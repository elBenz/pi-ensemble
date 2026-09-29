export function launchOptions(params, agent, parentDeadlineAt, now) {
  const result = { ...params };
  if (result.timeoutMs === undefined && result.maxRuntimeMs === undefined && agent.defaultTimeoutMs !== undefined) {
    result.timeoutMs = agent.defaultTimeoutMs;
  }
  return result;
}
