#!/usr/bin/env node
/**
 * One verdict for the whole criterion, clause by clause.
 *
 * The two gates answer halves of the question and the rail answers a third, so a reader asking
 * whether a distribution is complete had to hold three answers in mind and decide for themselves
 * whether together they were enough. That is the reading this command replaces: it evaluates the
 * criterion in one pass and prints one line per clause, so a short clause is named with the check
 * that measured it and the boundary of what a satisfied run means is printed rather than inferred.
 *
 * It measures nothing itself. Every clause is answered by the check the clause names, read through
 * the same readers the gates use, so this command cannot disagree with the gate a reader would
 * otherwise run — and the closure clause is evaluated over this command's own sibling sources,
 * which is what makes a claim printed without a measurement behind it fail here.
 */
import fs from 'node:fs';
import path from 'node:path';

import { CRITERION_BOUNDARY, criterionFindings } from '../sequences-slice/lib/distribution-criterion.mjs';
import { DEMAND_AXES, measureCoverage, measureDischarge } from '../sequences-slice/lib/obligation-coverage.mjs';
import { collectUnitIds } from '../sequences-slice/lib/material.mjs';
import { resolveGround, sectionIdentifiersOf } from '../sequences-slice/lib/obligation-ground.mjs';
import { toHomeRelative } from '../lib/path-utils.js';

import { findPackageDirectories, readLedgers } from './check-ledger-discharge.js';
import { findArtifact, readJsonOrNull, readViews } from './check-obligation-coverage.js';

const EXIT_OK = 0;
const EXIT_FAILED = 1;

const USAGE = 'usage: check-distribution-completeness.js <WORKSPACE_ROOT>';
const ALLOCATE_MANIFEST_FILENAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
const TREE_MANIFEST_FILENAME = 'WORKSPACIFY-TREE-MANIFEST.json';
const GATE_FILENAME = 'check-obligation-coverage.js';

/** The sources whose claims the closure clause reads: this gate's siblings. */
// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
function siblingSourceTexts() {
  return fs.readdirSync(import.meta.dirname)
    .filter((name) => name.startsWith('check-') && name.endsWith('.js'))
    .map((name) => fs.readFileSync(path.join(import.meta.dirname, name), 'utf8'))
    .join('\n');
}

/** The document a ledger lives in, as the resolver reads one: its own line count and its labels. */
// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
function documentViewOf(rfcText) {
  return { spec: { lines: String(rfcText).split('\n').length }, sections: [], operations: [], sequences: [] };
}

/** The ledger locations that cite something and contradict the document they cite. */
// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
function unresolvedLocations(ledgerRows) {
  const unresolved = [];
  for (const [packageId, entry] of ledgerRows) {
    const labels = sectionIdentifiersOf(entry.rfcText);
    for (const row of entry.rows) {
      const { unresolved: references } = resolveGround(row.location, documentViewOf(entry.rfcText), { sections: labels });
      if (references.length > 0) unresolved.push({ packageId, location: String(row.location) });
    }
  }
  return { unresolved };
}

/** The packages the allocation names, and the packages that carry a view. */
// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
function packageCoverage(allocateManifest, views) {
  const named = new Set();
  for (const contract of allocateManifest?.contract_registry ?? []) {
    if (contract?.provider_package) named.add(String(contract.provider_package));
    if (contract?.consumer_package) named.add(String(contract.consumer_package));
  }
  const withView = new Set(views.map((view) => String(view.packageId)));
  return { named: [...named].sort(), withView: [...withView].sort() };
}

/**
 * One line per clause, then the boundary.
 *
 * The clause id leads so a reader can scan the list, and the check that measured it is printed
 * beside the state so a short clause names where to look rather than only that something is short.
 */
// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
function renderCriterionLines(findings) {
  return findings.map((finding) => {
    const state = finding.holds ? 'holds' : 'not established';
    return `${finding.id} ${state} — ${finding.claim} (measured by ${finding.measuredBy})`;
  });
}

/** Measure the criterion over one workspace and print it. */
// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
export function main(argv = process.argv.slice(2)) {
  const [rootArgument] = argv.filter((argument) => !argument.startsWith('--'));
  if (rootArgument === undefined) {
    process.stderr.write(`${USAGE}\n`);
    return EXIT_FAILED;
  }
  const root = path.resolve(rootArgument);

  const artifact = findArtifact(root);
  const allocateManifest = readJsonOrNull(path.join(root, ALLOCATE_MANIFEST_FILENAME));
  if (artifact === null || allocateManifest === null) {
    process.stderr.write(`refused: ${toHomeRelative(root)} does not hold both an artifact and an ${ALLOCATE_MANIFEST_FILENAME}\n`);
    return EXIT_FAILED;
  }

  const views = readViews(root);
  const { ledgers, ledgerRows, malformed } = readLedgers(findPackageDirectories(root));
  const coverage = measureCoverage({
    artifact,
    allocateManifest,
    views,
    exemptions: (artifact.exemptions ?? []).filter((row) => typeof row?.why === 'string' && row.why.trim().length > 0),
    treeManifest: readJsonOrNull(path.join(root, TREE_MANIFEST_FILENAME)),
  });
  const discharge = measureDischarge({ views, ledgersByPackage: ledgers });
  const refused = new Set(malformed.map((entry) => entry.packageId));

  const findings = criterionFindings({
    coverage,
    discharge: { ...discharge, withoutLedger: discharge.withoutLedger.filter((packageId) => !refused.has(packageId)), malformed },
    locations: unresolvedLocations(ledgerRows),
    packages: packageCoverage(allocateManifest, views),
    gateSource: fs.readFileSync(path.join(import.meta.dirname, GATE_FILENAME), 'utf8'),
  });

  const lines = [
    `distribution: ${DEMAND_AXES.reduce((total, axis) => total + coverage.axes[axis].unassigned.length, 0)} demand(s) unassigned, ${discharge.unaccounted.length} package(s) unaccounted for`,
    ...renderCriterionLines(findings),
    `does not guarantee: ${CRITERION_BOUNDARY}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
  return findings.every((finding) => finding.holds) ? EXIT_OK : EXIT_FAILED;
}

// The gate is spawned as a program by the grill and by its tests, so the entry point is explicit.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}

export { packageCoverage, renderCriterionLines, siblingSourceTexts, unresolvedLocations };
