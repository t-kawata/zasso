// @verifies C003
/**
 * E14 — the properties R6.5 generates, actually run.
 *
 * Generation without execution is the shape P23-7 recorded as a defect: a
 * document full of candidates that nothing ever ran presents a generated
 * artefact as a result. This module runs each generated property inside the same
 * disposable worktree the counterexample channel uses, so that both channels
 * share one isolation and neither touches the subject.
 *
 * A property that could not run is refused with its reason and **stays in the
 * set**. Dropping it would make the set look smaller and cleaner than the run
 * was, and would turn "we could not look here" into silence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PASS_EXECUTED, PASS_NOTHING_TO_EXECUTE, RED_NOT_PROVED, RED_PROVED } from '../../../.claude/scripts/workspacify-reverse/lib/counterexample.mjs';
import {
  PROPERTY_ENGINES,
  PROPERTY_REASON_ENGINE_CANNOT_EXPRESS,
  PROPERTY_REASON_ENGINE_UNAVAILABLE,
  PROPERTY_REASON_INVALID_EXECUTION_RESULT,
  PROPERTY_STATUSES,
  PROPERTY_VERDICTS,
  generatePropertyTests,
  renderPropertyForEngine,
  runGeneratedProperties,
} from '../../../.claude/scripts/workspacify-reverse/lib/property-tests.mjs';
import { createGitBackedTree, hashTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** A subject the isolation can open a git worktree over. */
const SUBJECT = Object.freeze({
  'Cargo.toml': '[package]\nname = "property-subject"\n',
  'src/lib.rs': 'pub fn add(a: i32, b: i32) -> i32 { a + b }\n',
});

/** The guard proposition every case below is generated from. */
const GUARD_PROPOSITION = 'the guard accepts exactly the values inside it';

/** One generated property in one language, with the predicate an engine can falsify. */
function propertyFor(language) {
  return generatePropertyTests([{
    proposition: GUARD_PROPOSITION,
    source_fact: 'src/widget.rs:12',
    category: 'boundary_guard',
    predicate: 'value >= 0',
    language,
  }]).generated[0];
}

/**
 * The same property with no predicate.
 *
 * This is the ordinary shape: R3's material states propositions, and a
 * proposition is not an assertion an engine can be asked to falsify. The renderer
 * refuses it by name rather than inventing a predicate nobody wrote.
 */
function unexpressibleFor(language) {
  return generatePropertyTests([{
    proposition: GUARD_PROPOSITION,
    source_fact: 'src/widget.rs:12',
    category: 'boundary_guard',
    language,
  }]).generated[0];
}

// ---------------------------------------------------------------------------
// C003 postcondition — generated and executed are reported separately
// ---------------------------------------------------------------------------

test('UT: [Normal] C003 postcondition — a generated property with no engine executor is reported with its reason, and the counts stay separate', async () => {
  const generated = propertyFor('python');
  const run = await runGeneratedProperties({
    language: 'python',
    properties: [generated],
    engine: PROPERTY_ENGINES.python,
    execute: null,
  });

  assert.equal(run.counts.generatedCount, 1);
  assert.equal(run.counts.executedCount, 0);
  assert.equal(run.counts.refusedCount, 1);
  assert.equal(run.records[0].status, PASS_NOTHING_TO_EXECUTE);
  assert.equal(run.records[0].reason, PROPERTY_REASON_ENGINE_UNAVAILABLE);
  assert.match(run.records[0].detail, /hypothesis/);
  assert.equal(run.counts.executedCount + run.counts.refusedCount, run.counts.generatedCount);
  // `status` says whether the pass had anything to run, exactly as the
  // counterexample channel's does; the counts are what say none of them ran.
  assert.equal(run.status, PASS_EXECUTED);
  assert.equal(run.counts.executedCount, 0);
  assert.equal(Object.isFrozen(run.counts), true, 'the counts travel frozen, so a caller cannot adjust them after the fact');
});

test('UT: [Normal] C003 postcondition — an executed property runs in a disposable worktree and records a status and a verdict', async () => {
  const tree = createGitBackedTree(SUBJECT, { prefix: 'wsp-p24-5-proprun-' });
  const before = hashTree(tree.root);
  const generated = propertyFor('rust');

  const run = await runGeneratedProperties({
    root: tree.root,
    language: 'rust',
    properties: [generated],
    engine: PROPERTY_ENGINES.rust,
    execute: async ({ rendered, worktreePath }) => ({
      counterexampleFound: false,
      observations: [`${rendered.file} ran in ${worktreePath}`],
    }),
  });

  assert.equal(run.counts.executedCount, 1);
  assert.equal(run.counts.refusedCount, 0);
  assert.equal(run.records[0].status, PASS_EXECUTED);
  assert.equal(run.records[0].verdict, RED_NOT_PROVED);
  assert.equal(run.records[0].candidateFound, false);
  assert.equal(run.worktrees.length, 1);
  assert.equal(run.worktrees[0].restorationOutcome, 'destroyed');
  assert.deepEqual(hashTree(tree.root), before, 'the subject is byte-identical after the property run');
  assert.equal(existsSync(run.worktrees[0].worktreePath), false, 'the worktree is gone, not merely unused');
  tree.dispose();
});

