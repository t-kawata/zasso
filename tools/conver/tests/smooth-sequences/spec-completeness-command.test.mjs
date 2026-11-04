// PX-360 @verifies C001
// [::TICKET::] PX-360 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-360 --for-spec --no-implementation-order`.
/**
 * The workspace gate as a command, its worklist and its repair routes.
 *
 * A gate that reports a missing formula but leaves no executable next step is only a
 * verdict. These tests require the worklist row and the producer a reader can run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLOSURE_GATES } from '../../.claude/scripts/smooth-sequences/lib/closure-gates.mjs';
import { repairRouteFor } from '../../.claude/scripts/smooth-sequences/lib/repair-route.mjs';
import { buildWorkspace } from './helpers/formula-workspace.mjs';

const CHECK = fileURLToPath(new URL('../../.claude/scripts/grill-me-for-rfc/check-formula-completeness.js', import.meta.url));

// [::TICKET::] PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-360|PX-361) --for-spec --no-implementation-order`.
function runCheck(root) {
  return spawnSync(process.execPath, [CHECK, root], { encoding: 'utf8' });
}

test('C001 postcondition: the command writes a worklist and exits non-zero on a missing formula', () => {
  const workspace = buildWorkspace({ packageB: { formulas: [] } });
  const result = runCheck(workspace.root);

  assert.equal(result.status, 1);
  const worklistPath = join(workspace.root, 'smooth-sequences', 'SPEC-COMPLETENESS-WORKLIST.json');
  assert.equal(existsSync(worklistPath), true);
  const worklist = JSON.parse(readFileSync(worklistPath, 'utf8'));
  assert.equal(worklist.worklist.some((row) => row.package === 'pkg-b' && row.formulaId === workspace.second.id), true);
  assert.equal(worklist.worklist.every((row) => row.producer.length > 0 && row.rerun.length > 0), true);
});

test('C001 postcondition: a repaired workspace reruns as a verification with an empty worklist', () => {
  const workspace = buildWorkspace({ packageB: { formulas: [] } });
  assert.equal(runCheck(workspace.root).status, 1);

  const repaired = buildWorkspace();
  const result = runCheck(repaired.root);

  assert.equal(result.status, 0, result.stderr);
  const worklist = JSON.parse(readFileSync(join(repaired.root, 'smooth-sequences', 'SPEC-COMPLETENESS-WORKLIST.json'), 'utf8'));
  assert.equal(worklist.worklist.length, 0);
  assert.equal(worklist.summary.status, 'pass');
});

test('C001 invariant: the fifth closure gate is the workspace formula gate', () => {
// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
  const scripts = CLOSURE_GATES.map((gate) => gate.script);

  assert.deepEqual(scripts, [
    'check-obligation-coverage.js',
    'check-contribution-completeness.js',
    'check-distribution-completeness.js',
    'defect-report.js',
    'check-formula-completeness.js',
    'verify-api-consistency.mjs',
  ]);
});

test('C001 invariant: a transcription defect routes to the owning package grill', () => {
  const route = repairRouteFor('S8.formula-missing', { packageId: 'pkg-b', packagesById: new Map([['pkg-b', { id: 'pkg-b', path: 'pkg-b' }]]) });

  assert.equal(route.repairClass, 'judgment-required');
  assert.match(route.producer, /grill-me-for-rfc/);
  assert.match(route.where, /pkg-b\/RFC\.md/);
});

test('C001 invariant: a specification defect routes to regeneration, never an edit', () => {
  const route = repairRouteFor('S8.spec-hash-mismatch', { artifact: { spec: { path: 'spec.md' } } });

  assert.equal(route.repairClass, 'regeneration');
  assert.match(route.producer, /regeneration\/run\.mjs/);
  assert.match(route.where, /read-only/);
});

test('C001 invariant: an ownership defect routes to allocate regeneration', () => {
  const route = repairRouteFor('S8.formula-unowned', { locator: 'fx-0123456789ab' });

  assert.equal(route.repairClass, 'regeneration');
  assert.match(route.producer, /--allocate-decisions/);
});
