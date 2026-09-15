/**
 * makefile-test-runs — a target that runs tests either defers the heavy suite or
 * declares that it does not.
 *
 * `make test` carries `$(TEST_EXCLUDES)`, which defers
 * `tests/workspacify-reverse/integration`. That deferral is not tidiness: the
 * directory was measured at 156 s on its own against 18 s for every other
 * directory combined. A target that reaches the same tree without the exclusion
 * re-runs the deferred suite, and a run that long is what stops verification from
 * being done at all — which is the failure the exclusion exists to prevent.
 *
 * `test-coverage` was written that way: it collects every test under
 * `tests/workspacify-reverse` and passes no exclusion, so the coverage gate ran the
 * twenty deferred files on every invocation while `make test` beside it did not.
 * Nothing reported the disagreement, because the two targets share no declaration.
 *
 * So the decision is made data. A target either passes `$(TEST_EXCLUDES)`, or its
 * name appears in `HEAVY_TEST_TARGETS` and a reader can see that running it is the
 * deliberate heavy path. Neither is inferred from the target's name or its comment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The nearest Makefile above this file, which is conver's own.
 *
 * Deliberately not `repositoryRootFrom`: the git root here is the repository that
 * contains `tools/conver`, and it carries a Makefile of its own. Reading that one
 * answers a question about a different project, and it answers it plausibly — the
 * assertions below ran green against the wrong file before this walk replaced it.
 */
// [::TICKET::] P26-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-1 --for-spec --no-implementation-order`.
function nearestMakefileFrom(startDirectory) {
  let directory = startDirectory;
  for (;;) {
    const candidate = join(directory, 'Makefile');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`no Makefile above ${startDirectory}`);
    directory = parent;
  }
}

const MAKEFILE_PATH = nearestMakefileFrom(dirname(fileURLToPath(import.meta.url)));

/** The tree whose integration half the routine run defers. */
const DEFERRED_TREE = 'tests/workspacify-reverse';

/** The directory the routine run defers, spelled as the Makefile must spell it. */
const DEFERRED_TREE_INTEGRATION = 'tests/workspacify-reverse/integration';

/**
 * The two spellings a recipe uses to defer the suite.
 *
 * `run-all-surfaces.mjs` takes the exclusion as a flag, so a target that goes
 * through it writes `$(TEST_EXCLUDES)`. `node --test` takes a file list and no
 * exclusion flag, so a target that collects its own files writes the path and
 * filters on it. Both defer the same directory, and the rule is that a routine
 * target names it in one of these two ways rather than in neither.
 */
const DEFERRAL_REFERENCES = ['$(TEST_EXCLUDES)', '$(DEFERRED_TEST_PATH)'];

/** The declaration a target uses to say it runs the deferred suite on purpose. */
const HEAVY_TARGETS_VARIABLE = 'HEAVY_TEST_TARGETS';

// ---------------------------------------------------------------------------
// Reading the Makefile
// ---------------------------------------------------------------------------

/**
 * The recipe lines of every target, keyed by target name.
 *
 * A recipe line continues onto the next when it ends in a backslash, and the
 * continuation is joined so a target whose invocation is split across lines is
 * read as the one invocation it is. Reading only the line that names the runner
 * would miss an exclusion carried on a continuation, and reading only the first
 * line would miss a tree named on a later one.
 */
// [::TICKET::] P26-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-1 --for-spec --no-implementation-order`.
function recipesByTarget(makefileText) {
  const recipes = new Map();
  const lines = makefileText.split('\n');
  let current = null;
  for (const line of lines) {
    const target = /^([A-Za-z0-9_.-]+)\s*:(?!=)/.exec(line);
    if (target) {
      current = target[1];
      recipes.set(current, '');
      continue;
    }
    if (current === null) continue;
    if (line.startsWith('\t')) {
      recipes.set(current, `${recipes.get(current)}\n${line.slice(1).replace(/\\\s*$/, '')}`);
      continue;
    }
    if (line.trim() === '') continue;
    current = null;
  }
  return recipes;
}

