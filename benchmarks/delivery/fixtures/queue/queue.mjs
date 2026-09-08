export function createQueue() {
  const tails = new Map();
  return {
    run(key, task) {
      const previous = tails.get(key) ?? Promise.resolve();
      const current = previous.catch(() => {}).then(task);
      tails.delete(key);
      return current;
    },
  };
}
