// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
// P22-11 @verifies C001 C002 C003
// The command-level integration point: `run.mjs reverse` over a measured tree,
// and the two proofs that the forward rotation was not disturbed — a reproduced
// regression gate and unchanged command-file digests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareDigests, digestCommandFiles } from '../../../.claude/scripts/workspacify-reverse/lib/command-file-digest.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const RUN_SCRIPT = join(PROJECT_ROOT, '.claude/scripts/workspacify-tree/run.mjs');
const REGRESSION_SCRIPT = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/run.mjs');
const FIXTURES = join(PROJECT_ROOT, 'tests/workspacify-tree/fixtures');
const BASELINE_PATH = join(PROJECT_ROOT, 'tests/workspacify-tree/baselines/manifest-hashes.json');
const MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';

/** The fixture pair that reaches COMPLETE through the forward gates. */
const SPEC_NAME = 'objects-table.md';
const DECISIONS_NAME = 'decisions-complete.json';

/**
 * Build a measured tree whose single directory is the package path the fixture
 * decisions declare. T1 compares the two sets, so the design is authored from
 * the measurement rather than the other way round.
 */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function buildReverseWorkspace() {
  const decisions = JSON.parse(readFileSync(join(FIXTURES, DECISIONS_NAME), 'utf8'));
  const packagePath = decisions.workspace[0].path;
  const dir = mkdtempSync(join(tmpdir(), 'workspacify-tree-cli-reverse-'));
  const measuredRoot = join(dir, 'measured');
  const sourcePath = join(packagePath, 'mod.rs');
  mkdirSync(join(measuredRoot, packagePath), { recursive: true });
  writeFileSync(join(measuredRoot, sourcePath), 'pub fn call() {}\n');

  const sidecarDir = join(dir, 'sidecars');
  mkdirSync(sidecarDir, { recursive: true });
  writeFileSync(join(sidecarDir, 'ANALYSIS-SCOPE.json'), '{\n  "scope": "the fixture project"\n}\n');

  writeFileSync(join(dir, 'measured-edges.json'), JSON.stringify({ edges: [] }, null, 2));
  // A node that really resolves, so T3 is exercised rather than passed vacuously.
  writeFileSync(
    join(dir, 'graph.json'),
    `${JSON.stringify({ sourceFile: 'RFC-ROOT.md', nodes: [{ id: 'N0001', title: 'Purpose', file: sourcePath }] }, null, 2)}\n`,
  );
  mkdirSync(join(dir, 'out'), { recursive: true });

  return {
    dir,
    out: join(dir, 'out'),
    measuredRoot,
    sidecarDir,
    packagePath,
    packageId: decisions.workspace[0].id,
    sourcePath,
    graphPath: join(dir, 'graph.json'),
    deltaPath: join(dir, 'out', 'ARCHITECTURE-DELTA.json'),
  };
}

/** Author the delta record the operator must write before T5 can pass. */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function authorDelta(deltaPath, mismatches = []) {
  writeFileSync(deltaPath, `${JSON.stringify({ mismatches }, null, 2)}\n`);
}

// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function runReverseCli(workspace, extraArgs = []) {
  return spawnSync(
    process.execPath,
    [
      RUN_SCRIPT,
      'reverse',
      `--spec=${join(FIXTURES, SPEC_NAME)}`,
      `--decisions=${join(FIXTURES, DECISIONS_NAME)}`,
      `--root=${workspace.measuredRoot}`,
      `--graph=${workspace.graphPath}`,
      `--measured=${join(workspace.dir, 'measured-edges.json')}`,
      `--sidecars=${workspace.sidecarDir}`,
      `--delta=${workspace.deltaPath}`,
      `--out=${workspace.out}`,
      ...extraArgs,
    ],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  );
}

test('IT-1 a reverse run generates a manifest whose package paths match the measured directories', () => {
  const workspace = buildReverseWorkspace();
  try {
    authorDelta(workspace.deltaPath);
    const run = runReverseCli(workspace);
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);

    const manifestPath = join(workspace.out, MANIFEST_FILE_NAME);
    assert.ok(existsSync(manifestPath), 'the reverse run publishes its manifest');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.status, 'COMPLETE');
    assert.ok(manifest.reverse_provenance, 'reverse mode records its provenance');
    assert.equal(manifest.reverse_provenance.sidecar_bundle_hash.length, 64);
    assert.deepEqual(
      manifest.workspace.packages.map((pkg) => pkg.path),
      [workspace.packagePath],
      'the published package path set is the measured directory set',
    );
    assert.match(run.stdout, /T1:PASS/);
    assert.match(run.stdout, /T6:PASS/);
  } finally {
    rmSync(workspace.dir, { recursive: true, force: true });
  }
});

