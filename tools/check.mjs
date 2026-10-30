import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
async function files(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(folder, entry.name)) : /\.(?:js|mjs|cjs)$/.test(entry.name) ? [path.join(folder, entry.name)] : []))).flat();
}
let checked = 0;
for (const folder of ['js', 'tools', 'tests']) {
  for (const filename of await files(path.join(root, folder))) {
    const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
    if (result.status !== 0) { console.error(result.stderr); process.exitCode = 1; }
    checked++;
  }
}
if (!process.exitCode) console.log(`Syntax checked ${checked} JavaScript files.`);
