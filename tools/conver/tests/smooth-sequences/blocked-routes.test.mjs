import { test } from 'node:test';
import assert from 'node:assert/strict';

import { producerForBlockedSurface } from '../../.claude/scripts/smooth-sequences/lib/repair-route.mjs';
import { SURFACES } from '../../.claude/scripts/smooth-sequences/lib/surfaces.mjs';
import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { materializeSmoothWorkspace, minimalV2Artifact, minimalV3Artifact } from './helpers/workspace-fixture.mjs';

/** A captured console. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function capture() {
  const stdout = [];
  const stderr = [];
  return {
    stdout,
    stderr,
    io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) },
  };
}

// @verifies C005
test('every authorable v3 surface maps to the annotations producer', () => {
  const surfaces = [
    SURFACES.TYPED_STEP_CONTRACTS,
    SURFACES.AUTHORED_CONTRACTS,
    SURFACES.STEP_CROSSINGS,
    SURFACES.REGISTRY_CONTRIBUTION,
    SURFACES.BOUNDARY_EFFECTS,
    SURFACES.OPERATION_TRANSITIONS,
  ];
  for (const surface of surfaces) {
    const producer = producerForBlockedSurface(surface);
    assert.match(producer, /migrate-v3\.mjs/);
    assert.match(producer, /--annotations=/);
  }
});

// @verifies C005
test('an unknown blocked surface raises a named refusal', () => {
  assert.throws(
    () => producerForBlockedSurface('unknown.surface'),
    (error) => error.code === 'UNROUTED_BLOCKED_SURFACE',
  );
});

// @verifies C005
test('every blocked entry carries a producer in the report', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  const output = capture();
  try {
    const result = runCommand([workspace.root], output.io);
    assert.equal(result.exitCode, 4);
    assert.ok(result.report.blocked.length > 0);
    assert.ok(result.report.blocked.every((entry) => typeof entry.producer === 'string' && entry.producer.length > 0));
    assert.ok(output.stdout.some((line) => line.includes('blocked:') && line.includes('producer:')));
    assert.doesNotMatch(output.stdout.join('\n'), /waiver/);
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('an unproven run with readings names the readings repair route and no waiver', () => {
  const artifact = minimalV3Artifact();
  const workspace = materializeSmoothWorkspace({
    artifact,
    readings: {
      inquest: [{
        subject: '@object:Order',
        lens: 'omission',
        question: 'is a required act absent from this subject',
        answer: 'Yes',
        line: 1,
        quote: 'the spec line',
        reader: 'educe-sequences/test',
      }],
    },
  });
  const output = capture();
  try {
    const result = runCommand([workspace.root], output.io);
    assert.equal(result.exitCode, 4);
    assert.equal(result.report.verdict, 'unproven');
    const last = output.stdout.at(-1);
    assert.match(last, /reading/i);
    assert.doesNotMatch(last, /waiver/);
  } finally {
    workspace.remove();
  }
});
