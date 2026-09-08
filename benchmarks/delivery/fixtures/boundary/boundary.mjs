export async function execute(primary, fallback) {
  const result = await primary();
  if (!result.ok && result.retryable) return fallback();
  return result;
}
