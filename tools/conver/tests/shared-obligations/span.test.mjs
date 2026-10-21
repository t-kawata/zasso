// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
// [::TICKET::] PX-292 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-292 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { coveredOperations, performedOperations } from '../../.claude/scripts/shared-obligations/span.mjs';

// @verifies C003
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('only a step performs an operation; the operations list is coverage', () => {
  const span = [{ subject: 's1', steps: [{ operation: 'OpA' }], operations: ['OpA', 'OpB'] }];
  assert.deepEqual([...performedOperations(span)].sort(), ['OpA']);
  assert.deepEqual([...coveredOperations(span)].sort(), ['OpA', 'OpB']);
  assert.equal(performedOperations(span).has('OpB'), false);
  assert.equal(coveredOperations(span).has('OpB'), true);
});

// @verifies C003
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('a 257 listed and 149 stepped span leaves 108 operations unperformed', () => {
  const operations = Array.from({ length: 257 }, (_, index) => `Op${index}`);
  const span = [{
    steps: operations.slice(0, 149).map((operation) => ({ operation })),
    operations,
  }];
  const performed = performedOperations(span);
  const covered = coveredOperations(span);
  assert.equal(performed.size, 149);
  assert.equal(covered.size, 257);
  assert.equal(operations.filter((operation) => !performed.has(operation)).length, 108);
});

// @verifies C003
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('an operation entry in the coverage list is read by id', () => {
  const span = [{ operations: [{ id: 'OpA' }, 'OpB'] }];
  assert.deepEqual([...coveredOperations(span)].sort(), ['OpA', 'OpB']);
  assert.equal(performedOperations(span).size, 0);
});
