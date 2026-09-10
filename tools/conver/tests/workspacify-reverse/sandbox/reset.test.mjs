// @verifies C001
// @verifies C002
/**
 * Ways back: the reset, and the replay that stands in for re-running.
 *
 * A destructive transition cannot be repeated freely, so two capabilities are
 * proved together. The reset is what makes the isolation a property of the
 * structure rather than of the operator, and it is armed by a rehearsal — the
 * snapshot is restored once, and only if the digest comes back identical is a
 * destructive transition ever allowed to run. The replay is what lets a session
 * be examined again without executing it again, and the proof that it did not
 * execute is a side effect that is observed to happen exactly once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import {
  SandboxError,
  createSandbox,
  disposeSandbox,
  isObservedSandbox,
  resetSandbox,
  runTransition,
  startSession,
} from '../../../.claude/scripts/workspacify-reverse/lib/sandbox.mjs';
import { recordReplay, replaySession, verifyReplay } from '../../../.claude/scripts/workspacify-reverse/lib/record-replay.mjs';
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

/** A crates-only target whose start command is bounded and needs no network. */
const CARGO_TARGET = Object.freeze({
  'Cargo.toml': '[package]\nname = "pingable"\nversion = "0.1.0"\nedition = "2021"\n',
  'src/lib.rs': 'pub fn ping() -> bool {\n    true\n}\n',
});

/** A transition that appends one line to a file, so re-running it is visible in the file. */
const APPEND_SIDE_EFFECT = Object.freeze({
  name: 'append-one-line',
  command: process.execPath,
  args: ['--eval', 'require("node:fs").appendFileSync("side-effects.log", "ran\\n")'],
  destructive: true,
});

