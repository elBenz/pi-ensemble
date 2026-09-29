import { createHash } from 'node:crypto';

export function parseRecords(text) {
  if (typeof text !== 'string') throw new TypeError('text required');
  const result = [];
  const seen = new Set();
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].trim()) continue;
    let record;
    try {
      record = JSON.parse(lines[index]);
    } catch (cause) {
      throw new TypeError(`invalid JSON at line ${index + 1}`, { cause });
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new TypeError(`invalid record at line ${index + 1}`);
    }
    if (record.state !== 'completed') continue;
    if (typeof record.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(record.id)) {
      throw new TypeError('invalid id');
    }
    if (seen.has(record.id)) throw new TypeError('duplicate id');
    seen.add(record.id);
    if (typeof record.body !== 'string') throw new TypeError('body must be string');
    result.push({ id: record.id, body: record.body });
  }
  return result;
}

export function encodeArtifact(record) {
  const bytes = Buffer.from(record.body, 'utf8');
  return {
    name: `${record.id}.txt`,
    bytes,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export function buildManifest(artifacts) {
  return {
    schemaVersion: 1,
    count: artifacts.length,
    totalBytes: artifacts.reduce((total, artifact) => total + artifact.size, 0),
    artifacts: artifacts.map(({ name, size, sha256 }) => ({ name, size, sha256 })),
  };
}

export function manifestText(manifest) {
  return JSON.stringify(manifest, null, 2) + '\n';
}
