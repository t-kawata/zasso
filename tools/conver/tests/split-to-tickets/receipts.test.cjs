// PX-377 @verifies C003
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-377 --for-spec --no-implementation-order`.
/**
 * The three stage writers record the RFC digest they read without changing the
 * artifact they wrote. These tests run the real CLIs, because the receipt is a
 * status-file contract and a description of it would freeze the description.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const GRAPHIFY = join(__dirname, '../../.claude/scripts/rfc-graph/update-step-status.js');
const BOUNDIFY = join(__dirname, '../../.claude/scripts/rfc-graph/update-boundify-step-status.js');
const SPLIT = join(__dirname, '../../.claude/scripts/rfc-graph/update-split-step-status.js');

const RFC_TEXT = '# RFC\n\n## Design\n';
const GRAPH_TEXT = '{"nodes":[],"edges":[]}\n';
const DIRS_TREE_TEXT = '{"trees":{},"distribution":{"units":{}}}\n';
const TICKETS_TEXT = '{"phases":[]}\n';

/** A package directory with the artifacts the writers read and write. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function makePackage() {
  const directory = mkdtempSync(join(tmpdir(), 'px377-stage-'));
  writeFileSync(join(directory, 'RFC.md'), RFC_TEXT, 'utf8');
  writeFileSync(join(directory, 'RFC-GRAPH.json'), GRAPH_TEXT, 'utf8');
  writeFileSync(join(directory, 'RFC-Dirs-Tree.json'), DIRS_TREE_TEXT, 'utf8');
  writeFileSync(join(directory, 'Tickets.json'), TICKETS_TEXT, 'utf8');
  return directory;
}

/** Run one writer command. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function run(script, args) {
  return execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: 'pipe' });
}

/** The sha256 of a string. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function digestOf(text) {
  return createHash('sha256').update(text).digest('hex');
}

test('C003 postcondition: graphify records its receipt without changing the graph', () => {
  const directory = makePackage();
  const statusPath = join(directory, 'RFC-GRAPHIFY-Status.json');
  run(GRAPHIFY, [`--status=${statusPath}`, 'begin-run', '--run-id=test-run']);
  run(GRAPHIFY, [`--status=${statusPath}`, 'end-step', '5']);

  const status = JSON.parse(readFileSync(statusPath, 'utf8'));
  assert.equal(status.receipt.stage, 'graphify');
  assert.equal(status.receipt.sourceDigest, digestOf(RFC_TEXT));
  assert.equal(status.receipt.outputDigest, digestOf(GRAPH_TEXT));
  assert.equal(status.receipt.outputDigest, status.lastOutputDigest);
  assert.deepEqual(
    status.receipt.gateVerdicts.find((entry) => entry.step === '5'),
    { step: '5', verdict: 'done' },
  );
  assert.equal(status.receipt.gateVerdicts.length, 6, 'every step verdict is recorded, including the pending ones');
  assert.equal(readFileSync(join(directory, 'RFC-GRAPH.json'), 'utf8'), GRAPH_TEXT);
});

test('C003 postcondition: boundify records its receipt and the graph input digest', () => {
  const directory = makePackage();
  const statusPath = join(directory, 'RFC-BOUNDIFY-Status.json');
  run(BOUNDIFY, [`--status=${statusPath}`, 'begin-run', '--run-id=test-run']);
  run(BOUNDIFY, [`--status=${statusPath}`, 'end-step', '3']);

  const status = JSON.parse(readFileSync(statusPath, 'utf8'));
  assert.equal(status.receipt.stage, 'boundify');
  assert.equal(status.receipt.sourceDigest, digestOf(RFC_TEXT));
  assert.equal(status.receipt.inputDigests.graph, digestOf(GRAPH_TEXT));
  assert.equal(status.receipt.outputDigest, digestOf(DIRS_TREE_TEXT));
  assert.equal(readFileSync(join(directory, 'RFC-Dirs-Tree.json'), 'utf8'), DIRS_TREE_TEXT);
});

test('C003 postcondition: split records its receipt and the tree input digest', () => {
  const directory = makePackage();
  const statusPath = join(directory, 'RFC-SPLIT-Status.json');
  run(SPLIT, [`--status=${statusPath}`, 'begin-run', '--run-id=test-run']);
  run(SPLIT, [`--status=${statusPath}`, 'end-step', '6']);

  const status = JSON.parse(readFileSync(statusPath, 'utf8'));
  assert.equal(status.receipt.stage, 'split');
  assert.equal(status.receipt.sourceDigest, digestOf(RFC_TEXT));
  assert.equal(status.receipt.inputDigests.graph, digestOf(GRAPH_TEXT));
  assert.equal(status.receipt.inputDigests.dirsTree, digestOf(DIRS_TREE_TEXT));
  assert.equal(status.receipt.outputDigest, digestOf(TICKETS_TEXT));
  assert.equal(readFileSync(join(directory, 'Tickets.json'), 'utf8'), TICKETS_TEXT);
});

test('C003 invariant: an audit run writes no receipt', () => {
  const directory = makePackage();
  const statusPath = join(directory, 'RFC-GRAPHIFY-Status.json');
  run(GRAPHIFY, [`--status=${statusPath}`, 'begin-run', '--run-id=test-run']);
  run(GRAPHIFY, [`--status=${statusPath}`, 'end-step', '5', '--audit']);

  const status = JSON.parse(readFileSync(statusPath, 'utf8'));
  assert.equal(status.receipt, undefined);
});
