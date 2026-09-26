import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBundle, sendBundle } from '../lib.mjs';
const clip = Buffer.concat([Buffer.from([0,0,0,20]), Buffer.from('ftypisom0000')]).toString('base64');
test('normalizes international number and maps all message types', async () => {
  const steps = validateBundle({ phone: '+91 98765 43210', text: 'Hello', video: { data: clip }, location: { latitude: 0, longitude: 0, title: 'Origin' } });
  const calls = [];
  const result = await sendBundle(steps, async (path, method, body) => { calls.push({ path, method, body }); return { id: `id-${calls.length}` }; });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map(call => call.path), ['/api/sendText', '/api/sendLocation', '/api/sendVideo']);
  assert.ok(calls.every(call => call.body.chatId === '919876543210@c.us' && call.body.session === 'default'));
  assert.equal(calls[2].body.file.data, clip);
  assert.equal(calls[1].body.latitude, 0);
});
test('prepares video alongside text and location and sends video last', async () => {
  const steps = validateBundle({ phone: '12025550123', text: 'Hi', location: { latitude: 0, longitude: 0 }, video: { data: clip } });
  let release;
  let preparing = false;
  const ready = new Promise(resolve => { release = resolve; });
  const calls = [];
  const result = await sendBundle(steps, async path => {
    calls.push(path);
    assert.equal(preparing, true);
    if (path === '/api/sendLocation') release();
    return {};
  }, async step => {
    if (step.type === 'video') { preparing = true; await ready; }
    return { body: step.body };
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['/api/sendText', '/api/sendLocation', '/api/sendVideo']);
});
test('validates entire bundle before sending', () => {
  for (const input of [null, { phone: '123', text: 'Hi' }, { phone: '919876543210' }, { phone: '919876543210', text: 'Hi', location: { latitude: '', longitude: 3 } }, { phone: '919876543210', location: { latitude: 91, longitude: 0 } }, { phone: '919876543210', video: { data: 'not-a-video' } }]) assert.throws(() => validateBundle(input));
});
test('empty videos are rejected and other containers always use conversion', () => {
  assert.throws(() => validateBundle({ phone: '12025550123', video: { data: '' } }), /video is empty/);
  const step = validateBundle({ phone: '12025550123', video: { data: Buffer.from('container checked by FFmpeg').toString('base64'), filename: 'my clip (1).webm', convert: false } })[0];
  assert.equal(step.body.convert, true);
  assert.equal(step.body.file.filename, 'video.mp4');
});
test('stops after partial failure and identifies unattempted messages', async () => {
  const steps = validateBundle({ phone: '919876543210', text: 'Hello', video: { data: clip }, location: { latitude: 1, longitude: 2 } });
  let count = 0;
  const result = await sendBundle(steps, async () => { if (++count === 2) throw new Error('Timeout'); return { id: 'text-id' }; });
  assert.equal(count, 2);
  assert.equal(result.ok, false);
  assert.deepEqual(result.results.map(item => item.status), ['accepted', 'failed-or-unknown', 'not-attempted']);
});
