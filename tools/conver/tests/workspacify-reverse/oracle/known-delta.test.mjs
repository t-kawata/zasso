// [::TICKET::] P22-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-2 --for-spec --no-implementation-order`.
/**
 * The known structural delta between the answer key and the subject.
 *
 * `siprs-for-reverse` is not a byte copy of `siprs-with-4layers`: PX-203 removed
 * the forward artefacts, stripped provenance comments from 146 shared files,
 * renamed ten ticket-keyed test files and deleted one L3 test function. Every
 * one of those is intentional, and a reconciliation that reported them as
 * findings would waste the classification pass on eleven phantoms.
 *
 * So the delta is MEASURED, never assumed, and every entry carries the evidence
 * that established it. The ten renames are recovered three ways, because no
 * single rule recovers all ten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  KNOWN_DELTA_RELATIVE_PATH,
  extractKnownDelta,
} from '../../../.claude/scripts/workspacify-reverse/lib/oracle-bundle.mjs';
import {
  ORACLE_FIXTURE_FILES,
  SUBJECT_FIXTURE_FILES,
  createSyntheticOraclePair,
  createSyntheticTree,
} from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ORACLE_ROOT = fileURLToPath(new URL('../../../siprs-with-4layers', import.meta.url));
const SUBJECT_ROOT = fileURLToPath(new URL('../../../siprs-for-reverse', import.meta.url));
const KNOWN_DELTA_PATH = join(PROJECT_ROOT, KNOWN_DELTA_RELATIVE_PATH);
const bothTreesAvailable = existsSync(ORACLE_ROOT) && existsSync(SUBJECT_ROOT);

const EXPECTED_RENAMES = Object.freeze({
  verify_spec_p9_1: 'verify_spec_e0606bc3',
  verify_spec_p10_1: 'verify_spec_a4ecaf0f',
  verify_spec_p8_2: 'verify_spec_0963da9b',
  verify_spec_p9_2: 'verify_spec_f330ed39',
  verify_spec_p7_3: 'verify_spec_26d77120',
  verify_spec_p8_3: 'verify_spec_36123930',
  verify_spec_p8_7: 'verify_spec_7c1bb4d6',
  verify_spec_p9_3: 'verify_spec_64eff610',
  verify_spec_p9_5: 'verify_spec_7e78be0d',
  verify_spec_p0_1: 'verify_spec_4b35a676',
});

// --- C006 precondition ----------------------------------------------------------

test('C006 precondition: both trees are present and carry the file counts the design records', { skip: !bothTreesAvailable }, () => {
  const delta = extractKnownDelta({ oracleRoot: ORACLE_ROOT, subjectRoot: SUBJECT_ROOT });
  assert.ok(delta.counts.oracleFiles > 4000);
  assert.ok(delta.counts.subjectFiles > 2700);
  assert.equal(delta.measuredNotAssumed, true);
});

// --- UT-9: the delta is measured -------------------------------------------------

test('UT-9: the delta counts are measured, not assumed', { skip: !bothTreesAvailable }, () => {
  const delta = extractKnownDelta({ oracleRoot: ORACLE_ROOT, subjectRoot: SUBJECT_ROOT });
  assert.equal(delta.counts.oracleFiles, 4272);
  assert.equal(delta.counts.subjectFiles, 2791);
  assert.equal(delta.counts.shared, 2781);
  assert.equal(delta.counts.onlyInOracle, 1491);
  assert.equal(delta.counts.onlyInSubject, 10);
  assert.equal(delta.counts.differing, 146);
});

test('UT-9 companion: every artefact-only path is grouped and accounted for', { skip: !bothTreesAvailable }, () => {
  const delta = extractKnownDelta({ oracleRoot: ORACLE_ROOT, subjectRoot: SUBJECT_ROOT });
  assert.equal(
    delta.oracleOnlyGroups.reduce((sum, group) => sum + group.count, 0),
    delta.counts.onlyInOracle,
    'the groups must account for every path, or the delta is a sample rather than a measurement',
  );
  const byTop = Object.fromEntries(delta.oracleOnlyGroups.map((group) => [group.top, group.count]));
  assert.equal(byTop['.claude'], 1239);
  assert.equal(byTop['specs'], 115);
  assert.equal(byTop['drills'], 82);
  assert.equal(byTop['omissions'], 8);
});

test('UT-9 companion: the 146 differing shared files split into 144 trace-stripped and 2 substantive', { skip: !bothTreesAvailable }, () => {
  const delta = extractKnownDelta({ oracleRoot: ORACLE_ROOT, subjectRoot: SUBJECT_ROOT });
  assert.equal(delta.substantiveSharedFiles.length, 2);
  assert.deepEqual(delta.substantiveSharedFiles.map((entry) => entry.file).sort(), ['Cargo.toml', 'src/client.rs']);
  assert.equal(delta.traceStrippedSharedFiles.length, 144);
  for (const entry of delta.traceStrippedSharedFiles) {
    assert.ok(entry.evidence.length > 0, `${entry.file} must cite why its difference is a trace difference`);
  }
});

test('UT-9 companion: the removed L3 test function is recorded with the file it read', { skip: !bothTreesAvailable }, () => {
  const delta = extractKnownDelta({ oracleRoot: ORACLE_ROOT, subjectRoot: SUBJECT_ROOT });
  const removed = delta.removedTestFunctions.find((entry) => entry.file === 'src/client.rs');
  assert.ok(removed, 'the removed function must be recorded, or it returns as a phantom finding');
  assert.equal(removed.name, 'purpose_scope_remains_audio_only');
  assert.match(removed.evidence, /RFC-ROOT\.md/);
});

// --- C006 postcondition: the ten renames ----------------------------------------

test('C006 postcondition: all ten renamed test files are recovered, each with its evidence', { skip: !bothTreesAvailable }, () => {
  const delta = extractKnownDelta({ oracleRoot: ORACLE_ROOT, subjectRoot: SUBJECT_ROOT });

  assert.equal(delta.renamedTestFiles.length, 10);
  const recovered = Object.fromEntries(delta.renamedTestFiles.map((entry) => [entry.original, entry.renamed]));
  for (const [original, renamed] of Object.entries(EXPECTED_RENAMES)) {
    assert.equal(recovered[original], renamed, `${original} must be mapped to ${renamed}`);
  }

  const byKind = {};
  for (const entry of delta.renamedTestFiles) byKind[entry.evidenceKind] = (byKind[entry.evidenceKind] ?? 0) + 1;
  assert.deepEqual(byKind, { 'cargo-toml-alignment': 4, 'comment-stripped-identity': 5, 'whole-function-removal': 1 });

  for (const entry of delta.renamedTestFiles) {
    assert.ok(entry.evidence.length > 0, `${entry.original} must cite how the rename was recovered`);
  }
  assert.deepEqual(delta.unresolvedRenames, [], 'a rename that could not be recovered must be reported rather than guessed');
});

test('C006 postcondition: the ten files present only in the subject are exactly the renamed tests', { skip: !bothTreesAvailable }, () => {
  const delta = extractKnownDelta({ oracleRoot: ORACLE_ROOT, subjectRoot: SUBJECT_ROOT });
  assert.deepEqual(
    delta.onlyInSubject.map((entry) => entry.file).sort(),
    Object.values(EXPECTED_RENAMES).map((name) => `tests/${name}.rs`).sort(),
  );
});

// --- C006 invariant --------------------------------------------------------------

test('C006 postcondition: every measured difference class reaches the expected set, not only the renames', { skip: !bothTreesAvailable }, () => {
  const delta = extractKnownDelta({ oracleRoot: ORACLE_ROOT, subjectRoot: SUBJECT_ROOT });

  // The artefact-only paths and the trace-stripped shared files are known
  // differences too. Recording them in sibling arrays that `reconcile` never
  // reads leaves them to be handed to a human as findings.
  const kinds = new Set(delta.expectedDifferences.map((entry) => entry.kind));
  for (const kind of ['artefact-only', 'trace-stripped', 'renamed-test-file', 'removed-test-function']) {
    assert.ok(kinds.has(kind), `the "${kind}" class must be an expected difference, got: ${[...kinds].join(', ')}`);
  }
  assert.equal(
    delta.expectedDifferences.filter((entry) => entry.kind === 'trace-stripped').length,
    delta.traceStrippedSharedFiles.length,
    'every trace-stripped file is accounted for',
  );
});

test('C006 invariant: every expected difference carries the evidence that established it', { skip: !bothTreesAvailable }, () => {
  const delta = extractKnownDelta({ oracleRoot: ORACLE_ROOT, subjectRoot: SUBJECT_ROOT });
  assert.equal(delta.measuredNotAssumed, true);
  assert.ok(delta.expectedDifferences.length >= 11, 'the ten renames and the removed function at minimum');
  for (const entry of delta.expectedDifferences) {
    assert.equal(typeof entry.name, 'string');
    assert.equal(typeof entry.kind, 'string');
    assert.ok(entry.evidence.length > 0, `${entry.name} must cite its evidence`);
  }
});

test('the checked-in delta is a fresh measurement, so it cannot label a new difference expected', { skip: !bothTreesAvailable }, () => {
  const written = JSON.parse(readFileSync(KNOWN_DELTA_PATH, 'utf8'));
  const measured = extractKnownDelta({ oracleRoot: ORACLE_ROOT, subjectRoot: SUBJECT_ROOT });

  // `oracle compare` reads this file. If it drifts from the trees, every
  // difference discovered since it was written is labelled "expected" and no
  // test notices — the suite stays green while the instrument lies.
  assert.deepEqual(
    written.counts,
    measured.counts,
    'the checked-in delta must describe the trees as they are; re-run "run.mjs oracle delta"',
  );
  assert.deepEqual(
    written.expectedDifferences.map((entry) => entry.name).sort(),
    measured.expectedDifferences.map((entry) => entry.name).sort(),
    'the expected set must be the measured set; re-run "run.mjs oracle delta"',
  );
});

// --- The recovery rules, proven on a pair built to be recoverable ----------------

test('the three recovery rules are distinguishable on a synthetic pair', () => {
  const pair = createSyntheticOraclePair();
  try {
    const delta = extractKnownDelta({ oracleRoot: pair.oracleRoot, subjectRoot: pair.subjectRoot });

    const recovered = Object.fromEntries(delta.renamedTestFiles.map((entry) => [entry.original, entry.renamed]));
    assert.equal(recovered['verify_spec_p7_3'], 'verify_spec_26d77120', 'comment-stripped identity recovers this one');
    assert.equal(delta.renamedTestFiles.length, 2);
    assert.deepEqual(delta.unresolvedRenames, []);
  } finally {
    pair.dispose();
  }
});

test('a synthetic pair with an unrecoverable rename reports it rather than guessing', () => {
  const oracle = createSyntheticTree(ORACLE_FIXTURE_FILES, { prefix: 'wsp-oracle-' });
  const subjectFiles = { ...SUBJECT_FIXTURE_FILES };
  // Rename the test files AND change their content, so no recovery rule can apply,
  // and leave Cargo.toml naming files that are not there.
  delete subjectFiles['tests/verify_spec_4b35a676.rs'];
  delete subjectFiles['tests/verify_spec_26d77120.rs'];
  subjectFiles['tests/verify_spec_zzzzzzzz.rs'] = 'pub fn unrelated() -> u8 { 99 }\n';
  subjectFiles['tests/verify_spec_yyyyyyyy.rs'] = 'pub fn also_unrelated() -> u8 { 98 }\n';
  const subject = createSyntheticTree(subjectFiles, { prefix: 'wsp-subject-' });

  try {
    const delta = extractKnownDelta({ oracleRoot: oracle.root, subjectRoot: subject.root });
    assert.ok(delta.unresolvedRenames.length > 0, 'an unmatched name must be reported, never silently paired');
    assert.deepEqual(delta.renamedTestFiles, []);
    assert.equal(
      delta.renamedTestFiles.length + delta.unresolvedRenames.filter((entry) => entry.side === 'subject').length,
      delta.subjectTestNames.length,
      'every subject-side test name is either mapped or reported',
    );
  } finally {
    oracle.dispose();
    subject.dispose();
  }
});
