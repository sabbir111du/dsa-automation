import { readFile, writeFile, mkdir } from 'node:fs/promises';
const [worker, html] = await Promise.all([
  readFile(new URL('./worker.js', import.meta.url), 'utf8'),
  readFile(new URL('./index.html', import.meta.url), 'utf8')
]);
if (!worker.includes('__APP_HTML__')) throw new Error('HTML insertion placeholder missing');
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await writeFile(new URL('./dist/worker.js', import.meta.url), worker.replace('__APP_HTML__', JSON.stringify(html)));
console.log('Built Cloudflare DSA worker (DOCX generation uses original GitHub template).');
