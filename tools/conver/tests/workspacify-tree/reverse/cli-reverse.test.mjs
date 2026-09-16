// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
// P22-11 @verifies C001 C002 C003
// The command-level integration point: `run.mjs reverse` over a measured tree,
// and the two proofs that the forward rotation was not disturbed — a reproduced
// regression gate and unchanged command-file digests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareDigests, digestCommandFiles } from '../../../.claude/scripts/workspacify-reverse/lib/command-file-digest.mjs';
import { stageTreeDecisions, stageTreeDecisionsFrom, reservedTreeDecisionsPath } from '../../workspacify-tree/helpers/stage-tree-decisions.mjs';

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
// [::TICKET::] P22-11, PX-214, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-11|PX-214|PX-215) --for-spec --no-implementation-order`.
function buildReverseWorkspace() {
  const decisions = JSON.parse(readFileSync(join(FIXTURES, DECISIONS_NAME), 'utf8'));
  const packagePath = decisions.workspace[0].path;
  // Resolved, because the rotation reports `process.cwd()` in the platform's
  // canonical spelling and the staged document has to answer to that spelling.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'workspacify-tree-cli-reverse-')));
  const measuredRoot = join(dir, 'measured');
  const sourcePath = join(packagePath, 'mod.rs');
  mkdirSync(join(measuredRoot, packagePath), { recursive: true });
  writeFileSync(join(measuredRoot, sourcePath), 'pub fn call() {}\n');

  // Everything the rotation derives is placed where it derives it from: the origin
  // spec, the measured edges and the sidecar bundle beneath the reserved root, and
  // the graph at the subject root, which is where a project that already carries a
  // graph keeps it. Nothing is passed on the command line, so this placement is
  // what says the rotation reads the documents rather than the paths a test chose.
  const reserve = join(measuredRoot, 'workspacify', 'reverse');
  mkdirSync(reserve, { recursive: true });
  copyFileSync(join(FIXTURES, SPEC_NAME), join(reserve, 'ORIGIN-LONG-SPEC.md'));
  writeFileSync(join(reserve, 'DEPENDENCIES.json'), JSON.stringify({ edges: [] }, null, 2));
  writeFileSync(join(reserve, 'ANALYSIS-SCOPE.json'), '{\n  "scope": "the fixture project"\n}\n');
  // The decisions document lives beside the analysis, at the name the rotation
  // derives; nothing on the command line names it.
  stageTreeDecisionsFrom(measuredRoot, join(FIXTURES, DECISIONS_NAME));

  // A node that really resolves, so T3 is exercised rather than passed vacuously.
  writeFileSync(
    join(measuredRoot, 'RFC-ROOT-GRAPH.json'),
    `${JSON.stringify({ sourceFile: 'RFC-ROOT.md', nodes: [{ id: 'N0001', title: 'Purpose', file: sourcePath }] }, null, 2)}\n`,
  );

  return {
    dir,
    // The manifest and the delta are published at the workspace root, which is the
    // subject itself: §2.2 puts the fifth layer beside the ROOT package's layers.
    out: measuredRoot,
    measuredRoot,
    reserve,
    packagePath,
    packageId: decisions.workspace[0].id,
    sourcePath,
    decisionsPath: reservedTreeDecisionsPath(measuredRoot),
    graphPath: join(measuredRoot, 'RFC-ROOT-GRAPH.json'),
    deltaPath: join(measuredRoot, 'ARCHITECTURE-DELTA.json'),
  };
}

/** Author the delta record the operator must write before T5 can pass. */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function authorDelta(deltaPath, mismatches = []) {
  writeFileSync(deltaPath, `${JSON.stringify({ mismatches }, null, 2)}\n`);
}