test('UT: [Normal] C003 postcondition — a counterexample the engine found carries the other verdict, so both values are reached', async () => {
  const tree = createGitBackedTree(SUBJECT, { prefix: 'wsp-p24-5-propcex-' });
  const run = await runGeneratedProperties({
    root: tree.root,
    language: 'rust',
    properties: [propertyFor('rust')],
    engine: PROPERTY_ENGINES.rust,
    execute: async () => ({ counterexampleFound: true, observations: ['proptest shrank the input to zero'] }),
  });

  assert.equal(run.records[0].status, PASS_EXECUTED);
  assert.equal(run.records[0].verdict, RED_PROVED);
  assert.equal(run.records[0].candidateFound, true);
  assert.deepEqual([...PROPERTY_VERDICTS], [RED_PROVED, RED_NOT_PROVED], 'the verdicts are the counterexample channel\'s');
  tree.dispose();
});

test('UT: [Boundary] C003 boundary — an executed run that found no counterexample and a run that could not run are distinguishable', async () => {
  const tree = createGitBackedTree(SUBJECT, { prefix: 'wsp-p24-5-propb-' });
  const executed = await runGeneratedProperties({
    root: tree.root,
    language: 'go',
    properties: [propertyFor('go')],
    engine: PROPERTY_ENGINES.go,
    execute: async () => ({ counterexampleFound: false }),
  });
  const unrun = await runGeneratedProperties({
    root: tree.root,
    language: 'go',
    properties: [propertyFor('go')],
    engine: PROPERTY_ENGINES.go,
    execute: null,
  });

  assert.equal(executed.records[0].status, PASS_EXECUTED);
  assert.equal(executed.records[0].verdict, RED_NOT_PROVED);
  assert.equal(unrun.records[0].status, PASS_NOTHING_TO_EXECUTE);
  assert.equal(unrun.records[0].verdict, null, 'a property that did not run carries no verdict');
  assert.notEqual(executed.records[0].status, unrun.records[0].status);
  tree.dispose();
});

// ---------------------------------------------------------------------------
// C003 invariant — generation is never presented as verification
// ---------------------------------------------------------------------------

test('UT: [Invariant] C003 invariant — executed plus nothing-to-execute equals generated, over generated property sets', async () => {
  const tree = createGitBackedTree(SUBJECT, { prefix: 'wsp-p24-5-propi-' });
  const template = propertyFor('rust');

  for (const size of [0, 1, 5, 20]) {
    const properties = Array.from({ length: size }, (_, index) => ({ ...template, property_id: `prop-${index}` }));
    const run = await runGeneratedProperties({
      root: tree.root,
      language: 'rust',
      properties,
      engine: PROPERTY_ENGINES.rust,
      execute: async ({ property }) => ({ counterexampleFound: property.property_id.endsWith('0') }),
    });

    assert.equal(run.counts.generatedCount, size);
    assert.equal(run.counts.executedCount + run.counts.refusedCount, size);
    assert.ok(run.counts.executedCount <= size && run.counts.refusedCount <= size);
    assert.equal(run.records.length, size, 'no property leaves the set');
  }
  tree.dispose();
});

