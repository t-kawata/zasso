// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MILLION = 1e6;
const COST_ROUNDING_SCALE = 1e8;

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

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
function expandConfigDir(configDir) {
  if (configDir) return path.resolve(configDir);
  if (process.env.CLAUDE_CONFIG_DIR) return path.resolve(process.env.CLAUDE_CONFIG_DIR);
  return path.join(os.homedir(), '.claude');
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
} = {}) {
  const root = path.resolve(directory);
  const projectsDir = path.join(expandConfigDir(configDir), 'projects');
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

  const projectKey = root.replace(/[^a-zA-Z0-9]/g, '-');
  const logDirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name !== projectKey && !entry.name.startsWith(projectKey + '-')) continue;
    const dir = path.join(projectsDir, entry.name);
    const cwd = await findCwd(dir);
    if (cwd === null || isInside(cwd, root)) logDirs.push({ dir, cwd });
  }

  const unique = new Map();
  let invalidJson = 0;
  let invalidTimestamp = 0;
  let anonymous = 0;
  for await (const file of walkAll(logDirs.map((entry) => entry.dir))) {
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
        const id = record.message.id || record.requestId || `anonymous-${anonymous++}`;
        const next = {
          ms,
          model: record.message.model ?? 'unknown',
          miss: tokenCount(usage.input_tokens) + tokenCount(usage.cache_creation_input_tokens),
          hit: tokenCount(usage.cache_read_input_tokens),
          out: tokenCount(usage.output_tokens),
        };
        const current = unique.get(id);
        if (!current) {
          unique.set(id, next);
        } else {
          current.ms = Math.max(current.ms, next.ms);
          current.miss = Math.max(current.miss, next.miss);
          current.hit = Math.max(current.hit, next.hit);
          current.out = Math.max(current.out, next.out);
        }
      }
    } finally {
      lines.close();
      input.destroy();
    }
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
