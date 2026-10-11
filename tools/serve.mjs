// Static test server for dist/ and bench/ on localhost (node:http only).
//
//   node tools/serve.mjs [--port 4173] [--host 127.0.0.1]
//
// Serves GET/HEAD for /dist/** and /bench/** only; everything else is 404.
// Started and stopped by the test tooling (playwright.config.js webServer).

import { createReadStream, statSync } from 'node:fs';
import http from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SERVED = ['dist', 'bench'];

/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/**
 * Maps a request path to a file under one of the served directories, or null.
 * @param {string} urlPath
 * @param {string} [root]
 */
export function resolvePath(urlPath, root = ROOT) {
  let path;
  try {
    path = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (path.includes('\0')) return null;
  const rel = normalize(path).replace(/^[/\\]+/, '');
  const top = rel.split(/[/\\]/)[0];
  if (!SERVED.includes(top)) return null;
  const file = resolve(root, rel);
  if (!file.startsWith(resolve(root, top) + sep) && file !== resolve(root, top)) return null;
  return file;
}

/** @param {string} [root] */
export function createServer(root = ROOT) {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    let file = resolvePath(req.url ?? '/', root);
    try {
      if (file && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!file || !statSync(file).isFile()) throw new Error('not found');
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  /** @param {string} name @param {string} def */
  const opt = (name, def) => { const k = args.indexOf(name); return k >= 0 ? args[k + 1] : def; };
  const host = opt('--host', '127.0.0.1');
  const server = createServer();
  server.listen(Number(opt('--port', '4173')), host, () => {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    console.log(`serve: http://${host}:${port}/dist/ and /bench/ (Ctrl+C stops)`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
