const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const {
  createDefaultStatus,
  executeBeginRun,
  executeEndStep,
} = require('../../.claude/scripts/rfc-graph/update-step-status.js');

// [::TICKET::] PX-313 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-313 --for-spec --no-implementation-order`.
function statusFixture(t, graphUnits) {
  const directory = mkdtempSync(join(tmpdir(), 'stage-status-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const graphPath = join(directory, 'T-GRAPH.json');
  writeFileSync(graphPath, JSON.stringify({ nodes: [{ id: 'N0001', unitIds: graphUnits }] }));
  const status = createDefaultStatus(join(directory, 'T-GRAPHIFY-Status.json'));
  status.graphFile = graphPath;
  return { status, graphPath };
}

test('begin-run counts an invocation once per runId', (t) => {
  const { status } = statusFixture(t, ['op-A']);
  executeBeginRun(status, 'run-1');
  assert.equal(status.runs, 1);
  executeBeginRun(status, 'run-1');
  assert.equal(status.runs, 1);
  executeBeginRun(status, 'run-2');
  assert.equal(status.runs, 2);
});

test('end-step 5 advances generation only when the output digest changes', (t) => {
  const { status, graphPath } = statusFixture(t, ['op-A']);
  executeBeginRun(status, 'run-1');
  executeEndStep(status, 5);
  assert.equal(status.generation, 1);

  executeBeginRun(status, 'run-2');
  executeEndStep(status, 5);
  assert.equal(status.generation, 1, 'the same output is a verification');

  writeFileSync(graphPath, JSON.stringify({ nodes: [{ id: 'N0001', unitIds: ['op-A', 'op-B'] }] }));
  executeBeginRun(status, 'run-3');
  executeEndStep(status, 5);
  assert.equal(status.generation, 2);
});

test('audit completes the step without advancing generation', (t) => {
  const { status } = statusFixture(t, ['op-A']);
  executeBeginRun(status, 'run-1');
  executeEndStep(status, 5, { audit: true });
  assert.equal(status.generation, 0);
  assert.equal(status.steps['5'], 'done');
});

test('a coverage regression refuses the generation', (t) => {
  const { status, graphPath } = statusFixture(t, ['op-A', 'op-B']);
  executeBeginRun(status, 'run-1');
  executeEndStep(status, 5);
  assert.equal(status.generation, 1);

  writeFileSync(graphPath, JSON.stringify({ nodes: [{ id: 'N0001', unitIds: ['op-A'] }] }));
  executeBeginRun(status, 'run-2');
  assert.throws(() => executeEndStep(status, 5), /COVERAGE_REGRESSION/);
  assert.equal(status.generation, 1);
});
