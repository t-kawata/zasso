// PX-256 @verifies C002
// PX-256 @verifies C005
// STEP 0 is the surface the user's constraint is about: without the reinforcement nothing
// may change, and with it the material must arrive. The command is a bash block inside a
// markdown file, so these tests do both halves — the order test reads the block and
// asserts it states the right sequence, and the behaviour tests run that sequence over the
// real scripts. A command that said the wrong thing and a sequence that did the wrong
// thing each fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  INIT,
  PROJECT_ROOT,
  SETTLE_RUN,
  VIEW_JSON_NAME,
  VIEW_MARKDOWN_NAME,
  changedPaths,
  digestDirectory,
  digestFile,
  makeGrillSession,
  readStatus,
  runPreChangeStepZero,
  runStepZero,
  stepZeroArtifacts,
  withScratch,
} from './fixtures/session-tree.mjs';
import { buildSyntheticTriple, removeSyntheticTriple } from '../../sequences-slice/fixtures/synthetic-workspace.mjs';

const GRILL_COMMAND = path.join(PROJECT_ROOT, '.claude', 'commands', 'grill-me-for-rfc.md');
const DRILL_COMMAND = path.join(PROJECT_ROOT, '.claude', 'commands', 'drill-rfc-down.md');
const ARTIFACT_FILENAME = 'SyntheticSpec-sequences.json';
const SESSION_PACKAGE = 'crates/protocol/gaia-asset';

/**
 * The calls a command file makes inside one execution step, in the order it makes them.
 *
 * Only lines that invoke a script count. Matching bare names would find the prose that
 * explains the ordering — which mentions the scripts by name — and report a sequence no
 * run performs. The command is read rather than restated, so a command that lost the
 * detector or moved it after the strict reader fails here instead of satisfying a test
 * that describes an order the command no longer has.
 */
// [::TICKET::] PX-256 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-256 --for-spec --no-implementation-order`.
function callOrderInStep(commandPath, stepHeading, names) {
  const lines = fs.readFileSync(commandPath, 'utf8').split('\n');
  const start = lines.findIndex((line) => line.trim() === stepHeading);
  assert.notEqual(start, -1, `${stepHeading} not found in ${commandPath}`);
  const rest = lines.slice(start + 1);
  const endOffset = rest.findIndex((line) => /^#{2,4} /.test(line));
  const body = endOffset === -1 ? rest : rest.slice(0, endOffset);

  const calls = [];
  for (const line of body) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('node ')) continue;
    const named = names.find((name) => trimmed.includes(`/${name}`));
    if (named !== undefined) calls.push(named);
  }
  return calls;
}

// [::TICKET::] PX-256 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C002 grill STEP 0 names the detector after init.js and before the strict reader', () => {
  const order = callOrderInStep(GRILL_COMMAND, '### STEP 0: Initialization', [
    'init.js', 'sequences-material.js', 'run.mjs', 'list-files.js', 'settle-run.js',
  ]);
  assert.ok(order.includes('sequences-material.js'), `the detector is not called: ${order.join(' -> ')}`);
  assert.ok(order.indexOf('init.js') < order.indexOf('sequences-material.js'), order.join(' -> '));
  assert.ok(order.indexOf('sequences-material.js') < order.indexOf('list-files.js'), order.join(' -> '));
  // The projection is not a step of this block any more: initialization makes the view current
  // and records it, so a run cannot skip a command it never had to invoke. Asserting the absence
  // rather than an ordering, because an ordering assertion would pass on an index of -1.
  assert.equal(order.includes('run.mjs'), false, `STEP 0 still projects by hand: ${order.join(' -> ')}`);
});

// [::TICKET::] PX-256 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C002 drill Step 1 calls the detector after preflight and before session-init', () => {
  const calls = fs
    .readFileSync(DRILL_COMMAND, 'utf8')
    .split('\n')
    .map((line, index) => ({ line: line.trim(), at: index + 1 }))
    .filter((entry) => entry.line.startsWith('node '));
  const callLineOf = (name) => calls.find((entry) => entry.line.includes(`/${name}`));

  const preflight = callLineOf('preflight.cjs');
  const detector = callLineOf('sequences-material.js');
  const sessionInit = callLineOf('session-init.js');
  assert.ok(preflight !== undefined, 'the drill does not call preflight');
  assert.ok(detector !== undefined, 'the drill does not call the detector');
  assert.ok(sessionInit !== undefined, 'the drill does not call session-init');
  assert.ok(preflight.at < detector.at, `preflight ${preflight.at} is not before detector ${detector.at}`);
  assert.ok(detector.at < sessionInit.at, `detector ${detector.at} is not before session-init ${sessionInit.at}`);
});

