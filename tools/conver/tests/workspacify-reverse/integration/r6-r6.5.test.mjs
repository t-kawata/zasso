// [::TICKET::] PX-208 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-208 --for-spec --no-implementation-order`.
// @verifies C001
// @verifies C002
// @verifies C003
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
/**
 * R6 and R6.5 measured through the pipeline that runs them.
 *
 * The unit suites prove each module alone. These prove the wiring: that the
 * stages run in the declared order, that the plan reaches the sidecar every
 * claim is supposed to have an entry in, and that the reverse edge is recorded
 * rather than merely available. The forward-rotation gate is asserted here too,
 * because every later ticket runs it after its own step.
 *
 * The real-tree case is what can fail for a reason a synthetic fixture cannot
 * reproduce: 4460 claims across a real crate's layout. It names the stage it
 * stops at rather than inheriting a default that moves whenever a stage is
 * added.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANALYSIS_STAGES, analyzeProject } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { checkBaselines } from '../../../.claude/scripts/workspacify-reverse/lib/regression-gate.mjs';
import { createGitBackedTree, createSyntheticTree, hashTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const REVERSE_ROOT = join(PROJECT_ROOT, 'siprs-for-reverse');
const targetAvailable = existsSync(REVERSE_ROOT);

/**
 * Where the integration runs stop.
 *
 * R6.5 is the last stage R22-7 owns. P22-8 added R7 and R8 after it, so the
 * list no longer ends here and the assertion below changed with it. What the
 * original assertion protected is kept: every run in this file names its own
 * prefix rather than inheriting the default, so no stage added later can make
 * these runs silently cover more or less than they did.
 */
const THROUGH_R6_5 = 'r6.5';

/** A throwaway directory to publish into, so no test writes into the project. */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function scratchOutput() {
  const root = mkdtempSync(join(os.tmpdir(), 'wsp-r6-it-'));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/**
 * A population carrying all three claim families.
 *
 * One boundary crossing, one asserted condition and one error return, so the
 * plan has to select a technique for each subject kind rather than for one.
 */
const CLAIM_BEARING_TREE = Object.freeze({
  'src/api/login.rs': [
    'use crate::model::User;',
    '',
    'pub fn login(user: &User) -> Result<(), Error> {',
    '    assert!(!user.name.is_empty());',
    '    if user.name.len() > 64 {',
    '        return Err(Error::TooLong);',
    '    }',
    '    Ok(())',
    '}',
    '',
  ].join('\n'),
  'src/model.rs': [
    'pub struct User { pub name: String }',
    '',
  ].join('\n'),
});

test('IT-1: R6.5 is a declared stage, and the runs here pin their prefix explicitly', () => {
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
  assert.equal(ANALYSIS_STAGES.includes(THROUGH_R6_5), true);
  assert.equal(
    ANALYSIS_STAGES.indexOf('r6') < ANALYSIS_STAGES.indexOf(THROUGH_R6_5),
    true,
    'the stages before R6.5 are still ordered ahead of it',
  );
});

test('IT-1: a full run produces a plan in which every claim carries a plan identifier', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchOutput();
  try {
    const outcome = await analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R6_5 });

    assert.equal(existsSync(join(out.root, 'RED-RECONSTRUCTION-PLAN.json')), true);
    assert.equal(existsSync(join(out.root, 'COUNTEREXAMPLE-RESULTS.json')), true);
    assert.equal(existsSync(join(out.root, 'GENERATED-PROPERTIES.json')), true);

    const plan = JSON.parse(readFileSync(join(out.root, 'RED-RECONSTRUCTION-PLAN.json'), 'utf8'));
    assert.equal(plan.stage, 'r6');
    assert.equal(plan.entries.length, outcome.ledger.claims.length);
    assert.ok(plan.entries.length >= 3, `expected a claim per family, found ${plan.entries.length}`);
    for (const entry of plan.entries) {
      assert.match(entry.counterexample_plan_id, /^cxp-/);
      assert.equal(entry.target.kind, 'isolated_environment', 'no plan may target production state');
      assert.equal(typeof entry.expected_red, 'string');
      assert.ok(entry.expected_red.length > 0);
      assert.equal(entry.executable, false, 'no sandbox exists in this run, and the plan says so');
    }
    const techniques = new Set(plan.entries.map((entry) => entry.technique));
    for (const technique of techniques) {
      assert.notEqual(technique, null, 'every claim in this population has an applicable technique');
    }
    assert.equal(plan.environment.available, false);
    assert.ok(plan.unavailable.some((line) => /P22-19/.test(line)));
  } finally {
    tree.dispose();
    out.dispose();
  }
});

