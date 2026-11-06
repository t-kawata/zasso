// PX-379 @verifies C001
// PX-379 @verifies C002
// PX-379 @verifies C003
// PX-379 @verifies C004
// [::TICKET::] PX-379 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-379 --for-spec --no-implementation-order`.
/**
 * A canonical rewrite records the chain it owes. The grill completes while the debt is
 * pending, and the chain's final stage discharges it only when every receipt matches the
 * current RFC. A debt carried past the run that recorded it keeps the gate closed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateRederiveReceipts, REQUIRED_GATE_NAMES } from '../../.claude/scripts/grill-me-for-rfc/complete-run.js';
import { writeCompletionReceipt } from '../../.claude/scripts/grill-me-for-rfc/completion-receipt.js';
import { classifyCanonState } from '../../.claude/scripts/grill-me-for-rfc/canon-state.js';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INIT = join(PROJECT_ROOT, '.claude/scripts/grill-me-for-rfc/init.js');
const UPDATE_STATUS = join(PROJECT_ROOT, '.claude/scripts/grill-me-for-rfc/update-status.js');
const CHECK_SCHEMA = join(PROJECT_ROOT, '.claude/scripts/grill-me-for-rfc/check-all-schema.js');
const SPLIT = join(PROJECT_ROOT, '.claude/scripts/rfc-graph/update-split-step-status.js');

const RFC_TEXT = '# RFC\n\n## Design\n';
const GRAPH_TEXT = '{"nodes":[],"edges":[]}\n';
const DIRS_TREE_TEXT = '{"trees":{},"distribution":{"units":{}}}\n';
const TICKETS_TEXT = '{"phases":[]}\n';
const RECORDED_AT = '2026-01-01T00:00:00.000Z';

/** A valid grill session with the RFC the receipt binds. */
// [::TICKET::] PX-379 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-379 --for-spec --no-implementation-order`.
function freshSession() {
  const root = mkdtempSync(join(tmpdir(), 'px379-rederive-'));
  const rfcDir = join(root, 'rfc');
  const materialDir = join(root, 'material');
  mkdirSync(rfcDir);
  mkdirSync(materialDir);
  writeFileSync(join(materialDir, 'seed.md'), '# seed\n');
  execFileSync(process.execPath, [INIT, rfcDir, materialDir], { encoding: 'utf8' });
  writeFileSync(join(rfcDir, 'RFC.md'), RFC_TEXT, 'utf8');
  writeFileSync(join(rfcDir, 'RFC-GRAPH.json'), GRAPH_TEXT, 'utf8');
  return rfcDir;
}

/** The artifacts the split stage consumes and writes. */
// [::TICKET::] PX-379 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-379 --for-spec --no-implementation-order`.
function prepareSplitArtifacts(rfcDir) {
  writeFileSync(join(rfcDir, 'RFC-Dirs-Tree.json'), DIRS_TREE_TEXT, 'utf8');
  writeFileSync(join(rfcDir, 'Tickets.json'), TICKETS_TEXT, 'utf8');
}

/** The sha256 of a string. */
// [::TICKET::] PX-379 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-379 --for-spec --no-implementation-order`.
function digestOf(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** Run one update-status operation. */
// [::TICKET::] PX-379 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-379 --for-spec --no-implementation-order`.
function updateStatus(rfcDir, ...args) {
  return execFileSync(process.execPath, [UPDATE_STATUS, rfcDir, ...args], { encoding: 'utf8' });
}

/** Run one stage CLI. */
// [::TICKET::] PX-379 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-379 --for-spec --no-implementation-order`.
function run(script, args) {
  return execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: 'pipe' });
}

/** The status document a fresh session carries. */
// [::TICKET::] PX-379 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-379 --for-spec --no-implementation-order`.
function readStatus(rfcDir) {
  return JSON.parse(readFileSync(join(rfcDir, 'Status.json'), 'utf8'));
}

