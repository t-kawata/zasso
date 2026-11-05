// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
import { execFileSync } from 'node:child_process';

import { validateUsageCache, writeUsageCache } from './usage-cache.js';
import { DEFAULT_PRICES, isPeak, jstDateKey } from './usage.js';

export const DEFAULT_CACHE_FILE = 'progress-gif/snapshots/usage-cache.json';

const NO_HOLIDAYS = new Set();
const MILLION = 1e6;
// An impossible fingerprint forces the owning machine to reparse a partially
// deduplicated file instead of reusing an entry whose records moved elsewhere.
const UNUSABLE_FINGERPRINT = Object.freeze({ size: -1, mtimeMs: -1, ino: null });

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Keep the largest value of each field, exactly as the aggregation merge does. */
// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function mergeRecord(records, record) {
  const current = records.get(record.key);
  if (!current) {
    records.set(record.key, { ...record });
    return;
  }
  current.ms = Math.max(current.ms, record.ms);
  current.miss = Math.max(current.miss, record.miss);
  current.hit = Math.max(current.hit, record.hit);
  current.out = Math.max(current.out, record.out);
}

/** The revisions that touched the cache file, newest first. A git failure yields none. */
export function listCacheRevisions({ repoRoot, filePath = DEFAULT_CACHE_FILE }) {
  try {
    const output = execFileSync('git', [
      '-C', repoRoot, 'log', '--all', '--follow', '--format=%H%x09%cI', '--', filePath,
    ], { encoding: 'utf8' });
    return output.trim().split('\n').filter(Boolean).map((line) => {
      const [revision, committedAt] = line.split('\t');
      return { revision, committedAt };
    });
  } catch {
    return [];
  }
}

