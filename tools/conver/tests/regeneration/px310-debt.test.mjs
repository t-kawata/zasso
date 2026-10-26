// [::TICKET::] PX-310 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-310 --for-spec --no-implementation-order`.
// PX-310 @verifies C004
// A transaction must not treat a changed artifact as a reason to ignore stale
// evidence. The debt gate counts the evidence codes the detector reports.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeDebtIncrease,
  debtOfDetectorReport,
} from '../../.claude/scripts/regeneration/lib/debt.mjs';

test('C004 STALE_EVIDENCE is counted as debt', () => {
  const staging = debtOfDetectorReport({
    certificate: {
      inputs: { artifact: 'new' },
      open: [{ id: 'READ:1', code: 'STALE_EVIDENCE' }],
    },
  });
  assert.equal(staging.staleEvidence, 1);

  const increase = computeDebtIncrease({
    baseline: { obligations: { inputDigest: 'old', closed: ['READ:1'], open: [] } },
    staging,
  });
  assert.equal(increase.increased, true);
  assert.equal(increase.staleEvidence, 1);
});

test('C004 WORKLIST_MISMATCH and ATTACK_MISMATCH are counted as debt', () => {
  const staging = debtOfDetectorReport({
    certificate: {
      inputs: { artifact: 'new' },
      open: [
        { id: 'DIST:FIDELITY:a', code: 'WORKLIST_MISMATCH' },
        { id: 'READ:ADVERSARIAL:b', code: 'ATTACK_MISMATCH' },
      ],
    },
  });
  assert.equal(staging.staleEvidence, 2);
  assert.equal(computeDebtIncrease({ baseline: {}, staging }).increased, true);
});

test('C004 a carried evidence set with no stale code is not an increase', () => {
  const staging = debtOfDetectorReport({
    certificate: { inputs: { artifact: 'new' }, open: [] },
  });
  assert.equal(staging.staleEvidence, 0);
  assert.equal(computeDebtIncrease({ baseline: {}, staging }).increased, false);
});
