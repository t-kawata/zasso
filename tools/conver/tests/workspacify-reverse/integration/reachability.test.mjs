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
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RUN_ENTRY = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/run.mjs');
const MODULE_DIRECTORY = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/lib');

/** The modules design §6 records as the absent entrances, minus the four this ticket takes. */
const STILL_ABSENT = Object.freeze([
  'reflexion.mjs',
  'security-lane.mjs',
  'staleness.mjs',
  'two-pass.mjs',
  'worktree-isolation.mjs',
]);

/** The modules R2.5's dynamic half reaches through `dynamic-coupling.mjs`. */
const TAKEN_BY_THIS_STAGE = Object.freeze([
  'dynamic-coupling.mjs',
  'dynamic-surface.mjs',
  'record-replay.mjs',
  'sandbox-error.mjs',
  'sandbox.mjs',
]);

/** Every `./sibling.mjs` specifier a file's text names, resolved to a file that exists. */
// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
function importsOf(file) {
  const text = readFileSync(file, 'utf8');
  const found = new Set();
  for (const match of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const target = resolve(dirname(file), match[1]);
    if (existsSync(target) && statSync(target).isFile()) found.add(target);
  }
  return [...found];
}

/** Every module of the reverse tree's library that the run entry point can reach. */
// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
function reachableModules(entry, directory) {
  const reached = new Set();
  const pending = [resolve(entry)];
  while (pending.length > 0) {
    const current = pending.pop();
    if (reached.has(current)) continue;
    reached.add(current);
    for (const dependency of importsOf(current)) pending.push(dependency);
  }
  const libraryRoot = resolve(directory);
  return {
    reached,
    unreachable: readdirSync(libraryRoot)
      .filter((name) => name.endsWith('.mjs'))
      .filter((name) => !reached.has(join(libraryRoot, name)))
      .sort(),
  };
}

test('C004 invariant — the run entry point and the library it walks both exist, so an empty result cannot read as agreement', () => {
  assert.equal(existsSync(RUN_ENTRY), true, 'the entry point the closure is measured from must exist');
  assert.equal(existsSync(MODULE_DIRECTORY), true, 'the library the closure is measured over must exist');
});

test('C004 invariant — the transitive import closure from run.mjs reaches the dynamic channel', () => {
  const { unreachable } = reachableModules(RUN_ENTRY, MODULE_DIRECTORY);

  for (const name of TAKEN_BY_THIS_STAGE) {
    assert.equal(
      unreachable.includes(name),
      false,
      `${name} must be reachable from run.mjs, or the dynamic half is a guarantee nothing runs`,
    );
  }
});

test('C004 invariant — nine absent entrances become five, and the five are named', () => {
  const { unreachable } = reachableModules(RUN_ENTRY, MODULE_DIRECTORY);

  assert.deepEqual(
    unreachable,
    [...STILL_ABSENT].sort(),
    'the absent entrances design 6 records, less the four R2.5 now reaches',
  );
  assert.equal(unreachable.length, 5, 'nine before this ticket, five after');
});

test('C004 invariant — the closure is recomputed rather than remembered, so a new unreachable module is reported', () => {
  const { unreachable } = reachableModules(RUN_ENTRY, MODULE_DIRECTORY);

  assert.equal(
    unreachable.includes('dynamic-coupling.mjs'),
    false,
    'a module that only its own tests import is the defect this test exists to catch',
  );
  const surfaceReachable = reachableModules(
    join(MODULE_DIRECTORY, 'dynamic-coupling.mjs'),
    MODULE_DIRECTORY,
  );
  assert.ok(surfaceReachable.reached.size > 1, 'the walk reads real files, so it cannot pass by finding nothing');
});
