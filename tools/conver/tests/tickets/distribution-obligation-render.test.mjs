// PX-321 @verifies C005
// The operation obligation is the implementation payload. It must reach the spec and the
// distribution reports, not remain only in the Tickets.json JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTicketMarkdown } from '../../.claude/scripts/tickets/show-ticket-context.js';
import {
  collectTicketDistribution,
  renderTicketDistribution,
} from '../../.claude/scripts/tickets/show-ticket-distribution.js';
import { renderPhaseDistribution } from '../../.claude/scripts/tickets/show-phase-distribution.js';

// [::TICKET::] PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-321 --for-spec --no-implementation-order`.
function ticketWithObligation() {
  return {
    id: 1,
    phaseId: 0,
    status: 'made',
    title: 'A',
    nodeIds: ['N0001', 'op-A'],
    contracts: [],
    distribution: {
      units: [{
        unitId: 'op-A',
        kind: 'operation',
        role: 'implementer',
        placement: { nodeIds: ['N0001'], paths: ['src/a.js'] },
        obligation: {
          mode: 'implement',
          kind: 'write',
          rest: 'POST /a',
          requiredAuthority: 'user',
          finalityPredicate: 'done',
          rejectCodeFamilies: ['E1'],
          specLines: [12],
        },
        specRefs: [{ path: 'RFC.md', line: 12, quote: 'a' }],
      }],
    },
  };
}

test('C005 the spec renders the operation obligation payload', () => {
  const markdown = buildTicketMarkdown('PX-321', ticketWithObligation(), { phases: [] }, '.', true, false);
  assert.match(markdown, /## Distribution Obligations/);
  assert.match(markdown, /POST \/a/);
  assert.match(markdown, /requiredAuthority/);
  assert.match(markdown, /rejectCodeFamilies/);
});

test('C005 a ticket without distribution renders no empty section', () => {
  const markdown = buildTicketMarkdown('PX-321', { ...ticketWithObligation(), distribution: undefined }, { phases: [] }, '.', true, false);
  assert.doesNotMatch(markdown, /## Distribution Obligations/);
});

test('C005 the ticket distribution report renders the operation payload', () => {
  const text = renderTicketDistribution(collectTicketDistribution({ phases: [{ id: 0, tickets: [ticketWithObligation()] }] }));
  assert.match(text, /POST \/a/);
  assert.match(text, /requiredAuthority/);
});

test('C005 the spec renders the boundary direction of a ctr unit', () => {
  const ticket = {
    ...ticketWithObligation(),
    distribution: {
      units: [{
        unitId: 'ctr-b1',
        kind: 'contract',
        obligation: { mode: 'obligation', relation: 'carries', subject: 'b1', direction: 'provides', counterpart: 'pkg-2' },
        specRefs: [],
      }],
    },
  };
  const markdown = buildTicketMarkdown('PX-321', ticket, { phases: [] }, '.', true, false);
  assert.match(markdown, /direction: provides/);
  assert.match(markdown, /counterpart: pkg-2/);
});

test('C005 the phase distribution report renders the operation payload', () => {
  const view = {
    packageId: 'pkg',
    ownedOperationUnits: [{
      unitId: 'op-A',
      operationId: 'A',
      roleCandidate: 'implementer',
      obligation: { kind: 'write', rest: 'POST /a', requiredAuthority: 'user' },
    }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
  const graph = { nodes: [{ id: 'N0001', unitIds: ['op-A'] }], edges: [] };
  const text = renderPhaseDistribution({ phase: { id: 0, nodeIds: ['N0001'], name: 'P0' }, view, graph });
  assert.match(text, /POST \/a/);
  assert.match(text, /requiredAuthority/);
});

// F2: a reference names the implementing ticket. The numeric id is phase-local; the
// durable key is the identity the consuming design must record.
function referenceTicket() {
  return {
    id: 2,
    phaseId: 0,
    status: 'made',
    title: 'Consumer',
    contracts: [],
    distribution: {
      units: [{
        unitId: 'op-B',
        kind: 'operation',
        role: 'consumer',
        obligation: {
          mode: 'reference',
          providers: [],
          implementerTicketId: 12,
          implementerTicketKey: 'P0-12',
        },
      }],
    },
  };
}

test('C005 a reference renders the durable implementer key, not the phase-local id', () => {
  const markdown = buildTicketMarkdown('P0-2', referenceTicket(), { phases: [] }, '.', true, false);
  assert.match(markdown, /implementer ticket: P0-12/);
  assert.doesNotMatch(markdown, /implementer ticket: 12$/m);
});

test('C005 the ticket distribution report renders the durable implementer key', () => {
  const text = renderTicketDistribution(collectTicketDistribution({ phases: [{ id: 0, tickets: [referenceTicket()] }] }));
  assert.match(text, /implementer ticket: P0-12/);
});

// F3: the per-ticket implementation order is derived by split and checked by the entry
// gate. The make brief must show it, with the status the gate evaluates.
test('C005 the spec renders implementation prerequisites with status and source', () => {
  const ticket = {
    ...referenceTicket(),
    phaseId: 1,
    prerequisites: [
      { ticket: 'P0-1', kind: 'implementation', source: 'sequence:S:s1->s2' },
      { package: 'pkg-1', kind: 'implementation', source: 'build:P1->P0', boundary: 'boundary-001' },
    ],
  };
  const document = {
    phases: [
      { id: 0, tickets: [{ id: 1, phaseId: 0, title: 'Provider', status: 'done' }] },
      { id: 1, tickets: [ticket] },
    ],
  };
  const markdown = buildTicketMarkdown('P1-2', ticket, document, '.', true, false);
  assert.match(markdown, /## Implementation Prerequisites/);
  assert.match(markdown, /P0-1 — status done — source sequence:S:s1->s2/);
  assert.match(markdown, /package pkg-1 — status checked by the entry gate — source build:P1->P0 — boundary boundary-001/);
});

test('C005 a ticket without prerequisites renders no implementation prerequisites section', () => {
  const markdown = buildTicketMarkdown('P0-2', referenceTicket(), { phases: [] }, '.', true, false);
  assert.doesNotMatch(markdown, /## Implementation Prerequisites/);
});
