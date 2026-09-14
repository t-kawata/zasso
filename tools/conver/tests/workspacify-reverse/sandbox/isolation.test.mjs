// @verifies C001
// @verifies C002
/**
 * The isolated environment: what makes a target startable, and what the evidence
 * it produces is allowed to say.
 *
 * Two failures are being held apart here. The first is touching the subject: a
 * sandbox that damaged the tree it was made from would be attributed to the
 * reverse rotation rather than to the sandbox, so the subject tree is
 * measured before and after by an independent walker (`hashTree`), never by the
 * module under test. The second is the shape of the output: a run that reports
 * "no dynamic mechanism" when it means "I did not look there" converts the
 * absence of evidence into evidence of absence, and it arrives with the
 * authority of a run that actually executed. The four-valued status, the
 * required `unobserved_channels` list and the refusal to accept an
 * absence-asserting statement are what stop that.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  ABSENCE_ASSERTION_PATTERNS,
  DYNAMIC_SURFACE_CONFIDENCES,
  DYNAMIC_SURFACE_STATUSES,
  EVIDENCE_MODES,
  UNOBSERVED_CHANNEL_KINDS,
  buildDynamicSurface,
  describeDynamicConstruct,
  renderDynamicSurface,
  validateDynamicSurface,
} from '../../../.claude/scripts/workspacify-reverse/lib/dynamic-surface.mjs';
import {
  SandboxError,
  assertSubjectUntouched,
  collectDynamicEvidence,
  createSandbox,
  discoverStartPlans,
  disposeSandbox,
  isObservedSandbox,
  resetSandbox,
  runTransition,
  startSession,
} from '../../../.claude/scripts/workspacify-reverse/lib/sandbox.mjs';
import { checkBaselines } from '../../../.claude/scripts/workspacify-reverse/lib/regression-gate.mjs';
import { createSyntheticTree, hashTree } from '../helpers/scratch.mjs';

/**
 * A start plan runs through cargo. When cargo is absent the suite says so
 * rather than failing with a reason that belongs to the environment: a test
 * that cannot run its subject should be reported as skipped, not as red.
 */
const CARGO_MISSING_SKIP =
  spawnSync('cargo', ['--version'], { encoding: 'utf8' }).status === 0
    ? false
    : 'cargo is not on PATH, so no start plan can be executed';

/** The conver repository this suite belongs to, derived from this file rather than from the cwd. */
const MODULE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const REVERSE_ROOT = join(MODULE_ROOT, 'siprs-for-reverse');
const reverseTreeAvailable = existsSync(REVERSE_ROOT);

/** A crates-only target: startable, and with no service definition to prefer. */
const CARGO_TARGET = Object.freeze({
  'Cargo.toml': '[package]\nname = "pingable"\nversion = "0.1.0"\nedition = "2021"\n',
  'src/lib.rs': 'pub fn ping() -> bool {\n    true\n}\n',
});

/** A target declaring both a service and a crate, so plan priority is observable. */
const SERVICE_TARGET = Object.freeze({
  'Cargo.toml': '[package]\nname = "pingable"\nversion = "0.1.0"\nedition = "2021"\n',
  'src/lib.rs': 'pub fn ping() -> bool {\n    true\n}\n',
  'docker-compose.yml': 'services:\n  ping:\n    image: alpine:3.20\n',
});

/** A directory with no manifest at all: nothing a start command can be derived from. */
const UNSTARTABLE_TARGET = Object.freeze({
  'NOTES.md': '# a directory of prose, with no way to start it\n',
});

/** A declared crate whose manifest cannot be parsed, so the start command must fail. */
const BROKEN_TARGET = Object.freeze({
  'Cargo.toml': 'this is not a manifest at all !!!\n',
  'src/lib.rs': 'pub fn ping() -> bool {\n    true\n}\n',
});

/**
 * Create a throwaway sandbox over a synthetic target.
 *
 * The guarded path is the target root itself, which is the real-world case:
 * the tree a sandbox is made from is the tree that must not change.
 */
