import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { publish, inspectPublished } from './src/publish.mjs';
test('publication integration', async () => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-visible-'));
 try {
  const dest = path.join(root, 'out');
  const manifest = await publish(JSON.stringify({ id: 'one', state: 'completed', body: 'hello' }), dest);
  assert.equal(manifest.totalBytes, 5);
  assert.deepEqual((await inspectPublished(dest)).files, [{ name: 'one.txt', size: 5 }]);
 } finally { await fs.rm(root, { recursive: true, force: true }); }
});
