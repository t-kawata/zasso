// [::TICKET::] P25-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-4 --for-spec --no-implementation-order`.
// [::TICKET::] P25-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-3 --for-spec --no-implementation-order`.
// [::TICKET::] P25-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-2 --for-spec --no-implementation-order`.
// @verifies C004
/**
 * Reachability — which modules of the reverse tree the run entry point can
 * actually reach.
 *
 * A module nothing imports is a module whose guarantees are decoration. Design
 * §6 measured nine of them and filed R2.5's dynamic half, R6.5's executor and
 * three others as absent entrances for exactly that reason. This test is what
 * keeps the measurement honest as stages are added: it recomputes the import
 * closure from `run.mjs` on every run, so a module that stops being reachable —
 * or one that was supposed to become reachable and did not — fails here rather
 * than being rediscovered in a document months later.
 *
 * The remaining five are named rather than counted. A count would go red for
 * the wrong reason the moment a module is added, and the interesting fact is
 * *which* entrances are still absent.
 *
 * The walk itself lives in `helpers/module-closure.mjs`, because the command
 * definition's absence section is held to the same measurement by
 * `command-procedure.test.mjs` and the two must not read different closures.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readModuleClosure, unreachableModulesFrom } from '../helpers/module-closure.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RUN_ENTRY = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/run.mjs');
const MODULE_DIRECTORY = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/lib');

/**
 * The modules the closure reports unreachable, and why each one is where it is.
 *
 * Two of the five are absences with no owner. Design §6 measured nine unreachable
 * entrances; the stages closed seven of them (R2.5's dynamic half, R6.5's executor
 * and R7's two lanes among them), and these two are what remains of that nine:
 * nothing reaches `two-pass.mjs` or `staleness.mjs`, and no ticket owns them. The
 * absence section of `.claude/commands/workspacify-reverse.md` names them as such.
 *
 * The other three are deliberate exclusions rather than absences, and the honest
 * answer to "why not" is a sentence rather than an omission.
 *
 * `invariant-audit.mjs` is P23-12's audit of the reverse chain's gates, and design
 * §1.2 forbids it from auditing *as a gate*. Wiring it into `run.mjs` is precisely
 * what would let it refuse a run. What executes it is the test suite, which is the
 * entrance §1.2 asks for; an enforcement gate is the shape it forbids.
 *
 * `language-representatives.mjs` is listed for the same reason: what reads the
 * language declaration is the suite and the later tickets that parameterise over
 * the six representatives, and `run.mjs analyze` is pointed at one subject at a
 * time rather than at a fixture population. Wiring it into the analysis path would
 * put a declaration about test fixtures inside the run it is only evidence about.
 *
 * `terminal-state.mjs` is listed for the same reason. What reads §2.3's inventory
 * and compares terminal states is the observation test that drives the three-command
 * chain, not the analysis: the terminal state is a property of a run of the whole
 * chain, and `run.mjs analyze` is one command of it. Wiring this into the analysis
 * path would put a measurement of the chain inside one of the chain's own steps.
 */
const STILL_ABSENT = Object.freeze([
// [::TICKET::] P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-8 --for-spec --no-implementation-order`.
// [::TICKET::] P23-7, P23-8, P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P23-7|P23-8|P23-12) --for-spec --no-implementation-order`.
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
  'invariant-audit.mjs',
  'language-representatives.mjs',
  'staleness.mjs',
  'terminal-state.mjs',
  'two-pass.mjs',
]);

/** The modules R2.5's dynamic half reaches through `dynamic-coupling.mjs`. */
const TAKEN_BY_DYNAMIC_HALF = Object.freeze([
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
  'dynamic-coupling.mjs',
  'dynamic-surface.mjs',
  'record-replay.mjs',
  'sandbox-error.mjs',
  'sandbox.mjs',
]);

/**
 * The modules R6.5's executor reaches through `counterexample-run.mjs`.
 *
 * N2 measured `worktree-isolation.mjs` as an absent entrance: the isolation the
 * counterexample channel was supposed to run in was reachable from nothing the
 * command line could get to, which is why the channel received a literal empty
 * array and falsified nothing.
 */
const TAKEN_BY_R65 = Object.freeze([
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
  'counterexample-run.mjs',
  'counterexample.mjs',
  'worktree-isolation.mjs',
]);

test('C004 invariant — the run entry point and the library it walks both exist, so an empty result cannot read as agreement', () => {
  assert.equal(existsSync(RUN_ENTRY), true, 'the entry point the closure is measured from must exist');
  assert.equal(existsSync(MODULE_DIRECTORY), true, 'the library the closure is measured over must exist');
});

test('C004 invariant — the transitive import closure from run.mjs reaches the dynamic channel', () => {
  const { unreachable } = readModuleClosure(RUN_ENTRY, MODULE_DIRECTORY);

  for (const name of TAKEN_BY_DYNAMIC_HALF) {
    assert.equal(
      unreachable.includes(name),
      false,
      `${name} must be reachable from run.mjs, or the dynamic half is a guarantee nothing runs`,
    );
  }
});

test('C004 invariant — the transitive closure also reaches the counterexample channel and its isolation', () => {
  const { unreachable } = readModuleClosure(RUN_ENTRY, MODULE_DIRECTORY);

  for (const name of TAKEN_BY_R65) {
    assert.equal(
      unreachable.includes(name),
      false,
      `${name} must be reachable from run.mjs, or R6.5's executor is a guarantee nothing runs`,
    );
  }
});

test('C004 postcondition — nine absent entrances become five, and the five are named', () => {
  const { unreachable } = readModuleClosure(RUN_ENTRY, MODULE_DIRECTORY);

  assert.deepEqual(
    unreachable,
    [...STILL_ABSENT].sort(),
    'the two the stages left and the three the design keeps out of the run, by name',
  );
  assert.equal(
    unreachable.length,
    STILL_ABSENT.length,
    'nine before the stages; the seven the stages took are reachable, and the five above are what is left',
  );
  for (const name of STILL_ABSENT) {
    assert.ok(unreachable.includes(name), `${name} must be named, not only counted`);
  }
});

test('C004 invariant — a module that falls out of the closure is reported rather than rediscovered in a document', () => {
  // The same call the command's absence-section guard makes, so a module that
  // stops being reachable fails here and there together rather than being found
  // by a reader of the prose months later.
  assert.deepEqual(
    unreachableModulesFrom(RUN_ENTRY, MODULE_DIRECTORY),
    [...STILL_ABSENT].sort(),
    'a new unreachable module fails here; the fix is to name it in this list and in the absence section together',
  );
});

test('C004 invariant — the closure is recomputed rather than remembered, so a new unreachable module is reported', () => {
  const { unreachable } = readModuleClosure(RUN_ENTRY, MODULE_DIRECTORY);

  assert.equal(
    unreachable.includes('dynamic-coupling.mjs'),
    false,
    'a module that only its own tests import is the defect this test exists to catch',
  );
  const surfaceReachable = readModuleClosure(
    join(MODULE_DIRECTORY, 'dynamic-coupling.mjs'),
    MODULE_DIRECTORY,
  );
  assert.ok(surfaceReachable.reached.size > 1, 'the walk reads real files, so it cannot pass by finding nothing');
});
