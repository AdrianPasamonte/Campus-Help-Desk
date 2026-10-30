import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { launchPreview } from '../tools/launch.mjs';

test('direct file opening shows launch instructions; HTTP stays in normal app mode', async () => {
  const source = await readFile(new URL('../js/local-launch.js', import.meta.url), 'utf8');
  for (const protocol of ['file:', 'http:', 'https:']) {
    const classes = new Set();
    vm.runInNewContext(source, { location: { protocol }, document: { documentElement: { classList: { add: name => classes.add(name) } } } });
    assert.equal(classes.has('local-file-mode'), protocol === 'file:');
  }
});

test('launcher opens the browser only after the local server responds', async () => {
  let opened;
  const preview = await launchPreview({ port: 0, open: url => { opened = fetch(url); } });
  try {
    assert.equal(preview.reused, false);
    const response = await opened;
    assert.equal(response.status, 200);
    assert.match(await response.text(), /id="localFileNotice"/);
  } finally { await new Promise(resolve => preview.server.close(resolve)); }
});

test('running the launcher again reuses the existing HelpDesk server', async () => {
  const first = await launchPreview({ port: 0, open() {} });
  try {
    let opened;
    const second = await launchPreview({ port: first.server.address().port, open: url => { opened = url; } });
    assert.equal(second.reused, true);
    assert.equal(second.server, undefined);
    assert.equal(opened, first.url);
  } finally { await new Promise(resolve => first.server.close(resolve)); }
});
