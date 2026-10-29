import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { commitGeneration } from '../../.claude/scripts/regeneration/lib/commit.mjs';
import { computeDebtIncrease } from '../../.claude/scripts/regeneration/lib/debt.mjs';
import { deriveGeneration, openTransaction, verifyGeneration } from '../../.claude/scripts/regeneration/lib/transaction.mjs';
import { readDebtBaseline } from '../../.claude/scripts/smooth-sequences/lib/report.mjs';
import { readUnresolvedReadingSubjects } from '../../.claude/scripts/smooth-sequences/lib/readings-summary.mjs';
import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { fixtureGroundsOk, snapshotDesignTree } from './helpers/chain-fixture.mjs';
import {
  materializeRealWorkspace,
  writeArtifactForSpec,
  writeCandidateSpec,
} from './helpers/real-workspace-fixture.mjs';

const SEPARATOR = '\u0000';

/** A live report and its readings file. */
// [::TICKET::] PX-287 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-287 --for-spec --no-implementation-order`.
// [::TICKET::] PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function writeLiveDebt(root, { findings = [], blocked = [], yes = [] }) {
  mkdirSync(join(root, 'smooth-sequences'), { recursive: true });
  writeFileSync(join(root, 'smooth-sequences', 'SMOOTH-SEQUENCES.json'), `${JSON.stringify({
    schemaVersion: 4,
    findings,
    blocked,
    readings: { inquest: { yes: yes.length }, withheld: [] },
  }, null, 2)}\n`);
  mkdirSync(join(root, 'educe-sequences'), { recursive: true });
  const rows = yes.map((subject) => JSON.stringify({
    subject, lens: 'omission', question: 'q', answer: 'Yes', line: 1, quote: 'q', reader: 'test',
  }));
  writeFileSync(join(root, 'educe-sequences', 'readings-inquest.jsonl'), rows.length === 0 ? '' : `${rows.join('\n')}\n`);
}

/** A detector stub with the debt the caller names. */
// [::TICKET::] PX-287 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-287 --for-spec --no-implementation-order`.
function detector({ findings = [], blocked = [], yes = 0, withheld = [] } = {}) {
  return () => ({
    exitCode: 4,
    findings,
    blocked,
    readings: { inquest: { yes }, withheld },
  });
}

/** Open a transaction on a candidate spec. */
// [::TICKET::] PX-287 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-287 --for-spec --no-implementation-order`.
function openOnCandidate(workspace) {
  return openTransaction({
    root: workspace.root,
    candidateSpec: writeCandidateSpec(workspace),
    reason: 'debt gate test',
  });
}

/** Derive through the educe handoff, write the artifact, and derive the views. */
// [::TICKET::] PX-287 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-287 --for-spec --no-implementation-order`.
function deriveToArtifact(workspace, opened) {
  deriveGeneration({ root: workspace.root, transactionId: opened.transactionId });
  writeArtifactForSpec(opened.stagingRoot, join(opened.stagingRoot, 'spec.md'));
  return deriveGeneration({ root: workspace.root, transactionId: opened.transactionId });
}

// @verifies C002
test('computeDebtIncrease names every added identity and stays quiet for carried debt', () => {
  const baseline = {
    findings: new Set([`S1.a${SEPARATOR}x`]),
    blocked: new Set(['S5.x']),
    readingSubjects: new Set(['@a']),
    readingCount: 1,
    readingWithheld: 0,
  };
  const carried = {
    findings: new Set([`S1.a${SEPARATOR}x`]),
    blocked: new Set(['S5.x']),
    readingSubjects: new Set(['@a']),
    readingCount: 1,
    readingWithheld: 0,
  };
  assert.equal(computeDebtIncrease({ baseline, staging: carried }).increased, false);

  const worse = computeDebtIncrease({
    baseline,
    staging: {
      findings: new Set([`S1.a${SEPARATOR}x`, `S1.b${SEPARATOR}y`]),
      blocked: new Set(['S5.x', 'S5.y']),
      readingSubjects: new Set(['@a', '@b']),
      readingCount: 2,
      readingWithheld: 0,
    },
  });
  assert.deepEqual(worse.newFindings, [`S1.b${SEPARATOR}y`]);
  assert.deepEqual(worse.newBlocked, ['S5.y']);
  assert.deepEqual(worse.newReadingSubjects, ['@b']);
  assert.equal(worse.readingCountDelta, 1);
  assert.equal(worse.increased, true);
});

