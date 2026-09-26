import test from 'node:test';
import assert from 'node:assert/strict';
import { createVideoPreparer } from '../video.mjs';
import { validateBundle, sendBundle } from '../lib.mjs';
const data = Buffer.concat([Buffer.from([0,0,0,20]), Buffer.from('ftypisom0000')]).toString('base64');
test('reuses conversion for identical bytes, preserves recipient/caption and disables double conversion', async () => {
  let conversions = 0;
  const prepare = createVideoPreparer(async () => { conversions++; return Buffer.from('prepared-video'); });
  const first = validateBundle({ phone: '919876543210', video: { data, caption: 'First' } })[0];
  const second = validateBundle({ phone: '919876543211', video: { data, caption: 'Second' } })[0];
  assert.equal((await prepare(first)).cacheHit, false);
  const result = await prepare(second);
  assert.equal(conversions, 1);
  assert.equal(result.cacheHit, true);
  assert.equal(result.body.convert, false);
  assert.equal(result.body.caption, 'Second');
  assert.equal(result.body.chatId, '919876543211@c.us');
  const direct = validateBundle({ phone: '919876543210', video: { data, convert: false } })[0];
  assert.equal((await prepare(direct)).body.file.data, data);
  assert.equal(conversions, 1);
});
test('video preparation failure does not block location', async () => {
  const steps = validateBundle({ phone: '919876543210', video: { data }, location: { latitude: 0, longitude: 0 } });
  let calls = 0;
  const result = await sendBundle(steps, async () => { calls++; }, async step => { if (step.type === 'video') throw new Error('Invalid video'); return { body: step.body }; });
  assert.equal(calls, 1);
  assert.deepEqual(result.results.map(r => r.status), ['accepted', 'failed-before-send']);
});
