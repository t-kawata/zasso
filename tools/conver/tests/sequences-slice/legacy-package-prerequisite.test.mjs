// PX-330 @verifies C009
// A package written before the distribution existed has tickets but no distribution
// units. It is still a real implementation prerequisite, so its completion is decided by
// its tickets rather than reported as missing forever.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluatePrerequisites } from '../../.claude/scripts/sequences-slice/lib/implementation-order.mjs';

/** One package-status row, the shape check-ticket-prerequisites passes. */
// [::TICKET::] PX-330 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-330 --for-spec --no-implementation-order`.
function status(ticket, value, extra = {}) {
  return { ticket, status: value, implements: false, carriesWork: false, ...extra };
}

/** The package prerequisite one consumer ticket carries. */
// [::TICKET::] PX-330 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-330 --for-spec --no-implementation-order`.
function prerequisite() {
  return { package: 'pkg-legacy', kind: 'implementation', source: 'build:pkg-new->pkg-legacy' };
}

test('C009 a legacy provider package is complete when every ticket is done', () => {
  const result = evaluatePrerequisites({
    prerequisites: [prerequisite()],
    packageStatuses: new Map([['pkg-legacy', [status('P0-1', 'done'), status('P0-2', 'reviewed')]]]),
  });
  assert.deepEqual(result.findings, []);
});

test('C009 a legacy provider package with one unfinished ticket blocks', () => {
  const result = evaluatePrerequisites({
    prerequisites: [prerequisite()],
    packageStatuses: new Map([['pkg-legacy', [status('P0-1', 'done'), status('P0-2', 'planned')]]]),
  });
  assert.ok(result.findings.some(
    (entry) => entry.code === 'PREREQUISITE_NOT_DONE' && entry.subject === 'P0-2',
  ), JSON.stringify(result.findings));
});

test('C009 a legacy provider package with no tickets is still missing', () => {
  const result = evaluatePrerequisites({
    prerequisites: [prerequisite()],
    packageStatuses: new Map([['pkg-legacy', []]]),
  });
  assert.ok(result.findings.some(
    (entry) => entry.code === 'PREREQUISITE_TICKETS_MISSING' && entry.subject === 'pkg-legacy',
  ), JSON.stringify(result.findings));
});

test('C009 a distribution-bearing provider still evaluates only its work tickets', () => {
  const result = evaluatePrerequisites({
    prerequisites: [prerequisite()],
    packageStatuses: new Map([['pkg-legacy', [
      status('P0-1', 'done', { carriesWork: true }),
      status('P0-2', 'todo'),
    ]]]),
  });
  assert.deepEqual(result.findings, []);
});
