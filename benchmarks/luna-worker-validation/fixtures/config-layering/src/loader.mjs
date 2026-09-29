import fs from 'node:fs/promises';
import { defaults, merge, validate, isObject, parseBoolean, parseInteger } from './schema.mjs';

// Environment input is explicit: loading never reads process.env implicitly.
export function environmentLayer(env) {
  const layer = {};
  const integerKeys = { APP_TIMEOUT_MS: 'timeoutMs', APP_RETRIES: 'retries' };
  for (const [name, key] of Object.entries(integerKeys)) {
    if (env[name] !== undefined) layer[key] = parseInteger(env[name], name);
  }
  if (env.APP_ENABLED !== undefined) layer.enabled = parseBoolean(env.APP_ENABLED, 'APP_ENABLED');
  const transport = {};
  if (env.APP_HOST !== undefined) transport.host = env.APP_HOST;
  if (env.APP_PORT !== undefined) transport.port = parseInteger(env.APP_PORT, 'APP_PORT');
  if (env.APP_SECURE !== undefined) transport.secure = parseBoolean(env.APP_SECURE, 'APP_SECURE');
  if (Object.keys(transport).length) layer.transport = transport;
  return layer;
}

export function resolveConfig({ project = {}, profile = {}, env = {}, overrides = {} } = {}) {
  let config = defaults;
  for (const layer of [project, environmentLayer(env), profile, overrides]) {
    if (!isObject(layer)) throw new TypeError('layer must be an object');
    config = merge(config, layer);
  }
  return validate(config);
}

export async function loadConfig(file, options = {}, io = fs) {
  let project;
  try {
    project = JSON.parse(await io.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') project = {};
    else throw error;
  }
  return resolveConfig({ ...options, project });
}

export function describeConfig(config) {
  validate(config);
  return {
    endpoint: `${config.transport.secure ? 'https' : 'http'}://${config.transport.host}:${config.transport.port}`,
    active: config.enabled,
    budget: config.timeoutMs,
    attempts: config.retries + 1,
    labels: [...config.labels],
  };
}
