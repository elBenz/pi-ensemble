// Per-key serialization. Each caller owns its own result promise.
export function createQueue() {
  const tails = new Map();
  let closed = false;
  let submitted = 0;
  let completed = 0;
  let failed = 0;

  function run(key, task) {
    if (closed) return Promise.reject(new Error('queue closed'));
    if (typeof key !== 'string' || !key.trim() || typeof task !== 'function') {
      return Promise.reject(new TypeError('key and task required'));
    }
    submitted++;
    const previous = tails.get(key) ?? Promise.resolve();
    const current = previous.then(task);
    tails.set(key, current);
    current.then(
      () => { completed++; tails.delete(key); },
      () => { failed++; tails.delete(key); },
    );
    return current;
  }

  async function drain() {
    // Jobs submitted before this call are included; later submissions are not.
    const pending = [...tails.values()];
    await Promise.allSettled(pending);
  }

  async function close() {
    closed = true;
    await drain();
  }

  function stats() {
    return { submitted, completed, failed, activeKeys: tails.size, closed };
  }

  return { run, drain, close, stats };
}

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
