// The ad-hoc surface, after the run that produced it (PX-244, contracts C001-C006).
//
// The scaffold was where the design put its one genuinely non-mechanical act: a defect
// class no declared check was written for needs a check that has never been written. But
// the check was executed once, at scaffold time, and never again. `checkAll` iterated the
// declared checks and nothing else, the checks gate compared the run against a constant,
// promotion was unreachable from the command line, and the rail-exit store resolved
// inside the tool tree — so one specification's records were read by every other
// specification's run, and the tool tree was written by a successful scaffold.
//
// A scaffolded check now joins the running check set on every later run, the expectation
// is derived from what was loaded, promotion is a proposal the command can print, and the
// store belongs to the run directory it describes.
//
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// @verifies C006
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ADHOC_DIRECTORY,
  ADHOC_REFUSALS,
  loadAdhocChecks,
  promoteRecord,
  promotionCandidates,
  railExitTemplate,
  readCasesFile,
  scaffoldCheck,
} from '../../.claude/scripts/educe-sequences/rail/adhoc.mjs';
import { CHECKS, checkAll, ENGINE_DECLARED_CHECK_COUNT } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { evaluateGate, PHASES, phaseById } from '../../.claude/scripts/educe-sequences/rail/gates.mjs';
import { digestOfTree, railExitStoreFor, readRailExits, writeRailExit, writeRailExits } from '../../.claude/scripts/educe-sequences/rail/harness.mjs';
import { assetDigestOf, inheritedFileNames } from '../../.claude/scripts/educe-sequences/rail/inherit.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { artifactPathFor } from '../../.claude/scripts/educe-sequences/rail/paths.mjs';
import { beginRun, buildContext, startRun } from '../../.claude/scripts/educe-sequences/rail/phases.mjs';
import { EXIT, runCommand } from '../../.claude/scripts/educe-sequences/rail/run.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PHASE_SCRIPT = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/phase.mjs');
const COMMAND_PATH = join(PROJECT_ROOT, '.claude/commands/educe-sequences.md');
const RAIL_DIRECTORY = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail');
const ENGINE_PATH = join(RAIL_DIRECTORY, 'engine.mjs');
const TOOL_ROOT = join(PROJECT_ROOT, '.claude/scripts/educe-sequences');
const SPEC_SOURCE = new URL('./fixtures/spec/ledger.md', import.meta.url).pathname;
const RUN_INPUT = JSON.parse(readFileSync(new URL('./fixtures/spec/ledger.run.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(new URL('./fixtures/spec/ledger-sequences.json', import.meta.url), 'utf8'));

const DEFECT = 'an entry that carries no outcome and was never adjudicated';
const CHECK_NAME = 'ledger-drift';

/** The reading the scaffolded check performs, and the perturbation that must redden it. */
const CHECK_BODY = `    return context.artifact.sequences
      .filter((entry) => entry.kind === 'entry' && entry.outcome === null)
      .map((entry) => ({ check: '${CHECK_NAME}', subject: entry.id, reason: 'an entry carries no outcome' }));`;
const CHECK_MUTATION = `    const next = structuredClone(artifact);
    next.sequences = next.sequences.map((entry) => (entry.kind === 'entry' ? { ...entry, outcome: null } : entry));
    return next;`;

/** A throwaway specification, so no test writes into the committed fixture. */
// [::TICKET::] PX-244, PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-244|PX-243) --for-spec --no-implementation-order`.
function scratchRun() {
  const root = mkdtempSync(join(tmpdir(), 'educe-adhoc-run-'));
  const specPath = join(root, 'ledger.md');
  copyFileSync(SPEC_SOURCE, specPath);
  return { root, specPath, spec: readSpecification(specPath), directory: join(root, 'educe-sequences') };
}

/**
 * Scaffold a check and fill its two bodies, which is what the author does by hand.
 *
 * The scaffold is used rather than a hand-written module so the module imports the
 * constructor library through the specifier the scaffold computes for a directory beside
 * the specification — the part of a scaffolded module that a hand-written one gets wrong.
 */
// [::TICKET::] PX-244, PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-244|PX-243) --for-spec --no-implementation-order`.
function scaffoldedRun({ record = true, check = CHECK_NAME, defect = DEFECT } = {}) {
  const scratch = scratchRun();
  const run = startRun({ specPath: scratch.specPath, spec: scratch.spec });
  const written = scaffoldCheck({ directory: run.directory, check, defect, refuses: 'an entry carrying no outcome' });
  assert.equal(written.ok, true, JSON.stringify(written.problems));
  writeFileSync(written.modulePath, readFileSync(written.modulePath, 'utf8')
    .replace(/\/\/ \[::STUB::\][^\n]*\n/g, '')
    .replace(/  run\(context\) \{[\s\S]*?\n  \},/, `  run(context) {\n${CHECK_BODY}\n  },`)
    .replace(/export const mutation = \(artifact\) => \{[\s\S]*?\n\};/, `export const mutation = (artifact) => {\n${CHECK_MUTATION}\n};`));
  if (record) {
    writeRailExit(railExitTemplate({
      check,
      defect,
      cases: readCasesFile(run.directory, check),
      executed: { reddened: true, attributable: true, counterGreen: true },
    }), railExitStoreFor(run.directory));
  }
  return { ...scratch, directory: run.directory, status: run.status };
}

/** Put an artifact and a declaration beside the specification, so the checks phase can read them. */
// [::TICKET::] PX-244, PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-244|PX-243) --for-spec --no-implementation-order`.
function seedRunDirectory(directory, spec, specPath) {
  writeFileSync(join(directory, 'declaration.json'), `${JSON.stringify(RUN_INPUT.declaration, null, 2)}\n`);
  const span = RUN_INPUT.readings.sequences.map((reading) => ({ ...reading, steps: [], operations: [] }));
  span[0].steps = RUN_INPUT.readings.steps;
  span[0].operations = RUN_INPUT.readings.operations;
  writeFileSync(join(directory, 'readings-span.jsonl'), `${span.map((reading) => JSON.stringify(reading)).join('\n')}\n`);
  writeFileSync(join(directory, 'readings-adjudicate.jsonl'), `${RUN_INPUT.readings.adjudications.map((reading) => JSON.stringify(reading)).join('\n')}\n`);
  writeFileSync(join(directory, 'readings-reroute.jsonl'), '\n');
  writeFileSync(join(directory, 'readings-adversarial.jsonl'), '\n');
  writeFileSync(join(directory, 'readings-inquest.jsonl'), `${RUN_INPUT.readings.inquest.map((reading) => JSON.stringify(reading)).join('\n')}\n`);
  writeFileSync(artifactPathFor(specPath), `${JSON.stringify(golden, null, 2)}\n`);
  return spec;
}

/** A record in the shape writeRailExit accepts, with a distinct id per check. */
// [::TICKET::] PX-244, PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-244|PX-243) --for-spec --no-implementation-order`.
function recordFor(check, overrides = {}) {
  return {
    id: `${check}#7`,
    check,
    noAnalogueInRecord: 'a defect class with no declared analogue',
    inputs: 'a subject carrying the defect',
    outputShape: 'one verdict naming this check',
    readBy: 'rail/adhoc.mjs runScaffoldCases',
    verifiedBy: `${check}-counter`,
    promoted: false,
    promotionCondition: 'promote when a second specification needs the same rule',
    executed: { reddened: true, attributable: true, counterGreen: true },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// C001 — the loaded checks enter the measured count
// ---------------------------------------------------------------------------

test('C001 a run with no ad-hoc modules counts exactly the engine checks', async () => {
  const { directory, spec } = scratchRun();

  const { checks, problems } = await loadAdhocChecks({ directory });

  assert.deepEqual(checks, []);
  assert.deepEqual(problems, []);
  const { summary } = checkAll({ specLines: spec.lines, artifact: golden, recorded: { adhocChecks: checks } });
  assert.equal(summary.checksAdhoc, 0);
  assert.equal(summary.checksDeclared, ENGINE_DECLARED_CHECK_COUNT);
  assert.equal(summary.checksRun, summary.checksDeclared);
});

test('C001 the ad-hoc checks enter the same list and the declared count follows what was loaded', () => {
  const extra = [
    { id: 'ledger-drift', run: (context) => context.artifact.sequences.filter((entry) => entry.kind === 'entry' && entry.outcome === null).map((entry) => ({ check: 'ledger-drift', subject: entry.id, reason: 'no outcome' })) },
    { id: 'row-shape', run: () => [] },
  ];

  const { verdicts, summary } = checkAll({ specLines: readSpecification(SPEC_SOURCE).lines, artifact: golden, recorded: { adhocChecks: extra } });

  assert.equal(summary.checksRun, ENGINE_DECLARED_CHECK_COUNT + extra.length);
  assert.equal(summary.checksDeclared, summary.checksRun);
  assert.equal(summary.checksAdhoc, extra.length);
  assert.equal(summary.checksDeclared - ENGINE_DECLARED_CHECK_COUNT, summary.checksAdhoc);
  assert.deepEqual(verdicts, [], 'both loaded checks are silent on correct work');
});

test('C001 a check object whose run is not a function is declared but never run, so the two counts part', () => {
  const { verdicts, summary } = checkAll({ specLines: readSpecification(SPEC_SOURCE).lines, artifact: golden, recorded: { adhocChecks: [{ id: 'no-body' }] } });

  assert.deepEqual(verdicts, [], 'the block is produced: the shortfall is a count, not a verdict');
  assert.equal(summary.checksDeclared, ENGINE_DECLARED_CHECK_COUNT + 1);
  assert.equal(summary.checksRun, ENGINE_DECLARED_CHECK_COUNT);
  assert.equal(summary.checksRun < summary.checksDeclared, true, 'a declared check that did not run is visible as the difference');
});

test('C001 a scaffolded check runs against the artifact, so its verdict reaches the block', () => {
  const { spec } = scratchRun();
  const drained = { ...golden, sequences: golden.sequences.map((entry) => (entry.kind === 'entry' ? { ...entry, outcome: null } : entry)) };

  const { verdicts, summary } = checkAll({
    specLines: spec.lines,
    artifact: drained,
    recorded: { adhocChecks: [{ id: CHECK_NAME, run: (context) => context.artifact.sequences.filter((entry) => entry.kind === 'entry' && entry.outcome === null).map((entry) => ({ check: CHECK_NAME, subject: entry.id, reason: 'an entry carries no outcome' })) }] },
  });

  assert.equal(summary, null);
  assert.equal(verdicts.some((verdict) => verdict.check === CHECK_NAME), true);
});

test('C001 the engine stays a function of values: no dynamic import, and its count is its own', () => {
  const source = readFileSync(ENGINE_PATH, 'utf8');

  assert.equal(/await import|import\(/.test(source), false, 'the caller loads the modules, not the engine');
  assert.equal(ENGINE_DECLARED_CHECK_COUNT, CHECKS.length);
  assert.equal(ENGINE_DECLARED_CHECK_COUNT, 17);
});

// ---------------------------------------------------------------------------
// C002 — the expectation is derived rather than constant
// ---------------------------------------------------------------------------

test('C002 the checks phase passes when the run matches what was declared, and refuses naming both numbers when it does not', async () => {
  const { specPath, spec, directory } = scaffoldedRun();
  seedRunDirectory(directory, spec, specPath);
  const loaded = await loadAdhocChecks({ directory });
  const context = buildContext({ specPath, spec, run: { directory, status: startRun({ specPath, spec }).status }, recorded: { adhocChecks: loaded.checks, railExits: [] } });

  const passed = evaluateGate(14, context);
  assert.equal(passed.ok, true, passed.reason);
  assert.match(passed.reason, new RegExp(`of ${ENGINE_DECLARED_CHECK_COUNT + 1}`));

  const short = evaluateGate(14, { ...context, recorded: { ...context.recorded, adhocChecks: [{ id: 'no-body' }] } });
  assert.equal(short.ok, false);
  assert.match(short.reason, new RegExp(String(ENGINE_DECLARED_CHECK_COUNT)));
  assert.match(short.reason, new RegExp(String(ENGINE_DECLARED_CHECK_COUNT + 1)));
});

test('C002 a run whose ad-hoc module could not be loaded refuses at the checks phase, naming it', async () => {
  const { specPath, spec, directory } = scaffoldedRun();
  seedRunDirectory(directory, spec, specPath);
  const loaded = await loadAdhocChecks({ directory });
  const context = buildContext({ specPath, spec, run: { directory, status: startRun({ specPath, spec }).status }, recorded: { adhocChecks: loaded.checks, adhocProblems: [`broken.mjs ${ADHOC_REFUSALS.NOT_LOADED}: Unexpected token`], railExits: [] } });
  writeFileSync(join(directory, ADHOC_DIRECTORY, 'broken.mjs'), 'export const check = {');

  const refused = evaluateGate(14, context);

  assert.equal(refused.ok, false);
  assert.match(refused.reason, /broken/);
  assert.equal(/checks ran/.test(refused.reason), false, 'a count that would read as a pass is never printed');
});

test('C002 the command file restates no check count', () => {
  const command = readFileSync(COMMAND_PATH, 'utf8');

  assert.equal(/\b\d+ checks\b/.test(command), false);
  assert.equal(/\bchecksRun=\d+ of \d+\b/.test(command), false);
  assert.equal(/ENGINE_DECLARED_CHECK_COUNT/.test(command), false);
});

// ---------------------------------------------------------------------------
// C003 — a check that cannot be loaded is refused rather than dropped
// ---------------------------------------------------------------------------

test('C003 a filled and recorded module loads as a check the caller can run', async () => {
  const { directory } = scaffoldedRun();

  const { checks, problems } = await loadAdhocChecks({ directory });

  assert.deepEqual(problems, []);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].id, CHECK_NAME);
  assert.equal(typeof checks[0].run, 'function');
  assert.deepEqual(checks[0].run({ artifact: golden, specLines: [] }), []);
});

test('C003 a module that does not load is refused by name and is absent from the count', async () => {
  const { directory } = scaffoldedRun();
  writeFileSync(join(directory, ADHOC_DIRECTORY, 'broken.mjs'), 'export const check = {');

  const { checks, problems } = await loadAdhocChecks({ directory });

  assert.deepEqual(checks.map((check) => check.id), [CHECK_NAME]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /broken/);
  assert.match(problems[0], /does not load/);
  assert.equal(checks.some((check) => check.id === 'broken'), false);
});

test('C003 a module nothing has falsified is refused, because a stub reads as a check that passed', async () => {
  const { directory } = scaffoldedRun({ record: false });

  const { checks, problems } = await loadAdhocChecks({ directory });

  assert.deepEqual(checks, [], 'an unfilled or unfalsified module is never counted');
  assert.equal(problems.length, 1);
  assert.match(problems[0], new RegExp(CHECK_NAME));
  assert.match(problems[0], /rail-exit record/);
});

test('C003 a module exporting no mutation is refused, and the refusal says which module', async () => {
  const { directory } = scaffoldedRun();
  const modulePath = join(directory, ADHOC_DIRECTORY, `${CHECK_NAME}.mjs`);
  writeFileSync(modulePath, readFileSync(modulePath, 'utf8').replace(/export const mutation[\s\S]*$/, ''));

  const { checks, problems } = await loadAdhocChecks({ directory });

  assert.deepEqual(checks, []);
  assert.match(problems[0], /mutation/);
  assert.match(problems[0], new RegExp(CHECK_NAME));
});

test('C003 every refused module is named, and the refusal count explains the missing checks', async () => {
  const { directory } = scaffoldedRun();
  writeFileSync(join(directory, ADHOC_DIRECTORY, 'broken.mjs'), 'export const check = {');
  writeFileSync(join(directory, ADHOC_DIRECTORY, 'lonely.mjs'), 'export const check = { run: () => [] };\nexport const mutation = () => ({});\n');

  const { checks, problems } = await loadAdhocChecks({ directory });
  const onDisk = readdirSync(join(directory, ADHOC_DIRECTORY)).filter((name) => name.endsWith('.mjs'));

  assert.equal(problems.length > 0, checks.length !== onDisk.length, 'the count cannot read as a pass');
  assert.equal(problems.length, 2);
  assert.equal(checks.length, 1);
});

test('C003 the loader and the executor refuse with the same words', async () => {
  const loader = readFileSync(join(RAIL_DIRECTORY, 'adhoc.mjs'), 'utf8');

  assert.equal(/ADHOC_REFUSALS/.test(loader), true, 'the three shared reasons are named once');
  assert.equal((loader.match(/does not load/g) ?? []).length, 1, 'the reason is stated once and reused');
});

// ---------------------------------------------------------------------------
// C004 — a promotion is a proposal
// ---------------------------------------------------------------------------

test('C004 a promotion rewrites the record in the run directory and names the second specification', () => {
  const { directory } = scaffoldedRun();
  const store = railExitStoreFor(directory);
  const before = digestOfTree(TOOL_ROOT);

  const promoted = promoteRecord(readRailExits(store), readRailExits(store)[0].id, { secondSpecification: '/tmp/other.md' });

  assert.equal(promoted.ok, true, JSON.stringify(promoted.problems ?? []));
  assert.equal(promoted.record.promoted, true);
  assert.match(promoted.record.promotionCondition, /other\.md/);
  writeRailExits(readRailExits(store).map((held) => (held.id === promoted.record.id ? promoted.record : held)), store);
  assert.equal(readRailExits(store)[0].promoted, true);
  assert.equal(digestOfTree(TOOL_ROOT), before, 'a promotion proposes; it does not edit the rail');
  assert.equal(promotionCandidates(readRailExits(store)).length, 0);
});

test('C004 a promotion whose second specification is empty is refused before the store is touched', () => {
  const { directory } = scaffoldedRun();
  const store = railExitStoreFor(directory);
  const before = readFileSync(store, 'utf8');

  const refused = promoteRecord(readRailExits(store), readRailExits(store)[0].id, { secondSpecification: '   ' });

  assert.equal(refused.ok, false);
  assert.match(refused.problems[0], /second specification/);
  assert.equal(readFileSync(store, 'utf8'), before);
});

test('C004 a promotion of a record that does not exist is refused by name', () => {
  const { directory } = scaffoldedRun();

  const refused = promoteRecord(readRailExits(railExitStoreFor(directory)), 'no-such-record', { secondSpecification: '/tmp/other.md' });

  assert.equal(refused.ok, false);
  assert.match(refused.problems[0], /no-such-record/);
});

test('IT the promote subcommand prints the proposal and the file a splice must edit', () => {
  const { specPath, directory } = scaffoldedRun();
  const id = readRailExits(railExitStoreFor(directory))[0].id;
  const before = digestOfTree(TOOL_ROOT);

  const promoted = spawnSync('node', [PHASE_SCRIPT, 'promote', specPath, id, '/tmp/second.md'], { cwd: PROJECT_ROOT, encoding: 'utf8' });

  assert.equal(promoted.status, 0, promoted.stderr);
  assert.equal(promoted.stdout.includes(id), true);
  assert.match(promoted.stdout, /rail\/engine\.mjs/, 'the proposal names the file a splice must edit');
  assert.match(promoted.stdout, /second\.md/);
  assert.equal(digestOfTree(TOOL_ROOT), before);
  assert.equal(readRailExits(railExitStoreFor(directory))[0].promoted, true);

  const refused = spawnSync('node', [PHASE_SCRIPT, 'promote', specPath, id, ''], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /second specification/);
});

// ---------------------------------------------------------------------------
// C005 — the store belongs to the specification
// ---------------------------------------------------------------------------

test('C005 the store is a function of the run directory and two runs never share a record', () => {
  const first = scaffoldedRun();
  const second = scratchRun();
  startRun({ specPath: second.specPath, spec: second.spec });
  writeRailExit(recordFor('row-shape'), railExitStoreFor(second.directory));

  assert.equal(railExitStoreFor(first.directory), join(first.directory, 'rail-exits.jsonl'));
  assert.deepEqual(readRailExits(railExitStoreFor(first.directory)).map((record) => record.check), [CHECK_NAME]);
  assert.deepEqual(readRailExits(railExitStoreFor(second.directory)).map((record) => record.check), ['row-shape']);
  const shared = readRailExits(railExitStoreFor(first.directory)).filter((record) => record.check === 'row-shape');
  assert.deepEqual(shared, []);
});

test('C005 a call with no store path throws, naming the argument it needs', () => {
  const before = digestOfTree(TOOL_ROOT);

  assert.throws(() => writeRailExit(recordFor('x')), /store/i);
  assert.throws(() => readRailExits(), /store/i);
  assert.throws(() => writeRailExits([recordFor('x')]), /store/i);
  assert.throws(() => railExitStoreFor(''), /run directory|store/i);
  assert.equal(digestOfTree(TOOL_ROOT), before, 'the tool tree is not a default anyone can fall back on');
});

test('C005 no module computes a store path from its own location', () => {
  const offenders = readdirSync(RAIL_DIRECTORY)
    .filter((name) => name.endsWith('.mjs'))
    .filter((name) => /import\.meta\.dirname[^)]*rail-exits/.test(readFileSync(join(RAIL_DIRECTORY, name), 'utf8')));

  assert.deepEqual(offenders, []);
  assert.equal(existsSync(join(TOOL_ROOT, 'rail-exits.jsonl')), false, 'the tool tree holds no store');
});

test('C005 the store joins the inherited asset set, so adding a record changes the digest', () => {
  const { directory } = scaffoldedRun();
  const before = assetDigestOf(directory);

  writeRailExit(recordFor('row-shape'), railExitStoreFor(directory));

  assert.notEqual(assetDigestOf(directory), before, 'a record is part of what a generation inherits');
  assert.equal(inheritedFileNames().includes('rail-exits.jsonl'), true);
});

test('IT a record added between generations is a change the next begin sees', () => {
  const { specPath, spec, directory } = scratchRun();
  beginRun({ specPath, spec });
  const first = beginRun({ specPath, spec });
  assert.equal(first.mode, 'verification');

  writeRailExit(recordFor('row-shape'), railExitStoreFor(directory));
  const second = beginRun({ specPath, spec });

  assert.equal(second.mode, 'new-generation', 'the store is an inherited asset, so a new record is a change');
});

// ---------------------------------------------------------------------------
// C006 — the product path agrees with the phase driver
// ---------------------------------------------------------------------------

test('IT the product path reports the same check counts as the phase driver', async () => {
  const { specPath, directory } = scaffoldedRun();

  const product = await runCommand([specPath], { runInput: RUN_INPUT });

  assert.equal(product.exitCode, EXIT.OK, JSON.stringify(product.verdicts));
  assert.equal(product.summary.checksDeclared, ENGINE_DECLARED_CHECK_COUNT + 1);
  assert.equal(product.summary.checksAdhoc, 1);

  const driver = spawnSync('node', [PHASE_SCRIPT, 'report', specPath], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  const counts = /checksRun=(\d+) of (\d+)/.exec(driver.stdout);
  assert.equal(Number(counts[1]), product.summary.checksRun);
  assert.equal(Number(counts[2]), product.summary.checksDeclared);
  assert.equal(existsSync(artifactPathFor(specPath)), true);
  assert.equal(readdirSync(directory).includes('adhoc'), true);
});

test('C006 the one-argument contract and the exit codes are unchanged', async () => {
  const { directory, specPath } = scratchRun();
  const extensionless = join(directory, 'noext');
  mkdirSync(directory, { recursive: true });
  writeFileSync(extensionless, 'nothing\n');

  for (const argv of [[], [specPath, specPath], [directory], [extensionless]]) {
    const refused = await runCommand(argv, { runInput: RUN_INPUT });
    assert.equal(refused.exitCode, EXIT.MISUSED, JSON.stringify(argv));
    assert.equal(refused.artifactPath, null);
  }
  assert.equal(existsSync(artifactPathFor(specPath)), false, 'a misused invocation writes nothing');
});

test('C006 the product path refuses while an ad-hoc module cannot be loaded', async () => {
  const { specPath, directory } = scaffoldedRun();
  writeFileSync(join(directory, ADHOC_DIRECTORY, 'broken.mjs'), 'export const check = {');

  const refused = await runCommand([specPath], { runInput: RUN_INPUT });

  assert.equal(refused.exitCode, EXIT.REFUSED);
  assert.match(refused.verdicts.map((verdict) => verdict.reason ?? '').join(' '), /broken/);
});

test('IT a scaffolded check that reddens an artifact refuses the checks phase', async () => {
  const { specPath, directory } = scaffoldedRun();
  const drained = { ...golden, sequences: golden.sequences.map((entry) => (entry.kind === 'entry' ? { ...entry, outcome: null } : entry)) };
  writeFileSync(artifactPathFor(specPath), `${JSON.stringify(drained, null, 2)}\n`);

  const loaded = await loadAdhocChecks({ directory });
  const { verdicts, summary } = checkAll({ specLines: readSpecification(specPath).lines, artifact: drained, recorded: { adhocChecks: loaded.checks } });

  assert.equal(summary, null);
  assert.equal(verdicts[0].check, CHECK_NAME);
});

test('IT the golden run still writes the golden artifact, and its counts are the engine own', () => {
  const { specPath } = scratchRun();
  const run = spawnSync('node', [join(RAIL_DIRECTORY, 'run.mjs'), specPath], { cwd: PROJECT_ROOT, encoding: 'utf8', input: JSON.stringify(RUN_INPUT) });

  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(readFileSync(artifactPathFor(specPath), 'utf8')), golden);
  assert.match(run.stdout, /checksRun=17 of 17/);
});
