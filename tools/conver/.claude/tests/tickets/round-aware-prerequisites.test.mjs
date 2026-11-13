// [::TICKET::] PX-414 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-414 --for-spec --no-implementation-order`.
// @verifies C007
// @verifies C008
import { describe, test } from 'node:test';
import assert from 'node:assert';

const orderModule = await import(new URL(
  '../../scripts/sequences-slice/lib/implementation-order.mjs',
  import.meta.url,
).href);

const {
  checkPlacement,
  evaluatePrerequisites,
  isCompleteStatus,
  isPastRoundStatus,
} = orderModule;

describe('round-aware status vocabulary', () => {
  test('done, reviewed and R<n> are complete statuses', () => {
    for (const status of ['done', 'reviewed', 'R1', 'R12']) {
      assert.strictEqual(isCompleteStatus(status), true, status);
    }
  });

  test('every other status is not complete', () => {
    for (const status of ['todo', 'made', 'planned', 'started', 'R0', 'RX', '', undefined]) {
      assert.strictEqual(isCompleteStatus(status), false, String(status));
    }
  });

  test('a round-marked status is a past-round record, not an active status', () => {
    assert.strictEqual(isPastRoundStatus('R1'), true);
    assert.strictEqual(isPastRoundStatus('R12'), true);
    assert.strictEqual(isPastRoundStatus('reviewed'), false);
    assert.strictEqual(isPastRoundStatus('done'), false);
    assert.strictEqual(isPastRoundStatus('todo'), false);
    assert.strictEqual(isPastRoundStatus(undefined), false);
  });
});

describe('prerequisite evaluation with round markers', () => {
  test('a same-package R<n> prerequisite is complete', () => {
    const result = evaluatePrerequisites({
      prerequisites: [{ kind: 'implementation', ticket: 'P0-1', source: 'edge:e1' }],
      samePackageStatuses: new Map([['P0-1', 'R3']]),
    });

    assert.strictEqual(result.ok, true);
  });

  test('a same-package todo prerequisite is not complete', () => {
    const result = evaluatePrerequisites({
      prerequisites: [{ kind: 'implementation', ticket: 'P0-1', source: 'edge:e1' }],
      samePackageStatuses: new Map([['P0-1', 'todo']]),
    });

    assert.strictEqual(result.findings[0].code, 'PREREQUISITE_NOT_DONE');
  });

  test('a package R<n> work ticket is complete', () => {
    const result = evaluatePrerequisites({
      prerequisites: [{ kind: 'implementation', package: 'pkg-provider', source: 'boundary:b1' }],
      packageStatuses: new Map([
        ['pkg-provider', [{ ticket: 'P0-8', status: 'R12', carriesWork: true }]],
      ]),
    });

    assert.strictEqual(result.ok, true);
  });

  test('a package R0 ticket is not complete', () => {
    const result = evaluatePrerequisites({
      prerequisites: [{ kind: 'implementation', package: 'pkg-provider', source: 'boundary:b1' }],
      packageStatuses: new Map([
        ['pkg-provider', [{ ticket: 'P0-8', status: 'R0', carriesWork: true }]],
      ]),
    });

    assert.strictEqual(result.findings[0].code, 'PREREQUISITE_NOT_DONE');
  });
});

describe('placement with past-round records', () => {
  test('a past-round consumer is not placed again', () => {
    const verdict = checkPlacement({
      packageId: 'pkg-a',
      tickets: [
        {
          id: 2,
          phaseId: 0,
          status: 'R1',
          prerequisites: [{ ticket: 'P0-1', kind: 'implementation', source: 'graph:depends_on:N0002->N0001' }],
        },
        { id: 1, phaseId: 1, status: 'todo', prerequisites: [] },
      ],
    });

    assert.deepStrictEqual(verdict.findings, []);
  });

  test('an active consumer placed before its provider is still rejected', () => {
    const verdict = checkPlacement({
      packageId: 'pkg-a',
      tickets: [
        { id: 1, phaseId: 1, status: 'todo', prerequisites: [{ ticket: 'P1-2', kind: 'implementation', source: 'graph:depends_on:N0001->N0002' }] },
        { id: 2, phaseId: 1, status: 'todo', prerequisites: [] },
      ],
    });

    assert.strictEqual(verdict.findings.length, 1);
    assert.strictEqual(verdict.findings[0].code, 'PREREQUISITE_NOT_BEFORE');
    assert.strictEqual(verdict.findings[0].subject, 'P1-1');
  });
});
