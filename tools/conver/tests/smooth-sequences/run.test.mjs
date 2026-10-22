// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
// [::TICKET::] PX-281 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-281 --for-spec --no-implementation-order`.
// [::TICKET::] PX-280 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-280 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { materializeChainWorkspace } from '../regeneration/helpers/chain-fixture.mjs';
import {
  defaultAllocateManifest,
  defectiveWorkspace,
  materializeSmoothWorkspace,
  minimalV2Artifact,
  minimalV3Artifact,
} from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const RUN_DIRECTORY = 'smooth-sequences';

/** Capture what a run writes without touching the test runner's streams. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
// [::TICKET::] PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function capture() {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const stdout = [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const stderr = [];
  return { stdout, stderr, io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) } };
}

// @verifies C008
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a clean workspace exits 0, writes both reports and withholds nothing', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace();
  try {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy']);
    assert.equal(result.exitCode, 0);
    assert.ok(result.report);
    assert.deepEqual(result.report.withheld, []);
    assert.ok(existsSync(join(workspace.root, RUN_DIRECTORY, 'SMOOTH-SEQUENCES.json')));
    assert.ok(existsSync(join(workspace.root, RUN_DIRECTORY, 'SMOOTH-SEQUENCES.md')));
  } finally {
    workspace.remove();
  }
});

// @verifies C002
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('an artifact without vocabulary derives both checks and withholds nothing', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const artifact = minimalV3Artifact();
  delete artifact.vocabulary;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const allocateManifest = {
    ...defaultAllocateManifest(),
    declared_interfaces: {
      'crates/alpha': [{ interfaceId: 'rest', column: 'rest' }, { interfaceId: 'grpc', column: 'grpc' }, { interfaceId: 'cli', column: 'cli' }],
      'crates/beta': [{ interfaceId: 'rest', column: 'rest' }, { interfaceId: 'grpc', column: 'grpc' }, { interfaceId: 'cli', column: 'cli' }],
    },
  };
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace({ artifact, allocateManifest });
  try {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy']);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.report.findings, []);
    assert.deepEqual(result.report.withheld, []);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a malformed artifact vocabulary exits 2 and writes no report', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const artifact = minimalV3Artifact();
  artifact.vocabulary = { terminalStatuses: 'closed' };
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy']);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report, null);
    assert.equal(existsSync(join(workspace.root, RUN_DIRECTORY)), false);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a malformed rules file on disk is ignored and writes a report', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace();
  try {
    writeFileSync(join(workspace.root, 'SMOOTH-SEQUENCES-RULES.json'), '{not json');
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy']);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.report.withheld, []);
    assert.ok(existsSync(join(workspace.root, RUN_DIRECTORY, 'SMOOTH-SEQUENCES.json')));
  } finally {
    workspace.remove();
  }
});

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a defective workspace exits 1 and names the finding', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = defectiveWorkspace({ checkId: 'S1.step-unresolved-operation' });
  try {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy']);
    assert.equal(result.exitCode, 1);
    assert.ok(result.report.findings.some((finding) => finding.checkId === 'S1.step-unresolved-operation'));
  } finally {
    workspace.remove();
  }
});

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a nonexistent workspace exits 2 and writes no report', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = runCommand(['/tmp/smooth-sequences-does-not-exist', '--legacy']);
  assert.equal(result.exitCode, 2);
  assert.equal(result.report, null);
});

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('more than one argument exits 2', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = runCommand(['a', 'b', '--legacy']);
  assert.equal(result.exitCode, 2);
  assert.equal(result.report, null);
});

// @verifies C004
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('exit 1 prints the route block and a next line on stdout', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = defectiveWorkspace({ checkId: 'S1.step-unresolved-operation' });
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const output = capture();
  try {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy'], output.io);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const text = output.stdout.join('\n');
    assert.equal(result.exitCode, 1);
    assert.match(text, /^smooth-sequences: \d+ finding\(s\) in \d+ repair route\(s\)/m);
    assert.match(text, /^route: .+ \| rerun: .+$/m);
    assert.match(text, /S1\.step-unresolved-operation .+ \| why: .+ \| fix: /);
    assert.match(output.stdout.at(-1), /^next: fix every finding above; blocked surfaces must also be restored\./);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('unresolved inquest readings make a clean run unproven', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace({
    readings: { inquest: [{ subject: 'A-1', lens: 'omission', answer: 'Yes' }] },
  });
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const output = capture();
  try {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy'], output.io);
    assert.equal(result.report.readings.inquest.yes, 1);
    assert.equal(result.report.verdict, 'unproven');
    assert.equal(result.exitCode, 4);
    assert.match(output.stdout.at(-1), /verdict: unproven; exit: 4/);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('--advisory-readings keeps the same run pass and prints the policy', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace({
    readings: { inquest: [{ subject: 'A-1', lens: 'omission', answer: 'Yes' }] },
  });
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const output = capture();
  try {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--advisory-readings', '--legacy'], output.io);
    assert.equal(result.exitCode, 0);
    assert.equal(result.report.verdict, 'pass');
    assert.match(output.stdout.join('\n'), /advisory; not blocking/);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a clean run prints next: none and no finding line', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const output = capture();
  try {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy'], output.io);
    assert.equal(result.exitCode, 0);
    assert.equal(output.stdout.at(-1), 'next: none. verdict: pass.');
    assert.doesNotMatch(output.stdout.join('\n'), /^route: /m);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a v2 run is unproven and lists the blocked surfaces', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const output = capture();
  try {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy'], output.io);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const text = output.stdout.join('\n');
    assert.equal(result.exitCode, 4);
    assert.equal(result.report.verdict, 'unproven');
    assert.ok(result.report.blocked.length > 0);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const blockedIds = new Set(result.report.blocked.map((entry) => entry.checkId));
    assert.equal([...blockedIds].filter((id) => id.startsWith('S5.')).length, 9);
    assert.equal([...blockedIds].filter((id) => id.startsWith('S4.contribution')).length, 3);
    assert.equal(blockedIds.has('S6.boundary-effect-drift'), true);
    assert.match(text, /blocked: \d+ check\(s\) in \d+ surfaces?/);
    assert.match(text, /blocked: S5\.precondition-not-implied \| surface: steps\[\]\.contract\.authored \| producer: node \.claude\/scripts\/smooth-sequences\/migrate-v3\.mjs/);
    assert.match(output.stdout.at(-1), /^next: restore every blocked surface with its producer: .+\. verdict: unproven; exit: 4\.$/);
    assert.doesNotMatch(text, /waiver/);
    assert.doesNotMatch(text, /verdict: pass/);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('exit 2 prints the misuse repair and a next line and writes no report', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const output = capture();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = runCommand(['/tmp/smooth-sequences-does-not-exist', '--legacy'], output.io);
  assert.equal(result.exitCode, 2);
  assert.equal(result.report, null);
  assert.match(output.stderr.at(-1), /^next: fix the workspace and rerun; no report was written\./);
});

// @verifies C001
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a corrupt status exits 2 and writes no report', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace();
  try {
    mkdirSync(join(workspace.root, RUN_DIRECTORY), { recursive: true });
    writeFileSync(join(workspace.root, RUN_DIRECTORY, 'status.json'), '{not json');
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy']);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report, null);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a corrupt archived report exits 2', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace();
  try {
    assert.equal(runCommand([workspace.root, '--legacy']).exitCode, 0);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const archived = join(workspace.root, RUN_DIRECTORY, 'archive', '1');
    mkdirSync(archived, { recursive: true });
    writeFileSync(join(archived, 'SMOOTH-SEQUENCES.json'), '{not json');
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy']);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report, null);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a grounded waiver is recorded while the blocked run stays unproven', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const previous = {
    findings: [{
      checkId: 'S5.projection-only',
      class: 'deficiency',
      subject: 'A-1__step',
      where: 'spec.md#1',
      why: 'why',
      fix: 'fix',
      producer: 'node .claude/scripts/smooth-sequences/run.mjs',
    }],
  };
  try {
    mkdirSync(join(workspace.root, RUN_DIRECTORY), { recursive: true });
    writeFileSync(join(workspace.root, RUN_DIRECTORY, 'SMOOTH-SEQUENCES.json'), JSON.stringify(previous));
    writeFileSync(join(workspace.root, 'SMOOTH-SEQUENCES-WAIVERS.json'), JSON.stringify({
      waivers: [{ findingKey: 'S5.projection-only\u0000A-1__step', ground: 'the step is retired by the specification' }],
    }));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy']);
    assert.equal(result.report.waived.length, 1);
    assert.equal(result.report.findings.length, 0);
    assert.equal(result.report.verdict, 'unproven');
    assert.equal(result.exitCode, 4);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('an empty waiver ground is refused as misuse', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    writeFileSync(join(workspace.root, 'SMOOTH-SEQUENCES-WAIVERS.json'), JSON.stringify({
      waivers: [{ findingKey: 'S5.projection-only\u0000A-1__step', ground: '   ' }],
    }));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy']);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report, null);
  } finally {
    workspace.remove();
  }
});

// @verifies C005
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a finding that survives a rerun is marked persisted', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = defectiveWorkspace({ checkId: 'S1.step-unresolved-operation' });
  try {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const first = capture();
    runCommand([workspace.root, '--legacy'], first.io);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const second = capture();
    runCommand([workspace.root, '--legacy'], second.io);
    assert.doesNotMatch(first.stdout.join('\n'), /\| persisted/);
    assert.match(second.stdout.join('\n'), /\| persisted/);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('the first run records generation 1 and the console names it', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const output = capture();
  try {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy'], output.io);
    assert.equal(result.exitCode, 0);
    assert.match(output.stdout.join('\n'), /^generation: 1 \(new generation\)$/m);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const status = JSON.parse(readFileSync(join(workspace.root, RUN_DIRECTORY, 'status.json'), 'utf8'));
    assert.equal(status.generation, 1);
    assert.equal(status.verdict.exitCode, 0);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a second run over an unchanged workspace is a verification that writes nothing', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const runDirectory = join(workspace.root, RUN_DIRECTORY);
  try {
    runCommand([workspace.root, '--legacy'], capture().io);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const statusBefore = readFileSync(join(runDirectory, 'status.json'), 'utf8');
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const second = capture();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy'], second.io);

    assert.equal(result.exitCode, 0);
    assert.match(second.stdout.join('\n'), /^generation: 1 \(verification; no new generation\)$/m);
    assert.equal(readFileSync(join(runDirectory, 'status.json'), 'utf8'), statusBefore);
    assert.equal(existsSync(join(runDirectory, 'archive')), false);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a repaired workspace opens the next generation and archives the previous pair', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = defectiveWorkspace({ checkId: 'S1.step-unresolved-operation' });
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const runDirectory = join(workspace.root, RUN_DIRECTORY);
  try {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const first = runCommand([workspace.root, '--legacy'], capture().io);
    assert.equal(first.exitCode, 1);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const defectiveJson = readFileSync(join(runDirectory, 'SMOOTH-SEQUENCES.json'), 'utf8');
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const defectiveMarkdown = readFileSync(join(runDirectory, 'SMOOTH-SEQUENCES.md'), 'utf8');

    writeFileSync(workspace.artifactPath, JSON.stringify(minimalV3Artifact(), null, 2));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const second = runCommand([workspace.root, '--legacy'], capture().io);
    assert.equal(second.exitCode, 0);

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const status = JSON.parse(readFileSync(join(runDirectory, 'status.json'), 'utf8'));
    assert.equal(status.generation, 2);
    assert.equal(readFileSync(join(runDirectory, 'archive', '1', 'SMOOTH-SEQUENCES.json'), 'utf8'), defectiveJson);
    assert.equal(readFileSync(join(runDirectory, 'archive', '1', 'SMOOTH-SEQUENCES.md'), 'utf8'), defectiveMarkdown);
  } finally {
    workspace.remove();
  }
});

// @verifies C005
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a declared chain broken by a spec edit exits 2 and names SILENT_CHANGE_DETECTED', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeChainWorkspace();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const output = capture();
  try {
    writeFileSync(join(workspace.root, 'spec.md'), '# changed out of band\n');
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy'], output.io);
    assert.equal(result.exitCode, 2);
    assert.match(output.stderr.join('\n'), /SILENT_CHANGE_DETECTED/);
    assert.equal(existsSync(join(workspace.root, RUN_DIRECTORY)), false);
  } finally {
    workspace.remove();
  }
});

// @verifies C006
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('an open transaction refuses the detector with TRANSACTION_OPEN', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const output = capture();
  try {
    mkdirSync(join(workspace.root, 'regeneration'), { recursive: true });
    writeFileSync(join(workspace.root, 'regeneration', 'GENERATIONS.json'), `${JSON.stringify({
      schemaVersion: 1,
      transactions: [{ id: 'tx-open', state: 'open', reason: 'test', stagingRoot: '/tmp/staging' }],
    }, null, 2)}\n`);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy'], output.io);
    assert.equal(result.exitCode, 2);
    assert.match(output.stderr.join('\n'), /TRANSACTION_OPEN/);
    assert.equal(existsSync(join(workspace.root, RUN_DIRECTORY)), false);
  } finally {
    workspace.remove();
  }
});

// @verifies C006
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a judgment-required transaction exits 3 even when the live checks pass', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const output = capture();
  try {
    mkdirSync(join(workspace.root, 'regeneration'), { recursive: true });
    writeFileSync(join(workspace.root, 'regeneration', 'GENERATIONS.json'), `${JSON.stringify({
      schemaVersion: 1,
      transactions: [{ id: 'tx-judge', state: 'judgment-required', reason: 'the cited line no longer holds', stagingRoot: '/tmp/staging' }],
    }, null, 2)}\n`);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy'], output.io);
    assert.equal(result.exitCode, 3);
    assert.match(output.stdout.join('\n'), /judgment-required/);
    assert.match(output.stdout.join('\n'), /grill-me-for-rfc/);
    assert.match(output.stdout.join('\n'), /\/tmp\/staging/);
    assert.doesNotMatch(output.stdout.join('\n'), /human|stop and report/i);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const status = JSON.parse(readFileSync(join(workspace.root, RUN_DIRECTORY, 'status.json'), 'utf8'));
    assert.equal(status.verdict.exitCode, 3);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a pending transaction prints the educe handoff and the continue command', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const output = capture();
  try {
    mkdirSync(join(workspace.root, 'regeneration'), { recursive: true });
    writeFileSync(join(workspace.root, 'regeneration', 'GENERATIONS.json'), `${JSON.stringify({
      schemaVersion: 1,
      transactions: [{
        id: 'tx-handoff',
        state: 'open',
        reason: 'test',
        stagingRoot: '/tmp/staging',
        pending: 'run .claude/commands/educe-sequences.md with /tmp/staging/spec.md, then continue',
      }],
    }, null, 2)}\n`);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--legacy'], output.io);
    assert.equal(result.exitCode, 2);
    assert.match(output.stderr.join('\n'), /REGENERATION_HANDOFF/);
    assert.match(output.stderr.join('\n'), /educe-sequences\.md/);
    assert.match(output.stderr.join('\n'), /continue/);
    assert.doesNotMatch(output.stderr.join('\n'), /human|stop and report/i);
    assert.equal(existsSync(join(workspace.root, RUN_DIRECTORY)), false);
  } finally {
    workspace.remove();
  }
});

// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('closure mode refuses a workspace with an evidence manifest and no readings', () => {
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace({ readings: {} });
  try {
    writeFileSync(join(workspace.root, 'educe-sequences', 'EVIDENCE-MANIFEST.json'), JSON.stringify({
      schemaVersion: 1,
      artifact: { sha256: 'fixture' },
      files: [],
      receipts: [],
    }, null, 2));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const output = capture();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root], output.io);
    assert.equal(result.exitCode, 4);
    assert.equal(result.report.certificate.status, 'incomplete');
    assert.ok(result.report.certificate.open.length > 0);
    assert.equal(result.report.certificate.judged.held, 0);
    assert.equal(result.report.certificate.readings.held, 0);
    assert.equal(existsSync(join(workspace.root, RUN_DIRECTORY, 'COMPLETION-CERTIFICATE.json')), true);
    assert.equal(existsSync(join(workspace.root, RUN_DIRECTORY, 'JUDGMENT-WORKLIST.json')), true);
  } finally {
    workspace.remove();
  }
});

// @verifies C012
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a grounded waiver removes a current finding from the blocking set', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = defectiveWorkspace({ checkId: 'S1.step-unresolved-operation' });
  try {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const first = runCommand([workspace.root, '--legacy']);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const waivers = first.report.findings.map((finding) => ({
      findingKey: `${finding.checkId}\u0000${finding.subject}`,
      ground: 'the step is supplied by the designer and the generation accepts this known state',
    }));
    writeFileSync(join(workspace.root, 'SMOOTH-SEQUENCES-WAIVERS.json'), JSON.stringify({ waivers }));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const second = runCommand([workspace.root, '--legacy']);
    assert.equal(second.report.findings.length, 0);
    assert.ok(second.report.waived.length >= 1);
  } finally {
    workspace.remove();
  }
});

// @verifies C013
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('--require-effort writes the remaining worklist with the v2 shape', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace({ artifact: minimalV3Artifact() });
  try {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = runCommand([workspace.root, '--require-effort']);
    assert.ok(result.report);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const worklist = JSON.parse(readFileSync(join(workspace.root, RUN_DIRECTORY, 'JUDGMENT-WORKLIST.json'), 'utf8'));
    assert.equal(worklist.schemaVersion, 2);
    assert.ok(Array.isArray(worklist.items));
    assert.equal(typeof worklist.remainingOpen, 'number');
  } finally {
    workspace.remove();
  }
});
