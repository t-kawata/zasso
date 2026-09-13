// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
/**
 * R6.5's execution channel — derive, run, record.
 *
 * N2 measured `scope.mjs` handing R6.5 a **literal empty array**: the published
 * `COUNTEREXAMPLE-RESULTS.json` was `{empty: true, applied: []}` over a plan
 * holding one entry per claim, so the falsification stage falsified nothing while
 * publishing a document that read as a result.
 *
 * Three claims are held apart here, and they are the three the design fixes.
 *
 * The input is **derived** from R6's plan, so a non-empty plan cannot produce an
 * empty input, and the emptiness of the *plan* is a different statement from the
 * emptiness of a *stage that ran nothing*.
 *
 * The execution is **isolated**: every counterexample runs inside a disposable
 * git worktree, the guarded tree is digested before and after, and the worktree is
 * destroyed — or its survival is recorded with the reason rather than smoothed
 * over.
 *
 * The record is **complete**: one entry per derived counterexample, whatever
 * happened to it. A refusal carries its reason code and never a verdict, because
 * "we could not test it" and "we tested it and it held" are different facts, and
 * the machine says only `proved` or `not-proved` about the claim.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  PASS_STATUSES,
  REASON_CODES,
  REASON_EXECUTOR_MISSING,
  REASON_INVALID_EXECUTION_RESULT,
  REASON_PLAN_ID_MISSING,
  RED_NOT_PROVED,
  RED_PROVED,
  RED_VERDICTS,
  deriveCounterexamples,
  isReconstructionEntry,
  runCounterexamples,
} from '../../../.claude/scripts/workspacify-reverse/lib/counterexample-run.mjs';
import { OBSERVED_RED } from '../../../.claude/scripts/workspacify-reverse/lib/counterexample.mjs';
import { createGitBackedTree, hashTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const COUNTEREXAMPLE_RUN_MODULE = join(
  PROJECT_ROOT,
  '.claude/scripts/workspacify-reverse/lib/counterexample-run.mjs',
);

// --- Fixtures -------------------------------------------------------------------

/** A ledger in the shape R3.5 emits, reduced to what the channel reads. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function ledgerWith(...claimIds) {
  return {
    root: '/tmp/subject',
    claims: claimIds.map((claim_id, index) => ({
      claim_id,
      subjectKind: 'invariant',
      claim_type: 'inferred',
      statement: `the condition asserted at src/a.rs:${index + 1} holds`,
      evidence: [{ evidence_id: `ev-${index}`, source_span: { file: 'src/a.rs', line: index + 1 } }],
      falsification: `mutate the asserted condition at src/a.rs:${index + 1} and observe whether any test fails`,
    })),
  };
}

const LEDGER = ledgerWith('clm-a', 'clm-b', 'clm-c', 'clm-d');

/** One plan entry, in the shape `planRedReconstruction` emits. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function ticket({ claim_id, plan_id, technique = 'mutation', line = 1 }) {
  return {
    claim_id,
    technique,
    technique_basis: 'claim_falsification',
    target: { kind: 'isolated_environment', ref: 'isolated/src/a.rs', carrier: `src/a.rs:${line}` },
    expected_red: `mutate the asserted condition at src/a.rs:${line} and observe whether any test fails`,
    counterexample_plan_id: plan_id,
  };
}

/** A plan carrying three reconstruction tickets and one entry that carries none. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function planWithThree() {
  return {
    stage: 'r6',
    environment: { available: false },
    entries: [
      ticket({ claim_id: 'clm-a', plan_id: 'cxp-a-mutation-1', line: 1 }),
      ticket({ claim_id: 'clm-b', plan_id: 'cxp-a-negative_test-2', technique: 'negative_test', line: 2 }),
      ticket({ claim_id: 'clm-c', plan_id: 'cxp-a-property-3', technique: 'property', line: 3 }),
      { ...ticket({ claim_id: 'clm-d', plan_id: '', line: 4 }), counterexample_plan_id: '' },
    ],
  };
}

/** A subject the isolation can cut a worktree from. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function gitSubject() {
  return createGitBackedTree({
    'package.json': '{"name":"mini"}\n',
    'src/a.rs': 'pub fn a() -> bool { true }\n',
  }, { prefix: 'wsp-p23-7-unit-' });
}

/** The command the fixture subject answers: it fails exactly when the carrier was broken. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function runFixtureCheck(worktreePath) {
  return spawnSync(
    process.execPath,
    ['-e', 'const fs=require("fs");process.exit(fs.readFileSync("src/a.rs","utf8").includes("false")?1:0)'],
    { cwd: worktreePath, encoding: 'utf8' },
  );
}

/** An executor that breaks the carrier and reports the red it observed. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
async function breakingExecutor({ worktreePath }) {
  writeFileSync(join(worktreePath, 'src/a.rs'), 'pub fn a() -> bool { false }\n');
  const check = runFixtureCheck(worktreePath);
  return {
    redProved: check.status !== 0,
    observations: [`the carrier at ${worktreePath} was broken and the check exited ${check.status}`],
  };
}

/** An executor that runs the check without touching the carrier. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
async function quietExecutor({ worktreePath }) {
  const check = runFixtureCheck(worktreePath);
  return {
    redProved: check.status !== 0,
    observations: [`the carrier was left alone and the check exited ${check.status}`],
  };
}

/** An executor that throws, as a missing tool or an unreadable carrier would. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
async function throwingExecutor() {
  throw new Error('the carrier could not be rewritten');
}

// --- C001 — the derivation ------------------------------------------------------

test('C001 precondition: an entry is a reconstruction ticket exactly when it carries a plan identifier', () => {
  assert.equal(isReconstructionEntry(ticket({ claim_id: 'clm-a', plan_id: 'cxp-a-mutation-1' })), true);
  assert.equal(isReconstructionEntry({ claim_id: 'clm-a' }), false);
  assert.equal(isReconstructionEntry({ claim_id: 'clm-a', counterexample_plan_id: '' }), false, 'an empty identifier is not an identifier');
  assert.equal(isReconstructionEntry({ claim_id: 'clm-a', counterexample_plan_id: '   ' }), false);
  assert.equal(isReconstructionEntry(null), false);
});

test('C001 postcondition: three reconstruction tickets derive three counterexamples, each naming its claim and its invariant', () => {
  const derived = deriveCounterexamples({ redPlan: planWithThree(), ledger: LEDGER });

  assert.equal(derived.length, 3, 'the entry carrying no plan identifier is not a reconstruction ticket');
  assert.deepEqual(derived.map((entry) => entry.claim_id), ['clm-a', 'clm-b', 'clm-c']);
  assert.deepEqual(
    derived.map((entry) => entry.counterexample_plan_id),
    ['cxp-a-mutation-1', 'cxp-a-negative_test-2', 'cxp-a-property-3'],
  );
  assert.equal(derived[0].invariant, LEDGER.claims[0].falsification, 'the invariant the counterexample targets travels with it');
  assert.equal(derived[0].technique, 'mutation');
  assert.equal(derived[0].carrier, 'src/a.rs:1');
  assert.equal(Object.isFrozen(derived), true, 'the derived set is a value, not a working array');
  for (const entry of derived) assert.equal(Object.isFrozen(entry), true);
});

test('C001 postcondition: the derivation refuses a plan it cannot read, rather than deriving nothing from it', () => {
  assert.throws(() => deriveCounterexamples({ redPlan: null, ledger: LEDGER }), /plan/);
  assert.throws(() => deriveCounterexamples({ redPlan: { stage: 'r6' }, ledger: LEDGER }), /entries/);
  assert.throws(() => deriveCounterexamples({ redPlan: planWithThree(), ledger: null }), /ledger/);
  assert.throws(() => deriveCounterexamples({ redPlan: planWithThree(), ledger: {} }), /ledger/);
  assert.throws(
    () => deriveCounterexamples({ redPlan: planWithThree(), ledger: { claims: [] } }),
    /clm-a/,
    'a ledger holding no claim cannot have a counterexample derived against it',
  );
  assert.throws(
    () => deriveCounterexamples({ redPlan: planWithThree(), ledger: ledgerWith('clm-b') }),
    /clm-a/,
    'a counterexample naming a claim the ledger does not hold must be refused, not derived',
  );
});

test('C001 invariant: a non-empty plan never derives an empty set, and an empty plan states that the plan was empty', () => {
  // The assertion that would have caught N2 when it was introduced: R6.5's input
  // comes from the plan, so the two can only be empty together.
  assert.deepEqual(deriveCounterexamples({ redPlan: { stage: 'r6', entries: [] }, ledger: LEDGER }), []);
  assert.equal(deriveCounterexamples({ redPlan: planWithThree(), ledger: LEDGER }).length > 0, true);

  for (let size = 1; size <= 20; size += 1) {
    const entries = Array.from({ length: size }, (_unused, index) => (
      ticket({ claim_id: LEDGER.claims[index % LEDGER.claims.length].claim_id, plan_id: `cxp-${index}`, line: index + 1 })
    ));
    const derived = deriveCounterexamples({ redPlan: { stage: 'r6', entries }, ledger: LEDGER });
    assert.equal(derived.length, size, `a plan of ${size} entries derives ${size} counterexamples`);
  }
});

test('C001 boundary: two entries sharing a plan identifier stay two entries', () => {
  const shared = deriveCounterexamples({
    redPlan: {
      stage: 'r6',
      entries: [
        ticket({ claim_id: 'clm-a', plan_id: 'cxp-shared-1', line: 1 }),
        ticket({ claim_id: 'clm-b', plan_id: 'cxp-shared-1', line: 1 }),
      ],
    },
    ledger: LEDGER,
  });

  assert.equal(shared.length, 2, 'a plan identifier is not a primary key');
  assert.equal(shared[0].counterexample_plan_id, shared[1].counterexample_plan_id);
  assert.notEqual(shared[0].claim_id, shared[1].claim_id);
});

// --- C002 — the isolation -------------------------------------------------------

test('C002 postcondition: an executed counterexample runs in a disposable worktree that is destroyed afterwards', async () => {
  const tree = gitSubject();
  try {
    const derived = deriveCounterexamples({ redPlan: planWithThree(), ledger: LEDGER });
    const pass = await runCounterexamples({ root: tree.root, counterexamples: derived, execute: breakingExecutor });

    assert.equal(pass.status, 'executed');
    assert.equal(pass.counts.executedCount, 3);
    assert.equal(pass.counts.refusedCount, 0);
    assert.equal(pass.executed.length, 3);

    for (const record of pass.executed) {
      assert.equal(record.status, 'executed');
      assert.equal(record.worktreeRecord.restorationOutcome, 'destroyed');
      assert.equal(record.worktreeRecord.mainTreeDigest.unchanged, true, 'the guarded tree did not move');
      assert.equal(record.worktreeRecord.mainTreeCleanAtCreation, true);
      assert.equal(existsSync(record.worktreeRecord.worktreePath), false, 'a destroyed worktree is gone from disk');
      assert.equal(existsSync(record.worktreeRecord.scratchBase), false, 'a released scratch directory is gone');
      assert.equal(record.observations.length, 1);
    }
    assert.notEqual(pass.executed[0].worktreeRecord.worktreePath, pass.executed[1].worktreeRecord.worktreePath, 'each counterexample gets its own worktree');
  } finally {
    tree.dispose();
  }
});

test('C002 invariant: the subject is byte-identical after the pass, checked independently of the isolation', async () => {
  const tree = gitSubject();
  try {
    const before = hashTree(tree.root);
    const derived = deriveCounterexamples({ redPlan: planWithThree(), ledger: LEDGER });
    const pass = await runCounterexamples({ root: tree.root, counterexamples: derived, execute: breakingExecutor });

    assert.deepEqual(hashTree(tree.root), before, 'the worktree was cut from this tree and never wrote back to it');
    assert.equal(pass.worktrees.every((record) => record.restorationOutcome === 'destroyed'), true);
  } finally {
    tree.dispose();
  }
});

test('C002 error: a guarded tree that moved fails the pass loudly rather than publishing observations taken against it', async () => {
  const tree = gitSubject();
  try {
    const derived = deriveCounterexamples({ redPlan: planWithThree(), ledger: LEDGER });

    await assert.rejects(
      () => runCounterexamples({
        root: tree.root,
        counterexamples: derived.slice(0, 1),
        execute: async ({ worktreePath }) => {
          writeFileSync(join(tree.root, 'src/a.rs'), 'pub fn a() -> bool { false }\n');
          return { redProved: true, observations: [worktreePath] };
        },
      }),
      (error) => {
        assert.equal(error.reason, 'main-tree-modified');
        assert.ok(error.outcome.mainTreeDigest.changedPaths.length > 0, 'the digest pair is stated');
        return true;
      },
    );
  } finally {
    tree.dispose();
  }
});

test('C002 boundary: a subject that is not a git working tree is refused rather than run against the main tree', async () => {
  const scratch = mkdtempSync(join(os.tmpdir(), 'wsp-p23-7-nogit-'));
  try {
    writeFileSync(join(scratch, 'src-a.rs'), 'pub fn a() -> bool { true }\n');
    const derived = deriveCounterexamples({ redPlan: planWithThree(), ledger: LEDGER }).slice(0, 1);

    await assert.rejects(
      () => runCounterexamples({ root: scratch, counterexamples: derived, execute: breakingExecutor }),
      /not inside a git working tree/,
      'the alternative to running isolated is not running at all',
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

// --- C003 — the vocabulary ------------------------------------------------------

test('C003 postcondition: the red appearing carries not-proved and the red not appearing carries proved', async () => {
  const tree = gitSubject();
  try {
    const derived = deriveCounterexamples({ redPlan: planWithThree(), ledger: LEDGER }).slice(0, 1);

    const falsified = await runCounterexamples({ root: tree.root, counterexamples: derived, execute: breakingExecutor });
    assert.equal(falsified.executed[0].verdict, RED_NOT_PROVED, 'the check failed once the carrier was broken, so the claim did not hold');
    assert.equal(falsified.executed[0].observed, OBSERVED_RED, 'the observation the reverse edge reads is carried forward');

    const held = await runCounterexamples({ root: tree.root, counterexamples: derived, execute: quietExecutor });
    assert.equal(held.executed[0].verdict, RED_PROVED, 'the check passed, so the claim held under this counterexample');
  } finally {
    tree.dispose();
  }
});

test('C003 postcondition: every entry carries a status from the declared two, and the counts name how many of each', async () => {
  const tree = gitSubject();
  try {
    const derived = deriveCounterexamples({ redPlan: planWithThree(), ledger: LEDGER });
    const pass = await runCounterexamples({ root: tree.root, counterexamples: derived, execute: breakingExecutor });

    for (const record of [...pass.executed, ...pass.refused]) {
      assert.equal(PASS_STATUSES.includes(record.status), true, `unknown status ${record.status}`);
    }
    assert.equal(pass.executed.every((record) => record.reason === null), true, 'an executed counterexample carries no refusal reason');
    assert.equal(pass.counts.derivedCount, 3);
    assert.equal(pass.counts.executedCount + pass.counts.refusedCount, pass.counts.derivedCount);
    assert.deepEqual(pass.counts.refusedByReason, { 'plan-id-missing': 0, 'executor-missing': 0, 'invalid-execution-result': 0 });
  } finally {
    tree.dispose();
  }
});

test('C003 invariant: the result says only proved or not-proved, and never carries a success or failure boolean', async () => {
  const tree = gitSubject();
  try {
    const derived = deriveCounterexamples({ redPlan: planWithThree(), ledger: LEDGER });
    const pass = await runCounterexamples({ root: tree.root, counterexamples: derived, execute: breakingExecutor });

    assert.deepEqual([...RED_VERDICTS].sort(), ['not-proved', 'proved']);
    assert.equal(RED_PROVED, 'proved');
    assert.equal(RED_NOT_PROVED, 'not-proved');
    assert.deepEqual([...PASS_STATUSES].sort(), ['executed', 'nothing-to-execute']);
    assert.deepEqual([...REASON_CODES].sort(), ['executor-missing', 'invalid-execution-result', 'plan-id-missing']);

    const published = JSON.parse(JSON.stringify({ applied: [...pass.executed, ...pass.refused] }));
    const keys = [];
    const walk = (value) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value === null || typeof value !== 'object') return;
      for (const [key, nested] of Object.entries(value)) { keys.push(key); walk(nested); }
    };
    walk(published);
    for (const key of keys) {
      assert.equal(/success|failed|pass|score|redproved/i.test(key), false, `the machine may not say ${key}`);
    }
    for (const entry of published.applied) {
      assert.equal(entry.verdict === null || RED_VERDICTS.includes(entry.verdict), true);
      assert.equal(entry.reason === null || REASON_CODES.includes(entry.reason), true);
    }
    assert.equal(typeof pass.verdict !== 'boolean', true, 'no aggregate verdict over the set is computed');
  } finally {
    tree.dispose();
  }
});

test('C003 invariant: the analysis layer re-declares the vocabulary it may not import, and the two declarations name the same values', async () => {
  const conver = await import('../../../.claude/scripts/conver/red-reconstruction.js');

  assert.deepEqual([...RED_VERDICTS], [...conver.RED_VERDICTS]);
  assert.deepEqual([...PASS_STATUSES], [...conver.PASS_STATUSES]);
  assert.deepEqual([...REASON_CODES], [...conver.RED_REASONS]);
  assert.equal(conver.RED_PROVED, RED_PROVED);
  assert.equal(conver.RED_NOT_PROVED, RED_NOT_PROVED);
});

test('C003 precondition: the isolation reason this module names is one the isolation declares', async () => {
  const isolation = await import('../../../.claude/scripts/workspacify-reverse/lib/worktree-isolation.mjs');

  assert.equal(
    isolation.WORKTREE_REASONS.includes('execution-failed'),
    true,
    'the reason a failing executor is told apart from a failing isolation must stay in the isolation vocabulary',
  );
  assert.deepEqual([...isolation.RESTORATION_OUTCOMES].sort(), ['destroyed', 'failed']);
});

test('C003 invariant: the analysis path reaches the isolation this tree owns and never the loop that drives it', () => {
  const source = readFileSync(COUNTEREXAMPLE_RUN_MODULE, 'utf8');
  const specifiers = [...source.matchAll(/(?:from\s+|require\s*\(|import\s*\()\s*['"](\.[^'"]+)['"]/g)].map((match) => match[1]);

  assert.deepEqual(
    specifiers.filter((specifier) => specifier.includes('conver/')),
    [],
    'an edge into the caller would make the analysis depend on the loop it exists to feed',
  );
  assert.equal(specifiers.includes('./worktree-isolation.mjs'), true, 'the execution is reached through the module this tree owns');
});

// --- C004 — the refusal ---------------------------------------------------------

test('C004 precondition: an entry with no plan identifier is refused before anything runs, and stays in the set', async () => {
  const tree = gitSubject();
  try {
    const refused = await runCounterexamples({
      root: tree.root,
      counterexamples: [{ claim_id: 'clm-a', counterexample_plan_id: null, invariant: 'the condition holds' }],
      execute: breakingExecutor,
    });

    assert.equal(refused.executed.length, 0);
    assert.equal(refused.refused.length, 1);
    assert.equal(refused.refused[0].claim_id, 'clm-a');
    assert.equal(refused.refused[0].reason, REASON_PLAN_ID_MISSING);
    assert.equal(refused.refused[0].status, 'nothing-to-execute');
    assert.equal(refused.refused[0].verdict, null, 'we could not test it is not we tested it and it held');
    assert.ok(refused.refused[0].detail.length > 0);
    assert.equal(refused.counts.refusedByReason[REASON_PLAN_ID_MISSING], 1);
    assert.equal(refused.counts.derivedCount, 1, 'a refusal does not shrink the set');
  } finally {
    tree.dispose();
  }
});

test('C004 precondition: a pass with no executor refuses every entry with the reason that names what is missing', async () => {
  const tree = gitSubject();
  try {
    const derived = deriveCounterexamples({ redPlan: planWithThree(), ledger: LEDGER });
    const refused = await runCounterexamples({ root: tree.root, counterexamples: derived });

    assert.equal(refused.status, 'executed', 'the pass had counterexamples to run; the per-entry status says none of them ran');
    assert.equal(refused.counts.executedCount, 0);
    assert.equal(refused.counts.refusedCount, 3);
    assert.equal(refused.counts.derivedCount, 3, 'the derived count is unchanged by the refusal');
    for (const record of refused.refused) {
      assert.equal(record.reason, REASON_EXECUTOR_MISSING);
      assert.equal(record.verdict, null);
    }
  } finally {
    tree.dispose();
  }
});

test('C004 error: an executor that throws is recorded and the pass continues rather than stopping', async () => {
  const tree = gitSubject();
  try {
    const derived = deriveCounterexamples({ redPlan: planWithThree(), ledger: LEDGER });
    const pass = await runCounterexamples({ root: tree.root, counterexamples: derived, execute: throwingExecutor });

    assert.equal(pass.status, 'executed', 'the pass ran; a refusal is a finding, not a stage failure');
    assert.equal(pass.counts.refusedCount, 3);
    assert.equal(pass.counts.executedCount, 0);
    for (const record of pass.refused) {
      assert.equal(record.reason, REASON_INVALID_EXECUTION_RESULT);
      assert.match(record.detail, /could not be rewritten/, 'the thrown message is carried, not swallowed');
      assert.equal(record.verdict, null);
    }
    assert.equal(pass.counts.refusedByReason[REASON_INVALID_EXECUTION_RESULT], 3);
  } finally {
    tree.dispose();
  }
});

test('C004 boundary: an execution that states no answer is refused rather than read as a verdict', async () => {
  const tree = gitSubject();
  try {
    const derived = deriveCounterexamples({ redPlan: planWithThree(), ledger: LEDGER }).slice(0, 1);

    for (const silent of [async () => ({ observations: [] }), async () => ({}), async () => null, async () => 7]) {
      const pass = await runCounterexamples({ root: tree.root, counterexamples: derived, execute: silent });
      assert.equal(pass.refused[0].reason, REASON_INVALID_EXECUTION_RESULT, 'an unstated answer is not an answer');
      assert.equal(pass.refused[0].verdict, null);
      // The execution ran even though its answer could not be read, so its worktree
      // was made, digested and destroyed — and that record is not discarded.
      assert.equal(pass.refused[0].worktreeRecord.restorationOutcome, 'destroyed');
      assert.equal(pass.refused[0].worktreeRecord.mainTreeDigest.unchanged, true);
      assert.equal(pass.worktrees.length, 1, 'a worktree that ran is reported even when its answer was refused');
    }
  } finally {
    tree.dispose();
  }
});

test('C004 boundary: an empty derived set is reported as an empty set, and the pass runs nothing', async () => {
  const tree = gitSubject();
  try {
    const pass = await runCounterexamples({ root: tree.root, counterexamples: [], execute: breakingExecutor });

    assert.equal(pass.status, 'nothing-to-execute');
    assert.equal(pass.empty, true);
    assert.deepEqual(pass.executed, []);
    assert.deepEqual(pass.refused, []);
    assert.equal(pass.counts.derivedCount, 0);
    assert.ok(pass.caveat.length > 0);
  } finally {
    tree.dispose();
  }
});

test('C001 invariant: the same plan over the same subject produces the same verdicts', async () => {
  const tree = gitSubject();
  try {
    const derived = deriveCounterexamples({ redPlan: planWithThree(), ledger: LEDGER });
    const first = await runCounterexamples({ root: tree.root, counterexamples: derived, execute: breakingExecutor });
    const second = await runCounterexamples({ root: tree.root, counterexamples: derived, execute: breakingExecutor });

    assert.deepEqual(
      first.executed.map((record) => record.verdict),
      second.executed.map((record) => record.verdict),
      'the channel is deterministic given a deterministic fixture',
    );
  } finally {
    tree.dispose();
  }
});
