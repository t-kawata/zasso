// [::TICKET::] P22-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-3 --for-spec --no-implementation-order`.
// @verifies C004
/**
 * The slice's output against the answer key, through P22-2's instrument.
 *
 * Two things are asserted here that the instrument's own suite cannot assert.
 *
 * The executor never touches the answer key. `runSpike` is handed a subject root
 * and nothing else, so a project holding no oracle tree at all must still
 * produce a complete run. If that ever stops being true, the blind protocol is
 * broken and every number the spike reports is worthless.
 *
 * The comparison carries no verdict. It returns a list of individually named
 * disagreements, and the keys are inspected to prove no field could hold a
 * score, a ratio presented as a grade, or a pass/fail. A machine that says
 * "reverse engineering succeeded" is wrong by construction — that judgement is
 * a human's, made after several loop rounds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildPartitionCandidate, resolveSlice, runSpike } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { buildClaimCandidate, buildClaimLedger } from '../../../.claude/scripts/workspacify-reverse/lib/claim-ledger.mjs';
import { DISAGREEMENT_KINDS, NO_KNOWN_DELTA, reconcile, renderReconciliation } from '../../../.claude/scripts/workspacify-reverse/lib/reconcile.mjs';
import { ORACLE_TREE_RELATIVE_PATH, freezeOracle, writeOracleBundle } from '../../../.claude/scripts/workspacify-reverse/lib/oracle-bundle.mjs';
import {
  ORACLE_FIXTURE_FILES,
  SPIKE_SINGLE_CLAIM_FILES,
  createSyntheticTree,
  writeSyntheticTree,
} from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const RUN_SCRIPT = fileURLToPath(new URL('../../../.claude/scripts/workspacify-reverse/run.mjs', import.meta.url));
const FROZEN_AT = '2026-09-10T00:00:00Z';
const RECONCILIATION_KEYS = ['candidatePath', 'disagreements', 'expected', 'findings', 'oracleSha256', 'stage', 'unobserved'];

/**
 * A miniature answer key whose partition holds `src/api`, and a file the
 * analysis of any other slice will not produce. That file is the disagreement
 * this suite asserts is named rather than counted.
 */
const SPIKE_ORACLE_FILES = Object.freeze({
  ...ORACLE_FIXTURE_FILES,
  'RFC-ROOT-Dirs-Tree.json': `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: FROZEN_AT,
    sourceGraph: 'RFC-ROOT-GRAPH.json',
    sourceFile: 'RFC-ROOT.md',
    analysis: { nodeCount: 1, edgeCount: 0 },
    trees: {
      rust: {
        name: 'src',
        type: 'directory',
        kind: 'root',
        children: [
          {
            name: 'api',
            type: 'directory',
            kind: 'architecture',
            mappedNodeIds: [],
            children: [{ name: 'oracle_only.rs', type: 'file', kind: 'api_contract', mappedNodeIds: [] }],
          },
        ],
      },
    },
    dependencyDirections: { rust: [] },
    warnings: [],
  }, null, 2)}\n`,
});

/** A throwaway project holding the synthetic answer key and its frozen bundle. */
function makeOracleProject() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'p22-3-spike-'));
  const oracleRoot = join(projectRoot, ORACLE_TREE_RELATIVE_PATH);
  writeSyntheticTree(oracleRoot, SPIKE_ORACLE_FILES);
  writeOracleBundle({ projectRoot, bundle: freezeOracle({ oracleRoot, frozenAt: FROZEN_AT }) });
  return { projectRoot, oracleRoot, dispose: () => rmSync(projectRoot, { recursive: true, force: true }) };
}

/** Write a candidate document for a stage and return its path. */
function writeCandidate(projectRoot, name, document) {
  const full = join(projectRoot, name);
  writeFileSync(full, `${JSON.stringify(document, null, 2)}\n`);
  return full;
}

/** The slice output a stage comparison consumes, produced the way a run produces it. */
function buildSliceOutputs(root, sliceName) {
  const slice = resolveSlice(root, sliceName);
  const ledger = buildClaimLedger(slice);
  return { slice, ledger };
}

/** The frozen bundle a project holds, as bytes, so a test reads it the way a reader would. */
function readFrozenBundleText(projectRoot) {
  return readFileSync(join(projectRoot, 'tests/workspacify-reverse/oracle/ORACLE-BUNDLE.json'), 'utf8');
}

// --- C004 precondition: the slice output and the frozen bundle are available ----

test('C004 precondition: a slice partition candidate and the frozen bundle are both readable', () => {
  const project = makeOracleProject();
  const subject = createSyntheticTree(SPIKE_SINGLE_CLAIM_FILES);
  const { slice } = buildSliceOutputs(subject.root, 'solo');

  const candidatePath = writeCandidate(project.projectRoot, 'r1.candidate.json', buildPartitionCandidate(slice));
  const result = reconcile({ stage: 'r1', projectRoot: project.projectRoot, candidatePath, knownDelta: NO_KNOWN_DELTA });

  assert.equal(result.stage, 'r1');
  assert.equal(typeof result.oracleSha256, 'string');
  assert.equal(result.oracleSha256, JSON.parse(readFrozenBundleText(project.projectRoot)).sha256);
  subject.dispose();
  project.dispose();
});


