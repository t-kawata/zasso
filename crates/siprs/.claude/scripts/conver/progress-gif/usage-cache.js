// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
// [::TICKET::] PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-354 --for-spec --no-implementation-order`.
import fs from 'node:fs';
import path from 'node:path';

export const CACHE_SCHEMA = 'conver-usage-cache-v2';
export const CACHE_FILE_NAME = 'usage-cache.json';
export const TEMPORARY_SUFFIX = '.tmp';

const RECORD_TUPLE_LENGTH = 6;

let temporaryCounter = 0;

/** Keep an inode only when the filesystem reports a usable one. */
function normalizeInode(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// [::TICKET::] PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-354 --for-spec --no-implementation-order`.
function isTokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Collect the model names used by the records, sorted.
 *
 * The table is sorted so the same input always produces the same cache bytes;
 * records then carry a small integer index instead of repeating the name.
 */
// [::TICKET::] PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-354 --for-spec --no-implementation-order`.
function buildModelTable(files) {
  const names = new Set();
  for (const entry of files.values()) {
    for (const record of entry.records) names.add(record.model);
  }
  return [...names].sort();
}

/**
 * Encode one record as [keyOrLine, ms, modelIndex, miss, hit, out].
 *
 * A record without message.id uses the stable `<file>:<line>` key; storing only
 * the line number keeps the absolute path from repeating on every record, and
 * the prefix check guarantees a real message id is never mistaken for a line.
 */
// [::TICKET::] PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-354 --for-spec --no-implementation-order`.
function encodeRecord(record, file, modelIndex) {
  const anonymousPrefix = `${file}:`;
  const storedKey = record.key.startsWith(anonymousPrefix)
    && /^\d+$/.test(record.key.slice(anonymousPrefix.length))
    ? Number(record.key.slice(anonymousPrefix.length))
    : record.key;
  return [storedKey, record.ms, modelIndex, record.miss, record.hit, record.out];
}

/** Decode one tuple, returning null for anything that does not match the schema. */
// [::TICKET::] PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-354 --for-spec --no-implementation-order`.
function decodeTuple(tuple, file, models) {
  if (!Array.isArray(tuple) || tuple.length !== RECORD_TUPLE_LENGTH) return null;
  const [storedKey, ms, modelIndex, miss, hit, out] = tuple;
  const validKey = typeof storedKey === 'string'
    ? storedKey.length > 0
    : Number.isSafeInteger(storedKey) && storedKey > 0;
  if (!validKey) return null;
  if (!Number.isFinite(ms)) return null;
  if (!Number.isSafeInteger(modelIndex) || modelIndex < 0 || modelIndex >= models.length) return null;
  if (!isTokenCount(miss) || !isTokenCount(hit) || !isTokenCount(out)) return null;
  return {
    key: typeof storedKey === 'number' ? `${file}:${storedKey}` : storedKey,
    ms,
    model: models[modelIndex],
    miss,
    hit,
    out,
  };
}

/**
 * Read the identity of one log file.
 *
 * A file that vanished between discovery and stat returns null; the caller drops
 * it from the scan instead of failing the run.
 */
export async function fingerprintFile(file) {
  try {
    const stat = await fs.promises.stat(file);
    return {
      path: file,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      ino: normalizeInode(stat.ino),
    };
  } catch {
    return null;
  }
}

/** A cached entry may be reused only when every observable identity field agrees. */
export function isSameFingerprint(entry, fingerprint) {
  if (!entry || !fingerprint) return false;
  if (entry.path !== fingerprint.path) return false;
  if (entry.size !== fingerprint.size) return false;
  if (entry.mtimeMs !== fingerprint.mtimeMs) return false;
  const cachedInode = normalizeInode(entry.ino);
  const currentInode = normalizeInode(fingerprint.ino);
  return cachedInode === null || currentInode === null || cachedInode === currentInode;
}

/**
 * Validate a parsed cache payload against the current workspace identity.
 *
 * Any mismatch returns null, which the caller treats as a cache miss: the cache
 * is advisory, so a v1, foreign or damaged file can only cost a rescan.
 */
export function validateUsageCache(payload, { configDir, projectKey }) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (payload.schema !== CACHE_SCHEMA) return null;
  if (payload.configDir !== configDir) return null;
  if (payload.projectKey !== projectKey) return null;
  const models = payload.models;
  if (!Array.isArray(models) || !models.every((name) => typeof name === 'string')) return null;
  const rawFiles = payload.files;
  if (!rawFiles || typeof rawFiles !== 'object' || Array.isArray(rawFiles)) return null;
  const files = new Map();
  for (const [file, entry] of Object.entries(rawFiles)) {
    if (!entry || typeof entry !== 'object') return null;
    if (entry.path !== file) return null;
    if (!Number.isFinite(entry.size) || !Number.isFinite(entry.mtimeMs)) return null;
    if (!Array.isArray(entry.records)) return null;
    const records = [];
    for (const tuple of entry.records) {
      const record = decodeTuple(tuple, file, models);
      if (!record) return null;
      records.push(record);
    }
    files.set(file, {
      path: entry.path,
      size: entry.size,
      mtimeMs: entry.mtimeMs,
      ino: normalizeInode(entry.ino),
      records,
    });
  }
  return { files };
}

/** Load a cache; a missing, unreadable or malformed file is a miss, never an error. */
export async function readUsageCache({ cachePath, configDir, projectKey }) {
  if (!cachePath) return null;
  try {
    const text = await fs.promises.readFile(cachePath, 'utf8');
    return validateUsageCache(JSON.parse(text), { configDir, projectKey });
  } catch {
    return null;
  }
}

/**
 * Persist the per-file record maps atomically.
 *
 * Each writer owns a unique temporary path built from the process id and a
 * monotonic counter, so concurrent writers never share a partial file; the
 * rename publishes a complete payload and the last rename wins.
 */
export async function writeUsageCache({ cachePath, configDir, projectKey, files }) {
  if (!cachePath) return false;
  const temporary = `${cachePath}${TEMPORARY_SUFFIX}.${process.pid}.${temporaryCounter}`;
  temporaryCounter += 1;
  try {
    await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
    const models = buildModelTable(files);
    const modelIndexes = new Map(models.map((name, index) => [name, index]));
    const entries = [...files.entries()].map(([file, entry]) => [file, {
      path: entry.path,
      size: entry.size,
      mtimeMs: entry.mtimeMs,
      ino: normalizeInode(entry.ino),
      records: entry.records.map((record) => encodeRecord(record, file, modelIndexes.get(record.model))),
    }]);
    const payload = {
      schema: CACHE_SCHEMA,
      configDir,
      projectKey,
      updatedAt: new Date().toISOString(),
      models,
      files: Object.fromEntries(entries),
    };
    await fs.promises.writeFile(temporary, JSON.stringify(payload), 'utf8');
    await fs.promises.rename(temporary, cachePath);
    return true;
  } catch {
    // A failed write must leave the previous cache intact and no debris behind.
    await fs.promises.unlink(temporary).catch(() => {});
    return false;
  }
}