// [::TICKET::] P22-18, P23-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-18|P23-5) --for-spec --no-implementation-order`.
function createSandboxOver(filesByPath, options = {}) {
  const target = createSyntheticTree(filesByPath, { prefix: 'wsp-p22-18-target-' });
  const scratch = createSyntheticTree({}, { prefix: 'wsp-p22-18-scratch-' });
  const handle = createSandbox(target.root, {
    scratchRoot: scratch.root,
    guardedPaths: [target.root],
    ...options,
  });
  return {
    handle,
    target,
    scratch,
    dispose: () => {
      disposeSandbox(handle);
      target.dispose();
      scratch.dispose();
    },
  };
}

test('UT-1 createSandbox isolates a startable target and records what it was made from', () => {
  const { handle, target, dispose } = createSandboxOver(CARGO_TARGET);
  try {
    assert.equal(handle.sandboxUsable, true);
    assert.equal(handle.targetRoot, target.root);
    assert.equal(handle.sandboxRoot.startsWith(handle.sandboxDir), true);
    assert.equal(existsSync(join(handle.sandboxRoot, 'Cargo.toml')), true);
    assert.deepEqual(handle.startPlans.map((plan) => plan.kind), ['cargo']);
    assert.equal(handle.startPlan.manifest, 'Cargo.toml');
    assert.equal(handle.initialDigest.fileCount > 0, true);
    assert.deepEqual(handle.transitions, []);
  } finally {
    dispose();
  }
});

test('UT-1 a target declaring a service and a crate yields both plans, service first', () => {
  const { handle, dispose } = createSandboxOver(SERVICE_TARGET);
  try {
    assert.deepEqual(handle.startPlans.map((plan) => plan.kind), ['compose', 'cargo']);
    assert.equal(handle.startPlans[0].command, 'docker');
    assert.deepEqual(handle.startPlans[0].args, ['compose', '-f', 'docker-compose.yml', 'config', '--quiet']);
    assert.equal(handle.startPlan.kind, 'compose');
  } finally {
    dispose();
  }
});

test('discoverStartPlans names the manifest each plan came from, so a plan is never a guess', () => {
  const target = createSyntheticTree(SERVICE_TARGET, { prefix: 'wsp-p22-18-manifests-' });
  try {
    const plans = discoverStartPlans(target.root);
    assert.deepEqual(plans.map((plan) => plan.manifest), ['docker-compose.yml', 'Cargo.toml']);
    assert.equal(plans.every((plan) => existsSync(join(target.root, plan.manifest))), true);
    assert.deepEqual(discoverStartPlans(join(target.root, 'src')), []);
  } finally {
    target.dispose();
  }
});

test('UT-4 a sandbox that cannot be created names the reason rather than failing silently', () => {
  const scratch = createSyntheticTree({}, { prefix: 'wsp-p22-18-scratch-' });
  const missing = join(scratch.root, 'no-such-tree');
  try {
    assert.throws(
      () => createSandbox(missing, { scratchRoot: scratch.root }),
      (error) => {
        assert.equal(error instanceof SandboxError, true);
        assert.equal(error.reason, 'root-missing');
        assert.equal(error.message.includes(missing), true);
        return true;
      },
    );
  } finally {
    scratch.dispose();
  }
});

test('UT-6 a target with no manifest is unstartable, and says so instead of yielding empty evidence', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver(UNSTARTABLE_TARGET);
  try {
    assert.deepEqual(handle.startPlans, []);
    assert.equal(handle.startPlan, null);
    assert.throws(
      () => startSession(handle),
      (error) => {
        assert.equal(error.reason, 'unstartable');
        assert.equal(error.message.includes('Cargo.toml'), true);
        assert.equal(error.message.includes('docker-compose.yml'), true);
        return true;
      },
    );
    assert.deepEqual(handle.transitions, [], 'a refused start records no transition');
  } finally {
    dispose();
  }
});

