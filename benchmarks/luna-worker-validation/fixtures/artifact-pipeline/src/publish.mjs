import fs from 'node:fs/promises';
import path from 'node:path';
import { parseRecords, encodeArtifact, buildManifest, manifestText } from './records.mjs';

// Publish a new directory. Never overwrite an existing destination.
// io follows node:fs/promises; injection permits deterministic disk-failure tests.
export async function publish(text, destination, io = fs) {
  const records = parseRecords(text);
  const artifacts = records.map(encodeArtifact);
  const manifest = buildManifest(artifacts);
  const parent = path.dirname(destination);
  await io.mkdir(parent, { recursive: true });
  try {
    await io.lstat(destination);
    throw new Error('destination exists');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const staging = await io.mkdtemp(path.join(parent, '.publish-'));
  try {
    for (const artifact of artifacts) {
      await io.writeFile(path.join(staging, artifact.name), artifact.bytes);
    }
    await io.writeFile(path.join(staging, 'manifest.json'), manifestText(manifest), 'utf8');
    await io.rename(staging, destination);
    return manifest;
  } catch (error) {
    throw error;
  }
}

export async function publishFile(source, destination, io = fs) {
  const text = await io.readFile(source, 'utf8');
  return publish(text, destination, io);
}

export async function inspectPublished(destination, io = fs) {
  const text = await io.readFile(path.join(destination, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(text);
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.artifacts)) {
    throw new TypeError('unsupported manifest');
  }
  const files = [];
  for (const entry of manifest.artifacts) {
    const bytes = await io.readFile(path.join(destination, entry.name));
    files.push({ name: entry.name, size: bytes.length });
  }
  return { manifest, files };
}
