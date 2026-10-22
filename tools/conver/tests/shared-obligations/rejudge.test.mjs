// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compareRejudgment,
  sampleObligations,
} from '../../.claude/scripts/shared-obligations/rejudge.mjs';

// @verifies C017
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C017 the sample is deterministic from the worklist digest', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const obligations = [
    { obligationId: 'a' },
    { obligationId: 'b' },
    { obligationId: 'c' },
    { obligationId: 'd' },
  ];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const first = sampleObligations(obligations, { seed: 'worklist-digest', size: 2 });
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const second = sampleObligations(obligations, { seed: 'worklist-digest', size: 2 });
  assert.deepEqual(first.map((entry) => entry.obligationId), second.map((entry) => entry.obligationId));
  assert.equal(first.length, 2);
});

// @verifies C017
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C017 agreement is accepted and disagreement is reported', () => {
  assert.equal(compareRejudgment({ verdict: 'entailed' }, { verdict: 'entailed' }).ok, true);
  assert.equal(compareRejudgment({ verdict: 'entailed' }, { verdict: 'not_entailed' }).code, 'REJUDGE_DISAGREEMENT');
});
