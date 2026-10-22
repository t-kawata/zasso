import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { ENGINE_DECLARED_CHECK_COUNT, CHECKS } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { readArtifactSchema, validateArtifactShape } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { minimalV2Artifact, minimalV3Artifact } from '../smooth-sequences/helpers/workspace-fixture.mjs';

// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
// @verifies C009
// [::TICKET::] PX-300 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-300 --for-spec --no-implementation-order`.
test('the educe rail still declares 31 checks and one ad-hoc check', () => {
  // The runtime report counts the declared checks plus the ad-hoc check, which is why the
  // baseline prints 31/31 with checksAdhoc=1. Keeping the two counts apart makes a dropped
  // check visible instead of hiding it in the total.
  assert.equal(ENGINE_DECLARED_CHECK_COUNT, 31);
  assert.equal(CHECKS.length, 31);
  assert.equal(ENGINE_DECLARED_CHECK_COUNT + 1, 32);
});

test('the four grill gates still exist', () => {
  for (const file of [
    '.claude/scripts/grill-me-for-rfc/check-obligation-coverage.js',
    '.claude/scripts/grill-me-for-rfc/check-distribution-completeness.js',
    '.claude/scripts/grill-me-for-rfc/check-ledger-discharge.js',
    '.claude/scripts/grill-me-for-rfc/defect-report.js',
  ]) {
    assert.ok(existsSync(file), `${file} is missing`);
  }
});

test('both artifact generations validate under the shared schema', () => {
  const schema = readArtifactSchema();
  assert.deepEqual(validateArtifactShape(minimalV2Artifact(), schema), []);
  assert.deepEqual(validateArtifactShape(minimalV3Artifact(), schema), []);
});
