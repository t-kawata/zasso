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
