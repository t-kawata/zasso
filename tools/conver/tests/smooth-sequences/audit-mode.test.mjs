import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { defectiveWorkspace, materializeSmoothWorkspace } from './helpers/workspace-fixture.mjs';

/** Capture the detector's streams without touching the test runner's. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
// [::TICKET::] PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function capture() {
  const stdout = [];
  const stderr = [];
  return { stdout, stderr, io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) } };
}

// @verifies C002
test('--audit reports every finding, exits 0, and records the would-be exit', () => {
  const workspace = defectiveWorkspace({ checkId: 'S1.step-unresolved-operation' });
  try {
    const output = capture();
    const result = runCommand([workspace.root, '--audit', '--legacy'], output.io);
    assert.equal(result.exitCode, 0);
    assert.equal(result.report.verdict, 'audit');
    assert.equal(result.report.wouldExit, 1);
    assert.ok(result.report.findings.length > 0);
    assert.ok(output.stdout.some((line) => line.includes('verdict: audit')));
  } finally {
    workspace.remove();
  }
});

test('without --audit the same finding keeps the enforce exit code', () => {
  const workspace = defectiveWorkspace({ checkId: 'S1.step-unresolved-operation' });
  try {
    const result = runCommand([workspace.root, '--legacy']);
    assert.equal(result.exitCode, 1);
    assert.equal(result.report.verdict, 'findings');
    assert.equal(result.report.wouldExit, null);
  } finally {
    workspace.remove();
  }
});

test('--audit on a clean workspace exits 0 with wouldExit 0', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const result = runCommand([workspace.root, '--audit', '--legacy']);
    assert.equal(result.exitCode, 0);
    assert.equal(result.report.verdict, 'audit');
    assert.equal(result.report.wouldExit, 0);
    assert.deepEqual(result.report.findings, []);
  } finally {
    workspace.remove();
  }
});

test('an unknown flag is still misuse', () => {
  const result = runCommand(['/tmp/smooth-sequences-does-not-exist', '--unknown', '--legacy']);
  assert.equal(result.exitCode, 2);
  assert.equal(result.report, null);
});
