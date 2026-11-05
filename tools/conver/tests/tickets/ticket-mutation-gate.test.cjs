// PX-378 @verifies C001
// PX-378 @verifies C003
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
/**
 * The mutation transaction: snapshot, verify, promote, or restore byte for byte.
 *
 * The verifier is injected so this test proves the transaction without building a
 * workspace; the default verifier is the same split-stage chain the command runs.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const {
  runMutationGate,
  snapshotTickets,
  restoreTickets,
  listMutationGates,
} = require('../../.claude/scripts/tickets/ticket-mutation-gate.js');

const CONTRACT = { id: 'C001', sourceEdge: 'e1', precondition: 'p', postcondition: 'q', invariant: 'r' };

/** One ticket with the schema's minimum shape. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function makeTicket(overrides = {}) {
  return {
    id: 1,
    title: 'ticket',
    status: 'todo',
    contracts: [CONTRACT],
    nodeIds: [],
    ...overrides,
  };
}

/** A Tickets.json document with one phase. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function makeDocument(tickets = [makeTicket()]) {
  return { title: 'fixture', phases: [{ id: 0, name: 'P0', tickets }] };
}

/** Write a fixture package and return its paths. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function makePackage(document = makeDocument()) {
  const directory = mkdtempSync(join(tmpdir(), 'px378-gate-'));
  const ticketsPath = join(directory, 'Tickets.json');
  writeFileSync(ticketsPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return { directory, ticketsPath };
}

test('C001 postcondition: a successful mutation promotes the verified bytes', () => {
  const fixture = makePackage();
  const beforeDigest = snapshotTickets(fixture.ticketsPath).digest;
  const result = runMutationGate({
    ticketsPath: fixture.ticketsPath,
    manifest: { added: ['P0-2'] },
    mutate: (document) => {
      document.phases[0].tickets.push(makeTicket({ id: 2, title: 'second' }));
      return document;
    },
    verify: () => [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.manifest.beforeDigest, beforeDigest);
  assert.equal(result.manifest.afterDigest, snapshotTickets(fixture.ticketsPath).digest);
  assert.notEqual(result.manifest.afterDigest, beforeDigest);
  assert.equal(readdirSync(fixture.directory).filter((name) => name.includes('.staging.')).length, 0);
  assert.equal(JSON.parse(readFileSync(fixture.ticketsPath, 'utf8')).phases[0].tickets.length, 2);
});

test('C001 error: a new finding restores the snapshot byte for byte', () => {
  const fixture = makePackage();
  const before = readFileSync(fixture.ticketsPath);
  const result = runMutationGate({
    ticketsPath: fixture.ticketsPath,
    manifest: { added: ['P0-2'] },
    mutate: (document) => {
      document.phases[0].tickets.push(makeTicket({ id: 2, title: 'second' }));
      return document;
    },
    verify: (_document, ticketsPath) => (ticketsPath.includes('.staging.')
      ? [{ code: 'UNIT_SET_MISMATCH', subject: 'u1' }]
      : []),
  });

  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, 'UNIT_SET_MISMATCH');
  assert.deepEqual(readFileSync(fixture.ticketsPath), before);
});

test('C001 edge: a mutation that changes no ticket writes the same bytes', () => {
  const fixture = makePackage();
  const before = readFileSync(fixture.ticketsPath);
  const result = runMutationGate({
    ticketsPath: fixture.ticketsPath,
    manifest: { added: [] },
    mutate: (document) => document,
    verify: () => [],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.manifest.added, []);
  assert.deepEqual(readFileSync(fixture.ticketsPath), before);
});

test('C001 error: a missing manifest is refused before any write', () => {
  const fixture = makePackage();
  const before = readFileSync(fixture.ticketsPath);
  const result = runMutationGate({ ticketsPath: fixture.ticketsPath, manifest: null });

  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, 'MUTATION_MANIFEST_MISSING');
  assert.deepEqual(readFileSync(fixture.ticketsPath), before);
});

test('C003 normal: only a finding introduced by the mutation blocks', () => {
  const fixture = makePackage();
  const result = runMutationGate({
    ticketsPath: fixture.ticketsPath,
    manifest: { added: ['P0-2'] },
    mutate: (document) => {
      document.phases[0].tickets.push(makeTicket({ id: 2, title: 'second' }));
      return document;
    },
    verify: (_document, ticketsPath) => (ticketsPath.includes('.staging.')
      ? [{ code: 'OLD_FINDING', subject: 'old' }, { code: 'NEW_FINDING', subject: 'new' }]
      : [{ code: 'OLD_FINDING', subject: 'old' }]),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map((entry) => entry.code), ['NEW_FINDING']);
});

test('C003 invariant: an inherited finding is grandfathered', () => {
  const fixture = makePackage();
  const result = runMutationGate({
    ticketsPath: fixture.ticketsPath,
    manifest: { added: ['P0-2'] },
    mutate: (document) => {
      document.phases[0].tickets.push(makeTicket({ id: 2, title: 'second' }));
      return document;
    },
    verify: () => [{ code: 'OLD_FINDING', subject: 'old' }],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
});

test('C001 invariant: snapshot and restore round-trip the bytes', () => {
  const fixture = makePackage();
  const before = readFileSync(fixture.ticketsPath);
  const snapshot = snapshotTickets(fixture.ticketsPath);
  writeFileSync(fixture.ticketsPath, '{"phases":[]}\n', 'utf8');
  restoreTickets(snapshot);

  assert.deepEqual(readFileSync(fixture.ticketsPath), before);
});

test('C004 invariant: the gate reuses the split verifier and the merge checks', () => {
  assert.deepEqual(listMutationGates(), [
    'verify-chain:split',
    'ticket-closure',
    'merge-contracts:verify',
    'merge-formulas:verify',
    'formula-file-coverage',
    'ticket-prerequisites',
  ]);
});
