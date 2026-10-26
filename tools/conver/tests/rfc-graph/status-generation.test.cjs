// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  beginRun,
  completeGeneration,
  compareCoverage,
} = require('../../.claude/scripts/rfc-graph/lib/status-generation.js');

test('beginRun increments runs once per new runId', () => {
  const first = beginRun({ runs: 2, runId: 'a' }, 'b');
  assert.equal(first.runs, 3);
  assert.equal(first.runId, 'b');
  assert.equal(beginRun(first, 'b').runs, 3);
});

test('beginRun initializes a status that carries no counters', () => {
  const first = beginRun({}, 'run-1');
  assert.equal(first.runs, 1);
  assert.equal(first.runId, 'run-1');
});

test('completeGeneration does not increment on an unchanged output digest', () => {
  const next = completeGeneration({ generation: 1, lastOutputDigest: 'x' }, { outputDigest: 'x' });
  assert.equal(next.ok, true);
  assert.equal(next.status.generation, 1);
});

test('completeGeneration increments when the output digest changes', () => {
  const next = completeGeneration({ generation: 1, lastOutputDigest: 'x' }, { outputDigest: 'y', coverage: { units: 2, steps: 3, boundaries: 1 } });
  assert.equal(next.ok, true);
  assert.equal(next.status.generation, 2);
  assert.equal(next.status.lastOutputDigest, 'y');
  assert.deepEqual(next.status.coverage, { units: 2, steps: 3, boundaries: 1 });
});

test('completeGeneration refuses a missing output', () => {
  const next = completeGeneration({ generation: 1 }, { outputDigest: null });
  assert.equal(next.ok, false);
  assert.equal(next.code, 'MISSING_OUTPUT');
});

test('completeGeneration refuses a coverage regression', () => {
  const next = completeGeneration(
    { generation: 2, lastOutputDigest: 'x', coverage: { units: 10, steps: 30, boundaries: 84 } },
    { outputDigest: 'y', coverage: { units: 10, steps: 29, boundaries: 84 } },
  );
  assert.equal(next.ok, false);
  assert.equal(next.code, 'COVERAGE_REGRESSION');
  assert.deepEqual(next.decreased, ['steps']);
});

test('audit leaves generation and digest unchanged', () => {
  const next = completeGeneration({ generation: 2, lastOutputDigest: 'x', runs: 5 }, { outputDigest: 'y', audit: true });
  assert.equal(next.ok, true);
  assert.equal(next.status.generation, 2);
  assert.equal(next.status.lastOutputDigest, 'x');
  assert.equal(next.status.runs, 5);
});

test('compareCoverage passes when no count decreased and names every decrease', () => {
  assert.deepEqual(compareCoverage({ units: 10, steps: 30, boundaries: 84 }, { units: 11, steps: 30, boundaries: 84 }), { ok: true, decreased: [] });
  assert.deepEqual(compareCoverage({ units: 10, steps: 30, boundaries: 84 }, { units: 9, steps: 29, boundaries: 84 }), { ok: false, code: 'COVERAGE_REGRESSION', decreased: ['units', 'steps'] });
});