// [::TICKET::] P22-11, PX-214, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-11|PX-214|PX-215) --for-spec --no-implementation-order`.
function runReverseCli(workspace, extraArgs = []) {
  // Staged before every run, because a reverse run that publishes sweeps the
  // document: the manifest it wrote is the record of what was decided, and the
  // document is what the gates read on the way there.
  stageTreeDecisions(workspace.measuredRoot, readFileSync(join(FIXTURES, DECISIONS_NAME), 'utf8'));
  return spawnSync(
    process.execPath,
    [RUN_SCRIPT, 'reverse', ...extraArgs],
    // The subject is the directory the command is run in. Running from the subject
    // is what puts the fourth layer where §2.2 says it belongs.
    { cwd: workspace.measuredRoot, encoding: 'utf8' },
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
    assert.equal(
      existsSync(workspace.decisionsPath),
      false,
      'the staging decisions document is swept once the manifest it produced is published',
    );
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
    writeFileSync(join(workspace.reserve, 'DEPENDENCIES.json'), JSON.stringify({ note: 'we looked at the imports' }, null, 2));
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
    const beforeRun = new Set(readdirSync(workspace.out));
    const run = runReverseCli(workspace);
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);

    assert.deepEqual(readFileSync(workspace.graphPath), graphBefore, 'the graph is byte-identical after the run');
    const graph = JSON.parse(readFileSync(workspace.graphPath, 'utf8'));
    assert.equal('reverse_provenance' in graph, false, 'layer C gains nothing');
    assert.equal('analysis_state' in graph, false);
    assert.equal('evidence_state' in graph, false);
    assert.equal('claim_state' in graph, false);

    // Two documents, and no third. The delta is already there because the operator
    // authored it — T5 judges a record rather than requiring the run to invent one.
    // The specification is placed beside the manifest because stage two resolves the
    // name the manifest records against the manifest's directory, and everything
    // else in the root is what the subject already held.
    assert.deepEqual(
      readdirSync(workspace.out).filter((name) => !beforeRun.has(name)).sort(),
      ['ORIGIN-LONG-SPEC.md', MANIFEST_FILE_NAME],
      'the run adds the fifth layer and the specification it is read against, and nothing else',
    );
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
    stageTreeDecisionsFrom(out, join(FIXTURES, DECISIONS_NAME));
    const run = spawnSync(
      process.execPath,
      [RUN_SCRIPT, 'finalize', `--spec=${join(FIXTURES, SPEC_NAME)}`],
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

test('IT-6 the reverse subcommand reports what it looked for rather than failing silently', () => {
  // A reverse subcommand with no argument is no longer a usage error: it takes
  // none, so a bare invocation is a real run over the directory it is given. What
  // it must never do is fail without saying which document was missing.
  // Resolved, because the rotation reports `process.cwd()` in the platform's canonical spelling.
  const out = realpathSync(mkdtempSync(join(tmpdir(), 'workspacify-tree-noreverse-')));
  try {
    const run = spawnSync(process.execPath, [RUN_SCRIPT, 'reverse'], { cwd: out, encoding: 'utf8' });
    assert.notEqual(run.status, 0, 'a reverse run with nothing to read cannot pass');
    assert.match(
      `${run.stdout}${run.stderr}`,
      /workspacify[/\\]reverse/,
      'the place it looked in is named, so the failure is reported rather than silent',
    );
    assert.doesNotMatch(
      `${run.stdout}${run.stderr}`,
      /--decisions/,
      'and it never asks the caller for a path it derives from the subject',
    );
    assert.equal(existsSync(join(out, MANIFEST_FILE_NAME)), false, 'and nothing is published');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('IT-6b every withdrawn flag is refused by name with the whole token, and nothing is published', () => {
  const workspace = buildReverseWorkspace();
  try {
    authorDelta(workspace.deltaPath);
    // Every one of these named a document this subcommand now derives. Refusing
    // them is not politeness: a dropped path reads as a path that was used, so an
    // operator who scoped a run would be told a scoped run had passed.
    const withdrawnTokens = [
      `--spec=${join(FIXTURES, SPEC_NAME)}`,
      '--graph=/tmp/elsewhere-graph.json',
      '--measured=/tmp/elsewhere-edges.json',
      '--sidecars=/tmp/elsewhere-sidecars',
      '--root=/tmp/elsewhere',
      '--delta=/tmp/elsewhere-delta.json',
      '--out=/tmp/elsewhere-out',
      '--prior-partition=/tmp/elsewhere-dirs-tree.json',
    ];
    for (const token of withdrawnTokens) {
      const run = runReverseCli(workspace, [token]);
      assert.equal(run.status, 1, `${token} must be refused rather than ignored:\n${run.stdout}\n${run.stderr}`);
      assert.ok(
        `${run.stdout}${run.stderr}`.includes(token),
        `${token} must be reported as the caller wrote it: ${run.stdout}${run.stderr}`,
      );
      assert.equal(
        existsSync(join(workspace.out, MANIFEST_FILE_NAME)),
        false,
        `${token} must publish nothing`,
      );
    }
  } finally {
    rmSync(workspace.dir, { recursive: true, force: true });
  }
});

test('IT-6c a bare positional is refused rather than read as a subject', () => {
  const workspace = buildReverseWorkspace();
  try {
    authorDelta(workspace.deltaPath);
    // The subject is the directory the command is run in. A caller who hands a
    // root has to learn the scope was never theirs, rather than receive a report
    // over the directory they did not name.
    const run = runReverseCli(workspace, ['/some/other/project']);
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.ok(`${run.stdout}${run.stderr}`.includes('/some/other/project'), 'the argument is named');
    assert.equal(existsSync(join(workspace.out, MANIFEST_FILE_NAME)), false, 'nothing is published');
  } finally {
    rmSync(workspace.dir, { recursive: true, force: true });
  }
});
