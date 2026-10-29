import { test } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeReadings } from '../../.claude/scripts/smooth-sequences/lib/readings-summary.mjs';
import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { materializeSmoothWorkspace, minimalV3Artifact } from './helpers/workspace-fixture.mjs';

/** One inquest row. */
// [::TICKET::] PX-286 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-286 --for-spec --no-implementation-order`.
function inquestRow(subject, answer, line) {
  return {
    subject,
    lens: 'omission',
    question: 'is a required act absent from this subject',
    answer,
    line,
    quote: `the line for ${subject}`,
    reader: 'educe-sequences/test',
  };
}

// @verifies C005
test('the readings summary carries the file path and the unresolved details', () => {
  const workspace = materializeSmoothWorkspace({
    artifact: minimalV3Artifact(),
    readings: {
      inquest: [
        inquestRow('@object:Order', 'Yes', 3),
        inquestRow('@object:Order', 'Yes', 4),
        inquestRow('@object:Asset', 'No', 5),
      ],
    },
  });
  try {
    const summary = summarizeReadings(workspace.root);
    assert.match(summary.inquest.path, /readings-inquest\.jsonl$/);
    assert.equal(summary.inquest.unresolvedSubjectCount, 1);
    assert.equal(summary.inquest.unresolvedDetails.length, 2);
    assert.equal(summary.inquest.unresolvedDetails[0].line, 3);
    assert.equal(typeof summary.inquest.unresolvedDetails[0].quote, 'string');
    assert.equal(summary.inquest.unresolvedSubjects.length, 1);
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('the detail list is capped and the full subject count is kept', () => {
  const rows = [];
  for (let index = 0; index < 60; index += 1) {
    rows.push(inquestRow(`@object:Subject${index}`, 'Yes', index + 1));
  }
  const workspace = materializeSmoothWorkspace({
    artifact: minimalV3Artifact(),
    readings: { inquest: rows },
  });
  try {
    const summary = summarizeReadings(workspace.root);
    assert.equal(summary.inquest.unresolvedSubjectCount, 60);
    assert.equal(summary.inquest.unresolvedDetails.length, 50);
    assert.equal(summary.inquest.overflow, 10);
    assert.equal(summary.inquest.yes, 60);
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('the report carries the readings path and the full subject count', () => {
  const workspace = materializeSmoothWorkspace({
    artifact: minimalV3Artifact(),
    readings: {
      inquest: [
        inquestRow('@object:Order', 'Yes', 3),
        inquestRow('@object:Asset', 'Yes', 5),
        inquestRow('@object:Score', 'No', 7),
      ],
    },
  });
  const stdout = [];
  try {
    const result = runCommand([workspace.root], { stdout: (line) => stdout.push(line), stderr: () => {} });
    assert.equal(result.exitCode, 4);
    assert.equal(result.report.readings.inquest.unresolvedSubjectCount, 2);
    assert.match(result.report.readings.inquest.path, /readings-inquest\.jsonl$/);
    assert.ok(stdout.some((line) => line.startsWith('readings:') && line.includes('2 Yes')));
  } finally {
    workspace.remove();
  }
});
