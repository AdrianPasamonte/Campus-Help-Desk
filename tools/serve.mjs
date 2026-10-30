import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon'
};

export function createPreviewServer(root = projectRoot) {
  return http.createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
    }
    try {
      const url = new URL(request.url, 'http://localhost');
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'app.html';
      // Only browser assets are served, never Git data, docs, tests, or configuration.
      if (relative !== 'app.html' && !/^(?:js|css|assets)\//.test(relative)) throw new Error('Not public');
      const filename = path.resolve(root, relative);
      if (!filename.startsWith(path.resolve(root) + path.sep)) throw new Error('Outside project');
      const type = contentTypes[path.extname(filename).toLowerCase()];
      if (!type) throw new Error('Unsupported file');
      const body = await readFile(filename);
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.argv[2] || 5504);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Enter a valid port.');
  const server = createPreviewServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`HelpDesk Pro: http://127.0.0.1:${port}/app.html\nPress Ctrl+C to stop.`));
}
