// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

import {
  fingerprintFile,
  isSameFingerprint,
  machineIdFor,
  readUsageCache,
  writeUsageCache,
} from './usage-cache.js';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MILLION = 1e6;
const COST_ROUNDING_SCALE = 1e8;
const MODEL_FALLBACK = 'unknown';

export const DEFAULT_PRICES = Object.freeze({
  offpeak: Object.freeze({ cache_miss_input: 0.15, cache_hit_input: 0.003, output: 0.6 }),
  peak: Object.freeze({ cache_miss_input: 0.3, cache_hit_input: 0.006, output: 1.2 }),
});

export function jstDateKey(ms) {
  return new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function emptyBucket() {
  return {
    records: 0,
    cache_miss_input_tokens: 0,
    cache_hit_input_tokens: 0,
    output_tokens: 0,
  };
}

export function emptyGroup(date, model) {
  return { date, model, offpeak: emptyBucket(), peak: emptyBucket() };
}

export function tokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function isPeak(ms, holidays) {
  const date = new Date(ms);
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  if (holidays.has(date.toISOString().slice(0, 10))) return false;
  const hour = date.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

export function bucketCost(bucket, price) {
  const cacheMissInput = (bucket.cache_miss_input_tokens / MILLION) * price.cache_miss_input;
  const cacheHitInput = (bucket.cache_hit_input_tokens / MILLION) * price.cache_hit_input;
  const output = (bucket.output_tokens / MILLION) * price.output;
  return {
    cache_miss_input: cacheMissInput,
    cache_hit_input: cacheHitInput,
    output,
    total: cacheMissInput + cacheHitInput + output,
  };
}

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
function addCost(left, right) {
  return {
    cache_miss_input: left.cache_miss_input + right.cache_miss_input,
    cache_hit_input: left.cache_hit_input + right.cache_hit_input,
    output: left.output + right.output,
    total: left.total + right.total,
  };
}

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
function roundCost(cost) {
  const round = (value) => Math.round(value * COST_ROUNDING_SCALE) / COST_ROUNDING_SCALE;
  return {
    cache_miss_input: round(cost.cache_miss_input),
    cache_hit_input: round(cost.cache_hit_input),
    output: round(cost.output),
    total: round(cost.total),
  };
}

export function addBucket(target, source) {
  target.records += source.records;
  target.cache_miss_input_tokens += source.cache_miss_input_tokens;
  target.cache_hit_input_tokens += source.cache_hit_input_tokens;
  target.output_tokens += source.output_tokens;
}

export function summarize(group, prices) {
  const { offpeak, peak } = group;
  const costOffpeak = bucketCost(offpeak, prices.offpeak);
  const costPeak = bucketCost(peak, prices.peak);
  const cacheMissInput = offpeak.cache_miss_input_tokens + peak.cache_miss_input_tokens;
  const cacheHitInput = offpeak.cache_hit_input_tokens + peak.cache_hit_input_tokens;
  const output = offpeak.output_tokens + peak.output_tokens;
  return {
    ...(group.date !== undefined && { date: group.date }),
    ...(group.model !== undefined && { model: group.model }),
    records: offpeak.records + peak.records,
    cache_miss_input_tokens: cacheMissInput,
    cache_hit_input_tokens: cacheHitInput,
    total_input_tokens: cacheMissInput + cacheHitInput,
    output_tokens: output,
    offpeak: { ...offpeak, cost_usd: roundCost(costOffpeak) },
    peak: { ...peak, cost_usd: roundCost(costPeak) },
    cost_usd: roundCost(addCost(costOffpeak, costPeak)),
  };
}

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
async function* walkJsonl(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkJsonl(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      yield fullPath;
    }
  }
}

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
async function* walkAll(dirs) {
  for (const dir of dirs) yield* walkJsonl(dir);
}

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
async function findCwd(dir) {
  for await (const file of walkJsonl(dir)) {
    const input = fs.createReadStream(file, { encoding: 'utf8' });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    input.on('error', (error) => lines.destroy(error));
    try {
      for await (const line of lines) {
        if (!line.trim()) continue;
        try {
          const cwd = JSON.parse(line)?.cwd;
          if (typeof cwd === 'string') return cwd;
        } catch {
          // The aggregation scan counts malformed lines; this pre-scan only needs a cwd.
        }
      }
    } finally {
      lines.close();
      input.destroy();
    }
  }
  return null;
}

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
function isInside(child, parent) {
  const relative = path.relative(parent, path.resolve(child));
  return relative === ''
    || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

/**
 * Expand a leading `~` segment the way a shell would.
 *
 * Both separators are accepted so a Windows short form such as `~\work` expands on
 * every platform; the separator is dropped together with the tilde.
 */
export function expandHome(value) {
  if (typeof value !== 'string') return value;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

/**
 * Resolve the Claude Code config directory for this machine.
 *
 * A non-default config root is signalled only through `CLAUDE_CONFIG_DIR`, so that
 * environment variable must win over the home directory for every log reader.
 */
export function resolveConfigDir(configDir) {
  const requested = configDir || process.env.CLAUDE_CONFIG_DIR;
  if (requested) return path.resolve(expandHome(requested));
  return path.join(os.homedir(), '.claude');
}

/**
 * Encode a workspace path as the directory name Claude Code writes under `projects/`.
 */
export function encodeProjectKey(directory) {
  return directory.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * A record without message.id or requestId is identified by the SHA-256 of its
 * raw JSONL line. A copied line therefore keeps one identity on every machine,
 * and a different line can never collide with it.
 */
// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function anonymousRecordKey(line) {
  return `anon:${createHash('sha256').update(line).digest('hex')}`;
}

/**
 * Parse one JSONL log into raw message records.
 *
 * The identity is the message.id, then requestId, then the raw-line hash, so a
 * repeated scan of an unchanged file yields exactly the same records.
 */
// [::TICKET::] PX-353, PX-354, PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-353|PX-354|PX-376) --for-spec --no-implementation-order`.
async function parseUsageFile(file) {
  const records = new Map();
  let invalidJson = 0;
  let invalidTimestamp = 0;
  const input = fs.createReadStream(file, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  input.on('error', (error) => lines.destroy(error));
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        invalidJson += 1;
        continue;
      }
      const usage = record?.message?.usage;
      if (record?.type !== 'assistant' || !usage) continue;
      const ms = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : NaN;
      if (!Number.isFinite(ms)) {
        invalidTimestamp += 1;
        continue;
      }
      mergeUsageRecord(records, {
        key: record.message.id || record.requestId || anonymousRecordKey(line),
        ms,
        model: record.message.model ?? MODEL_FALLBACK,
        miss: tokenCount(usage.input_tokens) + tokenCount(usage.cache_creation_input_tokens),
        hit: tokenCount(usage.cache_read_input_tokens),
        out: tokenCount(usage.output_tokens),
      });
    }
  } finally {
    lines.close();
    input.destroy();
  }
  return { records: [...records.values()], invalidJson, invalidTimestamp };
}

/**
 * Merge one message snapshot, keeping the largest value seen for each field.
 *
 * Claude Code repeats a message across content-block lines and across files, so
 * the same key must resolve to one record and never to a sum.
 */
// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
function mergeUsageRecord(unique, record) {
  const current = unique.get(record.key);
  if (!current) {
    unique.set(record.key, { ...record });
    return;
  }
  current.ms = Math.max(current.ms, record.ms);
  current.miss = Math.max(current.miss, record.miss);
  current.hit = Math.max(current.hit, record.hit);
  current.out = Math.max(current.out, record.out);
}

/**
 * The section this machine owns.
 *
 * A v1/v2 cache from the same configDir is adopted only when at least one of its
 * files exists here; otherwise it belongs to another host and is carried as a
 * foreign section. Adoption is idempotent: the adopted section is rewritten
 * under the current machineId on the next save.
 */
// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function selectCurrentSection(machines, configDir, machineId) {
  const direct = machines.get(machineId);
  if (direct) return { id: machineId, section: direct };
  for (const [id, section] of machines) {
    if (!section.legacy || section.configDir !== configDir) continue;
    if ([...section.files.keys()].some((file) => fs.existsSync(file))) return { id, section };
  }
  return null;
}

