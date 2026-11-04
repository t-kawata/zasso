// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
import fs from 'node:fs';
import path from 'node:path';

export const CACHE_SCHEMA = 'conver-usage-cache-v1';
export const CACHE_FILE_NAME = 'usage-cache.json';
export const TEMPORARY_SUFFIX = '.tmp';

let temporaryCounter = 0;

/** Keep an inode only when the filesystem reports a usable one. */
// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
function normalizeInode(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
function isValidRecord(record) {
  return record !== null
    && typeof record === 'object'
    && typeof record.key === 'string'
    && record.key.length > 0
    && Number.isFinite(record.ms)
    && typeof record.model === 'string'
    && Number.isSafeInteger(record.miss) && record.miss >= 0
    && Number.isSafeInteger(record.hit) && record.hit >= 0
    && Number.isSafeInteger(record.out) && record.out >= 0;
}

/** Drop unknown keys so a hand-edited cache can never leak fields into aggregation. */
// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
function toRecord(record) {
  return {
    key: record.key,
    ms: record.ms,
    model: record.model,
    miss: record.miss,
    hit: record.hit,
    out: record.out,
  };
}

// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
function toEntry(entry) {
  return {
    path: entry.path,
    size: entry.size,
    mtimeMs: entry.mtimeMs,
    ino: normalizeInode(entry.ino),
    records: entry.records.map(toRecord),
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
 * is advisory, so a foreign or damaged file can only cost a rescan.
 */
export function validateUsageCache(payload, { configDir, projectKey }) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (payload.schema !== CACHE_SCHEMA) return null;
  if (payload.configDir !== configDir) return null;
  if (payload.projectKey !== projectKey) return null;
  const rawFiles = payload.files;
  if (!rawFiles || typeof rawFiles !== 'object' || Array.isArray(rawFiles)) return null;
  const files = new Map();
  for (const [file, entry] of Object.entries(rawFiles)) {
    if (!entry || typeof entry !== 'object') return null;
    if (entry.path !== file) return null;
    if (!Number.isFinite(entry.size) || !Number.isFinite(entry.mtimeMs)) return null;
    if (!Array.isArray(entry.records) || !entry.records.every(isValidRecord)) return null;
    files.set(file, toEntry(entry));
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
    const entries = [...files.entries()].map(([file, entry]) => [file, toEntry(entry)]);
    const payload = {
      schema: CACHE_SCHEMA,
      configDir,
      projectKey,
      updatedAt: new Date().toISOString(),
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