test('UT-6 a startable target that fails to start is reported, not read as a clean result', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver(BROKEN_TARGET);
  try {
    assert.throws(
      () => startSession(handle, { tier: 'cargo' }),
      (error) => {
        assert.equal(error.reason, 'start-failed');
        assert.match(error.message, /exit code/);
        return true;
      },
    );
    assert.equal(handle.transitions.length, 1, 'the failed run is recorded, not discarded');
    assert.notEqual(handle.transitions[0].exitCode, 0);
  } finally {
    dispose();
  }
});

test('UT-4 a sandbox that cannot be assembled leaves no copy of the target behind', () => {
  const target = createSyntheticTree(CARGO_TARGET, { prefix: 'wsp-p22-18-target-' });
  const scratch = createSyntheticTree({}, { prefix: 'wsp-p22-18-scratch-' });
  try {
    assert.throws(
      () => createSandbox(target.root, { scratchRoot: scratch.root, database: { kind: 'sqlite', path: 'absent.db' } }),
      (error) => {
        assert.equal(error.reason, 'database-missing');
        assert.equal(error.message.includes('absent.db'), true);
        return true;
      },
    );
    assert.deepEqual(
      readdirSync(scratch.root),
      [],
      'a refused sandbox must not leave a copy the caller has no handle to remove',
    );
  } finally {
    target.dispose();
    scratch.dispose();
  }
});

test('UT-4 a declared database that would resolve outside the sandbox is refused', () => {
  const target = createSyntheticTree(CARGO_TARGET, { prefix: 'wsp-p22-18-target-' });
  const scratch = createSyntheticTree({}, { prefix: 'wsp-p22-18-scratch-' });
  try {
    assert.throws(
      () => createSandbox(target.root, { scratchRoot: scratch.root, database: { kind: 'sqlite', path: '../../escape.db' } }),
      (error) => {
        assert.equal(error.reason, 'database-outside-sandbox');
        return true;
      },
    );
    assert.deepEqual(readdirSync(scratch.root), []);
  } finally {
    target.dispose();
    scratch.dispose();
  }
});

test('a start plan the target does not declare is refused by name', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver(CARGO_TARGET);
  try {
    assert.throws(
      () => startSession(handle, { tier: 'compose' }),
      (error) => {
        assert.equal(error.reason, 'tier-unavailable');
        assert.equal(error.message.includes('"cargo" (from Cargo.toml)'), true);
        return true;
      },
    );
    assert.deepEqual(handle.transitions, [], 'a refused session runs nothing');
  } finally {
    dispose();
  }
});

test('a command that cannot be spawned is reported with the command named', () => {
  const { handle, dispose } = createSandboxOver(CARGO_TARGET);
  try {
    assert.throws(
      () => runTransition(handle, { name: 'missing-binary', command: 'no-such-binary-p22-18', args: [] }),
      (error) => {
        assert.equal(error.reason, 'command-unavailable');
        assert.equal(error.message.includes('no-such-binary-p22-18'), true);
        return true;
      },
    );
    assert.deepEqual(handle.transitions, [], 'a command that never ran is not recorded as a run');
  } finally {
    dispose();
  }
});

test('UT-8 a target that requires no database is a valid sandbox', () => {
  const { handle, dispose } = createSandboxOver(CARGO_TARGET);
  try {
    assert.equal(handle.database.kind, 'none');
    assert.equal(handle.database.initialDigest, null);
    assert.equal(handle.sandboxUsable, true);
  } finally {
    dispose();
  }
});

test('UT-8 a declared database is resolved inside the sandbox and is never the file in the subject', () => {
  const { handle, dispose } = createSandboxOver(
    { ...CARGO_TARGET, 'data/state.db': 'SQLite format 3 initial\n' },
    { database: { kind: 'sqlite', path: 'data/state.db' } },
  );
  try {
    assert.equal(handle.database.kind, 'sqlite');
    assert.equal(handle.database.absolutePath.startsWith(handle.sandboxRoot), true);
    assert.equal(handle.database.initialDigest.sha256.length, 64);
    assert.equal(existsSync(handle.database.absolutePath), true);
  } finally {
    dispose();
  }
});

