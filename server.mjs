import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { validateBundle, sendBundle } from './lib.mjs';
import { createVideoPreparer } from './video.mjs';
import { previewSpeech } from './tts.mjs';
const prepareVideo = createVideoPreparer();

const port = Number(process.env.PORT || 3210);
const base = process.env.WAHA_URL || 'http://127.0.0.1:3000';
const apiKey = process.env.APP_API_KEY;
if (!apiKey || !process.env.WAHA_API_KEY) throw new Error('Run npm run setup, then npm start.');
const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const origins = new Set([...hosts].map(host => `http://${host}`));
const assets = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]]);

async function waha(path, method = 'GET', body) {
  let response;
  try {
    response = await fetch(`${base}${path}`, { method, headers: { 'X-Api-Key': process.env.WAHA_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  } catch {
    throw new Error('WAHA is unavailable or timed out. Run start.ps1 to start the native services and check their logs.');
  }
  if (!response.ok) {
    const error = new Error(`WAHA returned ${response.status}. Check the session and the native WAHA logs.`);
    error.status = response.status;
    throw error;
  }
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }
function authorized(req) {
  const provided = Buffer.from(req.headers['x-app-key'] || '');
  const expected = Buffer.from(apiKey);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Content-Type must be application/json.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 17 * 1024 * 1024) throw new Error('Request exceeds 17 MB.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
let sending = false;
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; media-src 'self' blob:; frame-ancestors 'none'");
  if (!hosts.has(req.headers.host) || (req.headers.origin && !origins.has(req.headers.origin))) return json(res, 403, { error: 'Only local access is allowed.' });
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    if (path === '/favicon.ico' && req.method === 'GET') { res.writeHead(204); return res.end(); }
    if (req.method === 'GET' && assets.has(path)) {
      const [file, type] = assets.get(path);
      res.setHeader('Content-Type', `${type}; charset=utf-8`);
      return res.end(await readFile(new URL(`./public/${file}`, import.meta.url)));
    }
    if (!authorized(req)) return json(res, 401, { error: 'Enter APP_API_KEY from your local .env file.' });
    if (path === '/api/tts/preview' && req.method === 'POST') {
      let input;
      try { input = await readJson(req); if (typeof input?.text !== 'string' || !input.text.trim() || input.text.length > 300) throw new Error('Use 1 to 300 characters.'); }
      catch (error) { return json(res, 400, { error: error.message }); }
      return json(res, 200, await previewSpeech(input.text));
    }
    if (path === '/api/status' && req.method === 'GET') {
      try { return json(res, 200, await waha('/api/sessions/default')); }
      catch (error) { if (error.status === 404) return json(res, 200, { status: 'NOT_CREATED' }); throw error; }
    }
    if (path === '/api/connect' && req.method === 'POST') {
      let session;
      try { session = await waha('/api/sessions/default'); }
      catch (error) { if (error.status !== 404) throw error; }
      if (!session) session = await waha('/api/sessions', 'POST', { name: 'default', start: true });
      else if (session.status === 'STOPPED') session = await waha('/api/sessions/default/start', 'POST', {});
      else if (session.status === 'FAILED') session = await waha('/api/sessions/default/restart', 'POST', {});
      return json(res, 200, session);
    }
    if (path === '/api/qr' && req.method === 'GET') return json(res, 200, await waha('/api/default/auth/qr'));
    if (path === '/api/send' && req.method === 'POST') {
      let steps;
      try { steps = validateBundle(await readJson(req)); }
      catch (error) { return json(res, 400, { error: error.message }); }
      if (sending) return json(res, 409, { error: 'A send is already in progress. Wait for its result.' });
      sending = true;
      try {
        const session = await waha('/api/sessions/default');
        if (session.status !== 'WORKING') return json(res, 409, { error: `WhatsApp is ${session.status}. Connect it before sending.` });
        const result = await sendBundle(steps, waha, prepareVideo);
        return json(res, result.ok ? 200 : 502, result);
      } finally { sending = false; }
    }
    return json(res, 404, { error: 'Unknown endpoint.' });
  } catch (error) { return json(res, 502, { error: error.message }); }
});
server.requestTimeout = 180000;
server.listen(port, '127.0.0.1', () => console.log(`WhatsApp sender: http://127.0.0.1:${port}`));
