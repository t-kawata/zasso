// PX-311 @verifies C001
// Closure mode is the final acceptance gate. These tests pin the policy: the strict
// evidence path is derived from closureMode itself, not from a flag the caller may forget,
// and --legacy remains the only weak path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { materializeSmoothWorkspace } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-311 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-311 --for-spec --no-implementation-order`.
function capture() {
  const stdout = [];
  const stderr = [];
  return { stdout, stderr, io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) } };
}

test('C001 closure mode without a flag runs the strict evidence path', () => {
  const workspace = materializeSmoothWorkspace();
  const output = capture();
  try {
    const result = runCommand([workspace.root], output.io);
    assert.equal(result.report.evidencePolicy, 'strict');
    assert.equal(result.report.certificate.status, 'incomplete');
    assert.equal(result.exitCode, 4);
    assert.equal(result.report.verdict, 'unproven');
  } finally {
    workspace.remove();
  }
});

test('C001 the console report states the evidence policy', () => {
  const workspace = materializeSmoothWorkspace();
  const output = capture();
  try {
    runCommand([workspace.root], output.io);
    assert.match(output.stdout.join('\n'), /^evidence: strict$/m);
  } finally {
    workspace.remove();
  }
});

test('C001 --legacy keeps the old path and does not claim strict evidence', () => {
  const workspace = materializeSmoothWorkspace();
  const output = capture();
  try {
    const result = runCommand([workspace.root, '--legacy'], output.io);
    assert.equal(result.report.evidencePolicy, 'legacy');
    assert.equal(result.report.certificate, undefined);
    assert.equal(result.exitCode, 0);
    assert.match(output.stdout.join('\n'), /^evidence: legacy$/m);
  } finally {
    workspace.remove();
  }
});

test('C001 strictEvidence is derived once and shared by every consumer', () => {
  const source = readFileSync('.claude/scripts/smooth-sequences/run.mjs', 'utf8');
  const assignments = source.match(/const strictEvidence =/g) ?? [];
  assert.equal(assignments.length, 1);
  assert.match(source, /strictEvidenceFor\(\{ closureMode, parsed \}\)/);
  assert.match(source, /linesByPath: strictEvidence \?/);
  assert.match(source, /requireEffort: strictEvidence/);
  assert.match(source, /requireAnchor: strictEvidence/);
});

test('C001 a certificate that is not complete never reports pass', () => {
  const workspace = materializeSmoothWorkspace();
  const output = capture();
  try {
    const result = runCommand([workspace.root], output.io);
    if (result.report.certificate.status !== 'complete') {
      assert.notEqual(result.report.verdict, 'pass');
      assert.notEqual(result.exitCode, 0);
    }
  } finally {
    workspace.remove();
  }
});
