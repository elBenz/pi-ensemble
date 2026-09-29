import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveConfig, describeConfig } from './src/loader.mjs';
test('overrides and nested defaults integrate', () => {
 const config = resolveConfig({ project: { transport: { host: 'example' } }, overrides: { retries: 2 } });
 assert.equal(describeConfig(config).endpoint, 'http://example:8080');
 assert.equal(config.retries, 2);
});
test('named profiles integrate with existing explicit layers', () => {
 const profiles = { base: { settings: { retries: 7, transport: { host: 'named' } } }, child: { extends: 'base', settings: { timeoutMs: 20 } } };
 const config = resolveConfig({ profiles, profileName: 'child', profile: { retries: 2 }, overrides: { timeoutMs: 30 } });
 assert.equal(config.transport.host, 'named');
 assert.equal(config.retries, 2);
 assert.equal(config.timeoutMs, 30);
});