// --- C004 postcondition: the differing packages and candidates are named --------

test('C004 postcondition: the differing partition members are named individually', () => {
  const project = makeOracleProject();
  const subject = createSyntheticTree(SPIKE_SINGLE_CLAIM_FILES);
  const { slice } = buildSliceOutputs(subject.root, 'solo');

  const candidatePath = writeCandidate(project.projectRoot, 'r1.candidate.json', buildPartitionCandidate(slice));
  const result = reconcile({ stage: 'r1', projectRoot: project.projectRoot, candidatePath, knownDelta: NO_KNOWN_DELTA });
  const names = result.disagreements.map((disagreement) => disagreement.name);

  assert.ok(names.includes('src/api/oracle_only.rs'), 'a member only the answer key has is named');
  assert.ok(names.includes('src/db'), 'a member only the analysis has is named');
  assert.equal(names.includes('src/api'), false, 'a member both have is not a disagreement');
  assert.ok(result.disagreements.every((entry) => typeof entry.name === 'string' && entry.name.length > 0));
  assert.ok(result.disagreements.every((entry) => Object.values(DISAGREEMENT_KINDS).includes(entry.kind)));
  assert.ok(renderReconciliation(result).includes('src/api/oracle_only.rs'));
  subject.dispose();
  project.dispose();
});

test('C004 postcondition: the slice claim output is compared against the annotated contract ids', () => {
  const project = makeOracleProject();
  const subject = createSyntheticTree(SPIKE_SINGLE_CLAIM_FILES);
  const { ledger } = buildSliceOutputs(subject.root, 'solo');

  const candidatePath = writeCandidate(project.projectRoot, 'r3.candidate.json', buildClaimCandidate(ledger));
  const result = reconcile({ stage: 'r3', projectRoot: project.projectRoot, candidatePath, knownDelta: NO_KNOWN_DELTA });

  const producedNames = result.disagreements
    .filter((disagreement) => disagreement.kind === DISAGREEMENT_KINDS.extraInAnalysis)
    .map((disagreement) => disagreement.name);
  assert.deepEqual(producedNames.sort(), ledger.claims.map((claim) => claim.claim_id).sort());
  assert.ok(
    result.unobserved.length > 0,
    'a slice cannot see contract ids the scrub removed, and says so instead of calling it agreement',
  );
  subject.dispose();
  project.dispose();
});

// --- UT-11 / C004 invariant: a list, never a verdict ---------------------------

test('UT-11: the slice reconciliation carries no score, ratio or verdict field', () => {
  const project = makeOracleProject();
  const subject = createSyntheticTree(SPIKE_SINGLE_CLAIM_FILES);
  const { slice } = buildSliceOutputs(subject.root, 'solo');

  const candidatePath = writeCandidate(project.projectRoot, 'r1.candidate.json', buildPartitionCandidate(slice));
  const result = reconcile({ stage: 'r1', projectRoot: project.projectRoot, candidatePath, knownDelta: NO_KNOWN_DELTA });

  assert.deepEqual(Object.keys(result).sort(), RECONCILIATION_KEYS);
  for (const forbidden of ['score', 'ratio', 'verdict', 'passed', 'succeeded', 'success', 'grade', 'accuracy']) {
    assert.equal(forbidden in result, false, `the result carries no "${forbidden}"`);
  }
  subject.dispose();
  project.dispose();
});

// --- UT-12: the executor never reads the answer key ----------------------------

test('UT-12: the executor completes with no oracle tree anywhere on disk', () => {
  const subject = createSyntheticTree(SPIKE_SINGLE_CLAIM_FILES);
  const outcome = runSpike({ root: subject.root, slice: 'solo' });

  assert.equal(outcome.slice.slice, 'solo');
  assert.ok(outcome.ledger.claims.length > 0);
  assert.ok(outcome.cards.length > 0);
  assert.equal(outcome.measurement.targetUnchanged, true);
  subject.dispose();
});

test('UT-12b: the comparison takes its members from the frozen bundle', () => {
  const project = makeOracleProject();
  const subject = createSyntheticTree(SPIKE_SINGLE_CLAIM_FILES);
  const { slice } = buildSliceOutputs(subject.root, 'solo');

  const bundle = JSON.parse(readFrozenBundleText(project.projectRoot));
  const candidatePath = writeCandidate(project.projectRoot, 'r1.candidate.json', buildPartitionCandidate(slice));
  const result = reconcile({ stage: 'r1', projectRoot: project.projectRoot, candidatePath, knownDelta: NO_KNOWN_DELTA });

  const oracleNames = result.disagreements
    .filter((disagreement) => disagreement.kind === DISAGREEMENT_KINDS.missingFromAnalysis)
    .map((disagreement) => disagreement.name)
    .sort();
  const expectedMissing = bundle.artefacts.dirsTree.directories
    .filter((name) => !buildPartitionCandidate(slice).entries.includes(name))
    .sort();
  assert.deepEqual(oracleNames, expectedMissing, 'every missing name is one the frozen bundle records');
  assert.equal(result.oracleSha256, bundle.sha256);
  subject.dispose();
  project.dispose();
});

