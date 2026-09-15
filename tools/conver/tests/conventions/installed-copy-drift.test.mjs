// [::TICKET::] P25-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-4 --for-spec --no-implementation-order`.
// [::TICKET::] P25-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-3 --for-spec --no-implementation-order`.
// [::TICKET::] P25-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-2 --for-spec --no-implementation-order`.
// [::TICKET::] P25-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-1 --for-spec --no-implementation-order`.
/**
 * installed-copy-drift — an installed copy that has fallen behind is a recorded
 * fact rather than a silence.
 *
 * `tools/conver/.claude/scripts/workspacify-reverse/lib/` is the source of record. Two
 * installed copies carry it: the repository root's, and `crates/siprs`'s. Through P26-1
 * both lagged by three modules and twelve files, byte for byte identical to each other —
 * the signature of two copies taken from one older snapshot rather than of two divergent
 * forks — and that record is what made the lag a finding rather than a silence.
 *
 * P25-7 advanced both copies on 2026-09-15, because it removed a module from the source
 * of record and a copy whose `run.mjs` imports a module the source no longer has is not
 * lagging but inconsistent. The record is empty now, and it stays a record rather than a
 * formality: `absent` is a lag, `extra` is a fork and `differing` is a lag that has not
 * yet removed the file, so any of the three appearing again fails here by name rather
 * than passing as close enough.
 *
 * Measured 2026-09-15. The numbers below are frozen, and each is resolved by re-measuring
 * and recording rather than by adjusting it to fit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
 * What the copies held when this record was last written, and why it changed.
 *
 * Through P26-1 the copies lagged the source of record by three modules and twelve
 * files, and the record said so: a copy that lags is delivered material at a released
 * version, and the defect the record addressed was the silence rather than the lag.
 *
 * **The copies were advanced on 2026-09-15 by P25-7**, which removed a module from the
 * source of record and could not leave the copies carrying it: a copy whose `run.mjs`
 * imports a module the source no longer has is not lagging, it is inconsistent. So the
 * installer was run against both copy targets — the sanctioned mechanism, digest-based,
 * which preserves what it finds locally modified rather than overwriting it — and the
 * module the source no longer has was removed from both copies afterwards, because the
 * installer copies and never deletes.
 *
 * The record is therefore empty in all three lists, and it stays a record rather than a
 * formality: `absent` is a lag, `extra` is a fork, `differing` is a lag that has not yet
 * removed the file, and any of the three appearing again fails here by name.
 */
const ABSENT_FROM_COPIES = Object.freeze([]);
const DIFFERING_IN_COPIES = Object.freeze([]);

/** The modules the source of record holds, re-measured 2026-09-15 by P25-7. */
const SOURCE_MODULE_COUNT = 50;

const measure = () => measureInstalledCopyDrift({ repositoryRoot: REPOSITORY_ROOT });

/**
 * A throwaway source-and-copy pair, so a vocabulary is pinned on an input this file owns.
 *
 * @param {{ sourceModules: Record<string, string>, copyModules: Record<string, string> }} input
 * @returns {{ root: string, dispose: () => void }}
 */
// [::TICKET::] P25-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-7 --for-spec --no-implementation-order`.
function createSyntheticPair({ sourceModules, copyModules }) {
  const root = mkdtempSync(join(tmpdir(), 'wsp-drift-'));
  for (const [directory, modules] of [['source/lib', sourceModules], ['copy/lib', copyModules]]) {
    mkdirSync(join(root, directory), { recursive: true });
    for (const [name, text] of Object.entries(modules)) writeFileSync(join(root, directory, name), text);
  }
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

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

test('the drift is measured, not assumed: each copy is the source of record', () => {
  const report = measure();

  assert.strictEqual(
    report.source.modules,
    SOURCE_MODULE_COUNT,
    'the source of record is the count the copies are measured against',
  );
  assert.strictEqual(report.copies.length, 2);

  for (const copy of report.copies) {
    assert.strictEqual(copy.modules, SOURCE_MODULE_COUNT, copy.path + ' carries every module the source holds');
    assert.deepStrictEqual(copy.absent, [...ABSENT_FROM_COPIES], copy.path + ' is missing nothing the source holds');
    assert.deepStrictEqual(copy.differing, [...DIFFERING_IN_COPIES], copy.path + ' carries the same bytes as the source');
    assert.deepStrictEqual(copy.extra, [], copy.path + ' carries nothing the source does not; an extra module is a fork');
  }
});

test('a module only a copy carries is reported as extra rather than as a lag', () => {
  // The finding a re-sync leaves behind: the installer copies and never deletes, so a
  // module the source removed stays in the copy until it is removed deliberately. The
  // synthetic pair pins the vocabulary, because `absent` and `extra` are opposite
  // findings and a measurement that merged them would call an orphan a lag.
  const pair = createSyntheticPair({
    sourceModules: { 'shared.mjs': 'export const shared = 1;\n' },
    copyModules: { 'shared.mjs': 'export const shared = 1;\n', 'orphan.mjs': 'export const orphan = 1;\n' },
  });
  try {
    const report = measureInstalledCopyDrift({ repositoryRoot: pair.root, source: 'source/lib', copies: ['copy/lib'] });

    assert.deepStrictEqual(report.copies[0].extra, ['orphan.mjs'], 'the module only the copy has');
    assert.deepStrictEqual(report.copies[0].absent, [], 'and the source is missing nothing');
    assert.deepStrictEqual(report.copies[0].differing, [], 'the shared module is byte-identical');
  } finally {
    pair.dispose();
  }
});

test('the two copies are identical to each other, which is what makes this one snapshot and not two forks', () => {
  const [first, second] = measure().copies;

  assert.deepStrictEqual(first.absent, second.absent);
  assert.deepStrictEqual(first.differing, second.differing);
  assert.strictEqual(first.modules, second.modules);
});

test('the report names what was measured, and says none rather than nothing when there is no drift', () => {
  const measurement = measure();
  const report = renderDriftReport(measurement);

  assert.ok(report.includes(SOURCE_LIBRARY), 'the report names the source of record');
  for (const copy of INSTALLED_COPIES) {
    assert.ok(report.includes(copy), copy + ' must be named in the report');
  }

  // A zero and a silence are different findings: the header states the count measured
  // against, and each of the three lists states its emptiness in words rather than
  // leaving the reader to infer it from an absence of rows.
  assert.match(report, new RegExp(`\\*\\*${SOURCE_MODULE_COUNT}\\*\\* module`));
  const listsPerCopy = 3;
  assert.equal(
    (report.match(/none/g) ?? []).length,
    listsPerCopy * measurement.copies.length,
    'every list of every copy states its emptiness in words',
  );
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
