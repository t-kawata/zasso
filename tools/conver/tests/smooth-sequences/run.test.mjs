import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { materializeChainWorkspace } from '../regeneration/helpers/chain-fixture.mjs';
import {
  defaultAllocateManifest,
  defectiveWorkspace,
  materializeSmoothWorkspace,
  minimalV3Artifact,
} from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.

/** Capture what a run writes without touching the test runner's streams. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function capture() {
  const stdout = [];
  const stderr = [];
  return { stdout, stderr, io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) } };
}

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

// @verifies C004
test('exit 1 prints the route block and a next line on stdout', () => {
  const workspace = defectiveWorkspace({ checkId: 'S1.step-unresolved-operation' });
  const output = capture();
  try {
    const result = runCommand([workspace.root], output.io);
    const text = output.stdout.join('\n');
    assert.equal(result.exitCode, 1);
    assert.match(text, /^smooth-sequences: \d+ finding\(s\) in \d+ repair route\(s\)/m);
    assert.match(text, /^route: .+ \| rerun: .+$/m);
    assert.match(text, /S1\.step-unresolved-operation .+ \| why: .+ \| fix: /);
    assert.match(output.stdout.at(-1), /^next: fix every finding above, then rerun this command\./);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('a clean run prints next: none and no finding line', () => {
  const workspace = materializeSmoothWorkspace();
  const output = capture();
  try {
    const result = runCommand([workspace.root], output.io);
    assert.equal(result.exitCode, 0);
    assert.equal(output.stdout.at(-1), 'next: none. verdict: pass.');
    assert.doesNotMatch(output.stdout.join('\n'), /^route: /m);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('a clean v2 run names the withheld surface and says not proved', () => {
  const artifact = { ...minimalV3Artifact(), schema_version: 2 };
  const workspace = materializeSmoothWorkspace({ artifact });
  const output = capture();
  try {
    const result = runCommand([workspace.root], output.io);
    const text = output.stdout.join('\n');
    assert.equal(result.exitCode, 0);
    assert.match(text, /withheld: B \(v3 step contract absent\), S4:S4\.contribution \(v2 artifact carries no registry_contribution\) — not proved/);
    assert.match(output.stdout.at(-1), /^next: none\. verdict: pass with 2 unproven surfaces\./);
    assert.doesNotMatch(text, /verdict: proved/);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('exit 2 prints the misuse repair and a next line and writes no report', () => {
  const output = capture();
  const result = runCommand(['/tmp/smooth-sequences-does-not-exist'], output.io);
  assert.equal(result.exitCode, 2);
  assert.equal(result.report, null);
  assert.match(output.stderr.at(-1), /^next: fix the workspace and rerun; no report was written\./);
});

// @verifies C005
test('a finding that survives a rerun is marked persisted', () => {
  const workspace = defectiveWorkspace({ checkId: 'S1.step-unresolved-operation' });
  try {
    const first = capture();
    runCommand([workspace.root], first.io);
    const second = capture();
    runCommand([workspace.root], second.io);
    assert.doesNotMatch(first.stdout.join('\n'), /\| persisted/);
    assert.match(second.stdout.join('\n'), /\| persisted/);
  } finally {
    workspace.remove();
  }
});

// @verifies C005
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
test('a declared chain broken by a spec edit exits 2 and names SILENT_CHANGE_DETECTED', () => {
  const workspace = materializeChainWorkspace();
  const output = capture();
  try {
    writeFileSync(join(workspace.root, 'spec.md'), '# changed out of band\n');
    const result = runCommand([workspace.root], output.io);
    assert.equal(result.exitCode, 2);
    assert.match(output.stderr.join('\n'), /SILENT_CHANGE_DETECTED/);
  } finally {
    workspace.remove();
  }
});

// @verifies C006
test('an open transaction refuses the detector with TRANSACTION_OPEN', () => {
  const workspace = materializeSmoothWorkspace();
  const output = capture();
  try {
    mkdirSync(join(workspace.root, 'regeneration'), { recursive: true });
    writeFileSync(join(workspace.root, 'regeneration', 'GENERATIONS.json'), `${JSON.stringify({
      schemaVersion: 1,
      transactions: [{ id: 'tx-open', state: 'open', reason: 'test', stagingRoot: '/tmp/staging' }],
    }, null, 2)}\n`);
    const result = runCommand([workspace.root], output.io);
    assert.equal(result.exitCode, 2);
    assert.match(output.stderr.join('\n'), /TRANSACTION_OPEN/);
  } finally {
    workspace.remove();
  }
});

// @verifies C006
test('a judgment-required transaction exits 3 even when the live checks pass', () => {
  const workspace = materializeSmoothWorkspace();
  const output = capture();
  try {
    mkdirSync(join(workspace.root, 'regeneration'), { recursive: true });
    writeFileSync(join(workspace.root, 'regeneration', 'GENERATIONS.json'), `${JSON.stringify({
      schemaVersion: 1,
      transactions: [{ id: 'tx-judge', state: 'judgment-required', reason: 'the cited line no longer holds', stagingRoot: '/tmp/staging' }],
    }, null, 2)}\n`);
    const result = runCommand([workspace.root], output.io);
    assert.equal(result.exitCode, 3);
    assert.match(output.stdout.join('\n'), /judgment-required/);
  } finally {
    workspace.remove();
  }
});
