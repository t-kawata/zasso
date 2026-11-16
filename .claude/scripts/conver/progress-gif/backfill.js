/**
 * One-time provenance-labelled backfill for the progress timeline.
 *
 * The live .conver-history.jsonl is append-only command evidence. This module
 * reconstructs the pre-history and uninstrumented part from status completion
 * timestamps, ticket timestamps, and git first-commit times. Artifact mtime is
 * deliberately never read: a checkout copies mtimes, so it is not a command clock.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  BACKFILL_FILE_NAME,
  HISTORY_CONFIDENCE,
  HISTORY_ROLES,
  HISTORY_SOURCES,
  readBackfillFile,
} from './history.js';
import { STAGE_ORDER } from './loop.js';

export { BACKFILL_FILE_NAME, HISTORY_CONFIDENCE as BACKFILL_CONFIDENCE, HISTORY_SOURCES as BACKFILL_SOURCES, readBackfillFile };

const STAGE_INDEX = Object.fromEntries(STAGE_ORDER.map((stage, index) => [stage, index]));
const MAX_LEDGER_ROWS = 40;

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function isoAt(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function stableBackfillId(entry) {
  const key = [entry.stage, entry.packageId ?? 'workspace', entry.at, entry.source, entry.evidenceKey ?? '', entry.ticketKey ?? ''].join('\u0000');
  return createHash('sha256').update(key).digest('hex').slice(0, 20);
}

/** Read the first commit time of a repository path; null outside git. */
export function readGitFirstCommit(root, relativePath) {
  try {
    const output = execFileSync('git', ['-C', root, 'log', '--reverse', '--format=%cI', '--', relativePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().split('\n')[0];
    const at = isoAt(output);
    return at === null ? null : { at, t: Date.parse(at) };
  } catch {
    return null;
  }
}

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function readJson(file, warnings, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    warnings.push(`[backfill] ${label}: ${error.message}`);
    return null;
  }
}

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function firstFiles(root, files, readGit) {
  const times = files
    .map((file) => readGit(root, file))
    .filter((entry) => entry !== null)
    .map((entry) => entry.t);
  return times.length > 0 ? Math.min(...times) : null;
}

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function flattenTickets(document) {
  const tickets = [];
  for (const phase of (document && document.phases) || []) {
    for (const ticket of phase.tickets || []) tickets.push(ticket);
  }
  return tickets;
}

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function statusTime(status) {
  if (!status) return null;
  for (const candidate of [status.completedAt, status.updatedAt, status.measuredAt, status.createdAt]) {
    const at = isoAt(candidate);
    if (at !== null) return at;
  }
  return null;
}

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function drillFraction(status) {
  if (!status) return 0;
  if (status.state === 'COMPLETE') return 1;
  const step = String(status.currentStep || '');
  const match = /^1-(\d+)$/.exec(step);
  if (match) return Math.min(1, Number(match[1]) / 12);
  return /^[2-5]-1$/.test(step) ? 1 : 0;
}

/** Collect every evidence item the backfill may use. */
export function collectBackfillEvidence({ root, packages = [], historyRecords = [], readGit = readGitFirstCommit }) {
  const evidence = { history: [], status: [], tickets: [], git: [], warnings: [] };
  const add = (bucket, entry) => {
    if (entry && entry.stage && Number.isFinite(Date.parse(entry.at))) bucket.push(entry);
  };

  for (const record of historyRecords) {
    if (record.event !== 'finish' || record.status !== 'COMPLETE') continue;
    add(evidence.history, {
      stage: record.stage,
      packageId: record.packageId ?? null,
      at: isoAt(record.at),
      command: record.command,
      evidenceKey: record.runId,
      confidence: 'exact',
    });
  }

  const educeAt = firstFiles(root, ['WORKSPACIFY-TREE-MANIFEST.json'], readGit);
  const sequenceFiles = fs.existsSync(root)
    ? fs.readdirSync(root).filter((name) => /-sequences\.json$/.test(name))
    : [];
  const sequenceAt = firstFiles(root, sequenceFiles, readGit);
  const workspaceEduce = [educeAt, sequenceAt].filter(Number.isFinite);
  if (workspaceEduce.length > 0) {
    add(evidence.git, {
      stage: 'educe', packageId: null, at: new Date(Math.min(...workspaceEduce)).toISOString(),
      evidenceKey: 'WORKSPACIFY-TREE-MANIFEST.json', confidence: 'approx',
    });
  } else {
    evidence.warnings.push('[backfill] educe: no git first commit');
  }

  for (const pkg of packages) {
    const dir = path.join(root, pkg.path || '');
    const tickets = flattenTickets(readJson(path.join(dir, 'Tickets.json'), evidence.warnings, `${pkg.id}/Tickets.json`));
    const ticketCount = Math.max(1, tickets.length);

    const explainAt = firstFiles(root, [
      path.join(pkg.path || '', 'EXPLAIN-RFC-SEED.md'),
      path.join(pkg.path || '', 'INFO-RFC-SEED.md'),
    ], readGit);
    if (explainAt !== null) {
      add(evidence.git, {
        stage: 'explain', packageId: pkg.id, at: new Date(explainAt).toISOString(),
        evidenceKey: `${pkg.id}/EXPLAIN-RFC-SEED.md`, confidence: 'approx',
      });
    } else {
      evidence.warnings.push(`[backfill] ${pkg.id} explain: no git first commit`);
    }

    const grill = readJson(path.join(dir, 'Status.json'), evidence.warnings, `${pkg.id}/Status.json`);
    const grillAt = statusTime(grill);
    if (grillAt !== null) {
      add(evidence.status, { stage: 'grill', packageId: pkg.id, at: grillAt, evidenceKey: `${pkg.id}/Status.json`, confidence: 'exact' });
    }

    const drill = readJson(path.join(dir, 'drills', 'Status.json'), evidence.warnings, `${pkg.id}/drills/Status.json`);
    const drillAt = statusTime(drill);
    if (drillAt !== null) {
      add(evidence.status, {
        stage: 'drill', packageId: pkg.id, at: drillAt,
        evidenceKey: `${pkg.id}/drills/Status.json`, confidence: 'exact',
        role: 'evolution', delta: drillFraction(drill),
      });
    }

    for (const ticket of tickets) {
      const key = ticket.key || ticket.id;
      for (const [stage, field] of [['make', 'made_at'], ['plan', 'planned_at'], ['start', 'done_at']]) {
        add(evidence.tickets, {
          stage, packageId: pkg.id, ticketKey: key, at: isoAt(ticket[field]),
          evidenceKey: `${pkg.id}/Tickets.json#${key}.${field}`, confidence: 'exact', delta: 1 / ticketCount,
        });
      }
      const reviewAt = isoAt(ticket.reviewed_at) || (ticket.status === 'reviewed' ? isoAt(ticket.completedAt) : null);
      add(evidence.tickets, {
        stage: 'review', packageId: pkg.id, ticketKey: key, at: reviewAt,
        evidenceKey: `${pkg.id}/Tickets.json#${key}.reviewed_at`, confidence: 'exact', delta: 1 / ticketCount,
      });
    }

    for (const [stage, file] of [['graphify', 'RFC-GRAPHIFY-Status.json'], ['boundify', 'RFC-BOUNDIFY-Status.json'], ['split', 'RFC-SPLIT-Status.json']]) {
      const status = readJson(path.join(dir, file), evidence.warnings, `${pkg.id}/${file}`);
      const at = statusTime(status) || isoAt(status && status.receipt && status.receipt.recordedAt);
      if (at !== null) {
        add(evidence.status, { stage, packageId: pkg.id, at, evidenceKey: `${pkg.id}/${file}`, confidence: 'exact' });
      }
    }
  }

  return evidence;
}

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function roleFor(entry) {
  if (entry.role && HISTORY_ROLES.includes(entry.role)) return entry.role;
  if (entry.stage === 'drill' || entry.stage === 'amend') return 'evolution';
  return 'pipeline';
}

/** Build deterministic, provenance-labelled records from the collected evidence. */
export function buildBackfillRecords(evidence) {
  const entries = [];
  for (const source of HISTORY_SOURCES) {
    for (const entry of evidence[source] || []) {
      if (!entry || !entry.stage || !Number.isFinite(Date.parse(entry.at))) continue;
      entries.push({ ...entry, source, at: isoAt(entry.at), role: roleFor({ ...entry, source }) });
    }
  }

  const ordered = entries.sort((left, right) =>
    Date.parse(left.at) - Date.parse(right.at)
    || (STAGE_INDEX[left.stage] ?? 99) - (STAGE_INDEX[right.stage] ?? 99)
    || String(left.packageId ?? '').localeCompare(String(right.packageId ?? ''))
    || String(left.ticketKey ?? '').localeCompare(String(right.ticketKey ?? '')));

  const seen = new Set();
  const records = [];
  for (const entry of ordered) {
    const dedupeKey = entry.ticketKey
      ? `${entry.stage}\u0000${entry.packageId ?? ''}\u0000${entry.ticketKey}`
      : `${entry.stage}\u0000${entry.packageId ?? ''}\u0000${entry.at}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const backfillId = stableBackfillId(entry);
    const record = {
      v: 1,
      runId: `backfill-${entry.stage}-${entry.packageId ?? 'workspace'}-${backfillId.slice(0, 12)}`,
      event: 'finish',
      command: `backfill:${entry.source}`,
      stage: entry.stage,
      packageId: entry.packageId ?? null,
      at: entry.at,
      status: 'COMPLETE',
      addedTicketKeys: entry.ticketKey ? [entry.ticketKey] : [],
      source: entry.source,
      confidence: entry.confidence || (entry.source === 'git' ? 'approx' : 'exact'),
      backfillId,
      role: entry.role || 'pipeline',
    };
    if (entry.ticketKey !== undefined) record.ticketKey = entry.ticketKey;
    if (entry.delta !== undefined) record.delta = entry.delta;
    records.push(record);
  }
  return records;
}

/** Append only records whose backfillId is not already present. */
export function writeBackfillFile(targetDir, records) {
  const file = path.join(targetDir, BACKFILL_FILE_NAME);
  const existing = readBackfillFile(file);
  const known = new Set(existing.records.map((record) => record.backfillId));
  const fresh = records.filter((record) => !known.has(record.backfillId));
  const warnings = [...existing.warnings];
  if (fresh.length > 0) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.appendFileSync(file, fresh.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8');
    } catch (error) {
      warnings.push(`[backfill] ${file}: ${error.message}`);
      return { ok: false, appended: 0, warnings };
    }
  }
  return { ok: true, appended: fresh.length, warnings };
}

export function renderBackfillLedger(records) {
  const rows = records.slice(0, MAX_LEDGER_ROWS).map((record) =>
    `| ${record.at} | ${record.stage} | ${record.packageId ?? 'workspace'} | ${record.source} | ${record.confidence} | ${record.role} |`);
  const more = records.length > MAX_LEDGER_ROWS ? `\n\n… and ${records.length - MAX_LEDGER_ROWS} more records` : '';
  return ['| at | stage | package | source | confidence | role |', '|---|---|---|---|---|---|', ...rows].join('\n') + more;
}
