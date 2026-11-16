// PX-433 @verifies C006 @verifies C008
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertNoViolations,
  compareFinalState,
  validateTimeline,
} from '../../.claude/scripts/conver/progress-gif/validator.js';
import { makeModel, packageModel } from './models.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main as validateMain } from '../../.claude/scripts/conver/validate-timeline.js';

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
test('C006: a collapsed order bucket is a violation', () => {
  const model = makeModel({ packages: [packageModel({ id: 'pkg-1', total: 10 })] });
  const timeline = {
    timeline: [
      { kind: 'stage', stage: 'explain', packageId: 'pkg-1', orderT: 9000, evidenceT: 1000, seq: 0 },
      { kind: 'stage', stage: 'grill', packageId: 'pkg-1', orderT: 9000, evidenceT: 70000, seq: 1 },
    ],
  };
  const violations = validateTimeline({ model, timeline, previousSnapshot: null });

  assert.equal(violations.some((violation) => violation.code === 'COLLAPSED_ORDER_TIME'), true);
  assert.throws(() => assertNoViolations(violations), /COLLAPSED_ORDER_TIME/);
});

test('C006: a history stage event without a record is a violation', () => {
  const model = makeModel({ packages: [packageModel({ id: 'pkg-1', total: 10 })] });
  model.timelineMode = 'history';
  const timeline = {
    timeline: [{ kind: 'stage', stage: 'explain', packageId: 'pkg-1', orderT: 2000, evidenceT: 2000, seq: 0 }],
  };
  const violations = validateTimeline({ model, timeline, previousSnapshot: null });

  assert.equal(violations.some((violation) => violation.code === 'MISSING_STAGE_RECORD'), true);
});

test('C006: a clean history timeline has no violations', () => {
  const model = makeModel({ packages: [packageModel({ id: 'pkg-1', total: 10 })] });
  model.timelineMode = 'history';
  const timeline = {
    timeline: [{ kind: 'stage', stage: 'explain', packageId: 'pkg-1', orderT: 2000, evidenceT: 2000, recordId: 'r1', seq: 0 }],
  };
  const violations = validateTimeline({ model, timeline, previousSnapshot: null });

  assert.deepEqual(violations, []);
});

test('C008: final-state parity reports a named mismatch', () => {
  const historyModel = { packages: [{ id: 'pkg-1', stages: { make: 1, plan: 1, start: 1, review: 1 } }] };
  const artifactModel = { packages: [{ id: 'pkg-1', stages: { make: 0, plan: 0, start: 0, review: 0 } }] };
  const result = compareFinalState(historyModel, artifactModel, { tolerance: 0.01 });

  assert.equal(result.ok, false);
  assert.equal(result.discrepancies[0].code, 'FINAL_STATE_MISMATCH');
  assert.equal(result.discrepancies[0].packageId, 'pkg-1');
});


test('C006: validate-timeline --model reads a model file', () => {
  const modelPath = path.join(os.tmpdir(), `px433-model-${Date.now()}.json`);
  fs.writeFileSync(modelPath, JSON.stringify(makeModel({ packages: [packageModel({ id: 'pkg-1', total: 10 })] })));
  const originalWrite = process.stdout.write;
  process.stdout.write = () => true;
  let exitCode;
  try {
    exitCode = validateMain([`--model=${modelPath}`]);
  } finally {
    process.stdout.write = originalWrite;
  }

  assert.equal(exitCode, 0);
});
