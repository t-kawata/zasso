import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { gaiaShapedWorkspace } from './helpers/gaia-shaped-fixture.mjs';

/** The findings of one check id in a result. */
// [::TICKET::] PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-284 --for-spec --no-implementation-order`.
function countOf(result, checkId) {
  return result.report.findings.filter((finding) => finding.checkId === checkId).length;
}

test('the gaia-shaped fixture is observable in audit mode and red in enforce mode', () => {
  const workspace = gaiaShapedWorkspace();
  try {
    const audit = runCommand([workspace.root, '--audit']);
    assert.equal(audit.exitCode, 0);
    assert.equal(audit.report.verdict, 'audit');
    assert.equal(audit.report.wouldExit, 1);
    assert.equal(countOf(audit, 'S5.boundary-uncovered'), 69);
    assert.equal(countOf(audit, 'S4.contribution-unowned'), 18);
    assert.equal(countOf(audit, 'S7.obligation-unit-unknown'), 5);
    assert.equal(countOf(audit, 'S1.not-a-sequence-ground-missing'), 434);
    assert.equal(countOf(audit, 'S3.transition-target-unknown'), 9);
    assert.ok(countOf(audit, 'S5.projection-only') >= 1);
    assert.ok(countOf(audit, 'S6.boundary-effect-drift') >= 1);

    const enforced = runCommand([workspace.root]);
    assert.equal(enforced.exitCode, 1);
    assert.equal(enforced.report.verdict, 'findings');
  } finally {
    workspace.remove();
  }
});