test('UT-10 the subject is byte-identical before and after every operation, measured independently', { skip: CARGO_MISSING_SKIP }, () => {
  const target = createSyntheticTree(CARGO_TARGET, { prefix: 'wsp-p22-18-prod-' });
  const scratch = createSyntheticTree({}, { prefix: 'wsp-p22-18-scratch-' });
  const before = hashTree(target.root);
  const handle = createSandbox(target.root, {
    scratchRoot: scratch.root,
    guardedPaths: [target.root],
  });
  const insideTheSandbox = join(handle.sandboxRoot, 'written-by-a-transition.txt');
  try {
    startSession(handle, { tier: 'cargo' });
    assert.equal(existsSync(insideTheSandbox), false);
    runTransition(handle, {
      name: 'write-inside-only',
      command: process.execPath,
      args: ['--eval', 'require("node:fs").writeFileSync("written-by-a-transition.txt", "inside only\\n")'],
      destructive: true,
    });
    assert.equal(existsSync(insideTheSandbox), true, 'the transition really did write');
    resetSandbox(handle);
    assert.equal(existsSync(insideTheSandbox), false);

    assert.deepEqual(hashTree(target.root), before, 'the subject must be byte-identical');
    const audit = assertSubjectUntouched(handle);
    assert.equal(audit.untouched, true);
    assert.deepEqual(audit.changedPaths, []);
    assert.deepEqual(audit.before, audit.after);
  } finally {
    disposeSandbox(handle);
    target.dispose();
    scratch.dispose();
  }
});

test('UT-13 a dynamic-surface record carries one of four statuses and never a boolean', () => {
  const { handle, dispose } = createSandboxOver(CARGO_TARGET);
  try {
    const record = buildDynamicSurface({ observations: [], unobservedChannels: [], sandboxId: handle.sandboxId });
    assert.equal(typeof record.status, 'string');
    assert.equal(DYNAMIC_SURFACE_STATUSES.includes(record.status), true);
    assert.equal(record.status, 'absent_under_scanned_patterns');
    assert.equal(DYNAMIC_SURFACE_CONFIDENCES.includes(record.confidence), true);
    for (const lie of [true, false, 'clean', 'success']) {
      const verdict = validateDynamicSurface({ ...record, status: lie });
      assert.equal(verdict.valid, false, `status ${JSON.stringify(lie)} must be refused`);
      assert.equal(verdict.errors[0].field, 'status');
    }
  } finally {
    dispose();
  }
});

test('UT-13 unobserved_channels accepts the four declared kinds and refuses an invented one', () => {
  const { handle, dispose } = createSandboxOver(CARGO_TARGET);
  try {
    assert.deepEqual(UNOBSERVED_CHANNEL_KINDS, [
      'process environment',
      'generated files unavailable',
      'unresolved reflective name',
      'missing compilation database',
    ]);
    const verdict = validateDynamicSurface(
      buildDynamicSurface({
        observations: [],
        unobservedChannels: ['an environment variable i did not check'],
        sandboxId: handle.sandboxId,
      }),
    );
    assert.equal(verdict.valid, false);
    assert.equal(verdict.errors[0].field, 'unobserved_channels');
  } finally {
    dispose();
  }
});

test('UT-14 an unresolvable specifier is stated as what was seen, never as what is absent', () => {
  const seen = describeDynamicConstruct({ kind: 'dynamic_load', specifier: null });
  assert.equal(seen, 'a dynamic load call exists and its specifier is not statically resolvable');
  assert.equal(ABSENCE_ASSERTION_PATTERNS.some((pattern) => pattern.test(seen)), false);

  const resolved = describeDynamicConstruct({ kind: 'dynamic_load', specifier: './handler.mjs' });
  assert.equal(resolved, 'a dynamic load call exists and its specifier resolves statically to "./handler.mjs"');

  const { handle, dispose } = createSandboxOver(CARGO_TARGET);
  try {
    const record = buildDynamicSurface({
      observations: [{ kind: 'dynamic_load', statement: seen, evidence_mode: 'source_static' }],
      unobservedChannels: [],
      sandboxId: handle.sandboxId,
    });
    assert.equal(record.status, 'syntactically_present_unresolved');
    assert.equal(validateDynamicSurface(record).valid, true);

    for (const lie of ['there is no dynamic loading', 'no dynamic imports were found']) {
      const verdict = validateDynamicSurface({
        ...record,
        observations: [{ kind: 'dynamic_load', statement: lie, evidence_mode: 'source_static' }],
      });
      assert.equal(verdict.valid, false, `"${lie}" must be refused`);
      assert.equal(verdict.errors[0].field, 'observations');
      assert.match(verdict.errors[0].detail, /names what was seen/);
    }
  } finally {
    dispose();
  }
});

