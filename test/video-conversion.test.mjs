import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import { convertVideo } from '../video.mjs';
const run = promisify(execFile);
async function clip(seconds) {
  const result = await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=160x120:r=10', '-t', String(seconds), '-c:v', 'mpeg4', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'], { encoding: 'buffer', windowsHide: true, timeout: 15000 });
  return result.stdout;
}
test('real FFmpeg converts MPEG-4 Part 2 MP4 to H264 and rejects long or corrupt input', async () => {
  const converted = await convertVideo(await clip(1));
  assert.equal(converted.toString('ascii', 4, 8), 'ftyp');
  assert.ok(converted.includes(Buffer.from('avc1')), 'H.264 stream is present');
  await assert.rejects(convertVideo(await clip(61)), /60 seconds/);
  await assert.rejects(convertVideo(Buffer.from('broken MP4')), /Could not inspect|no readable video/);
});
