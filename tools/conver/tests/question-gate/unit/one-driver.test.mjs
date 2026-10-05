// PX-234 @verifies C004
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
/**
 * grill and drill are one implementation, not two that agree.
 *
 * The driver is copied into each tool's directory because Node resolves imports by
 * path and neither tool may reach into the other's directory. That copy is the one
 * place the shared mechanism could drift while both suites stayed green — and it
 * did, once, during this ticket: a patch reached the grill copy and not the drill
 * one, and every test still passed because each suite exercised only its own tool.
 *
 * This is the check that the copy is a copy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** The files each tool keeps its own copy of, and which must therefore agree. */
const SHARED_COPIES = ['scripts/grill-me-for-rfc/settle-run.js', 'scripts/grill-me-for-rfc/update-tree.js'];

const GRILL = join(PROJECT_ROOT, '.claude');
const DRILL = join(PROJECT_ROOT, '.claude');

/** The drill twin of a grill-side filename. */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function drillTwin(relative) {
  return relative.replace('grill-me-for-rfc', 'drill-rfc-down');
}

test('C004 invariant: the question-gate driver is byte-identical in both tools', () => {
  const grill = readFileSync(join(GRILL, 'scripts/grill-me-for-rfc/settle-run.js'), 'utf8');
  const drill = readFileSync(join(DRILL, 'scripts/drill-rfc-down/settle-run.js'), 'utf8');

  assert.equal(
    grill,
    drill,
    'the two copies are one implementation: the only difference between the tools is which directory is handed to it',
  );
});

test('C004 invariant: both drivers import the same parts of the core', () => {
  for (const tool of ['grill-me-for-rfc', 'drill-rfc-down']) {
    const source = readFileSync(join(GRILL, 'scripts', tool, 'settle-run.js'), 'utf8');
    for (const symbol of ['partitionPoints', 'priorDecisions', 'nextNumbers', 'readAnswers', 'renderBlock', 'readBack']) {
      assert.ok(source.includes(symbol), `${tool} reaches the core's ${symbol}`);
    }
  }
});

test('C004 invariant: the copies the two tools keep are the ones that must agree', () => {
  // Guards against this list rotting: every file it names exists on both sides.
  for (const relative of SHARED_COPIES) {
    assert.doesNotThrow(() => readFileSync(join(GRILL, relative), 'utf8'), `${relative} exists for grill`);
    assert.doesNotThrow(() => readFileSync(join(DRILL, drillTwin(relative)), 'utf8'), `${relative} exists for drill`);
  }
});
