import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import {
  defaultAllocateManifest,
  defectiveWorkspace,
  materializeSmoothWorkspace,
  minimalV3Artifact,
} from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.

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

// @verifies C002
test('an artifact without vocabulary derives both checks and withholds nothing', () => {
  const artifact = minimalV3Artifact();
  delete artifact.vocabulary;
  const allocateManifest = {
    ...defaultAllocateManifest(),
    declared_interfaces: {
      'crates/alpha': [{ interfaceId: 'rest', column: 'rest' }, { interfaceId: 'grpc', column: 'grpc' }, { interfaceId: 'cli', column: 'cli' }],
      'crates/beta': [{ interfaceId: 'rest', column: 'rest' }, { interfaceId: 'grpc', column: 'grpc' }, { interfaceId: 'cli', column: 'cli' }],
    },
  };
  const workspace = materializeSmoothWorkspace({ artifact, allocateManifest });
  try {
    const result = runCommand([workspace.root]);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.report.findings, []);
    assert.deepEqual(result.report.withheld, []);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a malformed artifact vocabulary exits 2 and writes no report', () => {
  const artifact = minimalV3Artifact();
  artifact.vocabulary = { terminalStatuses: 'closed' };
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const result = runCommand([workspace.root]);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report, null);
    assert.equal(existsSync(join(workspace.root, 'SMOOTH-SEQUENCES.json')), false);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('a malformed rules file on disk is ignored and writes a report', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    writeFileSync(join(workspace.root, 'SMOOTH-SEQUENCES-RULES.json'), '{not json');
    const result = runCommand([workspace.root]);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.report.withheld, []);
    assert.ok(existsSync(join(workspace.root, 'SMOOTH-SEQUENCES.json')));
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