test('UT-15 an unlooked-at channel is not a clean one, so absence may not be claimed', () => {
  const { handle, dispose } = createSandboxOver(CARGO_TARGET);
  try {
    const unlooked = buildDynamicSurface({
      observations: [],
      unobservedChannels: ['process environment'],
      sandboxId: handle.sandboxId,
    });
    assert.equal(unlooked.status, 'partially_resolved_under_configuration');
    assert.notEqual(unlooked.status, 'absent_under_scanned_patterns');
    assert.deepEqual(unlooked.unobserved_channels, ['process environment']);
    assert.equal(validateDynamicSurface(unlooked).valid, true);

    const claim = validateDynamicSurface({
      ...unlooked,
      status: 'absent_under_scanned_patterns',
      unobserved_channels: ['missing compilation database'],
    });
    assert.equal(claim.valid, false);
    assert.equal(claim.errors[0].field, 'status');
    assert.match(claim.errors[0].detail, /missing compilation database/);
  } finally {
    dispose();
  }
});

test('UT-16 runtime evidence raises the status and names the reproducible run it came from', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver(CARGO_TARGET);
  try {
    const session = startSession(handle, { tier: 'cargo' });
    const probe = runTransition(handle, {
      name: 'probe-dynamic-load',
      command: process.execPath,
      args: ['--eval', 'process.stdout.write("loaded ./handler.mjs\\n")'],
      evidenceMode: 'runtime_dynamic',
      observations: [{ kind: 'dynamic_load', specifier: './handler.mjs' }],
    });
    assert.equal(probe.exitCode, 0);

    const record = collectDynamicEvidence(handle, session, { unobservedChannels: [] });
    assert.equal(record.status, 'runtime_observed');
    assert.equal(record.confidence, 'high');
    assert.equal(record.session.sessionId, session.sessionId);
    assert.equal(record.session.sandboxId, handle.sandboxId);
    assert.equal(
      record.observations.some((observation) => observation.evidence_mode === 'runtime_dynamic'),
      true,
    );

    const orphan = validateDynamicSurface({ ...record, session: null });
    assert.equal(orphan.valid, false);
    assert.equal(orphan.errors[0].field, 'session');
    assert.match(orphan.errors[0].detail, /runtime_observed.*names the session/);
  } finally {
    dispose();
  }
});

test('every evidence item carries one of the three evidence modes', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver(CARGO_TARGET);
  try {
    const session = startSession(handle, { tier: 'cargo' });
    const record = collectDynamicEvidence(handle, session, {
      unobservedChannels: ['process environment', 'generated files unavailable'],
    });
    assert.deepEqual(EVIDENCE_MODES, ['source_static', 'build_semantic', 'runtime_dynamic']);
    assert.equal(record.runs.length, 1, 'a surface says what was executed to back it');
    assert.equal(record.runs.every((run) => EVIDENCE_MODES.includes(run.evidence_mode)), true);
    assert.equal(validateDynamicSurface(record).valid, true);
    assert.equal(record.status, 'partially_resolved_under_configuration');
  } finally {
    dispose();
  }
});

