// [::TICKET::] PX-353, PX-354, PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-353|PX-354|PX-376) --for-spec --no-implementation-order`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CACHE_SCHEMA = 'conver-usage-ledger-v1';
export const LEGACY_CACHE_SCHEMA = 'conver-usage-cache-v2';
export const ANCIENT_CACHE_SCHEMA = 'conver-usage-cache-v1';
export const CACHE_FILE_NAME = 'usage-cache.json';
export const TEMPORARY_SUFFIX = '.tmp';

const RECORD_TUPLE_LENGTH = 6;
const MACHINE_ID_SEPARATOR = ':';
const UNKNOWN_MODEL = 'unknown';

let temporaryCounter = 0;

/** Keep an inode only when the filesystem reports a usable one. */
function normalizeInode(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Compare two strings without locale so the ledger bytes are deterministic. */
// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function isTokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * The stable identity of the machine that wrote a section.
 *
 * Hostname separates two machines that share one home path, and configDir
 * separates two config roots on one machine. The pair is stable across runs.
 */
export function machineIdFor(configDir, hostname = os.hostname()) {
  return `${hostname}${MACHINE_ID_SEPARATOR}${configDir}`;
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function isRecordShape(record) {
  return record !== null
    && typeof record === 'object'
    && typeof record.key === 'string'
    && record.key.length > 0
    && Number.isFinite(record.ms)
    && typeof record.model === 'string'
    && isTokenCount(record.miss)
    && isTokenCount(record.hit)
    && isTokenCount(record.out);
}

/** Decode one v2/v3 tuple; null means the cache is malformed and must be bypassed. */
// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function decodeTuple(tuple, models) {
  if (!Array.isArray(tuple) || tuple.length !== RECORD_TUPLE_LENGTH) return null;
  const [key, ms, modelIndex, miss, hit, out] = tuple;
  if (typeof key !== 'string' || key.length === 0) return null;
  if (!Number.isFinite(ms)) return null;
  if (!Number.isSafeInteger(modelIndex) || modelIndex < 0 || modelIndex >= models.length) return null;
  if (!isTokenCount(miss) || !isTokenCount(hit) || !isTokenCount(out)) return null;
  return { key, ms, model: models[modelIndex], miss, hit, out };
}

/** Decode one v1 object record; null means the cache is malformed. */
// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function decodeRecord(record) {
  return isRecordShape(record)
    ? { key: record.key, ms: record.ms, model: record.model, miss: record.miss, hit: record.hit, out: record.out }
    : null;
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function normalizeEntry(rawEntry, records) {
  return {
    size: rawEntry.size,
    mtimeMs: rawEntry.mtimeMs,
    ino: normalizeInode(rawEntry.ino),
    records,
  };
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function decodeTupleFiles(rawFiles, models) {
  const files = new Map();
  for (const [file, entry] of Object.entries(rawFiles)) {
    if (!entry || typeof entry !== 'object') return null;
    if (!Number.isFinite(entry.size) || !Number.isFinite(entry.mtimeMs)) return null;
    if (!Array.isArray(entry.records)) return null;
    const records = [];
    for (const tuple of entry.records) {
      const record = decodeTuple(tuple, models);
      if (!record) return null;
      records.push(record);
    }
    files.set(file, normalizeEntry(entry, records));
  }
  return files;
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function decodeRecordFiles(rawFiles) {
  const files = new Map();
  for (const [file, entry] of Object.entries(rawFiles)) {
    if (!entry || typeof entry !== 'object') return null;
    if (entry.path !== file) return null;
    if (!Number.isFinite(entry.size) || !Number.isFinite(entry.mtimeMs)) return null;
    if (!Array.isArray(entry.records)) return null;
    const records = [];
    for (const rawRecord of entry.records) {
      const record = decodeRecord(rawRecord);
      if (!record) return null;
      records.push(record);
    }
    files.set(file, normalizeEntry(entry, records));
  }
  return files;
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function isStringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function validateLedgerPayload(payload) {
  if (!payload.machines || typeof payload.machines !== 'object' || Array.isArray(payload.machines)) return null;
  const machines = new Map();
  for (const [machineId, section] of Object.entries(payload.machines)) {
    if (!section || typeof section !== 'object') return null;
    if (!isStringList(section.models)) return null;
    if (!section.files || typeof section.files !== 'object' || Array.isArray(section.files)) return null;
    const files = decodeTupleFiles(section.files, section.models);
    if (!files) return null;
    machines.set(machineId, {
      configDir: typeof section.configDir === 'string' && section.configDir !== '' ? section.configDir : machineId,
      legacy: section.recovered === true,
      models: section.models,
      files,
    });
  }
  return machines;
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function validateLegacyPayload(payload, recordFiles) {
  if (typeof payload.configDir !== 'string' || payload.configDir === '') return null;
  const files = recordFiles(payload.files);
  if (!files) return null;
  const models = [...new Set([...files.values()].flatMap((entry) => entry.records.map((record) => record.model)))].sort(compareText);
  return new Map([[payload.configDir, { configDir: payload.configDir, legacy: true, models, files }]]);
}

/**
 * Validate a parsed cache payload against the ledger schema.
 *
 * Both the v3 ledger and the v1/v2 caches are accepted. A v1/v2 payload becomes
 * one machine section keyed by its configDir; machine identity is never used to
 * reject a foreign cache, because the workspace ledger is the merge point.
 */
export function validateUsageCache(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  let machines = null;
  if (payload.schema === CACHE_SCHEMA) {
    machines = validateLedgerPayload(payload);
  } else if (payload.schema === LEGACY_CACHE_SCHEMA) {
    if (!isStringList(payload.models)) return null;
    if (!payload.files || typeof payload.files !== 'object' || Array.isArray(payload.files)) return null;
    const files = decodeTupleFiles(payload.files, payload.models);
    if (!files || typeof payload.configDir !== 'string' || payload.configDir === '') return null;
    machines = new Map([[payload.configDir, { configDir: payload.configDir, legacy: true, models: payload.models, files }]]);
  } else if (payload.schema === ANCIENT_CACHE_SCHEMA) {
    machines = validateLegacyPayload(payload, decodeRecordFiles);
  }
  if (!machines) return null;
  const files = new Map();
  for (const section of machines.values()) {
    for (const [file, entry] of section.files) files.set(file, entry);
  }
  return { machines, files };
}

/** Load a cache; a missing, unreadable or malformed file is a miss, never an error. */
export async function readUsageCache({ cachePath }) {
  if (!cachePath) return null;
  try {
    const text = await fs.promises.readFile(cachePath, 'utf8');
    return validateUsageCache(JSON.parse(text));
  } catch {
    return null;
  }
}

/** The model table of one section, derived from its records and sorted. */
// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function modelsOf(files) {
  const names = new Set();
  for (const entry of files.values()) {
    for (const record of entry.records) names.add(record.model || UNKNOWN_MODEL);
  }
  return [...names].sort(compareText);
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function compareRecords(left, right) {
  return compareText(String(left.key), String(right.key))
    || left.ms - right.ms
    || left.miss - right.miss
    || left.hit - right.hit
    || left.out - right.out;
}

/**
 * Serialize the ledger deterministically.
 *
 * Machines, files and records are sorted, each record tuple occupies one line,
 * and no volatile field is written. Two machines therefore edit different
 * top-level keys, which is what lets git merge their sections.
 */
export function serializeLedger(machines) {
  const machineIds = [...machines.keys()].sort(compareText);
  const lines = ['{', `  "schema": ${JSON.stringify(CACHE_SCHEMA)},`, '  "machines": {'];
  machineIds.forEach((machineId, machineIndex) => {
    const section = machines.get(machineId);
    const models = modelsOf(section.files);
    const modelIndexes = new Map(models.map((name, index) => [name, index]));
    const filePaths = [...section.files.keys()].sort(compareText);
    lines.push(`    ${JSON.stringify(machineId)}: {`);
    lines.push(`      "configDir": ${JSON.stringify(section.configDir || machineId)},`);
    if (section.legacy === true || section.recovered === true) lines.push('      "recovered": true,');
    lines.push(`      "models": ${JSON.stringify(models)},`);
    lines.push('      "files": {');
    filePaths.forEach((file, fileIndex) => {
      const entry = section.files.get(file);
      const records = [...entry.records].sort(compareRecords);
      lines.push(`        ${JSON.stringify(file)}: {`);
      lines.push(`          "size": ${Number.isFinite(entry.size) ? entry.size : 0},`);
      lines.push(`          "mtimeMs": ${Number.isFinite(entry.mtimeMs) ? entry.mtimeMs : 0},`);
      lines.push(`          "ino": ${Number.isSafeInteger(entry.ino) && entry.ino > 0 ? entry.ino : 'null'},`);
      lines.push('          "records": [');
      records.forEach((record, recordIndex) => {
        const tuple = [record.key, record.ms, modelIndexes.get(record.model) ?? 0, record.miss, record.hit, record.out];
        const suffix = recordIndex === records.length - 1 ? '' : ',';
        lines.push(`            ${JSON.stringify(tuple)}${suffix}`);
      });
      lines.push('          ]');
      lines.push(`        }${fileIndex === filePaths.length - 1 ? '' : ','}`);
    });
    lines.push('      }');
    lines.push(`    }${machineIndex === machineIds.length - 1 ? '' : ','}`);
  });
  lines.push('  }');
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

/**
 * Persist the machine sections atomically.
 *
 * Each writer owns a unique temporary path built from the process id and a
 * monotonic counter, so concurrent writers never share a partial file; the
 * rename publishes a complete payload and the last rename wins.
 */
export async function writeUsageCache({ cachePath, configDir, machineId, machines, files }) {
  if (!cachePath) return false;
  const temporary = `${cachePath}${TEMPORARY_SUFFIX}.${process.pid}.${temporaryCounter}`;
  temporaryCounter += 1;
  try {
    await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
    const sections = machines instanceof Map
      ? machines
      : new Map([[machineId || machineIdFor(configDir), { configDir, files }]]);
    await fs.promises.writeFile(temporary, serializeLedger(sections), 'utf8');
    await fs.promises.rename(temporary, cachePath);
    return true;
  } catch {
    // A failed write must leave the previous cache intact and no debris behind.
    await fs.promises.unlink(temporary).catch(() => {});
    return false;
  }
}

/** Read the identity of one log file. */
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
  if (entry.path !== undefined && entry.path !== fingerprint.path) return false;
  if (entry.size !== fingerprint.size) return false;
  if (entry.mtimeMs !== fingerprint.mtimeMs) return false;
  const cachedInode = normalizeInode(entry.ino);
  const currentInode = normalizeInode(fingerprint.ino);
  return cachedInode === null || currentInode === null || cachedInode === currentInode;
}
