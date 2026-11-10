'use strict';
// PX-402 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C006 @verifies C007

/**
 * PX-402 — dense ticket identity, single-pass reference rewrite and historical generation.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDenseRenumberMap,
  remapLiveReferences,
  renumberDocument,
  validateIdentity,
  buildArchiveAliasMap,
  ticketKeyOf,
} = require('../../.claude/scripts/tickets/lib/ticket-identity-renumber.js');

const { writeTicketDistributionAggregate } = require('../../.claude/scripts/tickets/add-tickets-for-phase.js');

/** A ticket with every live prose field pointing at its own key. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function ticket(id, overrides = {}) {
  return {
    id,
    phaseId: 0,
    status: 'todo',
    title: `Ticket P0-${id}`,
    nodeIds: [`N00${id}`],
    background: `background P0-${id}`,
    notes: `notes P0-${id}`,
    scope: [`scope P0-${id}`],
    invariants: `invariants P0-${id}`,
    instrumentation: `instrumentation P0-${id}`,
    investigation: `investigation P0-${id}`,
    boyScoutPlan: `boy scout P0-${id}`,
    testUnit: [`UT: unit P0-${id}`],
    testIntegration: [`IT: integration P0-${id}`],
    testExceptions: [`Exception P0-${id}`],
    acceptanceCriteria: [`AC P0-${id}`],
    unlistedFileReason: `unlisted P0-${id}`,
    contracts: [],
    ...overrides,
  };
}

/** One-phase document. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function documentFor(tickets, overrides = {}) {
  return {
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-10' },
    phases: [{ id: 0, name: 'P0', summary: '', nodeIds: [], tickets }],
    ...overrides,
  };
}

test('C001 [Normal] dense map is order-preserving and absorbs absorbed ids', () => {
  const phases = [{
    id: 0,
    name: 'P0',
    tickets: [
      ticket(1, { condensedFrom: { originKey: 'P0-1', tickets: [{ key: 'P0-2', id: 2 }] } }),
      ticket(3, { condensedFrom: { originKey: 'P0-3', tickets: [{ key: 'P0-4', id: 4 }] } }),
      ticket(5, { condensedFrom: { originKey: 'P0-5', tickets: [{ key: 'P0-6', id: 6 }] } }),
    ],
  }];
  const plan = buildDenseRenumberMap(phases);
  assert.equal(plan.changed, true);
  assert.deepEqual([...plan.keyMap.entries()], [
    ['P0-1', 'P0-1'],
    ['P0-2', 'P0-1'],
    ['P0-3', 'P0-2'],
    ['P0-4', 'P0-2'],
    ['P0-5', 'P0-3'],
    ['P0-6', 'P0-3'],
  ]);
});

test('C001 [Boundary] a single-ticket phase is dense as one and reports no change', () => {
  const plan = buildDenseRenumberMap([{ id: 0, name: 'P0', tickets: [ticket(1)] }]);
  assert.equal(plan.changed, false);
  assert.deepEqual([...plan.keyMap.entries()], [['P0-1', 'P0-1']]);
});

test('C001 [Invariant] every original id maps to exactly one survivor', () => {
  const phases = [{
    id: 0,
    name: 'P0',
    tickets: [
      ticket(1, { condensedFrom: { originKey: 'P0-1', tickets: [{ key: 'P0-2', id: 2 }] } }),
      ticket(3, { condensedFrom: { originKey: 'P0-3', tickets: [{ key: 'P0-4', id: 4 }] } }),
    ],
  }];
  const plan = buildDenseRenumberMap(phases);
  assert.equal(plan.keyMap.size, 4);
  assert.equal(plan.keyMap.get('P0-4'), 'P0-2');
  assert.equal(plan.keyMap.get('P0-2'), 'P0-1');
});

test('C002 [Normal] a permutation never chains through an intermediate key', () => {
  const keyMap = new Map([['P0-1', 'P0-2'], ['P0-2', 'P0-3']]);
  assert.equal(remapLiveReferences('P0-1, P0-2', keyMap), 'P0-2, P0-3');
  assert.notEqual(remapLiveReferences('P0-1, P0-2', keyMap), 'P0-3, P0-3');
});

test('C002 [Normal] every live prose field is rewritten while history is skipped', () => {
  const keyMap = new Map([['P0-1', 'P0-2'], ['P0-2', 'P0-3']]);
  const value = {
    notes: 'P0-1',
    background: 'P0-2',
    scope: ['P0-1'],
    changes: [{ before: 'P0-1', after: 'P0-1' }],
    condensedFrom: { originKey: 'P0-1', tickets: [{ key: 'P0-2' }] },
  };
  const rewritten = remapLiveReferences(value, keyMap);
  assert.equal(rewritten.notes, 'P0-2');
  assert.equal(rewritten.background, 'P0-3');
  assert.equal(rewritten.scope[0], 'P0-2');
  assert.equal(rewritten.changes[0].before, 'P0-1');
  assert.equal(rewritten.condensedFrom.originKey, 'P0-1');
});

test('C002 [Boundary] a key inside a longer token is not matched', () => {
  const keyMap = new Map([['P0-1', 'P0-2'], ['P0-2', 'P0-3']]);
  assert.equal(remapLiveReferences('P0-10 XP0-1 P0-1.', keyMap), 'P0-10 XP0-1 P0-2.');
});

test('C002 [Error] an unresolvable live key becomes a named finding', () => {
  const findings = [];
  const result = remapLiveReferences('P9-9', new Map(), '$.notes', findings);
  assert.equal(result, 'P9-9');
  assert.equal(findings[0].code, 'IDENTITY_HISTORY_UNRESOLVED');
  assert.equal(findings[0].key, 'P9-9');
  assert.equal(findings[0].path, '$.notes');
});

test('C003 [Normal] history keeps old keys and gains the pre-renumber generation', () => {
  const document = documentFor([
    ticket(1, {
      changes: [{ before: 'P0-1', after: 'P0-1' }],
      condensedFrom: { originKey: 'P0-1', tickets: [{ key: 'P0-2', id: 2 }] },
    }),
    ticket(3),
  ]);
  const result = renumberDocument(document, { excludedPhases: [-1] });
  assert.equal(result.generation, 1);
  assert.equal(result.document.identity.generation, 1);
  assert.equal(result.document.phases[0].tickets[0].changes[0].generation, 0);
  assert.equal(result.document.phases[0].tickets[0].condensedFrom.generation, 0);
  assert.equal(result.document.phases[0].tickets[0].condensedFrom.tickets[0].generation, 0);
  assert.equal(result.document.phases[0].tickets[0].changes[0].before, 'P0-1');
  assert.equal(result.document.phases[0].tickets[1].id, 2);
  assert.equal(result.document.identity.aliases['P0-3@g0'], 'P0-2');
  assert.equal(result.document.identity.aliases['P0-2@g0'], 'P0-1');
});

test('C003 [Invariant] an existing alias is composed through the new map', () => {
  const document = documentFor([
    ticket(1, { condensedFrom: { originKey: 'P0-1', tickets: [{ key: 'P0-2', id: 2 }] } }),
    ticket(3),
  ], { identity: { generation: 1, aliases: { 'P0-2@g0': 'P0-2' } } });
  const result = renumberDocument(document);
  assert.equal(result.document.identity.generation, 2);
  assert.equal(result.document.identity.aliases['P0-2@g0'], 'P0-1');
});

test('C004 [Normal] prerequisites, obligations and digests use current keys', () => {
  const document = documentFor([
    ticket(1, { distribution: { digest: 'd1', units: [] } }),
    ticket(3, {
      distribution: {
        digest: 'd2',
        units: [{
          unitId: 'u1',
          role: 'implementer',
          obligation: { mode: 'implement', implementerTicketKey: 'P0-3', implementerTicketId: 3 },
        }],
      },
      prerequisites: [{ ticket: 'P0-1', kind: 'implementation', source: 'graph:N0001->N0003' }],
    }),
  ]);
  const result = renumberDocument(document);
  const survivor = result.document.phases[0].tickets[1];
  assert.equal(survivor.id, 2);
  assert.equal(survivor.prerequisites[0].ticket, 'P0-1');
  assert.equal(survivor.distribution.units[0].obligation.implementerTicketKey, 'P0-2');
  assert.equal(survivor.distribution.units[0].obligation.implementerTicketId, 2);
  writeTicketDistributionAggregate(result.document);
  assert.deepEqual(Object.keys(result.document.distribution.ticketDigests), ['P0-1', 'P0-2']);
});

test('C006 [Normal] the excluded PX phase is byte-identical', () => {
  const document = {
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-10' },
    phases: [
      { id: -1, name: 'PX', tickets: [ticket(3, { phaseId: -1, notes: 'PX-3' })] },
      { id: 0, name: 'P0', tickets: [ticket(3)] },
    ],
  };
  const result = renumberDocument(document);
  assert.equal(result.document.phases[0].tickets[0].id, 3);
  assert.equal(result.document.phases[0].tickets[0].notes, 'PX-3');
  assert.equal(result.document.phases[1].tickets[0].id, 1);
  assert.equal(result.document.identity.aliases['PX-3@g0'], undefined);
});

test('C007 [Normal] an archived key resolves through the current nodeIds owner', () => {
  const current = documentFor([ticket(1, { nodeIds: ['N0001'] })]);
  const archive = documentFor([ticket(9, { nodeIds: ['N0001'] })]);
  const alias = buildArchiveAliasMap([archive], current);
  assert.equal(alias.get('P0-9'), 'P0-1');
});

test('C007 [Error] an ambiguous nodeIds owner blocks the mapping', () => {
  const current = documentFor([
    ticket(1, { nodeIds: ['N0001'] }),
    ticket(2, { nodeIds: ['N0001'] }),
  ]);
  const archive = documentFor([ticket(9, { nodeIds: ['N0001'] })]);
  const alias = buildArchiveAliasMap([archive], current);
  assert.equal(alias.get('P0-9'), undefined);
  assert.equal(alias.findings[0].code, 'IDENTITY_ARCHIVE_AMBIGUOUS');
});

test('validateIdentity rejects a gapped document and a dangling live reference', () => {
  const gapped = documentFor([ticket(1), ticket(3)]);
  const gappedResult = validateIdentity(gapped, { requireDense: true });
  assert.equal(gappedResult.ok, false);
  assert.ok(gappedResult.findings.some((finding) => finding.code === 'IDENTITY_NOT_DENSE'));

  const dangling = documentFor([ticket(1, { notes: 'P9-9' })]);
  const danglingResult = validateIdentity(dangling, { requireDense: true });
  assert.equal(danglingResult.ok, false);
  assert.ok(danglingResult.findings.some((finding) => finding.code === 'IDENTITY_DANGLING_REFERENCE'));
});

test('validateIdentity accepts a dense document whose history resolves by generation', () => {
  const document = documentFor([
    ticket(1, {
      changes: [{ before: 'P0-1', after: 'P0-1', generation: 0 }],
      condensedFrom: { originKey: 'P0-1', generation: 0, tickets: [{ key: 'P0-2', id: 2, generation: 0 }] },
    }),
    ticket(2),
  ], { identity: { generation: 1, aliases: { 'P0-1@g0': 'P0-1', 'P0-2@g0': 'P0-1' }, excludedPhases: [-1] } });
  const result = validateIdentity(document, { requireDense: true });
  assert.deepEqual(result.findings, []);
});

test('ticketKeyOf covers PX and numeric phases', () => {
  assert.equal(ticketKeyOf({ phaseId: -1, id: 3 }), 'PX-3');
  assert.equal(ticketKeyOf({ phaseId: 2, id: 3 }), 'P2-3');
});

test('C004 [Boundary] the durable implementer key wins over a phase-local numeric id', () => {
  const document = {
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-10' },
    phases: [
      { id: 0, name: 'P0', tickets: [ticket(1), ticket(3)] },
      {
        id: 1,
        name: 'P1',
        tickets: [ticket(1, {
          phaseId: 1,
          distribution: {
            digest: 'd',
            units: [{
              unitId: 'u1',
              role: 'reference',
              obligation: { mode: 'reference', implementerTicketKey: 'P0-3', implementerTicketId: 3 },
            }],
          },
        })],
      },
    ],
  };
  const result = renumberDocument(document);
  const obligation = result.document.phases[1].tickets[0].distribution.units[0].obligation;
  assert.equal(obligation.implementerTicketKey, 'P0-2');
  assert.equal(obligation.implementerTicketId, 2);
});