/**
 * Aggregate assistant usage from Claude Code JSONL logs.
 *
 * Claude Code writes one line per content block, and every line repeats the same
 * message.id and usage. Counting lines would multiply the totals, so a message is
 * counted once and its streaming snapshots are merged by maximum field value.
 */
// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
export async function aggregateUsage({
  directory,
  configDir,
  from,
  to,
  holidays = new Set(),
  dateKey = jstDateKey,
  cachePath = null,
  onFileParsed = null,
} = {}) {
  const root = path.resolve(directory);
  const resolvedConfigDir = resolveConfigDir(configDir);
  const projectsDir = path.join(resolvedConfigDir, 'projects');
  const warnings = [];
  let entries = [];
  let projectsDirMissing = false;
  try {
    entries = await fs.promises.readdir(projectsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    projectsDirMissing = true;
    warnings.push(`usage logs not found: ${projectsDir}`);
  }

  const projectKey = encodeProjectKey(root);
  const directories = entries.filter((entry) => entry.isDirectory());
  const nameMatched = directories.filter(
    (entry) => entry.name === projectKey || entry.name.startsWith(projectKey + '-')
  );
  // Claude Code's directory naming has been stable, but a different writer or a
  // platform-specific path spelling can produce a name this key does not match.
  // When nothing matches by name, fall back to the cwd each directory records and
  // keep only logs written inside this workspace. An unreadable cwd is never accepted
  // on the fallback path because it could belong to any project.
  const candidates = nameMatched.length > 0
    ? nameMatched.map((entry) => ({ entry, matchedByName: true }))
    : directories.map((entry) => ({ entry, matchedByName: false }));
  const logDirs = [];
  for (const { entry, matchedByName } of candidates) {
    const dir = path.join(projectsDir, entry.name);
    const cwd = await findCwd(dir);
    const belongsToWorkspace = matchedByName
      ? cwd === null || isInside(cwd, root)
      : cwd !== null && isInside(cwd, root);
    if (belongsToWorkspace) logDirs.push({ dir, cwd });
  }

  const machineId = machineIdFor(resolvedConfigDir);
  const cacheRequested = Boolean(cachePath);
  const cacheFileWasPresent = cacheRequested && fs.existsSync(cachePath);
  const cached = cacheRequested
    ? await readUsageCache({ cachePath, configDir: resolvedConfigDir, projectKey })
    : null;
  const cachedMachines = cached ? cached.machines : new Map();
  const currentSection = selectCurrentSection(cachedMachines, resolvedConfigDir, machineId);
  const carriedMachines = new Map();
  const unique = new Map();
  for (const [id, section] of cachedMachines) {
    if (currentSection && id === currentSection.id) continue;
    carriedMachines.set(id, section);
    for (const entry of section.files.values()) {
      for (const record of entry.records) mergeUsageRecord(unique, record);
    }
  }
  const cachedFiles = currentSection ? currentSection.section.files : new Map();
  const cacheStats = {
    filesReused: 0,
    filesParsed: 0,
    filesDropped: 0,
    machinesCarried: carriedMachines.size,
    bypassed: cacheRequested && cached === null,
  };

  const nextFiles = new Map();
  let invalidJson = 0;
  let invalidTimestamp = 0;
  for await (const file of walkAll(logDirs.map((entry) => entry.dir))) {
    const fingerprint = await fingerprintFile(file);
    if (!fingerprint) continue;
    const cachedEntry = cachedFiles.get(file);
    let records;
    if (cachedEntry && isSameFingerprint(cachedEntry, fingerprint)) {
      records = cachedEntry.records;
      cacheStats.filesReused += 1;
    } else {
      const parsed = await parseUsageFile(file);
      records = parsed.records;
      invalidJson += parsed.invalidJson;
      invalidTimestamp += parsed.invalidTimestamp;
      cacheStats.filesParsed += 1;
      if (typeof onFileParsed === 'function') onFileParsed(file);
    }
    nextFiles.set(file, { ...fingerprint, records });
    for (const record of records) mergeUsageRecord(unique, record);
  }
  for (const file of cachedFiles.keys()) {
    if (!nextFiles.has(file)) cacheStats.filesDropped += 1;
  }

  // Foreign sections are carried verbatim; only this machine's section is
  // replaced. A workspace that never had logs keeps no cache, while an existing
  // cache is rewritten so files that disappeared are actually dropped.
  const nextMachines = new Map(carriedMachines);
  if (nextFiles.size > 0 || currentSection) {
    nextMachines.set(machineId, { configDir: resolvedConfigDir, files: nextFiles });
  }
  if (cacheRequested && (nextMachines.size > 0 || cacheFileWasPresent)) {
    const written = await writeUsageCache({ cachePath, machineId, machines: nextMachines });
    if (!written) cacheStats.bypassed = true;
  }

  const groups = new Map();
  for (const record of unique.values()) {
    const date = dateKey(record.ms);
    if (from && date < from) continue;
    if (to && date > to) continue;
    const key = JSON.stringify([date, record.model]);
    let group = groups.get(key);
    if (!group) {
      group = emptyGroup(date, record.model);
      groups.set(key, group);
    }
    const bucket = isPeak(record.ms, holidays) ? group.peak : group.offpeak;
    bucket.records += 1;
    bucket.cache_miss_input_tokens += record.miss;
    bucket.cache_hit_input_tokens += record.hit;
    bucket.output_tokens += record.out;
  }

  const sorted = [...groups.values()].sort((left, right) => (
    left.date.localeCompare(right.date) || String(left.model).localeCompare(String(right.model))
  ));
  const total = emptyGroup();
  delete total.date;
  delete total.model;
  for (const group of sorted) {
    addBucket(total.offpeak, group.offpeak);
    addBucket(total.peak, group.peak);
  }

  return {
    groups: sorted,
    total,
    projects: logDirs,
    projectsDir,
    projectsDirMissing,
    warnings,
    invalidJson,
    invalidTimestamp,
    cacheStats,
    scannedAt: new Date().toISOString(),
  };
}

/** Merge date+model groups into one sparse daily series with cumulative totals. */
// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
export function dailySeries(groups, prices = DEFAULT_PRICES) {
  const byDate = new Map();
  for (const group of groups || []) {
    let day = byDate.get(group.date);
    if (!day) {
      day = { date: group.date, offpeak: emptyBucket(), peak: emptyBucket() };
      byDate.set(group.date, day);
    }
    addBucket(day.offpeak, group.offpeak);
    addBucket(day.peak, group.peak);
  }

  let cumulativeMiss = 0;
  let cumulativeHit = 0;
  let cumulativeOutput = 0;
  let cumulativeCost = 0;
  return [...byDate.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((day) => {
      const dailyCostUsd = bucketCost(day.offpeak, prices.offpeak).total
        + bucketCost(day.peak, prices.peak).total;
      const dailyMiss = day.offpeak.cache_miss_input_tokens + day.peak.cache_miss_input_tokens;
      const dailyHit = day.offpeak.cache_hit_input_tokens + day.peak.cache_hit_input_tokens;
      const dailyOutput = day.offpeak.output_tokens + day.peak.output_tokens;
      cumulativeMiss += dailyMiss;
      cumulativeHit += dailyHit;
      cumulativeOutput += dailyOutput;
      cumulativeCost += dailyCostUsd;
      return {
        date: day.date,
        records: day.offpeak.records + day.peak.records,
        cacheMissInputTokens: dailyMiss,
        cacheHitInputTokens: dailyHit,
        outputTokens: dailyOutput,
        dailyCostUsd,
        cumulative: {
          cacheMissInputTokens: cumulativeMiss,
          cacheHitInputTokens: cumulativeHit,
          outputTokens: cumulativeOutput,
          costUsd: cumulativeCost,
        },
      };
    });
}