// @verifies C002
test('a rising reading count with the same subject set is an increase', () => {
  const baseline = { findings: new Set(), blocked: new Set(), readingSubjects: new Set(['@a']), readingCount: 1, readingWithheld: 0 };
  const staging = { findings: new Set(), blocked: new Set(), readingSubjects: new Set(['@a']), readingCount: 2, readingWithheld: 0 };
  const increase = computeDebtIncrease({ baseline, staging });
  assert.equal(increase.readingCountDelta, 1);
  assert.equal(increase.increased, true);
});

// @verifies C002
test('a removed readings file is an increase, not a resolution', () => {
  const baseline = {
    findings: new Set(),
    blocked: new Set(),
    readingSubjects: new Set(['@a', '@b']),
    readingCount: 2,
    readingWithheld: 0,
    readingPresent: true,
  };
  const staging = {
    findings: new Set(),
    blocked: new Set(),
    readingSubjects: new Set(),
    readingCount: 0,
    readingWithheld: 0,
    readingPresent: false,
  };
  const increase = computeDebtIncrease({ baseline, staging });
  assert.equal(increase.readingsRemoved, true);
  assert.equal(increase.increased, true);
});

// @verifies C002
test('the baseline uses a current report even when it has no findings', () => {
  const workspace = materializeRealWorkspace();
  try {
    writeLiveDebt(workspace.root, { findings: [], blocked: [{ checkId: 'S5.x' }], yes: ['@a', '@b'] });
    const baseline = readDebtBaseline(workspace.root);
    assert.equal(baseline.source, 'current');
    assert.ok(baseline.blocked.has('S5.x'));
    assert.deepEqual([...baseline.readingSubjects].sort(), ['@a', '@b']);
    assert.equal(baseline.readingCount, 2);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('the baseline keeps every Yes subject beyond the display cap', () => {
  const workspace = materializeRealWorkspace();
  try {
    const subjects = Array.from({ length: 60 }, (_, index) => `@subject-${index}`);
    writeLiveDebt(workspace.root, { yes: subjects });
    const baseline = readDebtBaseline(workspace.root);
    assert.equal(baseline.readingSubjects.size, 60);
    assert.equal(baseline.readingCount, 60);
    const readings = readUnresolvedReadingSubjects(workspace.root);
    assert.equal(readings.subjects.size, 60);
    assert.equal(readings.count, 60);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('carried debt verifies and a new blocked check does not', () => {
  const workspace = materializeRealWorkspace();
  try {
    writeLiveDebt(workspace.root, { blocked: [{ checkId: 'S5.x' }], yes: ['@a', '@b'] });
    const opened = openOnCandidate(workspace);
    deriveToArtifact(workspace, opened);
    writeLiveDebt(opened.stagingRoot, { yes: ['@a', '@b'] });
    const carried = verifyGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: detector({ blocked: [{ checkId: 'S5.x' }], yes: 2 }),
    });
    assert.equal(carried.state, 'verified');
    assert.equal(carried.receipt.debt.increase.increased, false);
    assert.equal(carried.receipt.debt.baseline.blocked, 1);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('a new blocked check is refused with DEBT_INCREASED', () => {
  const workspace = materializeRealWorkspace();
  try {
    writeLiveDebt(workspace.root, { blocked: [{ checkId: 'S5.x' }], yes: ['@a', '@b'] });
    const opened = openOnCandidate(workspace);
    deriveToArtifact(workspace, opened);
    writeLiveDebt(opened.stagingRoot, { yes: ['@a', '@b'] });
    const result = verifyGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: detector({ blocked: [{ checkId: 'S5.x' }, { checkId: 'S5.y' }], yes: 2 }),
    });
    assert.equal(result.state, 'unverified');
    assert.equal(result.reason, 'DEBT_INCREASED');
    assert.deepEqual(result.receipt.debt.increase.newBlocked, ['S5.y']);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('a new reading subject is refused with DEBT_INCREASED', () => {
  const workspace = materializeRealWorkspace();
  try {
    writeLiveDebt(workspace.root, { blocked: [{ checkId: 'S5.x' }], yes: ['@a', '@b'] });
    const opened = openOnCandidate(workspace);
    deriveToArtifact(workspace, opened);
    writeLiveDebt(opened.stagingRoot, { blocked: [], yes: ['@a', '@b', '@c'] });
    const result = verifyGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: detector({ blocked: [{ checkId: 'S5.x' }], yes: 3 }),
    });
    assert.equal(result.state, 'unverified');
    assert.deepEqual(result.receipt.debt.increase.newReadingSubjects, ['@c']);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('deleting the staging readings file is refused', () => {
  const workspace = materializeRealWorkspace();
  try {
    writeLiveDebt(workspace.root, { blocked: [{ checkId: 'S5.x' }], yes: ['@a', '@b'] });
    const opened = openOnCandidate(workspace);
    deriveToArtifact(workspace, opened);
    rmSync(join(opened.stagingRoot, 'educe-sequences', 'readings-inquest.jsonl'), { force: true });
    const result = verifyGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: detector({ blocked: [{ checkId: 'S5.x' }], yes: 0 }),
    });
    assert.equal(result.state, 'unverified');
    assert.equal(result.receipt.debt.increase.readingsRemoved, true);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('no live report makes the baseline empty and the gate strict', () => {
  const workspace = materializeRealWorkspace();
  try {
    const opened = openOnCandidate(workspace);
    deriveToArtifact(workspace, opened);
    const result = verifyGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: detector({ blocked: [{ checkId: 'S5.x' }] }),
    });
    assert.equal(result.state, 'unverified');
    assert.equal(result.receipt.debt.baseline.blocked, 0);
    assert.deepEqual(result.receipt.debt.increase.newBlocked, ['S5.x']);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('a carried-debt commit leaves the final enforce run unproven', () => {
  const workspace = materializeRealWorkspace();
  try {
    writeLiveDebt(workspace.root, { blocked: [{ checkId: 'S5.x' }], yes: ['@a'] });
    const opened = openOnCandidate(workspace);
    deriveToArtifact(workspace, opened);
    writeLiveDebt(opened.stagingRoot, { yes: ['@a'] });
    verifyGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: detector({ blocked: [{ checkId: 'S5.x' }], yes: 1 }),
    });
    const committed = commitGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runDetector: detector({ blocked: [{ checkId: 'S5.x' }], yes: 1 }),
    });
    assert.equal(committed.state, 'committed');
    const final = runCommand([workspace.root, '--legacy'], { stdout: () => {}, stderr: () => {} });
    assert.equal(final.exitCode, 4);
    assert.equal(final.report.verdict, 'unproven');
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('a post-write debt increase rolls the live tree back', () => {
  const workspace = materializeRealWorkspace();
  try {
    writeLiveDebt(workspace.root, { blocked: [{ checkId: 'S5.x' }], yes: ['@a'] });
    const opened = openOnCandidate(workspace);
    deriveToArtifact(workspace, opened);
    writeLiveDebt(opened.stagingRoot, { yes: ['@a'] });
    verifyGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: detector({ blocked: [{ checkId: 'S5.x' }], yes: 1 }),
    });
    const before = snapshotDesignTree(workspace.root);
    assert.throws(
      () => commitGeneration({
        root: workspace.root,
        transactionId: opened.transactionId,
        runDetector: detector({ blocked: [{ checkId: 'S5.x' }, { checkId: 'S5.y' }], yes: 1 }),
      }),
      (error) => error.code === 'COMMIT_ROLLED_BACK',
    );
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
  } finally {
    workspace.remove();
  }
});
