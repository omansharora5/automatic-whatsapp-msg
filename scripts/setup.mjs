import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const key = () => randomBytes(32).toString('hex');
let template = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
template = template.replaceAll(/replace-with-[a-z-]+/g, key);
try {
  await writeFile(new URL('../.env', import.meta.url), template, { flag: 'wx', mode: 0o600 });
  console.log('Created .env with random credentials. Keep this file private.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env already exists; credentials preserved.');
}
