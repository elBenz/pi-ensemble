import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCounterService } from './src/service.mjs';
test('counter writes and reads', async () => {
 const data = new Map();
 const service = createCounterService({ read: async key => data.get(key), write: async (key, value) => { data.set(key, value); } });
 assert.equal(await service.increment('a'), 1);
 assert.equal(await service.increment('a', 2), 3);
 assert.deepEqual(await service.snapshot(['a', 'b']), { a: 3, b: 0 });
 await service.close();
});