test('a run is not a construct: a build that saw nothing never reports a construct', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver(CARGO_TARGET);
  try {
    const record = collectDynamicEvidence(handle, startSession(handle, { tier: 'cargo' }), {
      unobservedChannels: [],
    });
    assert.deepEqual(record.observations, [], 'the build run resolved no dynamic construct');
    assert.equal(record.runs.length, 1, 'and it is still named, so the surface is reproducible');
    assert.equal(record.status, 'absent_under_scanned_patterns');
  } finally {
    dispose();
  }
});

test('a runtime run alone still obliges the surface to name its session', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver(CARGO_TARGET);
  try {
    const session = startSession(handle, { tier: 'cargo' });
    runTransition(handle, {
      name: 'probe',
      command: process.execPath,
      args: ['--eval', 'process.exit(0)'],
      evidenceMode: 'runtime_dynamic',
    });
    const record = collectDynamicEvidence(handle, session, { unobservedChannels: [] });
    assert.equal(record.status, 'runtime_observed');
    assert.equal(record.session.sessionId, session.sessionId);

    const verdict = validateDynamicSurface({ ...record, session: null });
    assert.equal(verdict.valid, false);
    assert.equal(verdict.errors[0].field, 'session');
  } finally {
    dispose();
  }
});

test('validateDynamicSurface refuses a run whose evidence mode is not one of the three', () => {
  const { handle, dispose } = createSandboxOver(CARGO_TARGET);
  try {
    const record = buildDynamicSurface({
      observations: [],
      unobservedChannels: [],
      runs: [{ name: 'start', command: 'cargo', args: [], exitCode: 0, evidence_mode: 'guessed' }],
      sandboxId: handle.sandboxId,
    });
    const verdict = validateDynamicSurface(record);
    assert.equal(verdict.valid, false);
    assert.equal(verdict.errors[0].field, 'runs');
  } finally {
    dispose();
  }
});

test('renderDynamicSurface states the channels that were not looked at', () => {
  const { handle, dispose } = createSandboxOver(CARGO_TARGET);
  try {
    const record = buildDynamicSurface({
      observations: [],
      unobservedChannels: ['missing compilation database'],
      sandboxId: handle.sandboxId,
    });
    const markdown = renderDynamicSurface(record);
    assert.match(markdown, /partially_resolved_under_configuration/);
    assert.match(markdown, /missing compilation database/);
    assert.equal(ABSENCE_ASSERTION_PATTERNS.some((pattern) => pattern.test(markdown)), false);
  } finally {
    dispose();
  }
});

test('a disposed sandbox is refused rather than silently reused', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver(CARGO_TARGET);
  try {
    disposeSandbox(handle);
    assert.equal(handle.sandboxUsable, false);
    assert.throws(
      () => startSession(handle, { tier: 'cargo' }),
      (error) => error.reason === 'sandbox-disposed',
    );
  } finally {
    dispose();
  }
});

test('IT-1 the real target is sandboxed, started in isolation, and reset to its initial digest', { skip: !reverseTreeAvailable || CARGO_MISSING_SKIP }, () => {
  const scratch = createSyntheticTree({}, { prefix: 'wsp-p22-18-real-' });
  const handle = createSandbox(REVERSE_ROOT, { scratchRoot: scratch.root });
  try {
    assert.deepEqual(handle.startPlans.map((plan) => plan.kind), ['compose', 'cargo']);
    const session = startSession(handle, { tier: 'cargo' });
    assert.equal(session.transitions.length, 1);
    assert.equal(session.transitions[0].exitCode, 0);
    assert.match(session.transitions[0].stdout, /"name":"siprs"/);

    // The honest reading of a build run: it resolved what it resolved, and it did not
    // look at the environment or at anything the build generated.
    const evidence = collectDynamicEvidence(handle, session, {
      unobservedChannels: ['process environment', 'generated files unavailable'],
    });
    assert.equal(evidence.status, 'partially_resolved_under_configuration');
    assert.notEqual(evidence.status, 'absent_under_scanned_patterns');

    const reset = resetSandbox(handle);
    assert.equal(reset.restored, true);
    assert.deepEqual(reset.digest, handle.initialDigest);
  } finally {
    disposeSandbox(handle);
    scratch.dispose();
  }
});

