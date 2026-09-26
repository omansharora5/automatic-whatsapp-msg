import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cache = new Map();
let pending = false;
export async function previewSpeech(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 300) throw new Error('Use 1 to 300 characters for the speech preview.');
  if (process.platform !== 'win32') throw new Error('This lightweight speech engine requires Windows.');
  const start = performance.now();
  if (cache.has(text)) return { ...cache.get(text), cacheHit: true, generationMs: 0 };
  if (pending) throw new Error('Speech generation is busy. Try again shortly.');
  pending = true;
  try {
    const data = await new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./scripts/tts.ps1', import.meta.url))], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.resume();
      const timer = setTimeout(() => { child.kill(); reject(new Error('Speech generation timed out.')); }, 15000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); if (code === 0) resolve(output.trim()); else reject(new Error('Windows speech generation failed. Check installed Windows voices.')); });
      // Text is data on stdin; never evaluated as PowerShell code.
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify({ text }));
    });
    const result = { data, mimetype: 'audio/wav', bytes: Buffer.from(data, 'base64').length, cacheHit: false, generationMs: Math.round(performance.now() - start) };
    if (cache.size >= 8) cache.delete(cache.keys().next().value);
    cache.set(text, result);
    return result;
  } finally { pending = false; }
}
