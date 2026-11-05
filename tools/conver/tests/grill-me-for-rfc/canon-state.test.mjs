// PX-377 @verifies C001
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-377 --for-spec --no-implementation-order`.
/**
 * Whether the canon stands alone, is partially materialized, or is materialized.
 *
 * The guard used to refuse whenever a graph, a tree or tickets existed. That answer
 * conflated a partial package (no tickets, so drill cannot run) with a materialized
 * one. These tests assert the four states, the owner each names, and the invariant
 * that a package without Tickets.json never receives a drill instruction.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GRILL_CANON_STATE, runCommand } from '../question-gate/helpers/fixture-workspace.mjs';

const RFC_TEXT = '# RFC\n\n## Design\n';
const OUTPUT_DIGEST = 'a'.repeat(64);

/** The digest of the fixture's RFC bytes. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function sourceDigest() {
  return createHash('sha256').update(RFC_TEXT).digest('hex');
}

/** A package directory carrying the RFC and the named artifacts. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function makeCanon(artifacts = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'px377-canon-'));
  writeFileSync(join(directory, 'RFC.md'), RFC_TEXT, 'utf8');
  for (const [name, content] of Object.entries(artifacts)) {
    writeFileSync(join(directory, name), typeof content === 'string' ? content : JSON.stringify(content), 'utf8');
  }
  return directory;
}

/** A stage status carrying a receipt bound to the fixture RFC. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function stageStatus(stage, digest = sourceDigest()) {
  return {
    sourceFile: 'RFC.md',
    graphFile: 'RFC-GRAPH.json',
    currentStep: 0,
    steps: {},
    generation: 1,
    runs: 1,
    runId: 'run-1',
    lastOutputDigest: OUTPUT_DIGEST,
    coverage: null,
    receipt: {
      stage,
      sourceDigest: digest,
      inputDigests: {},
      outputDigest: OUTPUT_DIGEST,
      gateVerdicts: [],
      recordedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

test('C001 normal: a canon with no derived artifact stands alone', () => {
  const result = runCommand(GRILL_CANON_STATE, [makeCanon()]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /standalone/);
  assert.doesNotMatch(result.stdout + result.stderr, /rederive|drill/);
});

for (const artifact of ['RFC-GRAPH.json', 'RFC-Dirs-Tree.json']) {
  test(`C001 normal: ${artifact} alone is partial and owes rederive`, () => {
    const result = runCommand(GRILL_CANON_STATE, [makeCanon({ [artifact]: '{}' })]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /partial/);
    assert.match(result.stdout, /rederive/);
    assert.match(result.stdout, /graphify/);
    assert.match(result.stdout, /boundify/);
    assert.match(result.stdout, /split/);
    assert.doesNotMatch(result.stdout + result.stderr, /drill/);
  });
}

test('C001 normal: graph and tree without tickets are partial', () => {
  const result = runCommand(GRILL_CANON_STATE, [makeCanon({
    'RFC-GRAPH.json': '{}',
    'RFC-Dirs-Tree.json': '{}',
  })]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /partial/);
  assert.doesNotMatch(result.stdout + result.stderr, /drill/);
});

test('C001 normal: tickets and matching receipts are materialized-fresh', () => {
  const result = runCommand(GRILL_CANON_STATE, [makeCanon({
    'Tickets.json': '{}',
    'RFC-GRAPHIFY-Status.json': stageStatus('graphify'),
    'RFC-BOUNDIFY-Status.json': stageStatus('boundify'),
    'RFC-SPLIT-Status.json': stageStatus('split'),
  })]);

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /materialized-fresh/);
  assert.match(result.stdout, /drill-rfc-down/);
});

test('C001 error: a stale receipt is materialized-stale and never advises drill', () => {
  const result = runCommand(GRILL_CANON_STATE, [makeCanon({
    'Tickets.json': '{}',
    'RFC-GRAPHIFY-Status.json': stageStatus('graphify', 'b'.repeat(64)),
    'RFC-BOUNDIFY-Status.json': stageStatus('boundify'),
    'RFC-SPLIT-Status.json': stageStatus('split'),
  })]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /materialized-stale/);
  assert.match(result.stdout, /rederive/);
  assert.doesNotMatch(result.stdout + result.stderr, /drill/);
});

test('C001 edge: tickets without receipts keep the legacy fresh answer', () => {
  const result = runCommand(GRILL_CANON_STATE, [makeCanon({ 'Tickets.json': '{}' })]);

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /materialized-fresh/);
  assert.match(result.stdout, /drill-rfc-down/);
});

test('C001 edge: a recorded rederive obligation marks tickets as stale', () => {
  const result = runCommand(GRILL_CANON_STATE, [makeCanon({
    'Tickets.json': '{}',
    'Status.json': JSON.stringify({
      state: 'DONE',
      rederive: { required: true, chain: ['graphify', 'boundify', 'split'], sourceDigest: sourceDigest() },
    }),
  })]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /materialized-stale/);
  assert.match(result.stdout, /rederive/);
  assert.doesNotMatch(result.stdout + result.stderr, /drill/);
});

test('C001 postcondition: --json carries state, owner and rederive', () => {
  const directory = makeCanon({ 'RFC-GRAPH.json': '{}' });
  const result = runCommand(GRILL_CANON_STATE, [directory, '--json']);

  assert.equal(result.status, 0, result.stderr);
  const state = JSON.parse(result.stdout);
  assert.equal(state.state, 'partial');
  assert.equal(state.nextOwner, 'grill');
  assert.deepEqual(state.rederive, ['graphify', 'boundify', 'split']);
});

test('C001 invariant: the guard reads and never writes', () => {
  const directory = makeCanon({ 'Tickets.json': '{}', 'RFC-GRAPH.json': '{}' });
  const before = readdirSync(directory).sort().map((name) => [name, readFileSync(join(directory, name), 'utf8')]);

  const first = runCommand(GRILL_CANON_STATE, [directory]);
  const second = runCommand(GRILL_CANON_STATE, [directory]);

  assert.equal(first.status, second.status, 'the answer is stable');
  assert.equal(first.stdout, second.stdout, 'the message is stable');
  assert.deepEqual(
    readdirSync(directory).sort().map((name) => [name, readFileSync(join(directory, name), 'utf8')]),
    before,
    'no file was created or changed',
  );
});