test('IT-2 the subject tree is byte-identical after the real target was sandboxed and started', { skip: !reverseTreeAvailable || CARGO_MISSING_SKIP }, () => {
  const before = hashTree(REVERSE_ROOT);
  const scratch = createSyntheticTree({}, { prefix: 'wsp-p22-18-real-' });
  const handle = createSandbox(REVERSE_ROOT, { scratchRoot: scratch.root });
  try {
    startSession(handle, { tier: 'cargo' });
    resetSandbox(handle);
  } finally {
    disposeSandbox(handle);
    scratch.dispose();
  }
  assert.deepEqual(hashTree(REVERSE_ROOT), before);
  const audit = assertSubjectUntouched(handle);
  assert.equal(audit.untouched, true);
  assert.deepEqual(audit.changedPaths, []);
});

test('C1 a caller who names no channel has not said that every channel was looked at', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver(CARGO_TARGET);
  try {
    const silent = buildDynamicSurface({ observations: [], sandboxId: handle.sandboxId });
    assert.deepEqual(silent.unobserved_channels, [...UNOBSERVED_CHANNEL_KINDS]);
    assert.equal(silent.status, 'partially_resolved_under_configuration');
    assert.notEqual(silent.status, 'absent_under_scanned_patterns');
    assert.equal(validateDynamicSurface(silent).valid, true);

    const collected = collectDynamicEvidence(handle, startSession(handle, { tier: 'cargo' }), {});
    assert.deepEqual(collected.unobserved_channels, [...UNOBSERVED_CHANNEL_KINDS]);
    assert.notEqual(collected.status, 'absent_under_scanned_patterns');
  } finally {
    dispose();
  }
});

test('H2 a status that disagrees with the evidence filed under it is refused', () => {
  const seen = {
    kind: 'dynamic_load',
    statement: describeDynamicConstruct({ kind: 'dynamic_load' }),
    evidence_mode: 'source_static',
  };
  const claimedAbsent = validateDynamicSurface({
    status: 'absent_under_scanned_patterns',
    confidence: 'high',
    unobserved_channels: [],
    observations: [seen],
    runs: [],
    sandboxId: 'sbx-1',
    session: null,
  });
  assert.equal(claimedAbsent.valid, false);
  assert.equal(claimedAbsent.errors[0].field, 'status');
  assert.match(claimedAbsent.errors[0].detail, /syntactically_present_unresolved/);

  const claimedAbsentDespiteRuntime = validateDynamicSurface({
    status: 'absent_under_scanned_patterns',
    confidence: 'high',
    unobserved_channels: [],
    observations: [],
    runs: [{ name: 'probe', command: 'x', args: [], exitCode: 0, evidence_mode: 'runtime_dynamic' }],
    sandboxId: 'sbx-1',
    session: null,
  });
  assert.equal(claimedAbsentDespiteRuntime.valid, false);
  assert.equal(claimedAbsentDespiteRuntime.errors[0].field, 'status');

  const agreeing = validateDynamicSurface({
    status: 'runtime_observed',
    confidence: 'high',
    unobserved_channels: [],
    observations: [],
    runs: [{ name: 'probe', command: 'x', args: [], exitCode: 0, evidence_mode: 'runtime_dynamic' }],
    sandboxId: 'sbx-1',
    session: { sessionId: 'ses-1', sandboxId: 'sbx-1' },
  });
  assert.equal(agreeing.valid, true);
});

