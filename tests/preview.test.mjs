import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewServer } from '../tools/serve.mjs';

test('preview serves the module entry and styles with the correct content types', async () => {
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await fetch(base + '/');
    assert.equal(html.status, 200);
    const text = await html.text();
    assert.match(text, /type="module" src="\.\/js\/main.js"/);
    for (const [, resource] of text.matchAll(/(?:src|href)="(\.\/(?:js|css)\/[^"]+)"/g)) {
      const result = await fetch(new URL(resource, base));
      assert.equal(result.status, 200, resource);
      assert.match(result.headers.get('content-type'), resource.endsWith('.js') ? /javascript/ : /text\/css/);
    }
    for (const resource of ['/.git/config', '/README.md', '/package.json', '/tests/permissions.test.mjs']) {
      assert.equal((await fetch(base + resource)).status, 404, resource);
    }
    assert.equal((await fetch(base + '/app.html', { method: 'POST' })).status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