// --- Acceptance error case: a changed oracle is refused, not compared -----------

test('a reconciliation against a changed oracle is refused', () => {
  const project = makeOracleProject();
  const subject = createSyntheticTree(SPIKE_SINGLE_CLAIM_FILES);
  const { slice } = buildSliceOutputs(subject.root, 'solo');

  const candidatePath = writeCandidate(project.projectRoot, 'r1.candidate.json', buildPartitionCandidate(slice));
  writeFileSync(join(project.oracleRoot, 'RFC-ROOT.md'), '# A different RFC\n\n## Purpose\n\nChanged after freezing.\n');

  assert.throws(
    () => reconcile({ stage: 'r1', projectRoot: project.projectRoot, candidatePath, knownDelta: NO_KNOWN_DELTA }),
    /the oracle has changed since it was frozen/,
  );
  subject.dispose();
  project.dispose();
});

// --- IT: the whole path, through the CLI the ticket declares -------------------

test('IT: the spike runs a slice, then reconciles it, through run.mjs', () => {
  const project = makeOracleProject();
  const subject = createSyntheticTree(SPIKE_SINGLE_CLAIM_FILES);
  const out = join(project.projectRoot, 'spike-out');

  const run = spawnSync(
    process.execPath,
    [RUN_SCRIPT, 'spike', subject.root, 'solo', '--project-root', project.projectRoot, '--out', out],
    { encoding: 'utf8' },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /## Spike run/, 'the run reports what it produced');

  const reportPath = join(project.projectRoot, 'docs', 'SPIKE-REPORT.md');
  assert.ok(existsSync(reportPath), 'the run writes the report the ticket declares');
  assert.ok(existsSync(join(out, 'r1.candidate.json')));
  assert.ok(existsSync(join(out, 'r3.candidate.json')));
  assert.match(readFileSync(reportPath, 'utf8'), /has \*\*not been run\*\*/, 'the run never reads the answer key');

  const reconcileRun = spawnSync(
    process.execPath,
    [RUN_SCRIPT, 'spike', 'reconcile', '--project-root', project.projectRoot, '--out', out],
    { encoding: 'utf8' },
  );
  assert.equal(reconcileRun.status, 0, reconcileRun.stderr);

  const reconciled = readFileSync(reportPath, 'utf8');
  assert.match(reconciled, /## Disagreements/);
  assert.match(reconciled, /src\/api\/oracle_only\.rs/, 'the report names what differs from the answer key');
  assert.doesNotMatch(reconciled, /has \*\*not been run\*\*/, 'the placeholder is replaced, not appended to');

  // The section is replaced in place, not appended to. The comparison's own
  // "### Disagreements (N)" heading also contains the marker string, so a second
  // reconciliation is what proves the split lands on the report's own heading
  // rather than inside the text it previously inserted.
  const again = spawnSync(
    process.execPath,
    [RUN_SCRIPT, 'spike', 'reconcile', '--project-root', project.projectRoot, '--out', out],
    { encoding: 'utf8' },
  );
  assert.equal(again.status, 0, again.stderr);
  assert.equal(readFileSync(reportPath, 'utf8'), reconciled, 'a second reconciliation is a no-op');

  subject.dispose();
  project.dispose();
});

test('IT: the reconcile action refuses when no run has happened', () => {
  const project = makeOracleProject();
  const run = spawnSync(
    process.execPath,
    [RUN_SCRIPT, 'spike', 'reconcile', '--project-root', project.projectRoot],
    { encoding: 'utf8' },
  );

  assert.equal(run.status, 1);
  assert.match(run.stderr, /no spike report is present/);
  project.dispose();
});

// --- IT-4 / C004 invariant: the answer key is never written to ------------------

test('IT-4: the answer key is untouched after a comparison', () => {
  const before = spawnSync('git', ['status', '--porcelain', '--', ORACLE_TREE_RELATIVE_PATH], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  assert.equal(before.stdout.trim(), '', 'the answer key starts clean');

  const project = makeOracleProject();
  const subject = createSyntheticTree(SPIKE_SINGLE_CLAIM_FILES);
  const { slice } = buildSliceOutputs(subject.root, 'solo');
  const candidatePath = writeCandidate(project.projectRoot, 'r1.candidate.json', buildPartitionCandidate(slice));
  reconcile({ stage: 'r1', projectRoot: project.projectRoot, candidatePath, knownDelta: NO_KNOWN_DELTA });

  const after = spawnSync('git', ['status', '--porcelain', '--', ORACLE_TREE_RELATIVE_PATH], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  assert.equal(after.stdout.trim(), '', 'the answer key is written to by nothing in this path');
  subject.dispose();
  project.dispose();
});
