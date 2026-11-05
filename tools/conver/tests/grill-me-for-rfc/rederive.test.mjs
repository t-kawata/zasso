// PX-377 @verifies C002
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-377 --for-spec --no-implementation-order`.
/**
 * The rederive obligation a canonical rewrite records, and the completion gate that
 * refuses DONE until every stage receipt names the current RFC bytes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateRederiveReceipts } from '../../.claude/scripts/grill-me-for-rfc/complete-run.js';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INIT = join(PROJECT_ROOT, '.claude/scripts/grill-me-for-rfc/init.js');
const UPDATE_STATUS = join(PROJECT_ROOT, '.claude/scripts/grill-me-for-rfc/update-status.js');

const RFC_TEXT = '# RFC\n\n## Design\n';
const GRAPH_TEXT = '{"nodes":[],"edges":[]}\n';

/** A valid grill session with the RFC the receipt binds. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function freshSession() {
  const root = mkdtempSync(join(tmpdir(), 'px377-rederive-'));
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

/** The sha256 of a string. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function digestOf(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** Run one update-status operation. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function updateStatus(rfcDir, ...args) {
  return execFileSync(process.execPath, [UPDATE_STATUS, rfcDir, ...args], { encoding: 'utf8' });
}

/** The status document a fresh session carries. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function readStatus(rfcDir) {
  return JSON.parse(readFileSync(join(rfcDir, 'Status.json'), 'utf8'));
}

test('C002 postcondition: record-rederive binds the chain and the RFC digest', () => {
  const rfcDir = freshSession();
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify,boundify,split');

  const rederive = readStatus(rfcDir).rederive;
  assert.equal(rederive.required, true);
  assert.deepEqual(rederive.chain, ['graphify', 'boundify', 'split']);
  assert.equal(rederive.sourceDigest, digestOf(RFC_TEXT));
  assert.ok(rederive.recordedAt.length > 0);
});

test('C002 invariant: clear-rederive removes the obligation', () => {
  const rfcDir = freshSession();
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify');
  updateStatus(rfcDir, 'clear-rederive');

  assert.equal(readStatus(rfcDir).rederive, undefined);
});

test('C002 normal: no recorded obligation passes the gate', () => {
  const rfcDir = freshSession();

  assert.deepEqual(evaluateRederiveReceipts(rfcDir), { exitCode: 0, detail: 'no rederive owed' });
});

test('C002 error: an owed receipt that is absent blocks the gate', () => {
  const rfcDir = freshSession();
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify');

  const verdict = evaluateRederiveReceipts(rfcDir);
  assert.equal(verdict.exitCode, 1);
  assert.match(verdict.detail, /RECEIPT_MISSING:graphify/);
});

test('C002 normal: a matching stage receipt discharges the obligation', () => {
  const rfcDir = freshSession();
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify');
  const graphDigest = digestOf(GRAPH_TEXT);
  writeFileSync(join(rfcDir, 'RFC-GRAPHIFY-Status.json'), JSON.stringify({
    sourceFile: 'RFC.md',
    graphFile: 'RFC-GRAPH.json',
    currentStep: 6,
    steps: {},
    lastOutputDigest: graphDigest,
    receipt: {
      stage: 'graphify',
      sourceDigest: digestOf(RFC_TEXT),
      inputDigests: {},
      outputDigest: graphDigest,
      gateVerdicts: [],
      recordedAt: '2026-01-01T00:00:00.000Z',
    },
  }), 'utf8');

  assert.deepEqual(evaluateRederiveReceipts(rfcDir), {
    exitCode: 0,
    detail: 'stage receipts match the current RFC',
  });
});

test('C002 error: a stale receipt blocks the gate', () => {
  const rfcDir = freshSession();
  updateStatus(rfcDir, 'record-rederive', '--chain=graphify');
  const graphDigest = digestOf(GRAPH_TEXT);
  writeFileSync(join(rfcDir, 'RFC-GRAPHIFY-Status.json'), JSON.stringify({
    sourceFile: 'RFC.md',
    graphFile: 'RFC-GRAPH.json',
    currentStep: 6,
    steps: {},
    lastOutputDigest: graphDigest,
    receipt: {
      stage: 'graphify',
      sourceDigest: 'b'.repeat(64),
      inputDigests: {},
      outputDigest: graphDigest,
      gateVerdicts: [],
      recordedAt: '2026-01-01T00:00:00.000Z',
    },
  }), 'utf8');

  const verdict = evaluateRederiveReceipts(rfcDir);
  assert.equal(verdict.exitCode, 1);
  assert.match(verdict.detail, /RECEIPT_STALE:graphify/);
});
