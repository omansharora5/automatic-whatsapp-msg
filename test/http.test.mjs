import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('HTTP authentication, origin checks, validation, QR and send routing', async t => {
  const calls = [];
  const mock = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push({ path: req.url, body: body ? JSON.parse(body) : null, key: req.headers['x-api-key'] });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url.endsWith('/auth/qr') ? { data: 'qr-placeholder' } : req.url.includes('/send') ? { id: 'mock-message' } : { status: 'WORKING' }));
  });
  mock.listen(0, '127.0.0.1');
  await once(mock, 'listening');
  t.after(() => mock.close());
  const reservation = http.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), APP_API_KEY: 'test-app-key', WAHA_API_KEY: 'test-waha-key', WAHA_URL: `http://127.0.0.1:${mock.address().port}` }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Test server did not start')), 10000);
    child.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    child.once('error', reject);
  });
  const request = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, options);
  const headers = { 'X-App-Key': 'test-app-key', 'Content-Type': 'application/json' };
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/api/status')).status, 401);
  assert.equal((await request('/api/status', { headers: { ...headers, Origin: 'https://foreign.example' } })).status, 403);
  assert.equal((await request('/api/send', { method: 'POST', headers, body: JSON.stringify({ phone: 'bad', text: 'Hello' }) })).status, 400);
  assert.equal(calls.length, 0);
  const qr = await request('/api/qr', { headers });
  assert.equal((await qr.json()).data, 'qr-placeholder');
  const sent = await request('/api/send', { method: 'POST', headers, body: JSON.stringify({ phone: '+91 98765 43210', text: 'Test' }) });
  assert.equal(sent.status, 200);
  assert.equal((await sent.json()).results[0].status, 'accepted');
  assert.equal(calls.at(-1).path, '/api/sendText');
  assert.equal(calls.at(-1).body.chatId, '919876543210@c.us');
  assert.ok(calls.every(call => call.key === 'test-waha-key'));
});