test('IT-1b the delta record is written back so the mismatch is an artefact, not a memory', () => {
  const workspace = buildReverseWorkspace();
  try {
    authorDelta(workspace.deltaPath);
    const run = runReverseCli(workspace);
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.ok(existsSync(workspace.deltaPath), 'the delta the gate judged survives the run');
    const delta = JSON.parse(readFileSync(workspace.deltaPath, 'utf8'));
    assert.deepEqual(delta.mismatches, [], 'the authored record is preserved verbatim');
  } finally {
    rmSync(workspace.dir, { recursive: true, force: true });
  }
});

test('IT-1c a mismatch the delta does not record is a FAIL, and nothing is published', () => {
  const workspace = buildReverseWorkspace();
  try {
    authorDelta(workspace.deltaPath);
    // A stray directory the manifest never declared: T1 names it as extra.
    mkdirSync(join(workspace.measuredRoot, 'src', 'audio'), { recursive: true });
    writeFileSync(join(workspace.measuredRoot, 'src', 'audio', 'mod.rs'), 'pub fn audio() {}\n');

    const run = runReverseCli(workspace);
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /T1/, 'the failing gate is named');
    assert.match(`${run.stdout}${run.stderr}`, /src\/audio/, 'the extra path is named');
    assert.match(`${run.stdout}${run.stderr}`, /extra/);
    assert.equal(existsSync(join(workspace.out, MANIFEST_FILE_NAME)), false, 'a failing run publishes nothing');
  } finally {
    rmSync(workspace.dir, { recursive: true, force: true });
  }
});

test('IT-1d an unrecorded mismatch fails T5 even when the recorded delta is otherwise present', () => {
  const workspace = buildReverseWorkspace();
  try {
    // The delta is authored, but it does not name the extra directory.
    authorDelta(workspace.deltaPath, []);
    mkdirSync(join(workspace.measuredRoot, 'src', 'audio'), { recursive: true });
    writeFileSync(join(workspace.measuredRoot, 'src', 'audio', 'mod.rs'), 'pub fn audio() {}\n');

    const run = runReverseCli(workspace);
    assert.equal(run.status, 1);
    const manifestPath = join(workspace.out, MANIFEST_FILE_NAME);
    assert.equal(existsSync(manifestPath), false);
  } finally {
    rmSync(workspace.dir, { recursive: true, force: true });
  }
});

test('IT-5 the partition is compared against the frozen answer key, naming every extra and missing package', () => {
  const workspace = buildReverseWorkspace();
  const candidatePath = join(workspace.dir, 'partition-candidate.json');
  try {
    authorDelta(workspace.deltaPath);
    const run = runReverseCli(workspace);
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const manifest = JSON.parse(readFileSync(join(workspace.out, MANIFEST_FILE_NAME), 'utf8'));

    // T1 and the oracle read the same set: the manifest's package paths.
    writeFileSync(
      candidatePath,
      `${JSON.stringify({ stage: 'partition', entries: manifest.workspace.packages.map((pkg) => pkg.path) }, null, 2)}\n`,
    );
    const comparison = spawnSync(
      process.execPath,
      [REGRESSION_SCRIPT, 'oracle', 'compare', '--stage=partition', `--candidate=${candidatePath}`],
      { cwd: PROJECT_ROOT, encoding: 'utf8' },
    );
    assert.notEqual(comparison.status, 2, `the comparison must run: ${comparison.stdout}${comparison.stderr}`);

    const report = `${comparison.stdout}${comparison.stderr}`;
    // The fixture is not the siprs tree, so the comparison must disagree — and it
    // must say so by naming each package, never by emitting a number or a verdict.
    assert.match(report, /missing|extra/i, 'a disagreement is named');
    assert.match(report, new RegExp(workspace.packagePath.replace(/[/.]/g, '\\$&')), 'the package is named');
    assert.doesNotMatch(report, /\b(score|accuracy|percentage|%)\b/i, 'a comparison never scores');
  } finally {
    rmSync(workspace.dir, { recursive: true, force: true });
  }
});

