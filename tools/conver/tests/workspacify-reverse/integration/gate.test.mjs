// @verifies C002
// @verifies C003
// @verifies C004
/**
 * The gate the procedure runs after the analysis, and the destination between rounds.
 *
 * The analysis measures the subject; the gate measures the *procedure*. That is the
 * distinction the file's own `## Statuses and gates` section lost: it defined a gate
 * as a refusal, and design §1.2 forbids refusing a subject for being an incomplete
 * conver project, so the file forbade every gate. §1.2 forbids refusing because of
 * the *subject*; it says nothing about reporting that the procedure's own Step did
 * not produce what it must, which is a fact about this run.
 *
 * The two later rotations already have this: `workspacify-tree/run.mjs:122` and
 * `workspacify-allocate/run.mjs:779` both dispatch a `gate` subcommand over a
 * `DECISIONS.json` read from a derived path under the reserved root, and both print
 * a guide line naming what to fix. This file asserts the third rotation's gate is
 * the same shape, and that its failure text is an instruction rather than a stack.
 *
 * Only one analysis run is paid for here, at `r0.5`, because what the clearing has
 * to be shown against is a populated destination and not a complete one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { analyzeProject } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import {
  RESERVED_DECISIONS_FILE_NAME,
  RESERVED_REVERSE_SUBDIRECTORY,
  RESERVED_ROOT_NAME,
  RESERVED_TREE_SUBDIRECTORY,
  reservedReverseDirectory,
} from '../../../.claude/scripts/workspacify-tree/lib/reserved-root.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const RUNNER = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/run.mjs');

/** A subject small enough that the one analysis run here costs milliseconds. */
const SUBJECT_TREE = Object.freeze({
  'Cargo.toml': '[package]\nname = "gate-subject"\n',
  'src/api/login.rs': 'pub fn login(user_name: &str) -> bool { !user_name.is_empty() }\n',
});

/** The stage the clearing is shown at: past R0, far short of the exit. */
const EARLY_STAGE = 'r0.5';

/** Every judgement item, answered. */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
function completeDecisions() {
  return {
    package_boundary: { packages: [{ path: '.', name: 'root' }], rationale: 'the measured layout' },
    owner_assignment: [{ package: '.', owns: ['src/api/login.rs'] }],
    layer_estimation: [{ package: '.', layer: 'application' }],
    contract_meaning: [{ contract: 'login rejects an empty name', meaning: 'a precondition' }],
    over_splitting: { decision: 'not split', rationale: 'one crossing does not make a package' },
    proposition_classification: [{ claim: 'the surface is one function', class: 'observed' }],
  };
}

/** Run the entrance as an operator would, and capture what they would see. */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
function runEntrance(args, cwd) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * A subject whose reserved directory holds a published set and a decisions document.
 *
 * The material is written rather than analysed because the gate reads the material
 * and the decisions, not the subject — the analysis that produces the material is
 * the entrance's job and is measured by its own suite. What is under test here is
 * whether the gate reports a missing one by name.
 */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
function subjectWith({ decisions = completeDecisions(), material = 'all' } = {}) {
  const tree = createSyntheticTree(SUBJECT_TREE);
  const out = reservedReverseDirectory(tree.root);
  mkdirSync(out, { recursive: true });

  if (material === 'all') {
    writeFileSync(join(out, 'ANALYSIS-SCOPE.json'), '{}\n');
    writeFileSync(join(out, 'R0-R2-REPORT.md'), '# report\n');
    writeFileSync(join(out, 'CLAIM-LEDGER.json'), '{}\n');
    writeFileSync(join(out, 'R7-SERVING.md'), '# serving\n');
    writeFileSync(join(out, 'ORIGIN-LONG-SPEC.md'), '# spec\n');
    writeFileSync(join(out, 'CAPABILITY-PROFILE.json'), '{}\n');
  }

  if (decisions !== null) {
    writeFileSync(join(out, RESERVED_DECISIONS_FILE_NAME), `${JSON.stringify(decisions, null, 2)}\n`);
  }
  return tree;
}

// --- C004: the gate reports the six as recorded ------------------------------

test('IT: the gate accepts a complete decisions document and names the six as recorded', () => {
  const tree = subjectWith();
  try {
    const run = runEntrance(['gate'], tree.root);
    assert.equal(run.status, 0, `the gate must accept a complete document: ${run.stderr}`);
    for (const label of [
      'the final determination of the package boundary',
      'owner assignment',
      'layer estimation',
      'what a contract means',
      'the over-splitting decision',
      'the classification of each proposition',
    ]) {
      assert.ok(run.stdout.includes(label), `the verdict states ${label} is recorded`);
    }
  } finally {
    tree.dispose();
  }
});

