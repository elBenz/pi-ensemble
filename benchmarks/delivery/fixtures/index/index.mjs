export function listRuns(io, { id, sessionId, limit = 20 }) {
  if (id !== undefined) {
    const run = io.exact(id);
    return run && run.sessionId === sessionId ? [run] : [];
  }
  return io.scanAll().filter((run) => run.sessionId === sessionId).slice(0, limit);
}
