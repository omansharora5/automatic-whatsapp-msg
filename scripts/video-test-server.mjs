// Isolated test environment: never connects to the user's WAHA or WhatsApp.
import http from 'node:http';
import { spawn } from 'node:child_process';
const calls = [];
const mock = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (req.url === '/calls') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(calls)); }
  const input = body ? JSON.parse(body) : null;
  if (req.url.startsWith('/api/send')) {
    const bytes = input?.file ? Buffer.from(input.file.data, 'base64') : null;
    const validVideo = !bytes || (bytes.toString('ascii', 4, 8) === 'ftyp' && bytes.includes(Buffer.from('avc1')) && input.convert === false);
    calls.push({ path: req.url, validVideo, bytes: bytes?.length });
    if (!validVideo) res.statusCode = 400;
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(req.url.startsWith('/api/send') ? { id: 'mock-video-test' } : { status: 'WORKING' }));
});
mock.listen(3015, '127.0.0.1', () => {
  const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: '3215', APP_API_KEY: 'video-test-key', WAHA_API_KEY: 'mock-key', WAHA_URL: 'http://127.0.0.1:3015' }, stdio: 'inherit', windowsHide: true });
  process.on('SIGINT', () => { child.kill(); mock.close(); });
  process.on('SIGTERM', () => { child.kill(); mock.close(); });
  child.on('exit', () => mock.close());
});
