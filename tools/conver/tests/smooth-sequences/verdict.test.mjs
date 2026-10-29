// [::TICKET::] PX-285 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-285 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyVerdict } from '../../.claude/scripts/smooth-sequences/lib/verdict.mjs';

const FINDING = { checkId: 'S1.duplicate-id', subject: 'x' };
const BLOCKED = {
  checkId: 'S5.precondition-not-implied',
  family: 'meshing',
  surface: 'steps[].contract.authored',
  reason: 'surface absent',
};

// @verifies C001
test('classifyVerdict returns findings and exit 1 when findings is non-empty', () => {
  assert.deepEqual(
    classifyVerdict({ findings: [FINDING], blocked: [BLOCKED], unresolvedReadings: 201, downgrade: null }),
    { verdict: 'findings', exitCode: 1 },
  );
});

// @verifies C001
test('classifyVerdict returns unproven and exit 4 when only blocked surfaces remain', () => {
  assert.deepEqual(
    classifyVerdict({ findings: [], blocked: [BLOCKED], unresolvedReadings: 0, downgrade: null }),
    { verdict: 'unproven', exitCode: 4 },
  );
});

// @verifies C001
test('classifyVerdict returns unproven and exit 4 when readings are unresolved', () => {
  assert.deepEqual(
    classifyVerdict({ findings: [], blocked: [], unresolvedReadings: 201, downgrade: null }),
    { verdict: 'unproven', exitCode: 4 },
  );
});

// @verifies C001
test('classifyVerdict returns unproven and exit 4 on a schema downgrade', () => {
  assert.deepEqual(
    classifyVerdict({
      findings: [],
      blocked: [],
      unresolvedReadings: 0,
      downgrade: { code: 'UNPROVEN_DOWNGRADE', from: 3, to: 2 },
    }),
    { verdict: 'unproven', exitCode: 4 },
  );
});

// @verifies C001
test('classifyVerdict returns pass and exit 0 only when every axis is zero', () => {
  assert.deepEqual(
    classifyVerdict({ findings: [], blocked: [], unresolvedReadings: 0, downgrade: null }),
    { verdict: 'pass', exitCode: 0 },
  );
});
