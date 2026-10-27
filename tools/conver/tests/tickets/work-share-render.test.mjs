// PX-330 @verifies C002
// PX-324 @verifies C001 C002 C006
// The Work Share block names the owner of every step: this ticket, another ticket, or a
// package. It prints unknown information as unknown and never invents an owner.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderWorkShare } from '../../.claude/scripts/tickets/show-ticket-context.js';

function step(stepId, operationId, order, axes = {}) {
  return {
    stepId,
    operationId,
    order,
    contract: {
      pre: [`${stepId}-pre`],
      post: [`${stepId}-post`],
      invariants: [`${stepId}-inv`],
      ...axes,
    },
  };
}

function sharedTicket() {
  return {
    id: 2,
    phaseId: 0,
    contracts: [{ boundaryId: 'boundary-001', precondition: 'b-pre', postcondition: 'b-post', invariant: 'b-inv' }],
    distribution: {
      units: [
        {
          unitId: 'xdir-S',
          kind: 'cross-boundary-sequence',
          sequenceId: 'S',
          obligation: { mode: 'steps', outcome: 'realized', steps: [step('S__s1', 'A', 1)] },
        },
        { unitId: 'ctr-boundary-001', kind: 'boundary', obligation: { mode: 'obligation', direction: 'provides', counterpart: 'pkg-1' } },
      ],
    },
  };
}

function ticketsDocument() {
  return {
    phases: [{
      id: 0,
      tickets: [
        { id: 1, phaseId: 0, distribution: { units: [{ unitId: 'op-C', kind: 'operation', obligation: { mode: 'implement' } }] } },
        sharedTicket(),
      ],
    }],
  };
}

function view() {
  return {
    packageId: 'pkg-2',
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [{
      unitId: 'xdir-S',
      sequenceId: 'S',
      ownerPackageIds: ['pkg-1', 'pkg-2'],
      steps: [
        step('S__s1', 'A', 1, { consumes: ['fact:one'] }),
        step('S__s2', 'B', 2, { crosses: ['boundary:boundary-001'], produces: ['fact:two'] }),
        step('S__s3', 'C', 3),
      ],
    }],
  };
}

test('C001 a shared sequence names this ticket, another ticket and a package', () => {
  const text = renderWorkShare(sharedTicket(), { ticketsDocument: ticketsDocument(), view: view() });
  assert.match(text, /### Work Share/);
  assert.match(text, /\| S__s1 \| op-A \| this ticket \|/);
  assert.match(text, /\| S__s2 \| op-B \| package pkg-1 \|/);
  assert.match(text, /\| S__s3 \| op-C \| P0-1 \|/);
});

test('C002 Work Share prints the typed axes the delivery gate reads', () => {
  const text = renderWorkShare(sharedTicket(), { ticketsDocument: ticketsDocument(), view: view() });
  assert.match(text, /S__s2 .*crosses=boundary:boundary-001/);
  assert.match(text, /S__s2 .*produces=fact:two/);
  assert.match(text, /S__s1 .*consumes=fact:one/);
});

test('C006 an unreadable view keeps the local steps and marks the rest not available', () => {
  const text = renderWorkShare(sharedTicket(), { ticketsDocument: ticketsDocument(), view: null });
  assert.match(text, /S__s1/);
  assert.match(text, /other steps: not available/);
  assert.doesNotMatch(text, /package pkg-1/);
});

test('C002 a ctr unit renders direction, counterpart and pre/post/invariant', () => {
  const text = renderWorkShare(sharedTicket(), { ticketsDocument: ticketsDocument(), view: view() });
  assert.match(text, /#### Boundary boundary-001/);
  assert.match(text, /direction: provides/);
  assert.match(text, /counterpart: pkg-1/);
  assert.match(text, /precondition: b-pre/);
  assert.match(text, /postcondition: b-post/);
  assert.match(text, /invariant: b-inv/);
});

test('C002 a ctr unit without its contract is visible as missing', () => {
  const ticket = sharedTicket();
  ticket.contracts = [];
  const text = renderWorkShare(ticket, { ticketsDocument: ticketsDocument(), view: view() });
  assert.match(text, /contract: MISSING/);
});

test('C001 a ticket without a sequence or ctr unit renders no Work Share', () => {
  const ticket = { id: 1, phaseId: 0, distribution: { units: [{ unitId: 'op-A', kind: 'operation', obligation: { mode: 'implement' } }] } };
  assert.equal(renderWorkShare(ticket, { ticketsDocument: ticketsDocument(), view: view() }), null);
});
