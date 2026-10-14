#!/usr/bin/env node
/**
 * check-ledger-discharge.js <WORKSPACE_ROOT>
 *
 * The gate for the other half of the guarantee.
 *
 * check-obligation-coverage.js decides that every demand is owed by a named package. That is
 * half of the implication: the antecedent also needs each package to have accounted for what it
 * was handed, and a unit nobody wrote down is a unit nobody was held to. This gate decides that
 * half, workspace-wide, by reading each package's own distribution ledger.
 *
 * It is a separate program rather than a fifth axis of the coverage verdict, and the reason is a
 * moment in the workflow rather than a matter of taste: a demand can be assigned before any RFC
 * exists, and a unit can only be accounted for after the RFC that carries its ledger is written.
 * One verdict carrying both would be unsatisfiable at the step where the demand is resolved, and
 * an instruction that cannot be satisfied is the defect this pair of gates exists to avoid.
 *
 * It reads the ledger through the one parser the repository has, so this gate and the per-package
 * report cannot disagree about what a ledger is. It decides nothing about the design.
 *
 * Exit-code contract:
 *   every unit every view holds is accounted for → 0
 *   no ledger, a malformed ledger, an omitted unit, or an unreadable input → 1
 *
 * Design context: tools/conver/docs/FIX-PLAN006.md sections 3.5 and 3.6.
 */
import fs from 'node:fs';
import path from 'node:path';

import { toHomeRelative } from '../lib/path-utils.js';
import { readDistributionLedger } from '../sequences-slice/lib/distribution-ledger.mjs';
import { resolveGround, sectionIdentifiersOf } from '../sequences-slice/lib/obligation-ground.mjs';
import { VIEW_JSON_NAME, collectUnitIds } from '../sequences-slice/lib/material.mjs';
import { measureDischarge } from '../sequences-slice/lib/obligation-coverage.mjs';
import { PACKAGE_ROOT_DIRECTORY } from '../sequences-slice/lib/segments.mjs';

const EXIT_OK = 0;
const EXIT_FAILED = 1;

/** The document a package's distribution ledger is an appendix of. */
const RFC_FILENAME = 'RFC.md';

const USAGE = 'usage: check-ledger-discharge.js <WORKSPACE_ROOT>';

/** Read and parse one JSON file, or null when it cannot be read. */
// [::TICKET::] PX-261, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
function readJsonOrNull(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Read a text file, or null when it cannot be read. */
// [::TICKET::] PX-261, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
function readTextOrNull(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/** Every package directory beneath the workspace's package root, in path order. */
// [::TICKET::] PX-261, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
function findPackageDirectories(root) {
  const packageRoot = path.join(root, PACKAGE_ROOT_DIRECTORY);
  if (!fs.existsSync(packageRoot)) return [];
  const directories = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name === VIEW_JSON_NAME) directories.push(directory);
    }
  };
  walk(packageRoot);
  return directories;
}

/**
 * The units each package's ledger accounts for, and the packages whose ledger cannot be read.
 *
 * The parser answers three states and this keeps them apart rather than collapsing them into one
 * finding, because the repairs differ: a package with no ledger has not been grilled yet, a
 * package with a malformed ledger has written one the gate refuses, and a package whose ledger is
 * well formed but short has accounted for a subset of what it was handed.
 *
 * @param {string[]} directories
 * @returns {{ ledgers: Map<string, Set<string>>, malformed: Array<{ packageId: string, reason: string }>, views: object[] }}
 */
// [::TICKET::] PX-261, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
function readLedgers(directories) {
  const ledgers = new Map();
  const malformed = [];
  const locations = [];
  const ledgerRows = new Map();
  const views = [];

  for (const directory of directories) {
    const view = readJsonOrNull(path.join(directory, VIEW_JSON_NAME));
    if (view === null) continue;
    views.push(view);

    const unitIds = collectUnitIds(view);
    if (unitIds.length === 0) continue;

    const rfcText = readTextOrNull(path.join(directory, RFC_FILENAME));
    if (rfcText === null) continue;

    const verdict = readDistributionLedger(rfcText, new Set(unitIds));
    if (verdict === null) continue;
    if (!verdict.ok) {
      malformed.push({ packageId: String(view.packageId), reason: verdict.reason });
      continue;
    }
    ledgers.set(String(view.packageId), new Set(verdict.rows.map((row) => row.unit)));
    ledgerRows.set(String(view.packageId), { rows: verdict.rows, rfcText });

    // A location is resolved against the document it lives in, which is the only place its labels
    // exist. Only a location that cites something and contradicts the document is reported: one that
    // cites nothing was accepted before this and is still accepted, so a tightening does not become
    // a new obligation on rows nobody wrote as citations.
    const labels = sectionIdentifiersOf(rfcText);
    for (const row of verdict.rows) {
      const { unresolved } = resolveGround(row.location, documentViewOf(rfcText), { sections: labels });
      if (unresolved.length > 0) locations.push({ packageId: String(view.packageId), location: String(row.location), unresolved });
    }
  }
  return { ledgers, ledgerRows, malformed, locations, views };
}

/** The document a ledger lives in, as the resolver reads one: its own line count and nothing else. */
// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
function documentViewOf(rfcText) {
  return { spec: { lines: String(rfcText).split('\n').length }, sections: [], operations: [], sequences: [] };
}

/** The sentence stating what this gate does not guarantee, so a satisfied run is not read as more. */
// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
const LIMIT_LINE = 'does not guarantee: that a row whose location resolves is a row whose ground is the right ground, which is a reading of the design';

/** The lines naming what is undis-charged, each family apart. */
// [::TICKET::] PX-261, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
function renderDischargeLines(discharge, malformed, locations) {
  return [
    ...discharge.withoutLedger.map((packageId) => `no distribution ledger: ${packageId}`),
    ...malformed.map((entry) => `not well formed: ${entry.packageId} — ${entry.reason}`),
    ...locations.map((entry) => `location does not resolve: ${entry.packageId} — ${entry.location}`),
    ...discharge.unaccounted.map((entry) => `unaccounted: ${entry.packageId} — ${entry.unitIds.join(', ')}`),
  ];
}

/** Measure one workspace's discharge and print it. */
// [::TICKET::] PX-261, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const [rootArgument] = argv.filter((argument) => !argument.startsWith('--'));
  if (rootArgument === undefined) {
    process.stderr.write(`${USAGE}\n`);
    return EXIT_FAILED;
  }
  const root = path.resolve(rootArgument);
  if (!fs.existsSync(root)) {
    process.stderr.write(`refused: ${toHomeRelative(root)} could not be read\n`);
    return EXIT_FAILED;
  }

  const { ledgers, malformed, locations, views } = readLedgers(findPackageDirectories(root));
  const measured = measureDischarge({ views, ledgersByPackage: ledgers });
  // A package whose ledger was found and refused is not a package with no ledger, and reporting
  // it as both would name two repairs for one defect. It is read once and answered once.
  const refused = new Set(malformed.map((entry) => entry.packageId));
  const lines = renderDischargeLines({ ...measured, withoutLedger: measured.withoutLedger.filter((packageId) => !refused.has(packageId)) }, malformed, locations);
  lines.push(LIMIT_LINE);

  if (lines.length === 1) {
    lines.unshift('discharged: every unit every view holds is accounted for');
    process.stdout.write(`${lines.join('\n')}\n`);
    return EXIT_OK;
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  return EXIT_FAILED;
}

// The gate is spawned as a program by the grill and by its tests, so the entry point is explicit.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}

export { LIMIT_LINE, findPackageDirectories, main, readLedgers, renderDischargeLines };
