import { createHash } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import ffmpeg from 'ffmpeg-static';
const runFile = promisify(execFile);

async function checkVideo(dir) {
  let metadata = '';
  try {
    await runFile(ffmpeg, ['-hide_banner', '-nostdin', '-i', 'input.mp4'], { cwd: dir, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 });
  } catch (error) {
    // FFmpeg exits with code 1 when inspecting input without an output file.
    if (error.code !== 1 || error.killed) throw new Error('Could not inspect the video. Try exporting it as H.264 MP4.');
    metadata = error.stderr || '';
  }
  const duration = metadata.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!duration || !/Stream .*Video:/.test(metadata)) throw new Error('This MP4 has no readable video track. Export it again as H.264 MP4.');
  const seconds = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
  if (seconds <= 0 || seconds > 60) throw new Error('Choose a clip up to 60 seconds. Trim a longer video first.');
}

export async function convertVideo(bytes) {
  const dir = await mkdtemp(join(tmpdir(), 'whatsapi-video-'));
  try {
    await writeFile(join(dir, 'input.mp4'), bytes);
    await checkVideo(dir);
    await new Promise((resolve, reject) => {
      const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', 'input.mp4', '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-vf', "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', 'output.mp4'], { cwd: dir, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, 60000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); if (code === 0 && !timedOut) resolve(); else reject(new Error(timedOut ? 'Video preparation exceeded 60 seconds.' : 'Could not prepare this MP4 video.')); });
    });
    const output = await readFile(join(dir, 'output.mp4'));
    if (output.length > 12 * 1024 * 1024) throw new Error('Prepared video exceeds 12 MB. Choose a smaller clip.');
    return output;
  } finally {
    const target = resolve(dir);
    if (dirname(target).toLowerCase() !== resolve(tmpdir()).toLowerCase() || !basename(target).startsWith('whatsapi-video-')) throw new Error('Unexpected video temporary directory.');
    await rm(target, { recursive: true, force: true });
  }
}

export function createVideoPreparer(convert = convertVideo) {
  // Keep at most four prepared clips in memory, never on disk after conversion.
  const cache = new Map();
  return async function prepare(step) {
    if (step.type !== 'video' || !step.body.convert) return { body: step.body };
    const source = Buffer.from(step.body.file.data, 'base64');
    const key = createHash('sha256').update(source).digest('hex');
    let output = cache.get(key);
    const cacheHit = Boolean(output);
    if (!output) {
      output = await convert(source);
      if (cache.size >= 4) cache.delete(cache.keys().next().value);
      cache.set(key, output);
    }
    return { body: { ...step.body, convert: false, file: { ...step.body.file, data: output.toString('base64') } }, cacheHit, videoBytes: output.length };
  };
}
