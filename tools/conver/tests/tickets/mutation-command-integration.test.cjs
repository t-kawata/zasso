// PX-378 @verifies C004
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
/**
 * The resolving path creates a non-owning clone, and the commit goes through the gate
 * before the marker lines are rewritten.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const { createTicketFromSource } = require('../../.claude/scripts/lib/create-ticket-from-source.js');
const { runBatchCreate } = require('../../.claude/scripts/tickets/batch-create-resolving-tickets.js');

const CONTRACT = { id: 'C001', sourceEdge: 'e1', precondition: 'p', postcondition: 'q', invariant: 'r' };
const MARKER = '// [::STUB::] P0-1: a reason -- a plan';

/** A package with a reviewed source ticket and one stub marker. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function makePackage() {
  const directory = mkdtempSync(join(tmpdir(), 'px378-command-'));
  mkdirSync(join(directory, 'src'));
  writeFileSync(join(directory, 'src/a.rs'), `${MARKER}\n`, 'utf8');
  const document = {
    title: 'fixture',
    round: 1,
    metadata: { source: 'spec.md', generatedAt: '2026-01-01' },
    phases: [{
      id: 0,
      name: 'P0',
      tickets: [{
        id: 1,
        phaseId: 0,
        title: 'source',
        status: 'reviewed',
        contracts: [CONTRACT],
        nodeIds: ['N1'],
        distribution: { units: [{ unitId: 'op-1', kind: 'operation', obligation: { mode: 'implement' } }] },
      }],
    }],
  };
  const ticketsPath = join(directory, 'Tickets.json');
  writeFileSync(ticketsPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return { directory, ticketsPath, document };
}

/** The manifest find-omissions Step 1 consumes. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function makeManifest() {
  return [{
    sourceKey: 'P0-1',
    stubs: [{ file: 'src/a.rs', line: 1, content: MARKER }],
  }];
}

test('C002 normal: a resolving clone is non-owning by default', () => {
  const fixture = makePackage();
  const result = createTicketFromSource({
    ticketsData: fixture.document,
    sourceKey: 'P0-1',
    seed: {
      title: 'resolving work',
      origin: { kind: 'resolving', sourceTicket: 'P0-1' },
    },
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.ticket.nodeIds, []);
  assert.equal(result.ticket.origin.kind, 'resolving');
});

test('C002 normal: an explicit ownership transfer keeps the nodeIds', () => {
  const fixture = makePackage();
  const result = createTicketFromSource({
    ticketsData: fixture.document,
    sourceKey: 'P0-1',
    seed: {
      title: 'resolving work',
      origin: { kind: 'resolving', sourceTicket: 'P0-1' },
      ownershipTransfer: true,
    },
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.ticket.nodeIds, ['N1']);
});

test('C004 error: a gate refusal leaves Tickets.json and the marker untouched', () => {
  const fixture = makePackage();
  const before = readFileSync(fixture.ticketsPath);
  const result = runBatchCreate({
    ticketsPath: fixture.ticketsPath,
    manifest: makeManifest(),
    sourceRoot: fixture.directory,
    mutationGate: () => ({
      ok: false,
      findings: [{ code: 'MUTATION_OWNERSHIP_DUPLICATE', subject: 'P0-2' }],
    }),
  });

  assert.equal(result.success, false);
  assert.match(result.errors[0].error, /MUTATION_OWNERSHIP_DUPLICATE/);
  assert.deepEqual(readFileSync(fixture.ticketsPath), before);
  assert.equal(readFileSync(join(fixture.directory, 'src/a.rs'), 'utf8').trim(), MARKER);
});

test('C004 normal: a promoted gate is followed by the marker rewrite', () => {
  const fixture = makePackage();
  const result = runBatchCreate({
    ticketsPath: fixture.ticketsPath,
    manifest: makeManifest(),
    sourceRoot: fixture.directory,
    mutationGate: ({ ticketsPath, afterDocument }) => {
      writeFileSync(ticketsPath, `${JSON.stringify(afterDocument, null, 2)}\n`, 'utf8');
      return { ok: true, findings: [] };
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.created.length, 1);
  const marker = readFileSync(join(fixture.directory, 'src/a.rs'), 'utf8').trim();
  assert.match(marker, /P0-2/, 'the marker now points at the created ticket');
  assert.doesNotMatch(marker, /P0-1:/, 'the old key is gone');
});
