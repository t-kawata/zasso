import { test } from 'node:test';
import assert from 'node:assert/strict';

import { groundCommands } from '../../.claude/scripts/regeneration/lib/transaction.mjs';

const STAGING_ROOT = '/tmp/grounds-test-staging';

test('every ground check receives the staging root it must measure', () => {
  const commands = groundCommands(STAGING_ROOT);

  assert.equal(commands.length, 4);
  for (const [script, args] of commands) {
    assert.ok(args.includes(STAGING_ROOT), `${script} must receive ${STAGING_ROOT}`);
  }
});

test('defect-report receives the root before its gate flag', () => {
  const defectReport = groundCommands(STAGING_ROOT)
    .find(([script]) => script === 'grill-me-for-rfc/defect-report.js');

  assert.deepEqual(defectReport, [
    'grill-me-for-rfc/defect-report.js',
    [STAGING_ROOT, '--gate'],
  ]);
});
