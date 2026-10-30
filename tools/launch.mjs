import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createPreviewServer } from './serve.mjs';

function openBrowser(url) {
  const command = process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/d', '/c', 'start', '""', url] : [url];
  const child = spawn(command, args, { detached: true, windowsHide: true, stdio: 'ignore' });
  child.on('error', () => console.log(`Open this address in your browser: ${url}`));
  child.unref();
}

export async function launchPreview({ port = 5504, open = openBrowser } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Enter a valid port.');
  let url = `http://127.0.0.1:${port}/app.html`;
  if (port) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok && (await response.text()).includes('<title>HelpDesk Pro - Ticketing System</title>')) {
        open(url);
        return { url, reused: true };
      }
    } catch { /* Start the preview if no existing HelpDesk server answered. */ }
  }
  const server = createPreviewServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  url = `http://127.0.0.1:${server.address().port}/app.html`;
  console.log(`HelpDesk Pro: ${url}\nKeep this window running. Press Ctrl+C to stop.`);
  open(url);
  return { url, reused: false, server };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  launchPreview().catch(error => { console.error(`Could not start HelpDesk Pro: ${error.message}`); process.exitCode = 1; });
}
