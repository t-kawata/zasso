#!/usr/bin/env node
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
/**
 * restore-condensed-tickets.js — restore a package from its pre-condense archive.
 *
 * Condensation used to drop authored fields. The archive written before every
 * apply is the recovery source, so restoration can be deterministic: choose the
 * earliest archive that contains every absorbed key, prove that untouched
 * tickets did not change after the merge, then restore the archive bytes.
 *
 * Usage:
 *   restore-condensed-tickets.js --tickets=Tickets.json --dry-run
 *   restore-condensed-tickets.js --tickets=Tickets.json --apply
 *   restore-condensed-tickets.js --workspace=/path/to/workspace --apply
 *
 * The default is a dry run. The script never deletes an archive.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { ticketKeyOf } = require('./lib/ticket-partition.js');

const ARCHIVE_PREFIX = 'Tickets.pre-condense-';
const EXCLUDED_DIRECTORIES = Object.freeze(['.git', 'node_modules', 'fixtures']);

/** Fields recomputed after a merge; they do not need to match the archive. */
const DERIVED_FIELDS = Object.freeze([
  'contracts', 'formulaObligations', 'distribution', 'prerequisites', 'mergeAttempts',
  'relatedTicketIds', 'round', 'splitReason',
]);

/**
 * Fields the broken condense deleted or recomputed even on untouched tickets.
 *
 * The archive repairs them. A differing current value is a later edit and is
 * refused instead of overwritten.
 */
const LOSSY_FIELDS = Object.freeze(['referenceSection', 'rfcDiscrepancies', 'unlistedFileReason']);

/** Every ticket in a document, with its phase id attached. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function allTickets(document) {
  const tickets = [];
  for (const phase of document.phases ?? []) {
    for (const ticket of phase.tickets ?? []) tickets.push({ ...ticket, phaseId: phase.id });
  }
  for (const ticket of document.tickets ?? []) tickets.push(ticket);
  return tickets;
}

/** The keys absorbed by survivors in the current document. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function collectAbsorbedKeys(document) {
  const keys = [];
  for (const ticket of allTickets(document)) {
    for (const entry of ticket.condensedFrom?.tickets ?? []) keys.push(entry.key);
  }
  return keys;
}

/** The archive files of one package, oldest first. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function archivePaths(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => name.startsWith(ARCHIVE_PREFIX) && name.endsWith('.json'))
    .sort()
    .map((name) => path.join(directory, name));
}

/** A deterministic JSON string with sorted object keys. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** A ticket without the fields a merge may legitimately change. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function stripForComparison(ticket) {
  const record = { ...ticket };
  for (const field of DERIVED_FIELDS) delete record[field];
  delete record.condensedFrom;
  if (Array.isArray(record.changes)) {
    record.changes = record.changes.filter((entry) => !(
      entry && typeof entry.description === 'string' && entry.description.startsWith('Condensed ')
    ));
    if (record.changes.length === 0) delete record.changes;
  }
  for (const [field, value] of Object.entries(record)) {
    if (value === '' || (Array.isArray(value) && value.length === 0)) delete record[field];
  }
  return record;
}

/** Whether a value carries information. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/**
 * Prove that every untouched ticket is unchanged except the known lossy fields.
 *
 * @returns {{ ok: boolean, code?: string, detail?: string, repairedLosses: number }}
 */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function validateUntouchedTickets(currentTickets, archivedByKey, absorbedKeys) {
  let repairedLosses = 0;
  for (const ticket of currentTickets) {
    const key = ticketKeyOf(ticket);
    if (absorbedKeys.includes(key)) continue;
    const isSurvivor = (ticket.condensedFrom?.tickets ?? []).length > 0;
    if (isSurvivor) continue;
    const archived = archivedByKey.get(key);
    if (archived === undefined) {
      return { ok: false, code: 'RESTORE_ARCHIVE_INCOMPLETE', detail: `${key} is missing from the archive`, repairedLosses };
    }
    const before = stripForComparison(archived);
    const after = stripForComparison(ticket);
    const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const field of fields) {
      if (LOSSY_FIELDS.includes(field)) {
        if (hasValue(after[field]) && stableStringify(after[field]) !== stableStringify(before[field])) {
          return { ok: false, code: 'RESTORE_POST_CONDENSE_EDIT', detail: `${key} changed ${field} after condensation`, repairedLosses };
        }
        if (!hasValue(after[field]) && hasValue(before[field])) repairedLosses += 1;
        continue;
      }
      if (stableStringify(before[field]) !== stableStringify(after[field])) {
        return { ok: false, code: 'RESTORE_POST_CONDENSE_EDIT', detail: `${key} changed ${field} after condensation`, repairedLosses };
      }
    }
  }
  return { ok: true, repairedLosses };
}

