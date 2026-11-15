// Tiny static file server for local play: `npm start` (or `node tools/serve.mjs [port]`), then open the printed address.
// (ES modules and sprite sheets do not load from file:// pages. VS Code Live Server works too.)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = +process.argv[2] || 5173;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain', '.md': 'text/plain' };

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end('forbidden'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': (TYPES[extname(file).toLowerCase()] || 'application/octet-stream') + (/\.(html|js|mjs|json|css)$/.test(file) ? '; charset=utf-8' : ''), 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (e) { res.writeHead(404).end('not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Astral Relicism -> http://localhost:${port}`));
