// [::TICKET::] P22-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-2 --for-spec --no-implementation-order`.
/**
 * The frozen answer key.
 *
 * `siprs-with-4layers` is the same project taken through the forward rotation
 * to RESIDUE 0, so it holds what reverse rotation is trying to reconstruct.
 * Modifying it destroys every measurement ever taken against it, so this suite
 * asserts non-modification far more strictly than it asserts any count.
 *
 * The refusal paths run against a synthetic oracle tree. Tampering with the
 * real answer key to prove that tampering is detected would be the very defect
 * the check exists to prevent.
 *
 * Writing is separated from reading: `freezeOracle` is pure, and only the CLI
 * and `writeOracleBundle` put anything on disk. No test writes into the
 * repository.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  BUNDLE_RELATIVE_PATH,
  DESIGN_STATED_COUNTS,
  ORACLE_TREE_RELATIVE_PATH,
  VERIFIES_RULE,
  extractArtefacts,
  freezeOracle,
  loadOracleBundle,
  renderOracleReport,
  writeOracleBundle,
} from '../../../.claude/scripts/workspacify-reverse/lib/oracle-bundle.mjs';
import { digestTree } from '../../../.claude/scripts/workspacify-reverse/lib/holdout-ledger.mjs';
import { reconcile } from '../../../.claude/scripts/workspacify-reverse/lib/reconcile.mjs';
import { ORACLE_FIXTURE_FILES, createSyntheticOraclePair, writeSyntheticTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ORACLE_ROOT = fileURLToPath(new URL('../../../siprs-with-4layers', import.meta.url));
const RUN_SCRIPT = fileURLToPath(new URL('../../../.claude/scripts/workspacify-reverse/run.mjs', import.meta.url));
const FROZEN_AT = '2026-09-10T00:00:00Z';
const oracleAvailable = existsSync(ORACLE_ROOT);

const ARTEFACT_NAMES = ['designHeaders', 'dirsTree', 'graph', 'omissions', 'rfcRoot', 'ticketMarkers', 'tickets', 'verifies'];

// --- UT-4: the extracted counts -------------------------------------------------

test('UT-4: freezeOracle records the answer key with a digest and a rule for every artefact', { skip: !oracleAvailable }, () => {
  const bundle = freezeOracle({ oracleRoot: ORACLE_ROOT, frozenAt: FROZEN_AT });

  assert.deepEqual(Object.keys(bundle.artefacts).sort(), ARTEFACT_NAMES);
  assert.equal(bundle.artefacts.graph.nodes, 113);
  assert.equal(bundle.artefacts.graph.edges, 153);
  assert.equal(bundle.artefacts.tickets.phases, 21);
  assert.equal(bundle.artefacts.tickets.total, 146);
  assert.equal(bundle.artefacts.omissions.files.length, 8);
  assert.equal(bundle.artefacts.ticketMarkers.fileCount, 313);
  assert.equal(bundle.artefacts.designHeaders.fileCount, 100);
  assert.equal(bundle.artefacts.verifies.fileCount, 127);
  assert.equal(bundle.artefacts.verifies.rule, VERIFIES_RULE);

  for (const [name, artefact] of Object.entries(bundle.artefacts)) {
    assert.match(artefact.sha256, /^[0-9a-f]{64}$/, `${name} must be frozen by digest`);
    assert.equal(typeof artefact.rule, 'string', `${name} must name its measuring rule`);
    assert.ok(artefact.rule.length > 0);
  }
  assert.match(bundle.sha256, /^[0-9a-f]{64}$/);
});

test('UT-4 companion: the Dirs-Tree is measured the way the design documents measure it', { skip: !oracleAvailable }, () => {
  const artefacts = extractArtefacts({ oracleRoot: ORACLE_ROOT });
  const raw = readFileSync(join(ORACLE_ROOT, 'RFC-ROOT-Dirs-Tree.json'), 'utf8');
  assert.equal(artefacts.dirsTree.minifiedChars, 26820);
  assert.equal(artefacts.dirsTree.minifiedChars, JSON.stringify(JSON.parse(raw)).length);
  assert.ok(artefacts.dirsTree.directories.length > 0, 'the partition is what R1/R2 are compared against');
});

test('UT-4 companion: the ten verify_spec tests and the eight omission files are named, not counted', { skip: !oracleAvailable }, () => {
  const artefacts = extractArtefacts({ oracleRoot: ORACLE_ROOT });
  assert.deepEqual(artefacts.tickets.verifySpecTests, [
    'verify_spec_p0_1',
    'verify_spec_p10_1',
    'verify_spec_p7_3',
    'verify_spec_p8_2',
    'verify_spec_p8_3',
    'verify_spec_p8_7',
    'verify_spec_p9_1',
    'verify_spec_p9_2',
    'verify_spec_p9_3',
    'verify_spec_p9_5',
  ]);
  assert.deepEqual(artefacts.omissions.files, [
    'OMISSIONS-20260731115931.json',
    'OMISSIONS-20260805185804.json',
    'OMISSIONS-20260807125931.json',
    'OMISSIONS-20260807154319.json',
    'OMISSIONS-phasified-20260731115931.json',
    'OMISSIONS-phasified-20260805185804.json',
    'OMISSIONS-phasified-20260807125931.json',
    'OMISSIONS-phasified-20260807154319.json',
  ]);
});

test('every count the design documents state differently is recorded rather than dropped', { skip: !oracleAvailable }, () => {
  const bundle = freezeOracle({ oracleRoot: ORACLE_ROOT, frozenAt: FROZEN_AT });

  assert.ok(bundle.artefacts.verifies.measuredCount > 0);
  assert.ok(bundle.artefacts.verifies.contractIds.length > 0, 'the reconciliation unit is the contract id set');

  const byArtefact = Object.fromEntries(bundle.countDiscrepancies.map((entry) => [entry.artefact, entry]));
  assert.deepEqual(Object.keys(byArtefact).sort(), ['designHeaders', 'ticketMarkers', 'verifies']);

  assert.equal(byArtefact.verifies.stated, 232);
  assert.equal(byArtefact.ticketMarkers.stated, 379);
  assert.equal(byArtefact.designHeaders.stated, 143);

  for (const entry of Object.values(byArtefact)) {
    assert.equal(entry.measured, bundle.artefacts[entry.artefact].fileCount, `${entry.artefact} must report the measured value`);
    assert.ok(entry.statedIn.length > 0, `${entry.artefact} must name the document that states the number`);
    assert.ok(entry.definitionsTried.length >= 2, `${entry.artefact} must list the definitions that were tried`);
    for (const definition of entry.definitionsTried) {
      assert.equal(typeof definition.definition, 'string');
      assert.equal(typeof definition.value, 'number');
    }
    assert.ok(entry.reason.length > 0, `${entry.artefact} must say in plain English why the two numbers differ`);
  }
});

// --- C004: the answer key is frozen and never written to ------------------------

test('C004 precondition: the pristine forward-rotation tree is present and unmodified', { skip: !oracleAvailable }, () => {
  for (const relativePath of ['RFC-ROOT.md', 'RFC-ROOT-GRAPH.json', 'RFC-ROOT-Dirs-Tree.json', 'Tickets.json', 'omissions']) {
    assert.equal(existsSync(join(ORACLE_ROOT, relativePath)), true, `${relativePath} must exist in the answer key`);
  }
  const status = spawnSync('git', ['status', '--porcelain', '--', ORACLE_ROOT], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(status.stdout.trim(), '', 'a modified answer key invalidates every measurement taken against it');
});

test('C004 invariant: freezing writes nothing into the answer key', { skip: !oracleAvailable }, () => {
  const before = digestTree(ORACLE_ROOT);
  const bundle = freezeOracle({ oracleRoot: ORACLE_ROOT, frozenAt: FROZEN_AT });
  assert.equal(digestTree(ORACLE_ROOT).sha256, before.sha256);
  assert.equal(bundle.source.control.dirty, false);
});

test('C004 postcondition: freezing a tree outside version control records that fact rather than guessing', () => {
  const { oracleRoot, dispose } = createSyntheticOraclePair();
  try {
    const bundle = freezeOracle({ oracleRoot, frozenAt: FROZEN_AT });
    assert.equal(bundle.source.control.isRepository, false);
    assert.equal(bundle.source.control.dirty, null);
    assert.ok(bundle.source.control.reason.length > 0);
  } finally {
    dispose();
  }
});

test('UT-8 / C004 invariant: a changed oracle is refused rather than compared against', () => {
  const { projectRoot, oracleRoot, dispose } = makeSyntheticOracleProject();
  try {
    writeOracleBundle({ projectRoot, bundle: freezeOracle({ oracleRoot, frozenAt: FROZEN_AT }) });
    writeFileSync(join(oracleRoot, 'omissions', 'OMISSIONS-1.json'), '{"changed":true}\n');

    const loaded = loadOracleBundle({ projectRoot });
    assert.ok(loaded.drifted.length > 0, 'drift is reported, not swallowed');

    const candidatePath = join(projectRoot, 'r5-candidate.json');
    writeFileSync(candidatePath, `${JSON.stringify({ stage: 'r5', entries: [] })}\n`);
    assert.throws(
      () => reconcile({ stage: 'r5', projectRoot, candidatePath }),
      (error) => {
        assert.match(error.message, /oracle/i);
        assert.match(error.message, /drift|changed/i);
        return true;
      },
    );
  } finally {
    dispose();
  }
});

test('UT-8 companion: loadOracleBundle recomputes every artefact and reports drift by name', () => {
  const { projectRoot, oracleRoot, dispose } = makeSyntheticOracleProject();
  try {
    writeOracleBundle({ projectRoot, bundle: freezeOracle({ oracleRoot, frozenAt: FROZEN_AT }) });

    const clean = loadOracleBundle({ projectRoot });
    assert.deepEqual(clean.drifted, []);
    assert.deepEqual(clean.recomputed.map((entry) => entry.name).sort(), ARTEFACT_NAMES);

    writeFileSync(join(oracleRoot, 'src', 'audio', 'mod.rs'), 'pub fn a() -> u8 { 99 }\n');
    const drifted = loadOracleBundle({ projectRoot });
    assert.ok(drifted.drifted.length > 0);
    assert.ok(drifted.drifted.some((entry) => entry.name === 'designHeaders' || entry.name === 'ticketMarkers'));
  } finally {
    dispose();
  }
});

// --- UT-18 / IT-4: the real answer key is byte-identical after a comparison ------

test('UT-18 / IT-4: the answer key is byte-identical before and after reading and rendering it', { skip: !oracleAvailable }, () => {
  const before = digestTree(ORACLE_ROOT);
  const gitBefore = spawnSync('git', ['status', '--porcelain', '--', ORACLE_ROOT], { cwd: PROJECT_ROOT, encoding: 'utf8' }).stdout;

  const loaded = loadOracleBundle({ projectRoot: PROJECT_ROOT });
  assert.match(renderOracleReport(loaded), /RFC-ROOT-GRAPH\.json/);

  assert.equal(digestTree(ORACLE_ROOT).sha256, before.sha256);
  const gitAfter = spawnSync('git', ['status', '--porcelain', '--', ORACLE_ROOT], { cwd: PROJECT_ROOT, encoding: 'utf8' }).stdout;
  assert.equal(gitAfter, gitBefore);
});

// --- The checked-in bundle -------------------------------------------------------

test('the checked-in oracle bundle reproduces the answer key with no drift', { skip: !oracleAvailable }, () => {
  const bundlePath = join(PROJECT_ROOT, BUNDLE_RELATIVE_PATH);
  assert.equal(existsSync(bundlePath), true, `${BUNDLE_RELATIVE_PATH} must be checked in`);
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  assert.deepEqual(Object.keys(bundle.artefacts).sort(), ARTEFACT_NAMES);

  const loaded = loadOracleBundle({ projectRoot: PROJECT_ROOT });
  assert.deepEqual(loaded.drifted, [], 'the frozen bundle must still describe the answer key');
});

// --- IT-3: the CLI round trip ----------------------------------------------------

test('IT-3: the oracle subcommand freezes and compares through the CLI', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'p22-2-cli-'));
  try {
    writeSyntheticTree(join(projectRoot, ORACLE_TREE_RELATIVE_PATH), ORACLE_FIXTURE_FILES);

    const freeze = spawnSync(process.execPath, [RUN_SCRIPT, 'oracle', 'freeze', '--project-root', projectRoot], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
    assert.equal(freeze.status, 0, freeze.stderr || freeze.stdout);
    assert.match(freeze.stdout, /ORACLE-BUNDLE\.json/);

    const candidatePath = join(projectRoot, 'r3-candidate.json');
    writeFileSync(candidatePath, `${JSON.stringify({ stage: 'r3', corpus: { language: 'rust' }, entries: ['C900'] }, null, 2)}\n`);
    const compare = spawnSync(
      process.execPath,
      [RUN_SCRIPT, 'oracle', 'compare', '--stage', 'r3', '--candidate', candidatePath, '--project-root', projectRoot],
      { cwd: PROJECT_ROOT, encoding: 'utf8' },
    );
    assert.equal(compare.status, 0, compare.stderr || compare.stdout);
    assert.match(compare.stdout, /C001/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('C004 invariant companion: an annotation edited in place is drift, not a silent change', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'p22-2-verifies-'));
  try {
    const oracleRoot = join(projectRoot, ORACLE_TREE_RELATIVE_PATH);
    // A file carrying @verifies and nothing else, so the annotation is the only
    // thing that can change. Editing it in place keeps every file and line
    // number, so a signature over position alone cannot see it.
    writeSyntheticTree(oracleRoot, {
      ...ORACLE_FIXTURE_FILES,
      'tests/verify_spec_annotation_only.rs': '// @verifies C001\npub fn a() -> u8 { 1 }\n',
    });
    writeOracleBundle({ projectRoot, bundle: freezeOracle({ oracleRoot, frozenAt: FROZEN_AT }) });
    assert.deepEqual(loadOracleBundle({ projectRoot }).drifted, []);

    writeFileSync(join(oracleRoot, 'tests/verify_spec_annotation_only.rs'), '// @verifies C999\npub fn a() -> u8 { 1 }\n');

    const drifted = loadOracleBundle({ projectRoot }).drifted.map((entry) => entry.name);
    assert.ok(drifted.includes('verifies'), `the verifies artefact must drift, got: ${drifted.join(', ') || '(none)'}`);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('the definitions the design states are recorded as the values this tree measures', { skip: !oracleAvailable }, () => {
  const bundle = freezeOracle({ oracleRoot: ORACLE_ROOT, frozenAt: FROZEN_AT });
  const tried = new Map();
  for (const entry of DESIGN_STATED_COUNTS) {
    for (const definition of entry.definitionsTried) tried.set(`${entry.artefact}: ${definition.definition}`, definition.value);
  }

  // A "definition tried" is a measurement of this tree, so it must equal what
  // the artefact measures. A number that reproduces under no definition is a
  // claim rather than a measurement, and it is surfaced to a human as one.
  assert.equal(tried.get('verifies: files with a comment line carrying @verifies'), bundle.artefacts.verifies.fileCount);
  assert.equal(tried.get('verifies: comment-anchored @verifies lines'), bundle.artefacts.verifies.annotationCount);
  assert.equal(tried.get('verifies: distinct contract ids named by those annotations'), bundle.artefacts.verifies.contractIds.length);
  assert.equal(tried.get('ticketMarkers: files with a comment line carrying [::TICKET::]'), bundle.artefacts.ticketMarkers.fileCount);
  assert.equal(tried.get('ticketMarkers: comment-anchored lines carrying [::TICKET::]'), bundle.artefacts.ticketMarkers.occurrenceCount);
  assert.equal(tried.get('designHeaders: files with a comment line beginning the header'), bundle.artefacts.designHeaders.fileCount);
});

test('the bare oracle invocation reports usage rather than crashing', () => {
  // No action and no --project-root. The handler answers this with the usage
  // text; the parser must reach it instead of dereferencing an absent argument.
  const run = spawnSync(process.execPath, [RUN_SCRIPT, 'oracle'], { cwd: PROJECT_ROOT, encoding: 'utf8' });

  assert.doesNotMatch(run.stderr, /TypeError/, 'an argument list with no action must not crash the parser');
  assert.equal(run.status, 2, run.stderr || run.stdout);
  assert.match(run.stderr, /Usage:/);
});

/**
 * A throwaway project holding the synthetic oracle tree at the path the CLI
 * resolves it from, so the read path is exercised exactly as production sees it.
 */
function makeSyntheticOracleProject() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'p22-2-oracle-'));
  const oracleRoot = join(projectRoot, ORACLE_TREE_RELATIVE_PATH);
  writeSyntheticTree(oracleRoot, ORACLE_FIXTURE_FILES);
  return { projectRoot, oracleRoot, dispose: () => rmSync(projectRoot, { recursive: true, force: true }) };
}