// [::TICKET::] PX-256 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C002 with no sequences material STEP 0 produces byte-identical artifacts', () => {
  withScratch('px256-step0-', (root) => {
    const before = makeGrillSession(path.join(root, 'before'));
    const after = makeGrillSession(path.join(root, 'after'));

    runPreChangeStepZero(before, { arguments: [path.join(before, 'Specification.md')] });
    const result = runStepZero(after, { arguments: [path.join(after, 'Specification.md')] });

    assert.equal(result.init.status, 0, result.init.stderr);
    assert.equal(result.detector.answer.present, false);
    assert.deepEqual(result.report.refreshed, []);
    assert.equal(result.listFiles.status, 0, result.listFiles.stderr);
    assert.deepEqual(stepZeroArtifacts(after), stepZeroArtifacts(before));
    assert.equal(fs.existsSync(path.join(after, VIEW_MARKDOWN_NAME)), false);
    assert.equal(fs.existsSync(path.join(after, VIEW_JSON_NAME)), false);
  });
});

// [::TICKET::] PX-256 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C002 with a sequences artifact STEP 0 writes the view and records both names beside it', () => {
  const root = buildSyntheticTriple();
  try {
    const packageDir = path.join(root, SESSION_PACKAGE);
    makeGrillSession(packageDir);
    const specPath = path.join(packageDir, 'Specification.md');
    const sourcePath = path.join(root, ARTIFACT_FILENAME);
    const before = readStatus(packageDir);

    const result = runStepZero(packageDir, { arguments: [specPath, sourcePath] });
    assert.equal(result.init.status, 0, result.init.stderr);
    // The view is written by the initialization step, and it records the two names itself —
    // the strict readers walk the recorded list, so a view written and not recorded is a view
    // the run never reads.
    assert.equal(result.report.refreshed.length, 1);
    assert.equal(result.report.recordedMaterials.length, 2);
    assert.equal(result.listFiles.status, 0, result.listFiles.stderr);

    const status = readStatus(packageDir);
    // The run records three things: the source artifact the command line named, and the
    // two view files it then generated from it. The specification was already recorded.
    assert.deepEqual(status.materialPaths, [
      ...before.materialPaths,
      sourcePath,
      path.join(packageDir, VIEW_MARKDOWN_NAME),
      path.join(packageDir, VIEW_JSON_NAME),
    ]);
    assert.equal(status.researchPath, status.materialPaths[0]);
    assert.equal(fs.existsSync(path.join(packageDir, VIEW_MARKDOWN_NAME)), true);
    assert.equal(fs.existsSync(path.join(packageDir, VIEW_JSON_NAME)), true);
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-256 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C002 a recorded view that was deleted is regenerated before the strict reader walks the list', () => {
  const root = buildSyntheticTriple();
  try {
    const packageDir = path.join(root, SESSION_PACKAGE);
    makeGrillSession(packageDir);
    const specPath = path.join(packageDir, 'Specification.md');
    const sourcePath = path.join(root, ARTIFACT_FILENAME);
    const viewPath = path.join(packageDir, VIEW_MARKDOWN_NAME);

    const first = runStepZero(packageDir, { arguments: [specPath, sourcePath] });
    assert.equal(first.listFiles.status, 0, first.listFiles.stderr);
    const bytes = fs.readFileSync(viewPath, 'utf8');

    fs.rmSync(viewPath);
    const listAfterDeletion = spawnSync(process.execPath, [path.join(PROJECT_ROOT, '.claude/scripts/grill-me-for-rfc/list-files.js'), packageDir], { encoding: 'utf8' });
    assert.equal(listAfterDeletion.status, 1, 'the fixture must reproduce the wedge it is testing');

    const second = runStepZero(packageDir, { arguments: [specPath, sourcePath] });
    assert.equal(second.listFiles.status, 0, second.listFiles.stderr);
    assert.equal(fs.readFileSync(viewPath, 'utf8'), bytes);
    assert.equal(fs.existsSync(viewPath), true);
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-256 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C002 every material path the session records exists on disk after STEP 0', () => {
  const root = buildSyntheticTriple();
  try {
    const packageDir = path.join(root, SESSION_PACKAGE);
    makeGrillSession(packageDir);
    const result = runStepZero(packageDir, {
      arguments: [path.join(packageDir, 'Specification.md'), path.join(root, ARTIFACT_FILENAME)],
    });
    assert.equal(result.init.status, 0, result.init.stderr);

    // The invariant is about what init.js was handed. The observable trace of that is the
    // list it recorded: init.js refuses to record a path that does not exist, so a path
    // recorded and then found absent would mean the path was created and removed mid-run.
    for (const material of readStatus(packageDir).materialPaths) {
      assert.equal(fs.existsSync(material), true, material);
    }
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-256 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C005 a view in one package is not read as a prior record by its neighbour', () => {
  withScratch('px256-step0-', (root) => {
    const workspace = path.join(root, 'workspace');
    const packageA = makeGrillSession(path.join(workspace, 'package-a'));
    const packageB = makeGrillSession(path.join(workspace, 'package-b'));
    fs.writeFileSync(path.join(packageA, VIEW_MARKDOWN_NAME), '# sequences for package a\n');
    fs.writeFileSync(path.join(packageA, 'RFC-SEED.md'), '# seed for package a\n');

    const neighbourRun = spawnSync(process.execPath, [SETTLE_RUN, packageB, 'prior', packageA], { encoding: 'utf8' });
    assert.equal(neighbourRun.status, 0, neighbourRun.stderr);
    assert.equal(neighbourRun.stdout.includes('sequences for package a'), false);

    const tree = JSON.parse(fs.readFileSync(path.join(packageB, 'DesignTree.json'), 'utf8'));
    assert.equal(tree.priorScan.artifacts.includes(VIEW_MARKDOWN_NAME), false);
    assert.ok(tree.priorScan.artifacts.includes('RFC-SEED.md'));
    assert.deepEqual(tree.priorScan.artifacts.filter((name) => !name.startsWith('RFC')), []);
  });
});

// ---------------------------------------------------------------------------
// PX-270 @verifies C001
// PX-270 @verifies C002
// PX-270 @verifies C005
//
// The initialization step makes the recorded view current.
//
// Found by measuring ~/shyme/gaia: init.js rewrites Status.json on every resume, and one
// directory's updatedAt was three weeks old while its view had been re-sliced that afternoon --
// so a run had projected a view and no run had repaired the ledger that judge it. The refresh
// belongs here rather than in the command text because the arguments are already in this script's
// hands, and it fires on the artifact being named, so a project that has none sees no change.
// ---------------------------------------------------------------------------

/** The view a slice that predates the obligation carriage wrote: no obligation field at all. */
// [::TICKET::] PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
function writePreCarriageView(packageDir) {
  fs.writeFileSync(path.join(packageDir, VIEW_JSON_NAME), JSON.stringify({
    packageId: 'pkg-0001',
    ownedOperationUnits: [],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    unmatchedClassNames: [],
  }));
  fs.writeFileSync(path.join(packageDir, VIEW_MARKDOWN_NAME), '# sequences, projected before the carriage\n');
}

/** The JSON init.js prints, which is how a caller learns what the run decided. */
// [::TICKET::] PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
function runInit(packageDir, args) {
  const result = spawnSync(process.execPath, [INIT, packageDir, ...args], { encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr, report: JSON.parse(result.stdout) };
}

// [::TICKET::] PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
test('C001 a resume naming the artifact replaces a view that predates the carriage', () => {
  const root = buildSyntheticTriple();
  try {
    const packageDir = path.join(root, SESSION_PACKAGE);
    const sourcePath = path.join(root, ARTIFACT_FILENAME);
    makeGrillSession(packageDir, { material: [sourcePath] });
    writePreCarriageView(packageDir);

    const result = runInit(packageDir, [sourcePath]);
    assert.equal(result.status, 0, result.stderr);

    const view = JSON.parse(fs.readFileSync(path.join(packageDir, VIEW_JSON_NAME), 'utf8'));
    assert.notEqual(view.obligationSource, undefined);
    assert.equal(result.report.refreshed.length, 1);
    assert.equal(result.report.refreshed[0].view, VIEW_JSON_NAME);
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
test('C001 the refresh writes the two view files and leaves the session documents alone', () => {
  const root = buildSyntheticTriple();
  try {
    const packageDir = path.join(root, SESSION_PACKAGE);
    const sourcePath = path.join(root, ARTIFACT_FILENAME);
    // A session that never saw the artifact, holding a view from a run that wrote one without
    // recording it: the state in which the refresh has both things to do, and the only state in
    // which "what the material list gains" is not vacuous.
    makeGrillSession(packageDir);
    writePreCarriageView(packageDir);

    const timestamps = ['createdAt', 'updatedAt', 'materialsAddedAt'];
    const beforeFiles = digestDirectory(packageDir, { ignore: timestamps });
    const beforeTree = digestFile(path.join(packageDir, 'DesignTree.json'));
    const beforeChecklist = digestFile(path.join(packageDir, 'CheckList.md'));
    const materialBefore = readStatus(packageDir).materialPaths;

    runInit(packageDir, [sourcePath]);

    // The contract is that no third document is written. The session record may also change,
    // because the refresh records the two documents it just wrote, so the comparison excludes it
    // and the two documents it must not touch are asserted on their own.
    const afterFiles = digestDirectory(packageDir, { ignore: timestamps });
    const changed = changedPaths(beforeFiles, afterFiles).filter((relative) => relative !== 'Status.json');
    assert.deepEqual(changed.sort(), [VIEW_MARKDOWN_NAME, VIEW_JSON_NAME].sort(), 'a document other than the two views was written');
    assert.equal(digestFile(path.join(packageDir, 'DesignTree.json')), beforeTree, 'the refresh wrote the design tree');
    assert.equal(digestFile(path.join(packageDir, 'CheckList.md')), beforeChecklist, 'the refresh wrote the checklist');

    // The list gains this invocation's argument and then the two documents just written, in that
    // order: a view written and not recorded is a view the strict readers never walk, and anything
    // else recorded here would be this step claiming material the run was not handed.
    const gained = readStatus(packageDir).materialPaths.filter((materialPath) => !materialBefore.includes(materialPath));
    assert.deepEqual(gained, [sourcePath, path.join(packageDir, VIEW_MARKDOWN_NAME), path.join(packageDir, VIEW_JSON_NAME)]);
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
test('C002 a resume naming no artifact changes nothing but the session timestamp', () => {
  const root = buildSyntheticTriple();
  try {
    const packageDir = path.join(root, SESSION_PACKAGE);
    const sourcePath = path.join(root, ARTIFACT_FILENAME);
    makeGrillSession(packageDir);
    writePreCarriageView(packageDir);
    const specPath = path.join(packageDir, 'Specification.md');
    const timestamps = ['createdAt', 'updatedAt', 'materialsAddedAt'];
    const before = digestDirectory(packageDir, { ignore: timestamps });

    const result = runInit(packageDir, [specPath]);

    const after = digestDirectory(packageDir, { ignore: timestamps });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(changedPaths(before, after), []);
    assert.deepEqual(result.report.refreshed, []);
    assert.equal(fs.readFileSync(path.join(packageDir, VIEW_JSON_NAME), 'utf8').includes('obligationSource'), false);
    assert.equal(sourcePath.endsWith('-sequences.json'), true);
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
test('C005 a second resume over an already current view refreshes nothing and rewrites nothing', () => {
  const root = buildSyntheticTriple();
  try {
    const packageDir = path.join(root, SESSION_PACKAGE);
    const sourcePath = path.join(root, ARTIFACT_FILENAME);
    makeGrillSession(packageDir, { material: [sourcePath] });
    writePreCarriageView(packageDir);

    assert.equal(runInit(packageDir, [sourcePath]).report.refreshed.length, 1);
    const afterFirst = digestFile(path.join(packageDir, VIEW_JSON_NAME));

    const second = runInit(packageDir, [sourcePath]);

    assert.deepEqual(second.report.refreshed, []);
    assert.equal(second.report.reason, null);
    assert.equal(digestFile(path.join(packageDir, VIEW_JSON_NAME)), afterFirst);
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
test('C001 an artifact that cannot be used is reported rather than silently skipping the refresh', () => {
  const root = buildSyntheticTriple();
  try {
    const packageDir = path.join(root, SESSION_PACKAGE);
    const brokenPath = path.join(root, 'Broken-sequences.json');
    fs.writeFileSync(brokenPath, '{ not json');
    makeGrillSession(packageDir, { material: [brokenPath] });
    writePreCarriageView(packageDir);

    const result = runInit(packageDir, [brokenPath]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.report.refreshed, []);
    assert.match(result.report.reason, /Broken-sequences\.json/);
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
test('C001 a session being initialized with an artifact projects the view in that same call', () => {
  const root = buildSyntheticTriple();
  try {
    // The first run in a directory: no session record yet, so this is the branch a new
    // directory takes. Before the manual projection step left the command text, this case was
    // covered by the detector's branch; it has to be covered by initialization now, or the
    // first run in every directory ends with no view at all.
    // The triple's own package directory, which carries a seed and no session record.
    const fresh = path.join(root, SESSION_PACKAGE);
    const specPath = path.join(fresh, 'Specification.md');
    fs.writeFileSync(specPath, '# Specification\n');
    assert.equal(fs.existsSync(path.join(fresh, 'Status.json')), false);

    const result = runInit(fresh, [specPath, path.join(root, ARTIFACT_FILENAME)]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.mode, 'new');
    assert.equal(result.report.refreshed.length, 1);
    assert.equal(fs.existsSync(path.join(fresh, VIEW_JSON_NAME)), true);
    assert.equal(result.report.status.materialPaths.slice(-2).join(' ').includes(VIEW_MARKDOWN_NAME), true);
  } finally {
    removeSyntheticTriple(root);
  }
});
