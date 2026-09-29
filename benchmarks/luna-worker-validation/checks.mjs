import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkBehavior as legacy } from './legacy-checks.mjs';
const load = (root, name) => import(pathToFileURL(path.join(root, 'src', name + '.mjs')));
export async function checkBehavior(kind, root) {
  if (kind === 'config') {
    const { resolveConfig, loadConfig, describeConfig } = await load(root, 'loader');
    const { profileSettings } = await load(root, 'schema');
    assert.equal(typeof profileSettings, 'function');
    const profiles = Object.freeze({
      base: Object.freeze({ settings: Object.freeze({ retries: 8, labels: Object.freeze(['base']), transport: Object.freeze({ port: 50, secure: true }) }) }),
      child: Object.freeze({ extends: 'base', settings: Object.freeze({ retries: 0, labels: Object.freeze([]), transport: Object.freeze({ port: null, secure: false }) }) }),
      unused: null,
    });
    assert.deepEqual(profileSettings(profiles, 'child'), { retries: 0, labels: [], transport: { port: 50, secure: false } });
    const detached = profileSettings(profiles, 'child'); detached.labels.push('x'); detached.transport.port = 2;
    assert.equal(profileSettings(profiles, 'child').transport.port, 50); assert.deepEqual(profileSettings(profiles, 'child').labels, []);
    const empty = profileSettings(profiles); empty.x = 1; assert.deepEqual(profileSettings(profiles), {});
    for (const [map, selected] of [[null, undefined], [[], undefined], [{}, 'missing'], [{}, 'toString'], [profiles, null], [profiles, ''], [profiles, 3], [{ a: { settings: {}, extends: 'a' } }, 'a'], [{ a: { settings: {}, extends: 'b' }, b: { settings: {}, extends: 'a' } }, 'a'], [{ a: { settings: {}, extends: 'absent' } }, 'a']]) assert.throws(() => profileSettings(map, selected), TypeError);
    for (const definition of [null, [], {}, { settings: [] }, { settings: null }, { settings: {}, extra: 1 }, { settings: {}, extends: '' }, { settings: {}, extends: 4 }]) assert.throws(() => profileSettings({ a: definition }, 'a'), TypeError);
    assert.equal(resolveConfig({ profiles, profileName: 'child', project: { retries: 9 } }).retries, 0);
    assert.equal(resolveConfig({ profiles, profileName: 'child', profile: { retries: 6 }, env: { APP_RETRIES: '4' }, overrides: { retries: 2 } }).retries, 2);
    assert.equal(resolveConfig({ profiles: { a: { settings: { retries: -1 } }, b: { extends: 'a', settings: { retries: 2 } } }, profileName: 'b' }).retries, 2);
    assert.equal((await loadConfig('x', { profiles, profileName: 'child' }, { readFile: async () => '{"retries":99}' })).retries, 0);
    assert.throws(() => resolveConfig({ profiles: { a: { settings: { unknown: 1 } } }, profileName: 'a' }), TypeError);
    const project = Object.freeze({ timeoutMs: 8, enabled: true, labels: Object.freeze(['p']), transport: Object.freeze({ port: 7, secure: true }) });
    const config = resolveConfig({ project, profile: { timeoutMs: 9, transport: { port: 9 } }, env: { APP_TIMEOUT_MS: '10', APP_PORT: '0', APP_ENABLED: 'false', APP_SECURE: 'false' }, overrides: { timeoutMs: 0, retries: 0, labels: [], transport: { host: null, port: undefined } } });
    assert.deepEqual(config, { timeoutMs: 0, enabled: false, retries: 0, labels: [], transport: { host: 'localhost', port: 0, secure: false } });
    assert.equal(resolveConfig({ profile: { timeoutMs: 9 }, env: { APP_TIMEOUT_MS: '10' } }).timeoutMs, 10);
    assert.equal(describeConfig(config).attempts, 1);
    const copied = resolveConfig({ project });
    copied.labels.push('changed'); copied.transport.port = 66;
    assert.deepEqual(project.labels, ['p']); assert.equal(project.transport.port, 7);
    const first = resolveConfig(); first.labels.push('x'); first.transport.host = 'x';
    assert.deepEqual(resolveConfig().labels, ['worker']);
    for (const input of [{ project: [] }, { overrides: { unknown: 1 } }, { overrides: { transport: { typo: 1 } } }, { env: { APP_ENABLED: '0' } }, { env: { APP_RETRIES: '-1' } }, { overrides: { timeoutMs: -1 } }]) assert.throws(() => resolveConfig(input), TypeError);
    assert.equal((await loadConfig('x', { overrides: { enabled: false } }, { readFile: async () => { throw Object.assign(new Error(), { code: 'ENOENT' }); } })).enabled, false);
    const failure = new Error('disk');
    await assert.rejects(loadConfig('x', {}, { readFile: async () => { throw failure; } }), e => e === failure);
    await assert.rejects(loadConfig('x', {}, { readFile: async () => '{' }), SyntaxError);
    return;
  }
  if (kind === 'queue') {
    // Reuse independent scheduling probes, not candidate test assertions.
    await legacy('queue', path.join(root, 'src'));
    const { createQueue, deferred } = await load(root, 'queue');
    const { createCounterService } = await load(root, 'service');
    const gate = deferred(); const failure = new Error('write rejected');
    const writes = []; const audits = []; let fail = true;
    const service = createCounterService({ read: async () => 0, write: async (key, value) => {
      writes.push([key, value]);
      if (key === 'a' && fail) { fail = false; await gate.promise; throw failure; }
    } }, event => audits.push(event));
    const first = service.increment('a', 5).catch(e => e);
    const next = service.increment('a', 2);
    assert.equal(await service.increment('b', 0), 0);
    gate.resolve(); assert.equal(await first, failure); assert.equal(await next, 2);
    assert.deepEqual(writes, [['a', 5], ['b', 0], ['a', 2]]);
    assert.deepEqual(audits.map(x => x.after), [0, 2]);
    assert.equal(await service.increment('a', -2), 0);
    await service.invalidate('a'); assert.equal(await service.read('a'), 0);
    await service.close(); await assert.rejects(service.increment('a'), /closed/);
    let reads = 0, rejectWrite = false;
    const committedAudits = [];
    const cached = createCounterService({ read: async () => ++reads === 1 ? 10 : 99, write: async () => { if (rejectWrite) throw failure; } }, event => committedAudits.push(event));
    assert.equal(await cached.increment('cached', 2), 12);
    rejectWrite = true; await assert.rejects(cached.increment('cached', 5), error => error === failure);
    assert.equal(await cached.read('cached'), 12); assert.equal(reads, 1);
    rejectWrite = false; assert.equal(await cached.increment('cached', 1), 13);
    assert.deepEqual(committedAudits.map(event => event.after), [12, 13]);
    await cached.close();
    const queue = createQueue(); const wait = deferred();
    const pending = queue.run('x', () => wait.promise);
    const closing = queue.close(); let closed = false; closing.then(() => { closed = true; });
    await Promise.resolve(); assert.equal(closed, false);
    await assert.rejects(queue.run('y', () => 1), /closed/);
    wait.resolve(4); assert.equal(await pending, 4); await closing;
    assert.deepEqual(queue.stats(), { submitted: 1, completed: 1, failed: 0, activeKeys: 0, closed: true });
    const invalid = createQueue(); await assert.rejects(invalid.run('', () => 1), TypeError);
    assert.equal(invalid.stats().submitted, 0);
    await assert.rejects(invalid.run('x', () => { throw failure; }), e => e === failure);
    assert.equal(await invalid.run('x', () => 0), 0);
    await invalid.drain();
    assert.deepEqual(invalid.stats(), { submitted: 2, completed: 1, failed: 1, activeKeys: 0, closed: false });
    return;
  }
  if (kind === 'pipeline') {
    const { parseRecords } = await load(root, 'records');
    const { publish, publishFile, inspectPublished } = await load(root, 'publish');
    const good = { id: 'ok', state: 'completed', body: 'é\n' };
    for (const bad of [null, [], {}, { id: 'x', state: 'failed' }, { id: '../x', state: 'running' }, { id: 'x', state: 'completed', body: 2 }]) {
      const text = [good, bad].map(x => JSON.stringify(x)).join('\n');
      assert.throws(() => parseRecords(text), TypeError);
      await assert.rejects(publish(text, '/unused', { mkdir: () => { throw new Error('validation too late'); } }), TypeError);
    }
    for (const state of ['running', 'completed']) assert.throws(() => parseRecords([good, { ...good, state }].map(x => JSON.stringify(x)).join('\n')), TypeError);
    assert.throws(() => parseRecords('{bad'), TypeError);
    assert.deepEqual(parseRecords([ { id: 'z', state: 'completed', body: '' }, { id: 'running', state: 'running' }, good ].map(x => JSON.stringify(x)).join('\r\n')), [{ id: 'z', body: '' }, { id: 'ok', body: 'é\n' }]);
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-hidden-'));
    try {
      const source = path.join(scratch, 'input'); const destination = path.join(scratch, 'out');
      await fs.writeFile(source, '\r\n' + JSON.stringify(good) + '\r\n' + JSON.stringify({ id: 'skip', state: 'running', body: 9 }));
      const manifest = await publishFile(source, destination);
      assert.equal(manifest.totalBytes, 3); assert.equal(manifest.count, 1);
      assert.equal(manifest.artifacts[0].sha256, 'edd3a863872a04239eb29ad4bc12fc892b3d4ae57cc7e786a3697816f8e141c2');
      assert.equal(await fs.readFile(path.join(destination, 'ok.txt'), 'utf8'), good.body);
      assert.equal((await inspectPublished(destination)).manifest.count, 1);
      await assert.rejects(publish('', destination), /exists/);
      const empty = await publish('', path.join(scratch, 'empty')); assert.equal(empty.count, 0);
      for (const stage of ['artifact', 'manifest', 'rename']) {
        const error = new Error(stage); const dest = path.join(scratch, stage);
        const io = { ...fs, writeFile: async (file, ...args) => {
          await fs.writeFile(file, ...args);
          if (stage === 'artifact' && file.endsWith('.txt') || stage === 'manifest' && file.endsWith('manifest.json')) throw error;
        }, rename: async (...args) => { if (stage === 'rename') throw error; return fs.rename(...args); } };
        await assert.rejects(publish(JSON.stringify(good), dest, io), e => e === error);
        assert.equal((await fs.readdir(scratch)).some(x => x.startsWith('.publish-')), false);
        await assert.rejects(fs.lstat(dest), { code: 'ENOENT' });
      }
      const error = new Error('original');
      await assert.rejects(publish(JSON.stringify(good), path.join(scratch, 'cleanup'), { ...fs, writeFile: async () => { throw error; }, rm: async () => { throw new Error('cleanup'); } }), e => e === error);
    } finally { await fs.rm(scratch, { recursive: true, force: true }); }
    return;
  }
  throw new Error(`Unknown behavior ${kind}`);
}
