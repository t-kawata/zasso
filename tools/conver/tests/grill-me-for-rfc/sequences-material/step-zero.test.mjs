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
  PROJECT_ROOT,
  SETTLE_RUN,
  VIEW_JSON_NAME,
  VIEW_MARKDOWN_NAME,
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
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
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

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C002 grill STEP 0 names the detector after init.js and before the strict reader', () => {
  const order = callOrderInStep(GRILL_COMMAND, '### STEP 0: Initialization', [
    'init.js', 'sequences-material.js', 'run.mjs', 'list-files.js', 'settle-run.js',
  ]);
  assert.ok(order.includes('sequences-material.js'), `the detector is not called: ${order.join(' -> ')}`);
  assert.ok(order.indexOf('init.js') < order.indexOf('sequences-material.js'), order.join(' -> '));
  assert.ok(order.indexOf('sequences-material.js') < order.indexOf('list-files.js'), order.join(' -> '));
  assert.ok(order.indexOf('run.mjs') < order.indexOf('list-files.js'), order.join(' -> '));
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
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

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C002 with no sequences material STEP 0 produces byte-identical artifacts', () => {
  withScratch('px256-step0-', (root) => {
    const before = makeGrillSession(path.join(root, 'before'));
    const after = makeGrillSession(path.join(root, 'after'));

    runPreChangeStepZero(before, { arguments: [path.join(before, 'Specification.md')] });
    const result = runStepZero(after, { arguments: [path.join(after, 'Specification.md')] });

    assert.equal(result.init.status, 0, result.init.stderr);
    assert.equal(result.detector.answer.present, false);
    assert.equal(result.generation, null);
    assert.equal(result.listFiles.status, 0, result.listFiles.stderr);
    assert.deepEqual(stepZeroArtifacts(after), stepZeroArtifacts(before));
    assert.equal(fs.existsSync(path.join(after, VIEW_MARKDOWN_NAME)), false);
    assert.equal(fs.existsSync(path.join(after, VIEW_JSON_NAME)), false);
  });
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
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
    assert.equal(result.generation.written.status, 0, result.generation.written.stderr);
    assert.equal(result.generation.recorded.status, 0, result.generation.recorded.stderr);
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

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
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

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
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

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
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
