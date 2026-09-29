import { createQueue } from './queue.mjs';

function validateKey(key) {
  if (typeof key !== 'string' || !key.trim()) throw new TypeError('key required');
}

function validateValue(value) {
  if (!Number.isSafeInteger(value)) throw new TypeError('safe integer required');
}

// Store interface: async read(key), async write(key, number).
// Audit is observational and receives committed values only.
export function createCounterService(store, audit = () => {}) {
  const queue = createQueue();
  const cache = new Map();

  async function increment(key, delta = 1) {
    validateKey(key);
    validateValue(delta);
    return queue.run(key, async () => {
      const before = cache.has(key) ? cache.get(key) : (await store.read(key)) ?? 0;
      validateValue(before);
      const after = before + delta;
      validateValue(after);
      cache.set(key, after);
      await store.write(key, after);
      audit({ key, before, after });
      return after;
    });
  }

  async function read(key) {
    validateKey(key);
    return queue.run(key, async () => {
      if (cache.has(key)) return cache.get(key);
      const value = (await store.read(key)) ?? 0;
      validateValue(value);
      cache.set(key, value);
      return value;
    });
  }

  async function invalidate(key) {
    validateKey(key);
    return queue.run(key, () => { cache.delete(key); });
  }

  async function snapshot(keys) {
    if (!Array.isArray(keys)) throw new TypeError('keys must be an array');
    keys.forEach(validateKey);
    const values = await Promise.all(keys.map(read));
    return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
  }

  return {
    increment,
    read,
    invalidate,
    snapshot,
    stats: queue.stats,
    drain: queue.drain,
    close: queue.close,
  };
}