/**
 * An executor that removes the asserted condition inside the worktree, then asks
 * the fixture whether it survived.
 *
 * The observation is read from a command run inside the checkout the isolation
 * made rather than asserted by the test, so the boolean the analysis records is
 * evidence about that checkout.
 */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
async function breakApiCarrier({ worktreePath }) {
  const carrier = join(worktreePath, 'src/api/login.rs');
  writeFileSync(carrier, readFileSync(carrier, 'utf8').replace('assert!(!user.name.is_empty());', 'assert!(true);'));
  const check = spawnSync(
    process.execPath,
    ['-e', 'const fs=require("fs");process.exit(fs.readFileSync("src/api/login.rs","utf8").includes("assert!(!user.name.is_empty())")?0:1)'],
    { cwd: worktreePath, encoding: 'utf8' },
  );
  return {
    redProved: check.status !== 0,
    observations: [`the condition at src/api/login.rs:4 was removed and the check exited ${check.status}`],
  };
}

test('IT-2: the run derives the counterexample set from the plan rather than manufacturing it empty', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchOutput();
  try {
    const outcome = await analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R6_5 });
    const plan = JSON.parse(readFileSync(join(out.root, 'RED-RECONSTRUCTION-PLAN.json'), 'utf8'));
    const results = JSON.parse(readFileSync(join(out.root, 'COUNTEREXAMPLE-RESULTS.json'), 'utf8'));

    assert.equal(results.stage, 'r6.5');
    // The assertion that would have failed before this ticket: R6.5 was handed a
    // literal empty array, so this document read `{empty: true, applied: []}`
    // over a plan carrying one entry per claim.
    assert.equal(results.derivedCount, plan.entries.length);
    assert.ok(results.derivedCount > 0, `expected a counterexample per planned claim, found ${results.derivedCount}`);
    assert.equal(results.empty, false, 'the plan was not empty, so neither is the derived set');
    assert.equal(results.applied.length, results.derivedCount, 'every derived counterexample appears exactly once');
    assert.equal(results.executedCount + results.refusedCount, results.derivedCount);

    // This run supplies no executor, and that is a result rather than a gap.
    assert.equal(results.executedCount, 0);
    assert.equal(results.refusedCount, results.derivedCount);
    assert.equal(results.refusedByReason['executor-missing'], results.derivedCount);
    for (const record of results.applied) {
      assert.equal(record.status, 'nothing-to-execute');
      assert.equal(record.verdict, null, 'we could not test it is not we tested it and it held');
      assert.equal(record.reason, 'executor-missing');
      assert.equal(typeof record.invariant, 'string', 'each record names the invariant the counterexample targeted');
    }
    assert.deepEqual(results.worktrees, [], 'nothing ran, so no worktree was made and none was left behind');
    assert.deepEqual(results.revisions, []);
    assert.equal(results.verdict, null, 'a stage that executed nothing concludes nothing');
    assert.equal(outcome.counterexamples.ledger.verdict, null);
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT-2: an executed counterexample flows back and revises the claim it bears on', async () => {
  const tree = createGitBackedTree(CLAIM_BEARING_TREE);
  const out = scratchOutput();
  try {
    const outcome = await analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R6_5, options: { reconstruction: { executor: breakApiCarrier } } });
    const plan = JSON.parse(readFileSync(join(out.root, 'RED-RECONSTRUCTION-PLAN.json'), 'utf8'));
    const results = JSON.parse(readFileSync(join(out.root, 'COUNTEREXAMPLE-RESULTS.json'), 'utf8'));

    assert.equal(results.executedCount, plan.entries.length, 'every planned claim was executed in its own worktree');
    assert.equal(results.refusedCount, 0);
    assert.equal(results.empty, false);
    for (const record of results.applied) {
      assert.equal(record.status, 'executed');
      assert.equal(record.verdict, 'not-proved', 'the condition was removed and the check noticed, so the claim did not hold');
      assert.equal(record.observed, 'red');
      assert.equal(record.worktreeRecord.restorationOutcome, 'destroyed');
    }
    assert.equal(results.worktrees.length, plan.entries.length);
    assert.equal(results.worktrees.every((record) => record.restorationOutcome === 'destroyed'), true);

    const entry = plan.entries[0];
    const revision = results.revisions.find((item) => item.claim_id === entry.claim_id);
    assert.ok(revision, 'the red reached the claim it bears on');
    assert.ok(['retracted', 'split'].includes(revision.revision));
    assert.equal(results.verdict, null, 'the red is carried back without a verdict attached');
    assert.equal(
      JSON.stringify(results).includes('specification_error'),
      false,
      'a red failure is never automatically concluded to be a specification error',
    );
    assert.equal(outcome.counterexamples.ledger.verdict, null);
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT-2: a full run that created and destroyed worktrees leaves the fixture subject byte-identical', async () => {
  const tree = createGitBackedTree(CLAIM_BEARING_TREE);
  const out = scratchOutput();
  try {
    const before = hashTree(tree.root);
    await analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R6_5, options: { reconstruction: { executor: breakApiCarrier } } });
    const results = JSON.parse(readFileSync(join(out.root, 'COUNTEREXAMPLE-RESULTS.json'), 'utf8'));

    assert.ok(results.worktrees.length > 0, 'the run made at least one worktree, or there is nothing to check');
    // Digested here rather than read from the run's own comparison, so the two are
    // independent checks of the same property.
    assert.deepEqual(hashTree(tree.root), before, 'the subject the worktrees were cut from is byte-identical afterwards');
    assert.deepEqual(
      results.worktrees.filter((record) => record.restorationOutcome !== 'destroyed'),
      [],
      'a worktree that survived is reported, never silently left behind',
    );
    assert.deepEqual(
      results.worktrees.filter((record) => existsSync(record.scratchBase)),
      [],
      'a released scratch directory is gone from disk',
    );
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT-1: properties are recorded as not generated while no category has been read', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchOutput();
  try {
    await analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R6_5 });
    const properties = JSON.parse(readFileSync(join(out.root, 'GENERATED-PROPERTIES.json'), 'utf8'));

    assert.equal(properties.generated.length, 0);
    assert.ok(properties.notGenerated.length > 0);
    for (const item of properties.notGenerated) {
      assert.equal(item.status, 'not_generated');
      assert.ok(item.reason.length > 0);
      assert.equal('verified' in item, false);
    }
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT-1: over the real experiment input, every claim carries a plan identifier', { skip: !targetAvailable }, async () => {
  const out = scratchOutput();
  try {
    const outcome = await analyzeProject({ root: REVERSE_ROOT, out: out.root, through: THROUGH_R6_5 });
    const plan = JSON.parse(readFileSync(join(out.root, 'RED-RECONSTRUCTION-PLAN.json'), 'utf8'));

    assert.equal(plan.entries.length, outcome.ledger.claims.length);
    assert.ok(plan.entries.length > 1000, `expected the real population, found ${plan.entries.length}`);
    assert.equal(plan.entries.every((entry) => /^cxp-/.test(entry.counterexample_plan_id)), true);
    assert.equal(plan.entries.every((entry) => entry.target.kind === 'isolated_environment'), true);
    assert.equal(plan.unassigned.length, 0, 'every subject kind in this population selects a technique');
    assert.equal(plan.oracle_independence_counts.strong, 0, 'none of these oracles can falsify the implementation yet');
  } finally {
    out.dispose();
  }
});

test('IT-3: the forward rotation still reproduces every frozen value', () => {
  const result = checkBaselines({ projectRoot: PROJECT_ROOT });
  assert.equal(result.verdict, 'proved', 'no backward step may change forward-rotation behaviour');
});
