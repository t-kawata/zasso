// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { readStatus, writeGeneration } from '../../.claude/scripts/smooth-sequences/lib/generation.mjs';
import { buildReport } from '../../.claude/scripts/smooth-sequences/lib/report.mjs';
import {
  materializeSmoothWorkspace,
  minimalV2Artifact,
} from './helpers/workspace-fixture.mjs';

const QUIET = Object.freeze({ stdout: () => {}, stderr: () => {} });

// @verifies C005
test('a v3 to v2 downgrade exits 4 with UNPROVEN_DOWNGRADE', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const first = runCommand([workspace.root], QUIET);
    assert.equal(first.exitCode, 0);
    assert.deepEqual(readStatus(workspace.root).schemaHistory, [3]);

    writeFileSync(workspace.artifactPath, JSON.stringify(minimalV2Artifact(), null, 2));
    const result = runCommand([workspace.root], QUIET);
    assert.equal(result.exitCode, 4);
    assert.equal(result.report.verdict, 'unproven');
    assert.deepEqual(result.report.downgrade, { code: 'UNPROVEN_DOWNGRADE', from: 3, to: 2 });
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('a downgrade withdraws a finding the v3 generation carried', () => {
  const workspace = materializeSmoothWorkspace();
  const finding = {
    checkId: 'S5.projection-only',
    class: 'deficiency',
    subject: 'A-1__step',
    where: 'spec.md#1',
    why: 'why',
    fix: 'fix',
    producer: 'node .claude/scripts/smooth-sequences/run.mjs',
  };
  try {
    const report = buildReport({
      workspace: { root: workspace.root },
      findings: [finding],
      withheld: [],
      checks: { run: 1, failed: 1 },
      verdict: 'findings',
    });
    writeGeneration({ root: workspace.root, report, inputDigest: 'input-1', exitCode: 1, schemaHistory: [3] });
    writeFileSync(workspace.artifactPath, JSON.stringify(minimalV2Artifact(), null, 2));
    const result = runCommand([workspace.root], QUIET);
    assert.equal(result.exitCode, 1);
    assert.equal(result.report.findings.some((entry) => entry.checkId === 'S.evidence-withdrawn'), true);
    assert.equal(result.report.downgrade.code, 'UNPROVEN_DOWNGRADE');
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('a v2 artifact never yields verdict pass', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const result = runCommand([workspace.root], QUIET);
    assert.notEqual(result.report.verdict, 'pass');
    assert.equal(result.exitCode, 4);
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('audit mode records wouldExit 4 for a downgrade and exits 0', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    runCommand([workspace.root], QUIET);
    writeFileSync(workspace.artifactPath, JSON.stringify(minimalV2Artifact(), null, 2));
    const result = runCommand([workspace.root, '--audit'], QUIET);
    assert.equal(result.exitCode, 0);
    assert.equal(result.report.verdict, 'audit');
    assert.equal(result.report.wouldExit, 4);
  } finally {
    workspace.remove();
  }
});