test('IT-5b T4 refuses to pass when the measured input carries no edge set', () => {
  const workspace = buildReverseWorkspace();
  try {
    authorDelta(workspace.deltaPath);
    // A file that is not a measured dependency report: the order cannot be proved
    // from measurement, so the gate says so instead of passing quietly.
    writeFileSync(join(workspace.dir, 'measured-edges.json'), JSON.stringify({ note: 'we looked at the imports' }, null, 2));
    const run = runReverseCli(workspace);
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /T4/);
    assert.match(`${run.stdout}${run.stderr}`, /measured/i);
    assert.equal(existsSync(join(workspace.out, MANIFEST_FILE_NAME)), false, 'a failing run publishes nothing');
  } finally {
    rmSync(workspace.dir, { recursive: true, force: true });
  }
});

test('UT-11 no field is added to the GRAPH: the reverse rotation writes to the manifest alone', () => {
  const workspace = buildReverseWorkspace();
  try {
    authorDelta(workspace.deltaPath);
    const graphBefore = readFileSync(workspace.graphPath);
    const run = runReverseCli(workspace);
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);

    assert.deepEqual(readFileSync(workspace.graphPath), graphBefore, 'the graph is byte-identical after the run');
    const graph = JSON.parse(readFileSync(workspace.graphPath, 'utf8'));
    assert.equal('reverse_provenance' in graph, false, 'layer C gains nothing');
    assert.equal('analysis_state' in graph, false);
    assert.equal('evidence_state' in graph, false);
    assert.equal('claim_state' in graph, false);

    // The manifest is the only artefact a reverse run adds to the output directory.
    assert.deepEqual(readdirSync(workspace.out).sort(), ['ARCHITECTURE-DELTA.json', MANIFEST_FILE_NAME]);
  } finally {
    rmSync(workspace.dir, { recursive: true, force: true });
  }
});

test('IT-7 T3 grounds the nodes the graph really carries, and names the ones it cannot', () => {
  const workspace = buildReverseWorkspace();
  try {
    authorDelta(workspace.deltaPath);
    const resolving = runReverseCli(workspace);
    assert.equal(resolving.status, 0, `${resolving.stdout}\n${resolving.stderr}`);
    assert.match(resolving.stdout, /T3:PASS/);

    const manifestPath = join(workspace.out, MANIFEST_FILE_NAME);
    const publishedManifest = readFileSync(manifestPath);

    // The same run with a node whose file is not on disk: T3 fails and names it.
    writeFileSync(
      workspace.graphPath,
      `${JSON.stringify({ nodes: [{ id: 'N0007', file: 'src/missing.rs' }] }, null, 2)}\n`,
    );
    const unresolvable = runReverseCli(workspace);
    assert.equal(unresolvable.status, 1, 'an ungrounded node is not a passing run');
    assert.match(`${unresolvable.stdout}${unresolvable.stderr}`, /N0007/, 'the node is named by its identifier');
    assert.deepEqual(
      readFileSync(manifestPath),
      publishedManifest,
      'a failing run never replaces the manifest the previous run published',
    );
  } finally {
    rmSync(workspace.dir, { recursive: true, force: true });
  }
});

test('IT-2 the forward rotation still reaches COMPLETE and carries no reverse provenance', () => {
  const out = mkdtempSync(join(tmpdir(), 'workspacify-tree-forward-'));
  try {
    const run = spawnSync(
      process.execPath,
      [RUN_SCRIPT, 'finalize', `--spec=${join(FIXTURES, SPEC_NAME)}`, `--decisions=${join(FIXTURES, DECISIONS_NAME)}`],
      { cwd: out, encoding: 'utf8' },
    );
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const manifest = JSON.parse(readFileSync(join(out, MANIFEST_FILE_NAME), 'utf8'));
    assert.equal(manifest.status, 'COMPLETE');
    assert.equal('reverse_provenance' in manifest, false, 'the reverse field must not appear in forward mode');
    assert.equal(manifest.integrity.canonicalization, 'workspacify-tree-json-v1');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('IT-3 the nine command-file digests are unchanged: the edit was an edit, not a rewrite', () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const findings = compareDigests(baseline.commandFileDigests, digestCommandFiles(PROJECT_ROOT));
  assert.deepEqual(findings, [], 'no heading, Language Protocol table or First-Class Rule line was lost');
});

test('IT-4 the forward-rotation regression gate still exits 0', () => {
  const run = spawnSync(process.execPath, [REGRESSION_SCRIPT, 'regression', 'check'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /proved/);
  assert.match(run.stdout, /0 command-file loss\(es\)/);
});

test('IT-6 the reverse subcommand reports its usage rather than failing silently', () => {
  const run = spawnSync(process.execPath, [RUN_SCRIPT, 'reverse'], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  assert.notEqual(run.status, 0, 'a reverse run with no input is a usage error');
  assert.match(`${run.stdout}${run.stderr}`, /--spec|--decisions|--root/);
});