test('UT: [Invariant] C003 invariant — the status and verdict vocabularies are the counterexample channel\'s, so the two cannot drift', () => {
  assert.deepEqual([...PROPERTY_STATUSES].sort(), [PASS_EXECUTED, PASS_NOTHING_TO_EXECUTE].sort());
  assert.deepEqual([...PROPERTY_VERDICTS].sort(), [RED_NOT_PROVED, RED_PROVED].sort());
  const source = readFileSync(join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/lib/property-tests.mjs'), 'utf8');
  assert.match(source, /from '\.\/counterexample\.mjs'/, 'the vocabularies are imported, not re-spelled');
});

test('UT: [Invariant] C003 invariant — every refused record carries a reason a reader can act on', async () => {
  const run = await runGeneratedProperties({
    language: 'c_cpp',
    properties: [propertyFor('c_cpp')],
    engine: PROPERTY_ENGINES.c_cpp,
    execute: null,
  });

  for (const record of run.records) {
    assert.equal(record.status, PASS_NOTHING_TO_EXECUTE);
    assert.equal(typeof record.reason, 'string');
    assert.equal(typeof record.detail, 'string');
    assert.ok(record.detail.length > 0, 'a refusal states what was missing');
    assert.match(record.detail, /RapidCheck/, 'the reason names the engine that is unavailable');
  }
  assert.equal(run.counts.refusedByReason[PROPERTY_REASON_ENGINE_UNAVAILABLE], 1);
});

// ---------------------------------------------------------------------------
// C003 error — an engine that cannot express a property is reported, not dropped
// ---------------------------------------------------------------------------

test('UT: [Error] C003 error — a property the engine cannot express is reported with its reason and still counted as generated', async () => {
  const tree = createGitBackedTree(SUBJECT, { prefix: 'wsp-p24-5-prope-' });
  const run = await runGeneratedProperties({
    root: tree.root,
    language: 'go',
    properties: [unexpressibleFor('go')],
    engine: PROPERTY_ENGINES.go,
    execute: async () => ({ counterexampleFound: false }),
  });

  assert.equal(run.counts.generatedCount, 1, 'a property that could not be written is still one that was generated');
  assert.equal(run.counts.refusedCount, 1);
  assert.equal(run.records[0].status, PASS_NOTHING_TO_EXECUTE);
  assert.equal(run.records[0].reason, PROPERTY_REASON_ENGINE_CANNOT_EXPRESS);
  assert.equal(run.counts.refusedByReason[PROPERTY_REASON_ENGINE_CANNOT_EXPRESS], 1);
  assert.match(run.records[0].detail, /predicate/);
  assert.equal(run.worktrees.length, 0, 'nothing was executed, so no worktree was made');
  tree.dispose();
});

test('UT: [Error] C003 error — an execution that states no answer is refused rather than read as a verdict', async () => {
  const tree = createGitBackedTree(SUBJECT, { prefix: 'wsp-p24-5-propn-' });
  const run = await runGeneratedProperties({
    root: tree.root,
    language: 'python',
    properties: [propertyFor('python')],
    engine: PROPERTY_ENGINES.python,
    execute: async () => ({ observations: ['hypothesis ran but said nothing'] }),
  });

  assert.equal(run.records[0].status, PASS_NOTHING_TO_EXECUTE);
  assert.equal(run.records[0].reason, PROPERTY_REASON_INVALID_EXECUTION_RESULT);
  assert.equal(run.records[0].verdict, null);
  assert.equal(run.records[0].worktreeRecord.restorationOutcome, 'destroyed', 'the worktree that was made is reported even when the answer is missing');
  tree.dispose();
});

test('UT: [Error] C003 error — an executor that throws is recorded and the pass continues rather than stopping', async () => {
  const tree = createGitBackedTree(SUBJECT, { prefix: 'wsp-p24-5-propthr-' });
  const run = await runGeneratedProperties({
    root: tree.root,
    language: 'typescript',
    properties: [propertyFor('typescript'), propertyFor('typescript')],
    engine: PROPERTY_ENGINES.typescript,
    execute: async () => { throw new Error('fast-check failed to start'); },
  });

  assert.equal(run.records.length, 2, 'a throwing execution does not remove the property from the set');
  assert.equal(run.counts.refusedCount, 2);
  assert.equal(run.records[0].reason, PROPERTY_REASON_INVALID_EXECUTION_RESULT);
  assert.match(run.records[0].detail, /fast-check failed to start/);
  tree.dispose();
});

test('UT: [Error] C003 precondition — an engine that is not the language\'s declared one is refused rather than substituted', async () => {
  await assert.rejects(
    () => runGeneratedProperties({ language: 'go', properties: [], engine: 'fast-check', execute: null }),
    /fast-check/,
  );
});

// ---------------------------------------------------------------------------
// C003 precondition — the renderer, one function per engine
// ---------------------------------------------------------------------------

test('UT: [Normal] C003 precondition — every declared engine renders a property in its own form', () => {
  const seen = new Set();
  for (const [language, engine] of Object.entries(PROPERTY_ENGINES)) {
    if (language === 'unknown') continue;
    const rendered = renderPropertyForEngine({ language, property: propertyFor(language), engine });
    assert.equal(rendered.engine, engine);
    assert.equal(rendered.language, language);
    assert.equal(typeof rendered.file, 'string');
    assert.equal(typeof rendered.source, 'string');
    assert.ok(rendered.source.includes(GUARD_PROPOSITION), `${engine} carries the proposition it was generated from`);
    seen.add(engine);
  }
  assert.equal(seen.size >= 5, true, 'the engines are not one renderer wearing six names');
});

test('UT: [Error] C003 precondition — an engine with no renderer is refused by name rather than rendered by a fallback', () => {
  assert.throws(
    () => renderPropertyForEngine({ language: 'go', property: propertyFor('go'), engine: 'cucumber' }),
    /cucumber/,
  );
  assert.throws(
    () => renderPropertyForEngine({ language: 'go', property: unexpressibleFor('go'), engine: 'rapid' }),
    /no predicate/,
  );
  // `fast-check` serves two languages and renders them differently, so the
  // renderer is looked up by language and engine together.
  const typescript = renderPropertyForEngine({ language: 'typescript', property: propertyFor('typescript'), engine: 'fast-check' });
  const javascript = renderPropertyForEngine({ language: 'javascript', property: propertyFor('javascript'), engine: 'fast-check' });
  assert.notEqual(typescript.file, javascript.file, 'one engine must not write one language into the other');
});
