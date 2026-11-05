// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
import fs from 'node:fs';
import path from 'node:path';

import { listDir, parseStamp } from './parse.js';
import { STAGE_ORDER, clamp01, computeDensity } from './loop.js';

export const SNAPSHOT_SCHEMA = 'conver-progress-snapshot-v1';
export const RENDER_FILE_PATTERN = /^(\d{14})\.html$/;

/**
 * Parse a render filename stamp as a local calendar instant. Date rolls over
 * invalid components; a rolled-over value is not a real render time.
 */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
export function parseRenderStamp(value) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
    || date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second) {
    return null;
  }
  return { t: date.getTime(), prec: 'ms' };
}

/**
 * List previous HTML renders newest first. The filename is the clock; the file
 * body is never read. A 14-digit name that is not a calendar instant is reported
 * and ignored.
 */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
export function listHtmlRenders(outputDir, before = Number.POSITIVE_INFINITY, warnings = []) {
  return listDir(outputDir)
    .map((name) => {
      const match = RENDER_FILE_PATTERN.exec(name);
      if (!match) return null;
      const stamp = parseRenderStamp(match[1]);
      if (!stamp) {
        const warning = `[render] ${path.join(outputDir, name)}: invalid calendar stamp`;
        if (Array.isArray(warnings) && !warnings.includes(warning)) warnings.push(warning);
        return null;
      }
      if (stamp.t >= before) return null;
      return { name, path: path.join(outputDir, name), stamp: match[1], ...stamp };
    })
    .filter(Boolean)
    .sort((left, right) => right.t - left.t);
}

/**
 * The header-bar value a snapshot records, or null when the document cannot
 * provide one. Snapshots written before overallProgress existed are projected
 * from their per-package stage fractions with the renderer's own weighting.
 */
/**
 * Project a stored snapshot onto the density scale for historical comparisons.
 * The previous-progress marker does not use this value; it evaluates progressAt
 * against the current model at the newest past HTML stamp.
 */
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
export function computePreviousProgress(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  if (Number.isFinite(snapshot.overallProgress)) return clamp01(snapshot.overallProgress);
  const weightedPackages = (Array.isArray(snapshot.packages) ? snapshot.packages : []).map((pkg) => ({
    weight: Math.max(1, Number(pkg && pkg.obligations && pkg.obligations.total) || 0),
    stages: (pkg && pkg.stages) || {},
  }));
  if (weightedPackages.length === 0) return null;
  const totalWeight = weightedPackages.reduce((sum, pkg) => sum + pkg.weight, 0);
  const globalStage = STAGE_ORDER.map((stage) => weightedPackages.reduce(
    (sum, pkg) => sum + clamp01(pkg.stages[stage]) * pkg.weight,
    0,
  ) / totalWeight);
  return clamp01(computeDensity(globalStage));
}

/** Project a model onto the compact snapshot shape written after every run. */
export function snapshotFromModel(model, extra = {}) {
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
  return {
    schema: SNAPSHOT_SCHEMA,
    generatedAt: new Date().toISOString(),
    workspaceRoot: model.workspaceRoot,
    packages: model.packages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      path: pkg.path,
      obligations: pkg.obligations,
      tickets: pkg.tickets,
      stages: pkg.stages,
    })),
    totals: model.totals,
    runs: model.runs,
    ...extra,
  };
}

/** List snapshots newest first, excluding a snapshot taken at or after `before`. */
export function listSnapshots(snapshotDir, before = Number.POSITIVE_INFINITY) {
  return listDir(snapshotDir)
    .map((name) => {
      const match = /^(\d{14})\.json$/.exec(name);
      if (!match) return null;
      const stamp = parseStamp(match[1]);
      if (!stamp || stamp.t >= before) return null;
      return { name, path: path.join(snapshotDir, name), t: stamp.t };
    })
    .filter(Boolean)
    .sort((left, right) => right.t - left.t);
}

export function readSnapshot(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Write one snapshot atomically; the caller supplies the output filename stamp. */
export function writeSnapshot(snapshotDir, stamp, snapshot) {
  fs.mkdirSync(snapshotDir, { recursive: true });
  const target = path.join(snapshotDir, `${stamp}.json`);
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, target);
  return target;
}

/** Compare two snapshots by package id and return a compact delta. */
export function diffSnapshots(previous, current) {
  const before = new Map(((previous && previous.packages) || []).map((pkg) => [pkg.id, pkg]));
  const after = new Map(((current && current.packages) || []).map((pkg) => [pkg.id, pkg]));
  const added = [...after.keys()].filter((id) => !before.has(id));
  const removed = [...before.keys()].filter((id) => !after.has(id));
  const changed = [];
  for (const [id, pkg] of after) {
    const old = before.get(id);
    if (!old) continue;
    const beforeTotal = old.obligations ? old.obligations.total : 0;
    const afterTotal = pkg.obligations ? pkg.obligations.total : 0;
    if (beforeTotal !== afterTotal) changed.push({ id, before: beforeTotal, after: afterTotal });
  }
  return { added, removed, changed };
}