/** One revision payload, or an explicit error so recovery can warn and continue. */
export function readRevisionPayload({ repoRoot, filePath = DEFAULT_CACHE_FILE, revision }) {
  try {
    const text = execFileSync('git', ['-C', repoRoot, 'show', `${revision}:${filePath}`], { encoding: 'utf8' });
    return { payload: JSON.parse(text) };
  } catch (error) {
    return { error: error.message };
  }
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function emptyDay() {
  return {
    offpeak: { records: 0, cache_miss_input_tokens: 0, cache_hit_input_tokens: 0, output_tokens: 0 },
    peak: { records: 0, cache_miss_input_tokens: 0, cache_hit_input_tokens: 0, output_tokens: 0 },
  };
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function accumulateDay(days, record) {
  const date = jstDateKey(record.ms);
  let day = days.get(date);
  if (!day) {
    day = emptyDay();
    days.set(date, day);
  }
  const bucket = isPeak(record.ms, NO_HOLIDAYS) ? day.peak : day.offpeak;
  bucket.records += 1;
  bucket.cache_miss_input_tokens += record.miss;
  bucket.cache_hit_input_tokens += record.hit;
  bucket.output_tokens += record.out;
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function bucketCost(bucket, price) {
  return (bucket.cache_miss_input_tokens / MILLION) * price.cache_miss_input
    + (bucket.cache_hit_input_tokens / MILLION) * price.cache_hit_input
    + (bucket.output_tokens / MILLION) * price.output;
}

/**
 * Union every cache revision in git history into one ledger.
 *
 * A record identity is counted once. When two sections carry the same identity,
 * the section whose machineId sorts first keeps it; the other file entry is
 * given an impossible fingerprint so its owner reparses the file on the next run
 * instead of reusing a partial entry. The output is deterministic, so a second
 * recovery over the same history writes identical bytes.
 */
export async function recoverUsageLedger({ repoRoot, filePath = DEFAULT_CACHE_FILE, outputPath, write = false } = {}) {
  const revisions = listCacheRevisions({ repoRoot, filePath });
  const warnings = [];
  const revisionStats = [];
  const machines = new Map();

  for (const entry of [...revisions].reverse()) {
    const { payload, error } = readRevisionPayload({ repoRoot, filePath, revision: entry.revision });
    if (error) {
      warnings.push(`[recovery] ${entry.revision.slice(0, 7)}: ${error}`);
      continue;
    }
    const validated = validateUsageCache(payload);
    if (!validated) {
      warnings.push(`[recovery] ${entry.revision.slice(0, 7)}: unsupported or malformed cache payload`);
      continue;
    }
    let revisionRecords = 0;
    for (const [machineId, section] of validated.machines) {
      let target = machines.get(machineId);
      if (!target) {
        target = { configDir: section.configDir, legacy: section.legacy === true, files: new Map() };
        machines.set(machineId, target);
      }
      for (const [file, fileEntry] of section.files) {
        let targetFile = target.files.get(file);
        if (!targetFile) {
          targetFile = {
            size: fileEntry.size,
            mtimeMs: fileEntry.mtimeMs,
            ino: fileEntry.ino,
            records: new Map(),
          };
          target.files.set(file, targetFile);
        }
        for (const record of fileEntry.records) {
          mergeRecord(targetFile.records, record);
          revisionRecords += 1;
        }
      }
    }
    revisionStats.push({ revision: entry.revision, committedAt: entry.committedAt, records: revisionRecords });
  }

  const assigned = new Set();
  const machineIds = [...machines.keys()].sort(compareText);
  for (const machineId of machineIds) {
    const target = machines.get(machineId);
    for (const [file, fileEntry] of [...target.files.entries()].sort(([left], [right]) => compareText(left, right))) {
      let dropped = false;
      for (const key of [...fileEntry.records.keys()].sort(compareText)) {
        if (assigned.has(key)) {
          fileEntry.records.delete(key);
          dropped = true;
        } else {
          assigned.add(key);
        }
      }
      if (dropped) {
        fileEntry.size = UNUSABLE_FINGERPRINT.size;
        fileEntry.mtimeMs = UNUSABLE_FINGERPRINT.mtimeMs;
        fileEntry.ino = UNUSABLE_FINGERPRINT.ino;
      }
    }
  }

  const outputMachines = new Map();
  const days = new Map();
  let records = 0;
  for (const machineId of machineIds) {
    const target = machines.get(machineId);
    const files = new Map();
    for (const [file, fileEntry] of target.files) {
      const values = [...fileEntry.records.values()];
      if (values.length === 0) continue;
      files.set(file, {
        size: fileEntry.size,
        mtimeMs: fileEntry.mtimeMs,
        ino: fileEntry.ino,
        records: values,
      });
      for (const record of values) {
        records += 1;
        accumulateDay(days, record);
      }
    }
    outputMachines.set(machineId, { configDir: target.configDir, legacy: target.legacy === true, files });
  }

  const dayRows = [...days.keys()].sort(compareText).map((date) => {
    const day = days.get(date);
    const costUsd = bucketCost(day.offpeak, DEFAULT_PRICES.offpeak) + bucketCost(day.peak, DEFAULT_PRICES.peak);
    return {
      date,
      records: day.offpeak.records + day.peak.records,
      cacheMissInputTokens: day.offpeak.cache_miss_input_tokens + day.peak.cache_miss_input_tokens,
      cacheHitInputTokens: day.offpeak.cache_hit_input_tokens + day.peak.cache_hit_input_tokens,
      outputTokens: day.offpeak.output_tokens + day.peak.output_tokens,
      costUsd,
    };
  });

  if (write && outputPath) {
    await writeUsageCache({ cachePath: outputPath, machines: outputMachines });
  }

  return {
    revisions: revisionStats,
    records,
    cacheMissInputTokens: dayRows.reduce((sum, row) => sum + row.cacheMissInputTokens, 0),
    cacheHitInputTokens: dayRows.reduce((sum, row) => sum + row.cacheHitInputTokens, 0),
    outputTokens: dayRows.reduce((sum, row) => sum + row.outputTokens, 0),
    costUsd: dayRows.reduce((sum, row) => sum + row.costUsd, 0),
    days: dayRows,
    warnings,
  };
}