/** The value of a `NAME := value` or `NAME = value` assignment, or null. */
// [::TICKET::] P26-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-1 --for-spec --no-implementation-order`.
function variableValue(makefileText, name) {
  const assignment = new RegExp(`^${name}\\s*[:?]?=\\s*(.*)$`, 'm').exec(makefileText);
  return assignment ? assignment[1].trim() : null;
}

/** The targets named by `HEAVY_TEST_TARGETS`, as a list. */
// [::TICKET::] P26-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-1 --for-spec --no-implementation-order`.
function declaredHeavyTargets(makefileText) {
  const value = variableValue(makefileText, HEAVY_TARGETS_VARIABLE);
  return value === null ? null : value.split(/\s+/).filter((entry) => entry !== '');
}

const MAKEFILE_TEXT = readFileSync(MAKEFILE_PATH, 'utf8');
const RECIPES = recipesByTarget(MAKEFILE_TEXT);

/** The targets whose recipe reaches the deferred tree at all. */
// [::TICKET::] P26-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-1 --for-spec --no-implementation-order`.
function targetsReachingDeferredTree() {
  return [...RECIPES]
    .filter(([, recipe]) => recipe.includes(DEFERRED_TREE))
    .map(([name, recipe]) => ({ name, recipe }));
}

// ---------------------------------------------------------------------------
// The declaration
// ---------------------------------------------------------------------------

test('the heavy targets are declared, so the deferral decision is data rather than an omission', () => {
  const declared = declaredHeavyTargets(MAKEFILE_TEXT);
  assert.notEqual(declared, null, `${HEAVY_TARGETS_VARIABLE} is not declared in the Makefile`);
  for (const name of declared) {
    assert.equal(RECIPES.has(name), true, `${HEAVY_TARGETS_VARIABLE} names "${name}", which is not a target`);
  }
});

// ---------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------

test('a target that reaches the deferred tree either excludes it or declares itself heavy', () => {
  const declared = declaredHeavyTargets(MAKEFILE_TEXT) ?? [];
  const undeclared = targetsReachingDeferredTree()
    .filter(({ name, recipe }) => !DEFERRAL_REFERENCES.some((reference) => recipe.includes(reference)))
    .filter(({ name }) => !declared.includes(name))
    .map(({ name }) => name);

  assert.deepEqual(
    undeclared,
    [],
    `these targets run the deferred suite without saying so: ${undeclared.join(', ')}. `
      + `Name the deferral (${DEFERRAL_REFERENCES.join(' or ')}), or declare the target in ${HEAVY_TARGETS_VARIABLE}.`,
  );
});

test('the routine entry defers the suite, and the deferral it names is the one that exists', () => {
  const routine = RECIPES.get('test');
  assert.notEqual(routine, undefined, 'the Makefile declares no `test` target');
  assert.equal(
    routine.includes('$(TEST_EXCLUDES)'),
    true,
    '`test` does not pass $(TEST_EXCLUDES), so the routine run is the heavy one',
  );
  assert.equal(
    variableValue(MAKEFILE_TEXT, 'DEFERRED_TEST_PATH'),
    DEFERRED_TREE_INTEGRATION,
    `DEFERRED_TEST_PATH does not name ${DEFERRED_TREE_INTEGRATION}, so the routine run defers something else`,
  );
  assert.equal(
    variableValue(MAKEFILE_TEXT, 'TEST_EXCLUDES')?.includes('$(DEFERRED_TEST_PATH)'),
    true,
    'TEST_EXCLUDES does not derive from DEFERRED_TEST_PATH, so the two can drift apart',
  );
});

test('a heavy target is named by the declaration rather than by its comment', () => {
  const declared = declaredHeavyTargets(MAKEFILE_TEXT) ?? [];
  assert.equal(
    declared.includes('test-all'),
    true,
    '`test-all` is the whole-suite path and must be declared heavy',
  );
});
