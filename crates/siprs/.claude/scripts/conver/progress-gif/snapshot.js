// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
import fs from 'node:fs';
import path from 'node:path';

import { listDir, parseStamp } from './parse.js';

export const SNAPSHOT_SCHEMA = 'conver-progress-snapshot-v1';

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
