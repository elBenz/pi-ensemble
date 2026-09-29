// Configuration primitives shared by file loading and programmatic callers.
export const defaults = Object.freeze({
  timeoutMs: 30000,
  enabled: true,
  retries: 3,
  labels: Object.freeze(['worker']),
  transport: Object.freeze({ host: 'localhost', port: 8080, secure: false }),
});

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

export function merge(base, layer) {
  const result = clone(base);
  for (const [key, value] of Object.entries(layer)) {
    if (!value) continue;
    if (isObject(value) && isObject(result[key])) result[key] = merge(result[key], value);
    else result[key] = clone(value);
  }
  return result;
}

export function validate(config) {
  if (!isObject(config)) throw new TypeError('config must be an object');
  const allowed = ['timeoutMs', 'enabled', 'retries', 'labels', 'transport'];
  for (const key of Object.keys(config)) {
    if (!allowed.includes(key)) throw new TypeError(`unknown setting: ${key}`);
  }
  for (const key of ['timeoutMs', 'retries']) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 0) {
      throw new TypeError(`${key} must be a nonnegative safe integer`);
    }
  }
  if (typeof config.enabled !== 'boolean') throw new TypeError('enabled must be boolean');
  if (!Array.isArray(config.labels) || config.labels.some(x => typeof x !== 'string')) {
    throw new TypeError('labels must be strings');
  }
  if (!isObject(config.transport)) throw new TypeError('transport must be an object');
  for (const key of Object.keys(config.transport)) {
    if (!['host', 'port', 'secure'].includes(key)) throw new TypeError(`unknown transport setting: ${key}`);
  }
  if (typeof config.transport.host !== 'string' || !config.transport.host.trim()) {
    throw new TypeError('host must be nonblank');
  }
  if (!Number.isInteger(config.transport.port) || config.transport.port < 0 || config.transport.port > 65535) {
    throw new TypeError('port must be in range');
  }
  if (typeof config.transport.secure !== 'boolean') throw new TypeError('secure must be boolean');
  return config;
}

export function parseBoolean(value, name) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new TypeError(`${name} must be true or false`);
}

export function parseInteger(value, name) {
  if (!/^\d+$/.test(value)) throw new TypeError(`${name} must contain decimal digits`);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new TypeError(`${name} out of range`);
  return number;
}
