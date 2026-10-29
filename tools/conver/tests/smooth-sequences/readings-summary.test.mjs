import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { summarizeReadings } from '../../.claude/scripts/smooth-sequences/lib/readings-summary.mjs';
import { classifyVerdict } from '../../.claude/scripts/smooth-sequences/lib/verdict.mjs';
import { materializeSmoothWorkspace } from './helpers/workspace-fixture.mjs';

/** One inquest row. */
// [::TICKET::] PX-288 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-288 --for-spec --no-implementation-order`.
// [::TICKET::] PX-283, PX-284 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function inquest(subject, lens, answer, line = 1) {
  return { subject, lens, answer, line, quote: 'quote' };
}

// @verifies C002
test('inquest readings are counted by lens and answer and unresolved Yes subjects are listed', () => {
  const workspace = materializeSmoothWorkspace({
    readings: {
      inquest: [
        inquest('A-1010', 'omission', 'Yes', 1022),
        inquest('A-1010', 'deficiency', 'No', 1022),
        inquest('G-738', 'contradiction', 'Yes', 751),
        inquest('G-738', 'risk', 'No', 751),
      ],
    },
  });
  try {
    const summary = summarizeReadings(workspace.root);
    assert.equal(summary.status, 'available');
    assert.equal(summary.inquest.records, 4);
    assert.equal(summary.inquest.byAnswer.Yes, 2);
    assert.equal(summary.inquest.byAnswer.No, 2);
    assert.equal(summary.inquest.byLens.omission.Yes, 1);
    assert.equal(summary.inquest.byLens.deficiency.No, 1);
    assert.deepEqual(summary.inquest.unresolvedSubjects, ['A-1010', 'G-738']);
    assert.equal(summary.inquest.overflow, 0);
  } finally {
    workspace.remove();
  }
});

test('the unresolved subject list is capped and the overflow is stated', () => {
  const rows = Array.from({ length: 60 }, (_, index) => inquest(`A-${index}`, 'omission', 'Yes'));
  const workspace = materializeSmoothWorkspace({ readings: { inquest: rows } });
  try {
    const summary = summarizeReadings(workspace.root, { limit: 50 });
    assert.equal(summary.inquest.unresolvedSubjects.length, 50);
    assert.equal(summary.inquest.overflow, 10);
  } finally {
    workspace.remove();
  }
});

test('a workspace with no readings directory reports absent, never clean', () => {
// [::TICKET::] PX-289 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-289 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace();
  try {
    const summary = summarizeReadings(workspace.root);
    assert.equal(summary.status, 'absent');
    assert.equal(summary.present, false);
    assert.deepEqual(summary.inquest.unresolvedSubjects, []);
    assert.deepEqual(summary.open, []);
  } finally {
    workspace.remove();
  }
});

test('a malformed JSONL line is withheld with its file and line, never thrown', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const directory = join(workspace.root, 'educe-sequences');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'readings-inquest.jsonl'), `${JSON.stringify(inquest('A-1', 'omission', 'Yes'))}\n{not json\n`);
    const summary = summarizeReadings(workspace.root);
    assert.equal(summary.status, 'partial');
    assert.equal(summary.inquest.records, 1);
    assert.equal(summary.withheld.length, 1);
    assert.match(summary.withheld[0].reason, /readings-inquest\.jsonl:2/);
  } finally {
    workspace.remove();
  }
});

test('an unreadable readings file is withheld rather than silently skipped', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const directory = join(workspace.root, 'educe-sequences');
    mkdirSync(join(directory, 'readings-inquest.jsonl'), { recursive: true });
    const summary = summarizeReadings(workspace.root);
    assert.equal(summary.status, 'partial');
    assert.equal(summary.withheld.length, 1);
    assert.match(summary.withheld[0].reason, /readings-inquest\.jsonl/);
  } finally {
    workspace.remove();
  }
});

test('an uncovered record without a performed or escaped outcome is unresolved', () => {
  const workspace = materializeSmoothWorkspace({
    readings: {
      uncovered: [
        { subject: 'op-1', outcome: 'escaped', position: 'excluded', line: 10, quote: 'q', why: 'w', reader: 'r' },
        { subject: 'op-2', outcome: 'unknown', reader: 'r' },
      ],
    },
  });
  try {
    const summary = summarizeReadings(workspace.root);
    assert.equal(summary.uncovered.records, 2);
    assert.equal(summary.uncovered.unresolved, 1);
    assert.equal(summary.uncovered.byOutcome.escaped, 1);
  } finally {
    workspace.remove();
  }
});

test('unresolved uncovered records drive the verdict to unproven', () => {
  const decision = classifyVerdict({ findings: [], blocked: [], unresolvedReadings: 1, downgrade: null });
  assert.equal(decision.verdict, 'unproven');
  assert.equal(decision.exitCode, 4);
});

test('adversarial outcomes and uncovered records are counted', () => {
  const workspace = materializeSmoothWorkspace({
    readings: {
      adversarial: [
        { subject: 'A-1', outcome: 'notASequence', attack: 'held', weakestLink: 'none' },
        { subject: 'A-2', outcome: 'excluded', attack: 'held', weakestLink: 'none' },
      ],
      uncovered: [],
    },
  });
  try {
    const summary = summarizeReadings(workspace.root);
    assert.equal(summary.status, 'available');
    assert.equal(summary.adversarial.records, 2);
    assert.equal(summary.adversarial.byOutcome.notASequence, 1);
    assert.equal(summary.uncovered.records, 0);
  } finally {
    workspace.remove();
  }
});