/** One stage status carrying a receipt bound to the given digest. */
// [::TICKET::] PX-379 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-379 --for-spec --no-implementation-order`.
function writeStageReceipt(rfcDir, stage, options = {}) {
  const statusFile = stage === 'graphify' ? 'RFC-GRAPHIFY-Status.json' : 'RFC-BOUNDIFY-Status.json';
  const outputDigest = options.outputDigest ?? digestOf(stage === 'graphify' ? GRAPH_TEXT : DIRS_TREE_TEXT);
  writeFileSync(join(rfcDir, statusFile), JSON.stringify({
    sourceFile: 'RFC.md',
    graphFile: 'RFC-GRAPH.json',
    currentStep: 6,
    steps: {},
    lastOutputDigest: outputDigest,
    receipt: {
      stage,
      sourceDigest: options.sourceDigest ?? digestOf(RFC_TEXT),
      inputDigests: {},
      outputDigest,
      gateVerdicts: [],
      recordedAt: RECORDED_AT,
    },
  }), 'utf8');
}

/** Fresh receipts for graphify and boundify, optionally omitting one stage. */
// [::TICKET::] PX-379 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-379 --for-spec --no-implementation-order`.
function writeFreshChainReceipts(rfcDir, options = {}) {
  if (options.omit !== 'graphify') writeStageReceipt(rfcDir, 'graphify');
  if (options.omit !== 'boundify') writeStageReceipt(rfcDir, 'boundify');
}

/** Run the split CLI through the final step. */
// [::TICKET::] PX-379 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-379 --for-spec --no-implementation-order`.
function finishSplit(rfcDir, options = {}) {
  const statusPath = join(rfcDir, 'RFC-SPLIT-Status.json');
  run(SPLIT, [`--status=${statusPath}`, 'begin-run', '--run-id=test-run']);
  run(SPLIT, [`--status=${statusPath}`, 'end-step', '6', ...(options.audit ? ['--audit'] : [])]);
  return statusPath;
}

test('C002 postcondition: record-rederive binds the chain, the RFC digest and the generation', () => {
  const rfcDir = freshSession();
  updateStatus(rfcDir, 'begin-run');
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify,boundify,split');

  const rederive = readStatus(rfcDir).rederive;
  assert.equal(rederive.required, true);
  assert.deepEqual(rederive.chain, ['graphify', 'boundify', 'split']);
  assert.equal(rederive.sourceDigest, digestOf(RFC_TEXT));
  assert.equal(rederive.recordedGeneration, 1);
  assert.ok(rederive.recordedAt.length > 0);
});

test('C002 invariant: clear-rederive removes the obligation', () => {
  const rfcDir = freshSession();
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify');
  updateStatus(rfcDir, 'clear-rederive');

  assert.equal(readStatus(rfcDir).rederive, undefined);
});

test('C004 normal: no recorded obligation passes the gate', () => {
  const rfcDir = freshSession();

  assert.deepEqual(evaluateRederiveReceipts(rfcDir), {
    exitCode: 0,
    status: 'passed',
    detail: 'no rederive owed',
  });
});

test('C001 normal: an obligation recorded by this run passes as pending', () => {
  const rfcDir = freshSession();
  updateStatus(rfcDir, 'begin-run');
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify,boundify,split');

  assert.deepEqual(evaluateRederiveReceipts(rfcDir), {
    exitCode: 0,
    status: 'pending',
    detail: 'rederive owed: graphify, boundify, split',
  });
});

test('C001 invariant: DONE keeps the rederive record on disk', () => {
  const rfcDir = freshSession();
  updateStatus(rfcDir, 'begin-run');
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify,boundify,split');
  const receipt = writeCompletionReceipt(
    rfcDir,
    REQUIRED_GATE_NAMES.map((name) => ({ name, exitCode: 0 })),
  );
  updateStatus(rfcDir, 'set-state', 'DONE', `--completion-receipt=${receipt.path}`);

  const status = readStatus(rfcDir);
  assert.equal(status.state, 'DONE');
  assert.equal(status.rederive.required, true);
  assert.deepEqual(status.rederive.chain, ['graphify', 'boundify', 'split']);
});

test('C002 error: an owed receipt from an earlier generation blocks the gate', () => {
  const rfcDir = freshSession();
  updateStatus(rfcDir, 'begin-run');
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify');
  updateStatus(rfcDir, 'begin-run');

  const verdict = evaluateRederiveReceipts(rfcDir);
  assert.equal(verdict.exitCode, 1);
  assert.match(verdict.detail, /RECEIPT_MISSING:graphify/);
});