/**
 * Find the archive that restores one package.
 *
 * @param {string} ticketsPath
 * @returns {object} a candidate result; ok false carries a named code
 */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function findRestoreCandidate(ticketsPath) {
  if (!fs.existsSync(ticketsPath)) return { ok: false, code: 'RESTORE_TICKETS_MISSING', detail: ticketsPath };
  const current = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const currentTickets = allTickets(current);
  const absorbedKeys = collectAbsorbedKeys(current);
  if (absorbedKeys.length === 0) {
    return { ok: true, skipped: 'no-condensed', before: currentTickets.length, after: currentTickets.length };
  }

  const directory = path.dirname(ticketsPath);
  for (const archivePath of archivePaths(directory)) {
    let archived;
    try {
      archived = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
    } catch {
      continue;
    }
    const archivedTickets = allTickets(archived);
    const archivedByKey = new Map(archivedTickets.map((ticket) => [ticketKeyOf(ticket), ticket]));
    if (!absorbedKeys.every((key) => archivedByKey.has(key))) continue;
    if (archivedTickets.length !== currentTickets.length + absorbedKeys.length) {
      return {
        ok: false,
        code: 'RESTORE_COUNT_MISMATCH',
        detail: `${path.basename(archivePath)} has ${archivedTickets.length}, expected ${currentTickets.length + absorbedKeys.length}`,
      };
    }
    const validation = validateUntouchedTickets(currentTickets, archivedByKey, absorbedKeys);
    if (!validation.ok) return validation;
    return {
      ok: true,
      archivePath,
      archived,
      before: currentTickets.length,
      after: archivedTickets.length,
      repairedLosses: validation.repairedLosses,
    };
  }
  return { ok: false, code: 'RESTORE_ARCHIVE_MISSING', detail: absorbedKeys.join(', ') };
}

/** Atomically replace the ticket file with the archive bytes. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function writeAtomically(targetPath, bytes) {
  const temporary = `${targetPath}.restore-tmp`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, targetPath);
}

/**
 * Restore one package.
 *
 * @param {{ ticketsPath: string, apply?: boolean }} options
 * @returns {object}
 */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function restoreCondensedTickets(options) {
  const candidate = findRestoreCandidate(options.ticketsPath);
  if (!candidate.ok) return candidate;
  if (candidate.skipped === 'no-condensed') return { ...candidate, applied: false };
  if (options.apply === true) {
    writeAtomically(options.ticketsPath, fs.readFileSync(candidate.archivePath));
  }
  return { ...candidate, applied: options.apply === true };
}

/** Every Tickets.json below a workspace root, excluding dependency and fixture trees. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function discoverTicketFiles(root) {
  const found = [];
  const walk = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const full = path.join(directory, name);
      let stats;
      try {
        stats = fs.statSync(full);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.includes(name)) continue;
        walk(full);
      } else if (name === 'Tickets.json') {
        found.push(full);
      }
    }
  };
  walk(path.resolve(root));
  return found;
}

/** Render the restore results as Markdown. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function renderRestoreReport(results, workspaceRoot) {
  const lines = [];
  let restored = 0;
  let skipped = 0;
  let failed = 0;
  let repairedLosses = 0;
  for (const entry of results) {
    if (entry.ok === false) {
      failed += 1;
      lines.push(`FAILED ${entry.ticketsPath} ${entry.code}: ${entry.detail ?? ''}`);
    } else if (entry.skipped === 'no-condensed') {
      skipped += 1;
      lines.push(`skipped ${entry.ticketsPath}: no-condensed`);
    } else {
      restored += 1;
      repairedLosses += entry.repairedLosses ?? 0;
      const verb = entry.applied ? 'RESTORED' : 'READY';
      lines.push(`${verb} ${entry.ticketsPath} ${entry.before} -> ${entry.after} via ${path.basename(entry.archivePath)} repairs=${entry.repairedLosses ?? 0}`);
    }
  }
  lines.push(`restore summary: readyOrRestored=${restored} skipped=${skipped} failed=${failed} repairedLosses=${repairedLosses}`);
  if (workspaceRoot) lines.unshift(`workspace ${workspaceRoot}`);
  return `${lines.join('\n')}\n`;
}

/** Parse the command line. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const options = { ticketsPath: null, workspace: null, apply: false };
  for (const argument of argv.slice(2)) {
    if (argument.startsWith('--tickets=')) options.ticketsPath = path.resolve(argument.slice('--tickets='.length));
    else if (argument.startsWith('--workspace=')) options.workspace = path.resolve(argument.slice('--workspace='.length));
    else if (argument === '--apply') options.apply = true;
    else if (argument === '--dry-run') options.apply = false;
    else return null;
  }
  return options;
}

/** CLI entry point. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function main(argv = process.argv) {
  const options = parseArgs(argv);
  if (options === null) {
    process.stderr.write('Usage: restore-condensed-tickets.js --tickets=<Tickets.json>|--workspace=<root> [--dry-run|--apply]\n');
    return 2;
  }
  const targets = options.ticketsPath === null
    ? (options.workspace === null ? [] : discoverTicketFiles(options.workspace))
    : [options.ticketsPath];
  if (targets.length === 0) {
    process.stderr.write('restore: no Tickets.json found\n');
    return 2;
  }
  const results = targets.map((ticketsPath) => ({
    ticketsPath,
    ...restoreCondensedTickets({ ticketsPath, apply: options.apply }),
  }));
  process.stdout.write(renderRestoreReport(results, options.workspace));
  return results.some((entry) => entry.ok === false) ? 1 : 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  ARCHIVE_PREFIX,
  LOSSY_FIELDS,
  discoverTicketFiles,
  findRestoreCandidate,
  renderRestoreReport,
  restoreCondensedTickets,
  validateUntouchedTickets,
  main,
};
