#!/usr/bin/env node
/**
 * migrate-stage-timestamps.js — validate and report the stage timestamp schema
 * across project data without fabricating a time.
 *
 * Usage:
 *   node migrate-stage-timestamps.js --root=<dir> [--root=<dir> ...] [--dry-run]
 *
 * Project data only: Tickets.json, Malfeasance.json, CRYSTALIZE-Status.json and
 * drills/Status.json. The scanner skips .claude, tests, node_modules, .git and
 * fixtures. A missing precise instant is reported, never invented; a repeated
 * run therefore writes nothing.
 */
const fs = require('fs');
const path = require('path');

const SKIP_DIRECTORIES = new Set(['.claude', '.git', 'node_modules', 'tests', 'fixtures']);
const TICKET_COMPLETION_FIELDS = Object.freeze({
  made: 'made_at',
  planned: 'planned_at',
  done: 'done_at',
  reviewed: 'reviewed_at',
});
const TERMINAL_CRIME_STATUSES = new Set(['resolved', 'false_positive']);
const TARGET_BASENAMES = new Set(['Tickets.json', 'Malfeasance.json', 'CRYSTALIZE-Status.json']);

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function parseRoots(argv) {
  const roots = [];
  let dryRun = false;
  for (const argument of argv) {
    if (argument === '--dry-run') dryRun = true;
    else if (argument.startsWith('--root=')) roots.push(path.resolve(argument.slice('--root='.length)));
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (roots.length === 0) throw new Error('at least one --root=<dir> is required');
  return { roots, dryRun };
}

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function collectTargets(root) {
  const targets = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) visit(path.join(directory, entry.name));
        continue;
      }
      if (entry.name === 'Status.json') {
        if (path.basename(directory) === 'drills') targets.push(path.join(directory, entry.name));
        continue;
      }
      if (TARGET_BASENAMES.has(entry.name)) targets.push(path.join(directory, entry.name));
    }
  };
  visit(root);
  return targets;
}

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function countTicketGaps(document) {
  let missing = 0;
  for (const phase of document.phases || []) {
    for (const ticket of phase.tickets || []) {
      const field = TICKET_COMPLETION_FIELDS[ticket.status];
      if (field && !ticket[field]) missing += 1;
    }
  }
  return missing;
}

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function countCrimeGaps(document) {
  let missing = 0;
  for (const record of document.records || []) {
    if (TERMINAL_CRIME_STATUSES.has(record.status) && !record.resolved_at) missing += 1;
  }
  return missing;
}

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function inspect(file, failures) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
    return 0;
  }
  const basename = path.basename(file);
  if (basename === 'Tickets.json') return countTicketGaps(document);
  if (basename === 'Malfeasance.json') return countCrimeGaps(document);
  return 0;
}

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function main() {
  let parsed;
  try {
    parsed = parseRoots(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[ERROR] ${error.message}\nCause: invalid migration arguments.\nAction: pass --root=<dir> and optional --dry-run.\n`);
    process.exit(2);
  }

  const targets = parsed.roots.flatMap((root) => collectTargets(root));
  const failures = [];
  let missingCompletion = 0;
  for (const target of targets) missingCompletion += inspect(target, failures);

  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`[ERROR] ${failure}\n`);
    process.stderr.write('[ERROR] migration aborted: no file was written.\n');
    process.exit(1);
  }

  const changed = 0;
  process.stdout.write(`[migration] scanned=${targets.length} changed=${changed} missing_completion=${missingCompletion} dry_run=${parsed.dryRun} (${changed} files changed)\n`);
}

main();