test('C002 error: a stale receipt from an earlier generation blocks the gate', () => {
  const rfcDir = freshSession();
  updateStatus(rfcDir, 'begin-run');
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify');
  updateStatus(rfcDir, 'begin-run');
  writeStageReceipt(rfcDir, 'graphify', { sourceDigest: 'b'.repeat(64) });

  const verdict = evaluateRederiveReceipts(rfcDir);
  assert.equal(verdict.exitCode, 1);
  assert.match(verdict.detail, /RECEIPT_STALE:graphify/);
});

test('C002 normal: a matching stage receipt passes the gate', () => {
  const rfcDir = freshSession();
  updateStatus(rfcDir, 'begin-run');
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify');
  writeStageReceipt(rfcDir, 'graphify');

  assert.deepEqual(evaluateRederiveReceipts(rfcDir), {
    exitCode: 0,
    status: 'passed',
    detail: 'stage receipts match the current RFC',
  });
});

test('C003 normal: a fresh chain discharges the debt after the split write', () => {
  const rfcDir = freshSession();
  prepareSplitArtifacts(rfcDir);
  writeFreshChainReceipts(rfcDir);
  updateStatus(rfcDir, 'begin-run');
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify,boundify,split');

  const statusPath = finishSplit(rfcDir);

  assert.equal(readStatus(rfcDir).rederive, undefined);
  const splitStatus = JSON.parse(readFileSync(statusPath, 'utf8'));
  assert.equal(splitStatus.receipt.stage, 'split');
  assert.equal(splitStatus.receipt.sourceDigest, digestOf(RFC_TEXT));
});

test('C003 invariant: a partial chain keeps the debt and the split still succeeds', () => {
  const rfcDir = freshSession();
  prepareSplitArtifacts(rfcDir);
  writeFreshChainReceipts(rfcDir, { omit: 'boundify' });
  updateStatus(rfcDir, 'begin-run');
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify,boundify,split');

  const statusPath = finishSplit(rfcDir);

  const splitStatus = JSON.parse(readFileSync(statusPath, 'utf8'));
  assert.equal(splitStatus.steps['6'], 'done');
  assert.equal(readStatus(rfcDir).rederive.required, true);
});

test('C003 edge: an audit run writes no split receipt and discharges nothing', () => {
  const rfcDir = freshSession();
  prepareSplitArtifacts(rfcDir);
  writeFreshChainReceipts(rfcDir);
  updateStatus(rfcDir, 'begin-run');
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify,boundify,split');

  const statusPath = finishSplit(rfcDir, { audit: true });

  assert.equal(JSON.parse(readFileSync(statusPath, 'utf8')).receipt, undefined);
  assert.equal(readStatus(rfcDir).rederive.required, true);
});

test('C004 normal: discharge with no obligation is a no-op', () => {
  const rfcDir = freshSession();

  const stdout = execFileSync(process.execPath, [UPDATE_STATUS, rfcDir, 'discharge-rederive'], {
    encoding: 'utf8',
  });

  assert.deepEqual(JSON.parse(stdout), {
    ok: true,
    discharged: false,
    reason: 'no-obligation',
  });
  assert.equal(readStatus(rfcDir).rederive, undefined);
});

test('C004 normal: the recorded generation is schema-valid', () => {
  const rfcDir = freshSession();
  updateStatus(rfcDir, 'begin-run');
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify');

  assert.equal(readStatus(rfcDir).rederive.recordedGeneration, 1);
  execFileSync(process.execPath, [CHECK_SCHEMA, rfcDir], { stdio: 'pipe' });
});

test('C004 error: a non-integer generation is rejected by the schema', () => {
  const rfcDir = freshSession();
  const status = readStatus(rfcDir);
  status.rederive = {
    required: true,
    chain: ['graphify'],
    sourceDigest: digestOf(RFC_TEXT),
    recordedGeneration: 'one',
  };
  writeFileSync(join(rfcDir, 'Status.json'), JSON.stringify(status, null, 2), 'utf8');

  const result = spawnSync(process.execPath, [CHECK_SCHEMA, rfcDir], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /recordedGeneration/);
});

test('IT: a pending debt keeps drill out until the chain discharges it', () => {
  const rfcDir = freshSession();
  prepareSplitArtifacts(rfcDir);
  updateStatus(rfcDir, 'begin-run');
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify,boundify,split');

  assert.equal(classifyCanonState(rfcDir).state, 'materialized-stale');

  writeFreshChainReceipts(rfcDir);
  finishSplit(rfcDir);

  assert.equal(classifyCanonState(rfcDir).state, 'materialized-fresh');
});
