import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { materializeSmoothWorkspace } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function capture() {
  const stdout = [];
  const stderr = [];
  return {
    io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) },
    stdout,
    stderr,
  };
}

// [::TICKET::] PX-292, PX-293, PX-311 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-292|PX-293|PX-311) --for-spec --no-implementation-order`.
function worklistOf(workspace) {
  const body = JSON.parse(readFileSync(join(workspace.root, 'smooth-sequences', 'JUDGMENT-WORKLIST.json'), 'utf8'));
  // A strict run writes the versioned object; --legacy writes the bare array it always
  // wrote. Both carry the same items, so the test reads either without changing its claim.
  return Array.isArray(body) ? body : body.items;
}

// @verifies C003
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('a v3 workspace enters closure mode without a manifest, and --legacy keeps the old path', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const fresh = capture();
    const result = runCommand([workspace.root], fresh.io);
    assert.equal(result.exitCode, 4);
    assert.notEqual(result.report.certificate, undefined);
    assert.equal(existsSync(join(workspace.root, 'smooth-sequences', 'COMPLETION-CERTIFICATE.json')), true);

    const legacy = capture();
    const old = runCommand([workspace.root, '--legacy'], legacy.io);
    assert.equal(old.report.certificate, undefined);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('--scope writes only the matching obligations and a later run reports the remainder', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const scoped = capture();
    runCommand([workspace.root, '--scope=READ:INQUEST:'], scoped.io);
    const scopedIds = worklistOf(workspace).map((entry) => entry.obligationId);
    assert.ok(scopedIds.length > 0);
    assert.ok(scopedIds.every((id) => id.startsWith('READ:INQUEST:')));

    const full = capture();
    runCommand([workspace.root], full.io);
    const fullIds = worklistOf(workspace).map((entry) => entry.obligationId);
    assert.ok(fullIds.some((id) => !id.startsWith('READ:INQUEST:')));
  } finally {
    workspace.remove();
  }
});

// @verifies C005
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('a supplemental obligation file cannot change the certificate', () => {
  const baseline = materializeSmoothWorkspace();
  const injected = materializeSmoothWorkspace();
  try {
    const first = capture();
    const clean = runCommand([baseline.root], first.io);
    mkdirSync(join(injected.root, 'smooth-sequences'), { recursive: true });
    writeFileSync(join(injected.root, 'smooth-sequences', 'REMEDIATION-OBLIGATIONS.json'), JSON.stringify({
      obligations: [{ id: 'PROP:Injected:closed', class: 'semantic', state: 'closed', required: true }],
    }));
    const second = capture();
    const polluted = runCommand([injected.root], second.io);
    assert.equal(polluted.report.certificate.obligations.total, clean.report.certificate.obligations.total);
    assert.equal(
      polluted.report.certificate.closed.includes('PROP:Injected:closed'),
      false,
    );
  } finally {
    baseline.remove();
    injected.remove();
  }
});

// @verifies C005
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('a provisional record is rejected and never counted as held', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const first = capture();
    runCommand([workspace.root], first.io);
    const [item] = worklistOf(workspace);
    assert.notEqual(item, undefined);
    mkdirSync(join(workspace.root, 'educe-sequences'), { recursive: true });
    writeFileSync(
      join(workspace.root, 'educe-sequences', 'readings-judgment.jsonl'),
      `${JSON.stringify({
        schemaVersion: 2,
        obligationId: item.obligationId,
        contextDigest: item.contextDigest,
        worklistDigest: item.worklistDigest,
        artifactDigest: item.artifactDigest,
        provisional: true,
        verdict: item.answerVocabulary[0],
        basis: [],
        reader: item.reader,
        recordId: 'provisional-1',
      })}\n`,
    );
    const second = capture();
    const result = runCommand([workspace.root], second.io);
    assert.equal(result.report.certificate.judged.held, 0);
    assert.ok(result.report.certificate.assurance.provisionalRecords >= 1);
  } finally {
    workspace.remove();
  }
});

// @verifies C005
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('the production tree carries no remediation generator', () => {
  assert.equal(existsSync('.claude/scripts/smooth-sequences/remediation.mjs'), false);
  const runner = readFileSync('.claude/scripts/smooth-sequences/run.mjs', 'utf8');
  assert.doesNotMatch(runner, /REMEDIATION-OBLIGATIONS/);
});

// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-297 --for-spec --no-implementation-order`.
test('--strict-freshness is a flag and the certificate carries generation counters', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const output = capture();
    const result = runCommand([workspace.root, '--strict-freshness'], output.io);
    assert.notEqual(result.exitCode, 2);
    assert.equal(typeof result.report.certificate.assurance.staleReaderGenerationCount, 'number');
    assert.equal(typeof result.report.certificate.assurance.generationMismatchCount, 'number');
    assert.equal(typeof result.report.certificate.assurance.rereadCount, 'number');
  } finally {
    workspace.remove();
  }
});

// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('a failing design-authoring gate makes a closure-mode run unproven and names the gate', () => {
  // The acceptance gate used to pass while the grill's obligation-coverage gate was red.
  // That allowed smooth passing to stand in for a closed pipeline. One failing closure
  // gate now keeps the certificate incomplete and carries the gate's refusal into open.
  const workspace = materializeSmoothWorkspace();
  try {
    const output = capture();
    const result = runCommand([workspace.root], {
      ...output.io,
      runClosureGates: () => ({
        ok: false,
        gates: [{ script: 'check-obligation-coverage.js', exitCode: 1, reason: 'unstated denominator: 1' }],
      }),
    });

    assert.equal(result.exitCode, 4);
    assert.equal(result.report.certificate.status, 'incomplete');
    const entry = result.report.certificate.open.find((row) => row.id === 'CLOSURE:check-obligation-coverage.js');
    assert.notEqual(entry, undefined);
    assert.equal(entry.subject, 'unstated denominator: 1');
  } finally {
    workspace.remove();
  }
});