/** Create a throwaway sandbox over a synthetic target. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function createSandboxOver(filesByPath = CARGO_TARGET, options = {}) {
  const target = createSyntheticTree(filesByPath, { prefix: 'wsp-p22-18-reset-target-' });
  const scratch = createSyntheticTree({}, { prefix: 'wsp-p22-18-reset-scratch-' });
  const handle = createSandbox(target.root, {
    scratchRoot: scratch.root,
    productionPaths: [target.root],
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

/** The number of lines a side-effect file holds inside the sandbox, or zero when it is absent. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function sideEffectCount(handle) {
  const log = join(handle.sandboxRoot, 'side-effects.log');
  if (!existsSync(log)) return 0;
  return readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).length;
}

test('UT-2 resetSandbox returns the environment to its recorded initial state', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver();
  try {
    const initial = handle.initialDigest;
    startSession(handle, { tier: 'cargo' });
    runTransition(handle, APPEND_SIDE_EFFECT);
    assert.equal(sideEffectCount(handle), 1);

    const reset = resetSandbox(handle);
    assert.equal(reset.restored, true);
    assert.equal(reset.matchesInitial, true);
    assert.deepEqual(reset.digest, initial);
    assert.equal(sideEffectCount(handle), 0);
    assert.deepEqual(handle.transitions, []);
  } finally {
    dispose();
  }
});

test('UT-7 a sandbox with no recorded transitions resets to its initial state unchanged', () => {
  const { handle, target, dispose } = createSandboxOver();
  const productionBefore = hashTree(target.root);
  try {
    const initial = handle.initialDigest;
    assert.deepEqual(handle.transitions, []);

    const reset = resetSandbox(handle);
    assert.equal(reset.restored, true);
    assert.equal(reset.matchesInitial, true);
    assert.deepEqual(reset.digest, initial);
    assert.equal(reset.transitionsCleared, 0);
    assert.deepEqual(handle.transitions, []);
    assert.deepEqual(hashTree(target.root), productionBefore, 'the production tree is byte-identical');
  } finally {
    dispose();
  }
});

test('UT-11 no destructive transition runs before its reset has been recorded', () => {
  const { handle, dispose } = createSandboxOver();
  try {
    // The reset is recorded by the rehearsal createSandbox performs, and the
    // handle only exists because that rehearsal reproduced the initial digest.
    assert.equal(handle.resetArmed, true);
    assert.notEqual(handle.resetHandle, null);

    // A fabricated handle can claim anything and is still refused: the arming is
    // a capability this module holds, not a field a caller can set.
    const forged = {
      sandboxId: 'forged',
      sandboxDir: handle.sandboxDir,
      sandboxRoot: handle.sandboxRoot,
      sandboxUsable: true,
      resetArmed: true,
      resetHandle: { resetId: 'forged' },
      transitions: [],
      productionPaths: [],
      productionDigest: {},
    };
    assert.equal(isObservedSandbox(forged), false);
    assert.throws(
      () => runTransition(forged, APPEND_SIDE_EFFECT),
      (error) => {
        assert.equal(error instanceof SandboxError, true);
        assert.equal(error.reason, 'sandbox-not-observed');
        return true;
      },
    );
    assert.throws(() => disposeSandbox(forged), (error) => error.reason === 'sandbox-not-observed');
    assert.equal(sideEffectCount(handle), 0, 'nothing may have run');

    // The readable field mirrors the capability rather than being its source,
    // so clearing it by assignment cannot open the destructive path.
    assert.throws(() => {
      handle.resetArmed = false;
    });
    assert.equal(handle.resetArmed, true);

    // A non-destructive transition is not gated on the arm.
    const readOnly = runTransition(handle, { ...APPEND_SIDE_EFFECT, destructive: false });
    assert.equal(readOnly.exitCode, 0);
  } finally {
    dispose();
  }
});

test('a reset does not erase what a session already did', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver();
  try {
    const session = startSession(handle, { tier: 'cargo' });
    const sessionIdBeforeReset = session.sessionId;
    assert.equal(session.transitions.length, 1);

    resetSandbox(handle);

    assert.equal(session.transitions.length, 1, 'the session keeps the log it began in');
    assert.equal(session.sessionId, sessionIdBeforeReset, 'and keeps naming itself the same way');
  } finally {
    dispose();
  }
});

test('a reset clears the handle of the session it no longer holds', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver();
  try {
    recordReplay(startSession(handle, { tier: 'cargo' }));
    assert.notEqual(handle.replayHandle, null);

    resetSandbox(handle);

    assert.equal(handle.replayHandle, null, 'the handle must not advertise a session the sandbox no longer holds');
  } finally {
    dispose();
  }
});

test('UT-5 a failed reset is reported and the environment is marked unusable, never reused', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver();
  try {
    rmSync(handle.snapshotRoot, { recursive: true, force: true });

    const reset = resetSandbox(handle);
    assert.equal(reset.restored, false);
    assert.equal(reset.matchesInitial, false);
    assert.equal(reset.reason.length > 0, true);
    assert.equal(handle.sandboxUsable, false);
    assert.equal(handle.resetArmed, false);

    assert.throws(
      () => runTransition(handle, { ...APPEND_SIDE_EFFECT, destructive: false }),
      (error) => error.reason === 'sandbox-unusable',
    );
    assert.throws(
      () => startSession(handle, { tier: 'cargo' }),
      (error) => error.reason === 'sandbox-unusable',
    );
  } finally {
    dispose();
  }
});

test('UT-3 recordReplay captures a session that replays without repeating its side effects', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver();
  try {
    const session = startSession(handle, { tier: 'cargo' });
    runTransition(handle, APPEND_SIDE_EFFECT);
    assert.equal(sideEffectCount(handle), 1);

    const record = recordReplay(session);
    assert.equal(record.transitions.length, 2);
    assert.equal(record.evidence.length, 2);

    // Return the environment to its initial state, so a repeated side effect would
    // start from zero and be visible.
    resetSandbox(handle);
    assert.equal(sideEffectCount(handle), 0);

    const replayed = replaySession(record);
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.sideEffectsRepeated, false);
    assert.equal(sideEffectCount(handle), 0, 'the replay must not have executed anything');
    assert.deepEqual(replayed.evidence, record.evidence);
    assert.equal(replayed.evidenceDigest, record.evidenceDigest);
  } finally {
    dispose();
  }
});

test('UT-9 a single recorded transition replays correctly', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver();
  try {
    const session = startSession(handle, { tier: 'cargo' });
    const record = recordReplay(session);
    assert.equal(record.transitions.length, 1);

    const replayed = replaySession(record);
    assert.equal(replayed.evidence.length, 1);
    assert.equal(replayed.evidence[0].exitCode, 0);
    assert.equal(replayed.evidence[0].name, 'start');
    assert.equal(verifyReplay(record).valid, true);
  } finally {
    dispose();
  }
});

test('the sandbox handle carries the whole session record: id, initial digest, transitions, replay', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver();
  try {
    assert.deepEqual(Object.keys(handle).filter((key) => ['sandboxId', 'initialDigest', 'transitions', 'replayHandle'].includes(key)).sort(), [
      'initialDigest',
      'replayHandle',
      'sandboxId',
      'transitions',
    ]);
    assert.equal(handle.replayHandle, null, 'nothing has been recorded yet');

    const record = recordReplay(startSession(handle, { tier: 'cargo' }));
    assert.deepEqual(handle.replayHandle, {
      sessionId: record.sessionId,
      evidenceDigest: record.evidenceDigest,
      transitionCount: 1,
    });
  } finally {
    dispose();
  }
});

test('UT-12 an identical session replays to identical evidence', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver();
  try {
    const session = startSession(handle, { tier: 'cargo' });

    const first = recordReplay(session);
    const second = recordReplay(session);
    assert.equal(first.sessionId, second.sessionId);
    assert.equal(first.evidenceDigest, second.evidenceDigest);
    assert.deepEqual(replaySession(first).evidence, replaySession(second).evidence);

    const tampered = { ...first, transitions: [...first.transitions, { ...first.transitions[0], name: 'invented' }] };
    const verdict = verifyReplay(tampered);
    assert.equal(verdict.valid, false);
    assert.match(verdict.errors[0].detail, /digest/);
  } finally {
    dispose();
  }
});

test('recordReplay refuses a session from a sandbox it did not observe', { skip: CARGO_MISSING_SKIP }, () => {
  const { handle, dispose } = createSandboxOver();
  try {
    startSession(handle, { tier: 'cargo' });
    assert.throws(
      () => recordReplay({ sandboxId: 'sbx-invented', startPlan: null, transitions: [] }),
      (error) => {
        assert.equal(error instanceof SandboxError, true);
        assert.equal(error.reason, 'session-not-observed');
        return true;
      },
    );
  } finally {
    dispose();
  }
});

test('the reset restores a declared database to its initial content', () => {
  const { handle, dispose } = createSandboxOver(
    { ...CARGO_TARGET, 'data/state.db': 'row:initial\n' },
    { database: { kind: 'sqlite', path: 'data/state.db' } },
  );
  try {
    const databasePath = handle.database.absolutePath;
    assert.equal(readFileSync(databasePath, 'utf8'), 'row:initial\n');
    writeFileSync(databasePath, 'row:mutated\n');

    const reset = resetSandbox(handle);
    assert.equal(reset.restored, true);
    assert.equal(readFileSync(databasePath, 'utf8'), 'row:initial\n');
    assert.equal(reset.database.matchesInitial, true);
  } finally {
    dispose();
  }
});
