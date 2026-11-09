'use strict';
// PX-395 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C006

/**
 * PX-395 — manifest-first workspace discovery and the no-argument workspace run.
 *
 * Every test builds a synthetic workspace so discovery, failure continuation and the
 * single workspace-order write are deterministic and independent of the real projects.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  discoverWorkspacePackages,
  discoverFilesystemPackages,
  discoverPackages,
  runWorkspace,
} = require('../../.claude/scripts/tickets/condense-tickets.js');
const {
  createWorkspace,
  ticket,
  writePackage,
} = require('./fixtures/manifest-workspace.cjs');

const BUDGET = Object.freeze({
  operations: 8,
  sequenceSteps: 8,
  ownedContracts: 4,
  files: 10,
  testUnit: 100,
  testIntegration: 100,
  modules: 100,
});

const CONDENSE_WORKSPACE_COMMAND = path.join(__dirname, '..', '..', '.claude', 'commands', 'condense-workspace.md');
const CONDENSE_TICKETS_COMMAND = path.join(__dirname, '..', '..', '.claude', 'commands', 'condense-tickets.md');

/** A fresh temporary workspace root. */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function freshRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

/**
 * The discovery workspace: a root package, one split package, a duplicated row,
 * an unsplit package, a missing directory and an unlisted package.
 */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function createDiscoveryWorkspace(prefix) {
  const root = freshRoot(prefix);
  createWorkspace(root, {
    packages: [
      { id: 'pkg-root', path: '.' },
      { id: 'pkg-alpha', path: 'crates/alpha' },
      { id: 'pkg-alpha-again', path: 'crates/alpha' },
      { id: 'pkg-unsplit', path: 'crates/unsplit' },
      { id: 'pkg-absent', path: 'crates/absent' },
    ],
  });
  writePackage(root, [ticket(1), ticket(2)]);
  writePackage(path.join(root, 'crates/alpha'), [ticket(1)]);
  fs.mkdirSync(path.join(root, 'crates/unsplit'), { recursive: true });
  writePackage(path.join(root, 'crates/stray'), [ticket(1)]);
  return root;
}