test('H4 a symlink that leaves the target is refused rather than copied', () => {
  const outside = createSyntheticTree({ 'secret.txt': 'production\n' }, { prefix: 'wsp-p22-18-outside-' });
  const target = createSyntheticTree(CARGO_TARGET, { prefix: 'wsp-p22-18-link-target-' });
  const scratch = createSyntheticTree({}, { prefix: 'wsp-p22-18-scratch-' });
  try {
    symlinkSync(join(outside.root, 'secret.txt'), join(target.root, 'escape.txt'));
    assert.throws(
      () => createSandbox(target.root, { scratchRoot: scratch.root, guardedPaths: [target.root] }),
      (error) => {
        assert.equal(error instanceof SandboxError, true);
        assert.equal(error.reason, 'symlink-escapes-target');
        assert.equal(error.message.includes('escape.txt'), true);
        return true;
      },
    );
    assert.deepEqual(readdirSync(scratch.root), [], 'the refused copy is cleaned up');
  } finally {
    outside.dispose();
    target.dispose();
    scratch.dispose();
  }
});

test('H4 a transition that reaches the subject is reported and the sandbox marked unusable', () => {
  const target = createSyntheticTree(CARGO_TARGET, { prefix: 'wsp-p22-18-escape-' });
  const scratch = createSyntheticTree({}, { prefix: 'wsp-p22-18-scratch-' });
  const handle = createSandbox(target.root, { scratchRoot: scratch.root, guardedPaths: [target.root] });
  const escaped = join(target.root, 'escaped.txt');
  try {
    assert.throws(
      () =>
        runTransition(handle, {
          name: 'reach-outside',
          command: process.execPath,
          args: ['--eval', `require('node:fs').writeFileSync(${JSON.stringify(escaped)}, 'x')`],
        }),
      (error) => {
        assert.equal(error.reason, 'subject-touched');
        assert.equal(error.message.includes(target.root), true);
        return true;
      },
    );
    assert.equal(existsSync(escaped), true, 'the escape really did happen, so the refusal is not vacuous');
    assert.equal(handle.sandboxUsable, false);
  } finally {
    disposeSandbox(handle);
    target.dispose();
    scratch.dispose();
  }
});

test('L11 a guarded root that has vanished is reported as changed, not raised', () => {
  const target = createSyntheticTree(CARGO_TARGET, { prefix: 'wsp-p22-18-vanish-' });
  const scratch = createSyntheticTree({}, { prefix: 'wsp-p22-18-scratch-' });
  const handle = createSandbox(target.root, { scratchRoot: scratch.root, guardedPaths: [target.root] });
  try {
    rmSync(target.root, { recursive: true, force: true });
    const audit = assertSubjectUntouched(handle);
    assert.equal(audit.untouched, false);
    assert.deepEqual(audit.changedPaths, [target.root]);
  } finally {
    disposeSandbox(handle);
    scratch.dispose();
  }
});

test('L10 a scratch parent this module created is removed with the sandbox', () => {
  const target = createSyntheticTree(CARGO_TARGET, { prefix: 'wsp-p22-18-owned-' });
  const handle = createSandbox(target.root, { guardedPaths: [target.root] });
  const scratchBase = handle.scratchBase;
  try {
    assert.equal(handle.scratchBaseWasCreated, true);
    assert.equal(existsSync(scratchBase), true);
  } finally {
    disposeSandbox(handle);
    target.dispose();
  }
  assert.equal(existsSync(scratchBase), false, 'the parent we made holds only this sandbox');
});

test('IT-3 the sandbox runs the real target and the forward-rotation gate still speaks "proved"', { skip: !reverseTreeAvailable || CARGO_MISSING_SKIP }, () => {
  const scratch = createSyntheticTree({}, { prefix: 'wsp-p22-18-it3-' });
  const handle = createSandbox(REVERSE_ROOT, { scratchRoot: scratch.root });
  try {
    const session = startSession(handle, { tier: 'cargo' });
    assert.equal(session.transitions[0].exitCode, 0);
    assert.equal(assertSubjectUntouched(handle).untouched, true);

    // The composition the Test Plan names, in one test: the sandbox ran a
    // startable target, and the forward rotation is still proved afterwards.
    const gate = checkBaselines({ projectRoot: MODULE_ROOT });
    assert.equal(gate.verdict, 'proved');
    assert.deepEqual(gate.pairFindings, []);
    assert.deepEqual(gate.commandFileFindings, []);
  } finally {
    disposeSandbox(handle);
    scratch.dispose();
  }
});
