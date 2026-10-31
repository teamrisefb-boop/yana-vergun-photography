import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const ref=process.env.BASELINE_REF || 'HEAD';
const baseline = execFileSync('git',['show',`${ref}:index.html`],{cwd:root});
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    function respond(data, type) {
      res.setHeader('Content-Type',type);
      res.setHeader('Cache-Control','no-store');
      if (/text|javascript|json/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) {
        res.setHeader('Content-Encoding','gzip');data=gzipSync(data);
      }
      res.end(data);
    }
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path.startsWith('/baseline/')) {
      path = path.slice('/baseline'.length);
      if (path === '/' || path === '/index.html') return respond(baseline,'text/html');
      if (/\.(js|css)$/.test(path)) {
        const old=execFileSync('git',['show',`${ref}:${path.slice(1)}`],{cwd:root,stdio:['ignore','pipe','ignore']});
        return respond(old,path.endsWith('.js')?'text/javascript':'text/css');
      }
    }
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403); return res.end(); }
    const data = await readFile(file);
    respond(data,mime[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream');
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${server.address().port}`));