/** A workspace whose three packages each condense 2 -> 1. */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-395 --for-spec --no-implementation-order`.
function createApplyWorkspace(prefix) {
  const root = freshRoot(prefix);
  const names = ['alpha', 'beta', 'gamma'];
  createWorkspace(root, {
    packages: names.map((name) => ({ id: `pkg-${name}`, path: `crates/${name}` })),
  });
  for (const name of names) {
    writePackage(
      path.join(root, 'crates', name),
      [ticket(1, { fileCount: 2 }), ticket(2, { fileCount: 3 })],
      { graph: false, dirsTree: false },
    );
  }
  return root;
}

/** A crystal-shaped workspace: the root package holds ten tickets that condense 10 -> 9. */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function createCrystalShapedWorkspace(prefix) {
  const root = freshRoot(prefix);
  const packageNames = Array.from({ length: 22 }, (_, index) => `pkg-${String(index + 1).padStart(2, '0')}`);
  createWorkspace(root, {
    packages: [
      { id: 'pkg-crystal', path: '.' },
      ...packageNames.map((name) => ({ id: name, path: `crates/${name}` })),
    ],
  });
  const rootTickets = [];
  for (let id = 1; id <= 8; id += 1) rootTickets.push(ticket(id, { fileCount: 10 }));
  rootTickets.push(ticket(9), ticket(10));
  writePackage(root, rootTickets, { graph: false, dirsTree: false });
  for (const name of packageNames) {
    writePackage(path.join(root, 'crates', name), [ticket(1)], { graph: false, dirsTree: false });
  }
  return root;
}

/** A gaia-shaped workspace: 29 rows, 19 split, 10 unsplit and a root aggregate. */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function createGaiaShapedWorkspace(prefix) {
  const root = freshRoot(prefix);
  const splitNames = Array.from({ length: 19 }, (_, index) => `pkg-split-${String(index + 1).padStart(2, '0')}`);
  const unsplitNames = Array.from({ length: 10 }, (_, index) => `pkg-unsplit-${String(index + 1).padStart(2, '0')}`);
  createWorkspace(root, {
    packages: [
      ...splitNames.map((name) => ({ id: name, path: `crates/${name}` })),
      ...unsplitNames.map((name) => ({ id: name, path: `crates/${name}` })),
    ],
  });
  for (const name of splitNames) writePackage(path.join(root, 'crates', name), [ticket(1)]);
  for (const name of unsplitNames) fs.mkdirSync(path.join(root, 'crates', name), { recursive: true });
  writePackage(root, [ticket(1)], { graph: false, dirsTree: false });
  return root;
}

/** Capture every Tickets.json byte under a workspace. */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function snapshotLedgers(root) {
  const snapshot = new Map();
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = path.join(directory, entry.name);
      const ledger = path.join(child, 'Tickets.json');
      if (fs.existsSync(ledger)) snapshot.set(child, fs.readFileSync(ledger, 'utf8'));
      walk(child);
    }
  };
  walk(root);
  return snapshot;
}

test('discovery follows manifest order and deduplicates rows (C001)', () => {
  const root = createDiscoveryWorkspace('manifest-order');
  const found = discoverWorkspacePackages(root);
  assert.equal(found.source, 'manifest');
  assert.deepEqual(found.targets, [root, path.join(root, 'crates/alpha')]);
  assert.equal(new Set(found.targets).size, found.targets.length);
});

test('an unsplit package and a missing directory are reported, never targeted (C002)', () => {
  const root = createDiscoveryWorkspace('manifest-skipped');
  const found = discoverWorkspacePackages(root);
  assert.deepEqual(found.skipped, [
    { path: path.join(root, 'crates/unsplit'), reason: 'unsplit' },
    { path: path.join(root, 'crates/absent'), reason: 'missing-directory' },
  ]);
  assert.equal(found.targets.includes(path.join(root, 'crates/unsplit')), false);
  assert.equal(found.targets.includes(path.join(root, 'crates/absent')), false);
});

test('a ledger outside the manifest is unlisted, never targeted (C003)', () => {
  const root = createDiscoveryWorkspace('manifest-unlisted');
  const found = discoverWorkspacePackages(root);
  assert.ok(found.unlisted.includes(path.join(root, 'crates/stray')));
  assert.equal(found.targets.includes(path.join(root, 'crates/stray')), false);
});

test('path "." is the root package and a root aggregate is not unlisted (C004)', () => {
  const root = createDiscoveryWorkspace('manifest-root');
  const found = discoverWorkspacePackages(root);
  assert.ok(found.targets.includes(root));

  const aggregate = createWorkspace(freshRoot('manifest-aggregate'), { packages: [] });
  writePackage(aggregate, [ticket(1)], { graph: false, dirsTree: false });
  assert.deepEqual(discoverWorkspacePackages(aggregate).unlisted, []);
});

test('a workspace without a tree manifest falls back to the filesystem walk (C001)', () => {
  const root = createWorkspace(freshRoot('manifest-fallback'), { manifest: false });
  const good = path.join(root, 'crate-good');
  const graphOnly = path.join(root, 'crate-graph-only');
  const fixture = path.join(root, 'tests', 'fixtures', 'crate-fixture');
  writePackage(good, [ticket(1)]);
  writePackage(graphOnly, [ticket(1)], { dirsTree: false });
  writePackage(fixture, [ticket(1)]);
  writePackage(root, [ticket(1)]);
  const found = discoverWorkspacePackages(root);
  assert.equal(found.source, 'filesystem');
  assert.deepEqual(found.targets, [good]);
  assert.deepEqual(found.skipped, []);
  assert.deepEqual(found.unlisted, []);
  assert.deepEqual(discoverFilesystemPackages(root), [good]);
  assert.deepEqual(discoverPackages, discoverFilesystemPackages);
});

test('one failing package does not stop the remaining targets (C005)', async () => {
  const root = createApplyWorkspace('workspace-failure');
  const betaDirectory = path.join(root, 'crates/beta');
  const betaBefore = fs.readFileSync(path.join(betaDirectory, 'Tickets.json'), 'utf8');
  const writerCalls = [];
  const summary = await runWorkspace({
    workspace: root,
    apply: true,
    budget: BUDGET,
    verify: ({ artifacts }) => {
      if (artifacts.directory === betaDirectory) throw new Error('gate');
      return { ok: true };
    },
    writeWorkspaceOrder: (workspaceRoot) => { writerCalls.push(workspaceRoot); return { ok: true }; },
  });
  assert.deepEqual(summary.failed.map((entry) => entry.directory), [betaDirectory]);
  assert.equal(summary.applied, 2);
  assert.equal(summary.noChange, 0);
  assert.equal(fs.readFileSync(path.join(betaDirectory, 'Tickets.json'), 'utf8'), betaBefore);
  assert.equal(writerCalls.length, 1);
  for (const name of ['alpha', 'gamma']) {
    const archives = fs.readdirSync(path.join(root, 'crates', name))
      .filter((entry) => entry.startsWith('Tickets.pre-condense-'));
    assert.equal(archives.length, 1, `${name} keeps its own archive`);
  }
});

test('the workspace order writer runs once after a changing run (C006)', async () => {
  const root = createApplyWorkspace('workspace-order');
  const writerCalls = [];
  const summary = await runWorkspace({
    workspace: root,
    apply: true,
    budget: BUDGET,
    verify: () => ({ ok: true }),
    writeWorkspaceOrder: (workspaceRoot) => { writerCalls.push(workspaceRoot); return { ok: true }; },
  });
  assert.equal(summary.applied, 3);
  assert.equal(summary.orderWritten, true);
  assert.deepEqual(writerCalls, [root]);
});

test('a no-change run writes no ledger and calls no workspace order writer (C006)', async () => {
  const root = createApplyWorkspace('workspace-no-change');
  const writerCalls = [];
  const writeWorkspaceOrder = (workspaceRoot) => { writerCalls.push(workspaceRoot); return { ok: true }; };
  await runWorkspace({ workspace: root, apply: true, budget: BUDGET, verify: () => ({ ok: true }), writeWorkspaceOrder });
  const before = snapshotLedgers(root);
  const second = await runWorkspace({ workspace: root, apply: true, budget: BUDGET, verify: () => ({ ok: true }), writeWorkspaceOrder });
  assert.equal(second.applied, 0);
  assert.equal(second.noChange, 3);
  assert.deepEqual(snapshotLedgers(root), before);
  assert.equal(writerCalls.length, 1);
});

test('/condense-workspace refuses an argument before any script runs (C004)', () => {
  const command = fs.readFileSync(CONDENSE_WORKSPACE_COMMAND, 'utf8');
  assert.match(command, /\[ -n "\$ARGUMENTS" \]/);
  assert.match(command, /UNEXPECTED_ARGUMENT/);
  const firstScriptInvocation = command.indexOf('condense-tickets.js');
  assert.ok(firstScriptInvocation >= 0, 'the command invokes the shared script');
  assert.ok(command.indexOf('UNEXPECTED_ARGUMENT') < firstScriptInvocation);
  assert.doesNotMatch(command, /^argument-hint:/m);
  assert.match(command, /WORKSPACIFY-TREE-MANIFEST\.json/);
  assert.match(command, /--plan --workspace="\$PWD"/);
  assert.match(command, /--apply --workspace="\$PWD"/);
});

test('/condense-tickets stays package-scoped and argument-free (C004)', () => {
  const command = fs.readFileSync(CONDENSE_TICKETS_COMMAND, 'utf8');
  assert.match(command, /\[ -n "\$ARGUMENTS" \]/);
  assert.match(command, /\[ ! -f "Tickets\.json" \]/);
  assert.doesNotMatch(command, /^argument-hint:/m);
  const invocations = command.split('\n').filter((line) => line.includes('condense-tickets.js'));
  assert.equal(invocations.some((line) => line.includes('--workspace')), false);
  assert.equal(invocations.length, 2, 'the package command keeps its plan and apply invocations');
  assert.match(command, /\/condense-workspace/, 'the package command points at the workspace command');
});

test('a crystal-shaped manifest discovers 23 targets and condenses the root 10 -> 9 (C001, C004)', async () => {
  const root = createCrystalShapedWorkspace('workspace-crystal');
  const found = discoverWorkspacePackages(root);
  assert.equal(found.targets.length, 23);
  assert.equal(found.targets[0], root);
  const summary = await runWorkspace({
    workspace: root,
    apply: true,
    budget: BUDGET,
    verify: () => ({ ok: true }),
    writeWorkspaceOrder: () => ({ ok: true }),
  });
  assert.equal(summary.applied, 1);
  assert.equal(summary.noChange, 22);
  const condensed = JSON.parse(fs.readFileSync(path.join(root, 'Tickets.json'), 'utf8'));
  assert.equal(condensed.phases[0].tickets.length, 9);
});

test('a gaia-shaped manifest targets 19 packages and reports 10 unsplit (C002)', () => {
  const root = createGaiaShapedWorkspace('workspace-gaia');
  const found = discoverWorkspacePackages(root);
  assert.equal(found.source, 'manifest');
  assert.equal(found.targets.length, 19);
  assert.equal(found.skipped.length, 10);
  assert.equal(found.skipped.every((entry) => entry.reason === 'unsplit'), true);
  assert.deepEqual(found.unlisted, []);
});

test('a second workspace apply is NO_CHANGE and writes no bytes (C006)', async () => {
  const root = createCrystalShapedWorkspace('workspace-idempotent');
  const writeWorkspaceOrder = () => ({ ok: true });
  await runWorkspace({ workspace: root, apply: true, budget: BUDGET, verify: () => ({ ok: true }), writeWorkspaceOrder });
  const before = snapshotLedgers(root);
  const second = await runWorkspace({ workspace: root, apply: true, budget: BUDGET, verify: () => ({ ok: true }), writeWorkspaceOrder });
  assert.equal(second.applied, 0);
  assert.equal(second.noChange, 23);
  assert.deepEqual(snapshotLedgers(root), before);
});