// --- C002: a failure is an instruction ---------------------------------------

test('IT: an unanswered item is reported by name, with the Step to return to', () => {
  const decisions = completeDecisions();
  delete decisions.owner_assignment;
  const tree = subjectWith({ decisions });
  try {
    const run = runEntrance(['gate'], tree.root);
    assert.equal(run.status, 1, 'an unanswered item is a failure of the procedure, not of the subject');
    assert.match(run.stderr, /owner assignment/, 'the report names the item');
    assert.match(run.stderr, /## Step 5: decide the partition/, 'and the Step to return to');
    assert.doesNotMatch(run.stderr, /\n\s+at\s/, 'a stack frame names no Step and no fix');
  } finally {
    tree.dispose();
  }
});

test('IT: material the decision was made from is reported by name when it is absent', () => {
  const tree = subjectWith({ material: 'none' });
  try {
    const run = runEntrance(['gate'], tree.root);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /CLAIM-LEDGER\.json/, 'the absent document is named');
    assert.match(run.stderr, /## Step [23]/, 'and the Step that publishes it is the return Step');
  } finally {
    tree.dispose();
  }
});

test('IT: a caller who names the decisions document is refused, and the token is named', () => {
  const tree = subjectWith();
  try {
    const run = runEntrance(['gate', '--decisions=/tmp/elsewhere.json'], tree.root);
    assert.equal(run.status, 1, 'the path is derived from the subject and is not selectable');
    assert.match(run.stderr, /--decisions/, 'the refusal names the token that was written');
    assert.doesNotMatch(run.stderr, /\n\s+at\s/, 'and is an instruction rather than a stack');
  } finally {
    tree.dispose();
  }
});

test('IT: a gate run before the decisions are written advises, and prints no stack frame', () => {
  // The likeliest real failure: the AI runs the gate first. It must be told to
  // write the document at the path the command derives, and which Step to return
  // to — not handed a stack frame, which names neither.
  const tree = subjectWith({ decisions: null });
  try {
    const run = runEntrance(['gate'], tree.root);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /DECISIONS\.json/, 'the report names the document to write');
    assert.match(run.stderr, new RegExp(RESERVED_ROOT_NAME), 'and the directory it is derived under');
    assert.match(run.stderr, /## Step 5/, 'and the Step to return to');
    assert.doesNotMatch(run.stderr, /\n\s+at\s/, 'run.mjs:479 states that a gate names what is wrong');
  } finally {
    tree.dispose();
  }
});

// --- C003: the destination between rounds ------------------------------------

test('IT: a document a previous round published is gone after this one', async () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  try {
    const out = reservedReverseDirectory(tree.root);
    mkdirSync(out, { recursive: true });
    // The four `publishWhenPresent` documents are conditional, so a round over a
    // tree that changed can leave one the next round does not produce.
    writeFileSync(join(out, 'R7-ADJUDICATION.md'), 'a previous round’s document\n');

    await analyzeProject({ root: tree.root, out, through: EARLY_STAGE });

    assert.ok(
      !readdirSync(out).includes('R7-ADJUDICATION.md'),
      'the destination holds exactly what this run published',
    );
    assert.ok(readdirSync(out).length > 0, 'and it did publish something, or the assertion above is vacuous');
  } finally {
    tree.dispose();
  }
});

test('IT: the clearing does not reach the other rotations’ decisions documents', async () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  try {
    const planted = join(tree.root, RESERVED_ROOT_NAME, RESERVED_TREE_SUBDIRECTORY, RESERVED_DECISIONS_FILE_NAME);
    mkdirSync(dirname(planted), { recursive: true });
    writeFileSync(planted, '{ "workspace": [] }\n');
    const before = readFileSync(planted);

    const out = reservedReverseDirectory(tree.root);
    await analyzeProject({ root: tree.root, out, through: EARLY_STAGE });

    assert.ok(readdirSync(out).length > 0, 'the run published, or the assertion below is vacuous');
    assert.deepEqual(readFileSync(planted), before, 'the tree rotation’s decisions are not this run’s to remove');
  } finally {
    tree.dispose();
  }
});

test('IT: the destination is created when it does not exist yet', async () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  try {
    const out = reservedReverseDirectory(tree.root);
    assert.equal(readdirSync(join(tree.root)).includes(RESERVED_ROOT_NAME), false, 'the reserve starts absent');

    await analyzeProject({ root: tree.root, out, through: EARLY_STAGE });

    assert.ok(
      readdirSync(out).includes('ANALYSIS-SCOPE.json'),
      'a first run publishes into a directory it creates',
    );
  } finally {
    tree.dispose();
  }
});
