#!/usr/bin/env node
/**
 * defect-report.js <root> [--gate] [--json]
 *
 * The workspace-wide defect inventory, and the gate that makes full resolution
 * binding. A defect that no fix inside one directory can reach is still this run's
 * defect, so the inventory is taken over every package under `<root>`, not over one.
 *
 * The ledger is read out of each package's `RFC.md`. There is deliberately no side
 * file: a second source of truth is what the seed divergence ledger exists to
 * eliminate, and a row that lives only in a copy cannot satisfy this gate.
 *
 * A package that carries no ledger fails the gate even with nothing to report. An
 * unread neighbour is indistinguishable from a clean one, so "no defect" is accepted
 * only from a ledger that records the composition checks establishing it.
 *
 * Exit 0 — the report was printed; or, with `--gate`, every package is resolved.
 * Exit 1 — with `--gate`, some package or row is not.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { findSectionByTitleSuffix, readFirstTable } from './lib/markdown-sections.mjs';

/** The appendix this gate reads. */
const LEDGER_TITLE_SUFFIX = 'Cross-directory defect ledger';

/** The three classes a defect can take. `open` is not one of them. */
const DEFECT_CLASSES = ['contradiction', 'conflict', 'deficiency'];

/** The three dispositions. `open` and `unresolved` are not among them. */
const DISPOSITIONS = ['resolved-here', 'resolved-other', 'withdrawn'];

/** A disposition other than `resolved-other` needs no cross-directory evidence. */
const CROSS_DIRECTORY_DISPOSITION = 'resolved-other';

/** What evidence for a cross-directory fix must carry: a target and a date. */
const EVIDENCE_PATTERN = /RFC\.md\s*@\s*\d{4}-\d{2}-\d{2}/;

/** A package with no rows must have looked; this is what it records having done. */
const COMPOSITION_CHECK_PATTERN = /composition check/i;

const DIRECTORY_ENTRIES_TO_SKIP = new Set(['node_modules', '.git']);

const USAGE = 'usage: defect-report.js <root> [--gate] [--json]';

/**
 * Every `RFC.md` under `root`.
 *
 * @param {string} root
 * @returns {string[]} absolute paths
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function collectRfcPaths(root) {
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (DIRECTORY_ENTRIES_TO_SKIP.has(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...collectRfcPaths(path));
    else if (entry.name === 'RFC.md') found.push(path);
  }
  return found;
}

/**
 * The reason one row cannot stand, or null when it can.
 *
 * @param {string[]} row — the six cells
 * @returns {string|null}
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function findRowFailure(row) {
  const [defect, defectClass, target, disposition, evidence, ground] = row;

  if (!DEFECT_CLASSES.includes(defectClass)) {
    return `class "${defectClass}" is not one of ${JSON.stringify(DEFECT_CLASSES)}: ${defect}`;
  }
  if (!target.endsWith('RFC.md')) {
    return `target "${target}" is not an RFC: ${defect}`;
  }
  if (!DISPOSITIONS.includes(disposition)) {
    return `disposition "${disposition}" is not one of ${JSON.stringify(DISPOSITIONS)}: ${defect}`;
  }
  if (disposition === CROSS_DIRECTORY_DISPOSITION && !EVIDENCE_PATTERN.test(evidence)) {
    return `evidence "${evidence}" names no date for a cross-directory fix: ${defect}`;
  }
  if (ground.trim().length === 0) {
    return `ground is empty for: ${defect}`;
  }
  return null;
}

/**
 * Read one package's ledger.
 *
 * @param {string} rfcPath
 * @returns {{ rfcPath: string, hasLedger: boolean, rows: string[][], failure: string|null }}
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function readPackageLedger(rfcPath) {
  const rfc = readFileSync(rfcPath, 'utf8');
  const ledger = findSectionByTitleSuffix(rfc, LEDGER_TITLE_SUFFIX);

  if (!ledger.found) {
    return { rfcPath, hasLedger: false, rows: [], failure: `no defect ledger appendix in ${rfcPath}` };
  }

  const { rows } = readFirstTable(ledger.body);
  if (rows.length === 0 && !COMPOSITION_CHECK_PATTERN.test(ledger.body)) {
    return {
      rfcPath,
      hasLedger: true,
      rows,
      failure: `${rfcPath} records no defect and no composition check, so it cannot be told from unread`,
    };
  }

  for (const row of rows) {
    const failure = findRowFailure(row);
    if (failure) return { rfcPath, hasLedger: true, rows, failure: `${rfcPath}: ${failure}` };
  }

  return { rfcPath, hasLedger: true, rows, failure: null };
}

/**
 * @param {string[]} argv
 * @returns {number} the exit status
 */
export function run(argv) {
  const root = argv.find((arg) => !arg.startsWith('--')) ?? '';
  const gate = argv.includes('--gate');
  const json = argv.includes('--json');

  if (root.length === 0) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }

  let packages;
  try {
    packages = collectRfcPaths(root).map(readPackageLedger);
  } catch (error) {
    process.stderr.write(`cannot read ${root}: ${error.message}\n`);
    return 1;
  }

  const failures = packages.map((entry) => entry.failure).filter(Boolean);

  if (json) {
    process.stdout.write(
      `${JSON.stringify({
        root,
        packages: packages.map((entry) => ({ rfcPath: entry.rfcPath, rows: entry.rows.length })),
        failures,
      })}\n`,
    );
  } else {
    for (const entry of packages) {
      process.stdout.write(`${entry.rfcPath}: ${entry.rows.length} defect(s)\n`);
    }
    for (const failure of failures) {
      process.stdout.write(`unresolved: ${failure}\n`);
    }
  }

  if (gate && failures.length > 0) {
    for (const failure of failures) process.stderr.write(`${failure}\n`);
    return 1;
  }

  return 0;
}

process.exit(run(process.argv.slice(2)));
