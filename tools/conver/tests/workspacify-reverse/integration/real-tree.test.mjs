// @verifies C001
// @verifies C005
// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
// Read-only assertions about the real experiment input and its pristine original.
//
// These tests never scrub. They assert the end state PX-203 promises: the
// experiment input carries no forward trace, and the original still carries all
// of its design traceability.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  detectForwardTraces,
} from '../../../.claude/scripts/workspacify-reverse/lib/detect-forward-traces.mjs';
import {
  verifyScrub,
  renderVerification,
} from '../../../.claude/scripts/workspacify-reverse/lib/verify-scrub.mjs';
import { hashTree } from '../helpers/scratch.mjs';

const REVERSE_ROOT = fileURLToPath(new URL('../../../siprs-for-reverse', import.meta.url));
const PRISTINE_ROOT = fileURLToPath(new URL('../../../siprs-with-4layers', import.meta.url));

const reverseTreeAvailable = existsSync(REVERSE_ROOT);
const pristineAvailable = existsSync(PRISTINE_ROOT);

test('the experiment input is free of every removable forward trace', { skip: !reverseTreeAvailable }, () => {
  const result = verifyScrub(REVERSE_ROOT);
  assert.equal(result.residualCount, 0, renderVerification(result, REVERSE_ROOT));
});

test('the code structure survives — the legitimate reverse input is intact', { skip: !reverseTreeAvailable }, () => {
  const report = detectForwardTraces(REVERSE_ROOT);
  assert.ok(report.layers.L4.count > 0, 'L4 structure must still be there to analyse');
  assert.equal(report.layers.L4.removable, false);
});

test('detection over the real tree is read-only', { skip: !reverseTreeAvailable }, () => {
  const before = hashTree(REVERSE_ROOT);
  detectForwardTraces(REVERSE_ROOT);
  verifyScrub(REVERSE_ROOT);
  assert.deepEqual(hashTree(REVERSE_ROOT), before);
});

test('the pristine original keeps its design traceability', { skip: !pristineAvailable }, () => {
  const report = detectForwardTraces(PRISTINE_ROOT);
  assert.ok(report.layers.L1.count > 0, 'the original must keep its boundify headers');
  assert.ok(report.layers.L2.count > 0, 'the original must keep its contract annotations');
});
