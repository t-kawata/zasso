// [::TICKET::] P25-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-4 --for-spec --no-implementation-order`.
// [::TICKET::] P25-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-3 --for-spec --no-implementation-order`.
// [::TICKET::] P25-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-2 --for-spec --no-implementation-order`.
// [::TICKET::] P25-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-1 --for-spec --no-implementation-order`.
/**
 * installed-copy-drift — an installed copy that has fallen behind is a recorded
 * fact rather than a silence.
 *
 * `tools/conver/.claude/scripts/workspacify-reverse/lib/` is the source of record
 * at 51 modules. Two installed copies carry 48 each: the repository root's, and
 * `crates/siprs`'s. Both are missing the same three modules and differ in the same
 * files, byte for byte identical to each other — the signature of two copies taken
 * from one older snapshot rather than of two divergent forks.
 *
 * The defect this test addresses is the silence and not the lag. A copy that lags
 * is delivered material at a released version, and advancing it is an installer
 * decision this ticket does not own. What nothing did was say so: a fourth module
 * could join the three and no test would notice.
 *
 * Measured 2026-09-15. The record below is frozen, so the lag cannot grow quietly
 * and a re-sync cannot happen quietly either — each fails here by name, and each
 * is resolved by re-measuring and recording. The record grew by one the same day
 * when P25-2 moved the source of record, which is the guard working rather than an
 * exception to it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  INSTALLED_COPIES,
  SOURCE_LIBRARY,
  measureInstalledCopyDrift,
  renderDriftReport,
} from '../lib/installed-copy-drift.mjs';
import { repositoryRootFrom } from '../lib/repo-hygiene.mjs';

const REPOSITORY_ROOT = repositoryRootFrom(dirname(fileURLToPath(import.meta.url)));

/**
 * The three modules the copies predate, and the files they carry differently.
 *
 * Re-measured 2026-09-15 by P25-2, which moved the source of record: the freeze list
 * lives in `command-file-digest.mjs`, and widening it made that file differ from both
 * copies. P25-4 moved it again, in `red-reconstruction.mjs` and `scope.mjs`. Both times
 * the record grew because the source moved and not because a copy did — and it grew
 * here, by name, which is what this record is for.
 */
const ABSENT_FROM_COPIES = Object.freeze(['build-database.mjs', 'capability-matrix.mjs', 'terminal-state.mjs']);
const DIFFERING_IN_COPIES = Object.freeze([
  'analysis-tech.mjs',
  'command-file-digest.mjs',
  'dependencies.mjs',
  'forward-surface-baseline.mjs',
  'holdout-ledger.mjs',
  'oracle-gap.mjs',
  'property-tests.mjs',
  'reachability.mjs',
  'red-reconstruction.mjs',
  'scope.mjs',
  'structure.mjs',
]);

const measure = () => measureInstalledCopyDrift({ repositoryRoot: REPOSITORY_ROOT });

test('the source of record and every installed copy are declared and present', () => {
// [::TICKET::] P25-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-5 --for-spec --no-implementation-order`.
  assert.ok(REPOSITORY_ROOT, 'the tree under test belongs to a repository, or nothing here can be measured');
  assert.strictEqual(SOURCE_LIBRARY, 'tools/conver/.claude/scripts/workspacify-reverse/lib');
  assert.deepStrictEqual(INSTALLED_COPIES, [
    '.claude/scripts/workspacify-reverse/lib',
    'crates/siprs/.claude/scripts/workspacify-reverse/lib',
  ]);

  assert.ok(existsSync(join(REPOSITORY_ROOT, SOURCE_LIBRARY)), 'the source of record must exist');
  for (const copy of INSTALLED_COPIES) {
    assert.ok(existsSync(join(REPOSITORY_ROOT, copy)), copy + ' must exist; a missing copy is a different finding');
  }
});

test('the drift is measured, not assumed: both copies lag the source by the same modules and files', () => {
  const report = measure();

  assert.strictEqual(report.source.modules, 51, 'the source of record is the count the copies are measured against');
  assert.strictEqual(report.copies.length, 2);

  for (const copy of report.copies) {
    assert.strictEqual(copy.modules, 48, copy.path + ' carries 48 modules');
    assert.deepStrictEqual(copy.absent, [...ABSENT_FROM_COPIES], copy.path + ' is missing the same three modules as its sibling');
    assert.deepStrictEqual(copy.differing, [...DIFFERING_IN_COPIES], copy.path + ' differs in the same files as its sibling');
    assert.deepStrictEqual(copy.extra, [], copy.path + ' carries nothing the source does not; an extra module is a fork, not a lag');
  }
});

test('the two copies are identical to each other, which is what makes this one snapshot and not two forks', () => {
  const [first, second] = measure().copies;

  assert.deepStrictEqual(first.absent, second.absent);
  assert.deepStrictEqual(first.differing, second.differing);
  assert.strictEqual(first.modules, second.modules);
});

test('the report names every drifting path, so a reader can act without re-deriving the measurement', () => {
  const report = renderDriftReport(measure());

  for (const name of [...ABSENT_FROM_COPIES, ...DIFFERING_IN_COPIES]) {
    assert.ok(report.includes(name), name + ' must be named in the report');
  }
  for (const copy of INSTALLED_COPIES) {
    assert.ok(report.includes(copy), copy + ' must be named in the report');
  }
});

test('a copy that is re-synced fails here until the record is re-measured', () => {
  // The pass condition is the record, not the drift, so a re-sync is a decision
  // that has to be written down rather than a change that slips through green.
  const report = measure();
  const recorded = report.copies.every(
    (copy) => copy.absent.length === ABSENT_FROM_COPIES.length && copy.differing.length === DIFFERING_IN_COPIES.length,
  );

  assert.strictEqual(recorded, true, 'the measured drift equals the record; re-measure and update the record together');
});
