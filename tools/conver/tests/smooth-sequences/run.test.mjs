import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { defectiveWorkspace, materializeSmoothWorkspace, RULES_FILE_NAME } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.

// @verifies C008
test('a clean workspace exits 0, writes both reports and withholds nothing', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const result = runCommand([workspace.root]);
    assert.equal(result.exitCode, 0);
    assert.ok(result.report);
    assert.deepEqual(result.report.withheld, []);
    assert.ok(existsSync(join(workspace.root, 'SMOOTH-SEQUENCES.json')));
    assert.ok(existsSync(join(workspace.root, 'SMOOTH-SEQUENCES.md')));
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a workspace without a rules file withholds both declaration-driven checks', () => {
  const workspace = materializeSmoothWorkspace({ rules: null });
  try {
    const result = runCommand([workspace.root]);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.report.findings, []);
    assert.deepEqual(result.report.withheld.map((entry) => entry.check), ['S3.terminal-status', 'S3.interface-mapping']);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a malformed rules file exits 2 and writes no report', () => {
  const workspace = materializeSmoothWorkspace({ rules: null });
  try {
    writeFileSync(join(workspace.root, RULES_FILE_NAME), '{not json');
    const result = runCommand([workspace.root]);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report, null);
    assert.equal(existsSync(join(workspace.root, 'SMOOTH-SEQUENCES.json')), false);
  } finally {
    workspace.remove();
  }
});

test('a defective workspace exits 1 and names the finding', () => {
  const workspace = defectiveWorkspace({ checkId: 'S1.step-unresolved-operation' });
  try {
    const result = runCommand([workspace.root]);
    assert.equal(result.exitCode, 1);
    assert.ok(result.report.findings.some((finding) => finding.checkId === 'S1.step-unresolved-operation'));
  } finally {
    workspace.remove();
  }
});

test('a nonexistent workspace exits 2 and writes no report', () => {
  const result = runCommand(['/tmp/smooth-sequences-does-not-exist']);
  assert.equal(result.exitCode, 2);
  assert.equal(result.report, null);
});

test('more than one argument exits 2', () => {
  const result = runCommand(['a', 'b']);
  assert.equal(result.exitCode, 2);
  assert.equal(result.report, null);
});
