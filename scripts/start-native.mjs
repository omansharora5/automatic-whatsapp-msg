import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wahaDir = resolve(root, 'waha');
if (!existsSync(resolve(wahaDir, 'dist/main.js'))) {
  throw new Error('WAHA must be built first. See the native setup steps in README.md.');
}
const env = {
  ...process.env,
  WHATSAPP_DEFAULT_ENGINE: 'NOWEB',
  WAHA_VERSION: 'CORE',
  WAHA_LISTEN_HOST: '127.0.0.1',
  WAHA_PRINT_QR: 'False',
  WAHA_LOCAL_STORE_BASE_DIR: resolve(root, 'sessions'),
  WAHA_LOG_FORMAT: 'JSON',
  WAHA_LOG_LEVEL: process.env.WAHA_LOG_LEVEL || 'info',
  WHATSAPP_FILES_FOLDER: resolve(root, 'media'),
  PATH: `${dirname(ffmpeg)}${delimiter}${process.env.PATH || process.env.Path || ''}`,
};
// Windows environment names are case-insensitive; avoid passing both Path and PATH.
for (const name of Object.keys(env)) if (name.toLowerCase() === 'path' && name !== 'PATH') delete env[name];
const children = [];
let shuttingDown = false;
function stop() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
function start(name, args, cwd, overrides = {}) {
  const child = spawn(process.execPath, args, { cwd, env: { ...env, ...overrides }, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', error => { console.error(`${name}: ${error.message}`); process.exitCode = 1; stop(); });
  child.on('exit', code => { if (!shuttingDown) { console.error(`${name} exited (${code}).`); process.exitCode = code || 1; stop(); } });
}
start('WAHA', ['dist/main.js'], wahaDir, { PORT: new URL(process.env.WAHA_URL || 'http://127.0.0.1:3000').port || '3000' });
start('Sender', ['server.mjs'], root);
console.log('Native services starting. Open http://127.0.0.1:3210. Press Ctrl+C to stop both.');
