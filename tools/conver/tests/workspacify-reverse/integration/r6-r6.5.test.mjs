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
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANALYSIS_STAGES, analyzeProject } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { applyCounterexamples } from '../../../.claude/scripts/workspacify-reverse/lib/counterexample.mjs';
import { checkBaselines } from '../../../.claude/scripts/workspacify-reverse/lib/regression-gate.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

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
    const outcome = analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R6_5 });

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

test('IT-2: the run records the counterexample set as empty rather than omitting the stage', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchOutput();
  try {
    const outcome = analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R6_5 });
    const results = JSON.parse(readFileSync(join(out.root, 'COUNTEREXAMPLE-RESULTS.json'), 'utf8'));

    assert.equal(results.stage, 'r6.5');
    assert.equal(results.empty, true);
    assert.deepEqual(results.applied, []);
    assert.deepEqual(results.revisions, []);
    assert.equal(results.verdict, null, 'a stage that ran nothing concludes nothing');
    assert.equal(outcome.counterexamples.ledger.verdict, null);
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT-2: a counterexample obtained later flows back and revises the claim it bears on', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchOutput();
  try {
    const outcome = analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R6_5 });
    const plan = JSON.parse(readFileSync(join(out.root, 'RED-RECONSTRUCTION-PLAN.json'), 'utf8'));

    // Standing in for the execution P22-19 performs: the plan says which
    // observation would count against the claim, and the counterexample reports
    // that it happened.
    const entry = plan.entries[0];
    const result = applyCounterexamples([{
      counterexample_plan_id: entry.counterexample_plan_id,
      claim_id: entry.claim_id,
      observed: 'red',
      observation: `the observation at ${entry.target.carrier} was made and no test failed`,
    }], outcome.ledger);

    assert.equal(result.applied.length, 1);
    assert.equal(result.ledger.revisions.length, 1);
    assert.equal(result.ledger.revisions[0].claim_id, entry.claim_id);
    assert.ok(['retracted', 'split'].includes(result.ledger.revisions[0].revision));
    assert.equal(result.ledger.verdict, null, 'the red is carried back without a verdict attached');
    assert.equal(
      JSON.stringify(result.ledger).includes('specification_error'),
      false,
      'a red failure is never automatically concluded to be a specification error',
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
    analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R6_5 });
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

test('IT-1: over the real experiment input, every claim carries a plan identifier', { skip: !targetAvailable }, () => {
  const out = scratchOutput();
  try {
    const outcome = analyzeProject({ root: REVERSE_ROOT, out: out.root, through: THROUGH_R6_5 });
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
