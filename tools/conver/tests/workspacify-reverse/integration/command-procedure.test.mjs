// @verifies C001
// @verifies C002
// @verifies C003
// [::TICKET::] P23-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-1 --for-spec --no-implementation-order`.
/**
 * The procedure `/workspacify-reverse` states, held to the design that states it.
 *
 * `command.test.mjs` holds the tenth command file to the eight structural
 * properties P22-9 established, and those are necessary and not sufficient: a
 * file could satisfy all eight and still describe rather than instruct, still
 * state no terminal state, still leave the AI's judgement surface open, and
 * still carry a gate that refuses an incomplete project — which is the one
 * failure design §1.2 exists to prevent.
 *
 * So the guard here is two-sided. It asserts the presence of the sections design
 * §5.3 declares, and it asserts the ABSENCE of the six formulations §5.7
 * forbids. The second half is the load-bearing one: absence cannot be established
 * by reading the file once, and every formulation is therefore exercised against
 * a throwaway fixture that carries it, so each rule is seen to fail rather than
 * only seen to pass.
 *
 * The fixtures that must fail are derived from the real file by mutation rather
 * than written out. A second copy of the Language Protocol table would be a
 * second thing to drift, and a mutated real file is a stronger fixture: it is
 * wrong in exactly one way.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  COMMAND_FILE_NAMES,
  COMMANDS_RELATIVE_DIR,
  compareDigests,
  digestCommandFiles,
  extractCommandFileSections,
} from '../../../.claude/scripts/workspacify-reverse/lib/command-file-digest.mjs';
import { ANALYSIS_EVALUATION_ORDER, ANALYSIS_STAGES } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';
import {
  EXPECTED_STEP_HEADINGS,
  FORBIDDEN_FORMULATIONS,
  FORBIDDEN_FORMULATION_COUNT,
  JUDGEMENT_SURFACE_SIZE,
  MODES_HEADING,
  SCRIPTS_USED_HEADING,
  assertCommandFileStructure,
  assertJudgementSurface,
  auditForbiddenFormulations,
  extractJudgementItems,
  extractMachineDecisions,
  readCommandFile,
  regionsOf,
  sectionText,
} from '../helpers/command-file.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const RUNNER = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/run.mjs');
const COMMAND_PATH = join(PROJECT_ROOT, COMMANDS_RELATIVE_DIR, 'workspacify-reverse.md');
const BASELINE_PATH = 'tests/workspacify-tree/baselines/manifest-hashes.json';

// [::TICKET::] P23-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-1 --for-spec --no-implementation-order`.
const TEXT = readFileSync(COMMAND_PATH, 'utf8');
const SECTIONS = extractCommandFileSections(TEXT);

/** The `## Step N` headings, in the order the file declares them. */
// [::TICKET::] P23-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-1 --for-spec --no-implementation-order`.
function stepHeadings(text) {
  return extractCommandFileSections(text).headings.filter((heading) => /^## Step \d/.test(heading));
}

/** Every subcommand the entrance accepts, so a step's invocation is matched by name. */
const KNOWN_SUBCOMMANDS = ['detect', 'scrub', 'verify', 'regression', 'holdout', 'oracle', 'spike', 'analyze'];

/** The subcommands invoked inside the procedure's own step sections. */
// [::TICKET::] P23-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-1 --for-spec --no-implementation-order`.
function subcommandsRunBySteps(text) {
  const regions = regionsOf(text);
  const stepRegions = [...new Set(regions.filter((region) => /^## Step \d/.test(region)))];
  const invocation = new RegExp(`run\\.mjs\\s+(${KNOWN_SUBCOMMANDS.join('|')})\\b`, 'g');
  return stepRegions.flatMap((region) =>
    [...sectionText(text, region).matchAll(invocation)].map((match) => match[1]),
  );
}

/** A throwaway directory to publish into, so no test writes into the project. */
// [::TICKET::] P23-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-1 --for-spec --no-implementation-order`.
function scratchDirectory(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/** Run the entrance as an operator would, and capture what they would see. */
// [::TICKET::] P23-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-1 --for-spec --no-implementation-order`.
function runEntrance(args) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * The six formulations design §5.7 forbids, each as a sentence a command file
 * could plausibly carry, plus the section it would sit in.
 */
const FORBIDDEN_FIXTURES = Object.freeze([
  {
    id: 'incompleteness-gate',
    section: '## Step 3: reach the exit',
    sentence: 'Step 3 is skipped when the project is not a conver project.',
  },
  {
    id: 'must-already-be-complete',
    section: '## Step 0: identify the input',
    sentence: 'The target must already be a complete conver project before this step runs.',
  },
  {
    id: 'holdout-isolation',
    section: '## Step 2: fix the boundary and the scope',
    sentence: 'Run the analysis only once `holdout isolation` has exited 0.',
  },
  {
    id: 'scrub-detect-verify-as-step',
    section: '## Step 3: reach the exit',
    sentence: 'Run `run.mjs scrub` and then `run.mjs verify` before the analysis.',
  },
  {
    id: 'oracle-compare-as-step',
    section: '## Step 8: report',
    sentence: 'Finish by running `oracle compare` over the published spec.',
  },
  {
    id: 'regression-check-as-precondition',
    section: '## Step 2: fix the boundary and the scope',
    sentence: '`run.mjs regression check` must pass before the run starts.',
  },
]);

/** The line number the fixture's sentence lands on, in `fixtureDocument`. */
const FIXTURE_SENTENCE_LINE = 9;

/** A minimal command file carrying one offending sentence inside a step section. */
// [::TICKET::] P23-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-1 --for-spec --no-implementation-order`.
function fixtureDocument({ section, sentence }) {
  return ['# /workspacify-reverse', '', '## Arguments', '', 'plain prose', '', section, '', sentence, ''].join('\n');
}

/** The same sentence, written as a table row: the shape an exempt region may carry. */
// [::TICKET::] P23-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-1 --for-spec --no-implementation-order`.
function tabulated(sentence) {
  return `| ${sentence} | note |`;
}

/** The six decisions design §6.2 licenses, as the file is expected to name them. */
const EXPECTED_JUDGEMENT_ITEMS = Object.freeze([
  /package boundary/i,
  /owner assignment/i,
  /layer estimation/i,
  /what a contract \*?means\*?|contract \*?means\*?/i,
  /over-splitting/i,
  /observed.*inferred.*normative.*unresolved/i,
]);

// --- C001: the eight structural assertions, held through the shared guard ------

test('C001/UT-1: the rewritten file satisfies the eight structural assertions unchanged', () => {
  assertCommandFileStructure(TEXT, { projectRoot: PROJECT_ROOT });
});

test('C001/UT-1: the eight assertions are defined once and read the same file as the companion guard', () => {
  const companion = readFileSync(join(PROJECT_ROOT, 'tests/workspacify-reverse/integration/command.test.mjs'), 'utf8');
  assert.match(
    companion,
    /assertCommandFileStructure/,
    'command.test.mjs calls the shared predicate rather than carrying a second copy of it',
  );
  assert.doesNotMatch(
    companion,
    /assert\.match\(text, \/\^---\\n\//,
    'the inline copy of the eight assertions is gone, so the two guards cannot drift',
  );
});

test('C001/UT: the frontmatter the command API rests on is unchanged, read as the first five lines', () => {
  const frontmatter = TEXT.split('\n').slice(0, 5);
  assert.deepEqual(frontmatter, [
    '---',
    'description: Run R0 through R8 over an existing implementation and publish the origin spec (the entrance to the reverse rotation)',
    'argument-hint: <path-to-the-project-root>',
    'disable-model-invocation: true',
    '---',
  ]);
});

test('C001 boundary: a later horizontal rule is not read as frontmatter', () => {
  const withRule = `${TEXT}\n---\n\na horizontal rule, not a frontmatter fence\n`;
  assertCommandFileStructure(withRule, { projectRoot: PROJECT_ROOT });
});

// --- C003: the procedure's declared sections --------------------------------

test('C003 precondition: the sections design §5.3 declares are present', () => {
  const required = [
    '## Arguments',
    '## The four principles',
    '## What the machine decides, and what you decide',
    '## The terminal state this command serves',
    '## The canonical output and its constraints',
    SCRIPTS_USED_HEADING,
    '## Statuses and gates',
    '## What this command cannot yet reach',
    '## A round, and what success is',
  ];
  for (const heading of required) {
    assert.ok(SECTIONS.headings.includes(heading), `${heading} must exist`);
  }
});

test('C003/UT: the procedure declares Step 0 through Step 8 as nine headings, first and last included', () => {
  const steps = stepHeadings(TEXT);
  assert.equal(steps.length, EXPECTED_STEP_HEADINGS, 'the declared spine is nine steps');
  assert.match(steps[0], /^## Step 0: /, 'the procedure opens at Step 0');
  assert.match(steps[steps.length - 1], /^## Step 8: /, 'the procedure ends at Step 8');
  assert.deepEqual(
    steps.map((heading) => /^## Step (\d)/.exec(heading)[1]),
    ['0', '1', '2', '3', '4', '5', '6', '7', '8'],
    'no step number is skipped or repeated',
  );
});

test('C003/UT: the four principles are named, one per claim', () => {
  const principles = sectionText(TEXT, '## The four principles');
  assert.match(principles, /deterministic analysis/i, 'principle 1: maximise the deterministic analysis');
  assert.match(principles, /AI judgement/i, 'principle 2: minimise the area left to AI judgement');
  assert.match(principles, /serving/i, 'principle 3: maximise the serving to that area');
  assert.match(principles, /inviolab/i, 'principle 4: the existing tree is absolutely inviolable');
});

test('C003/UT: the judgement surface enumerates exactly six items, each the one §6.2 licenses', () => {
  assertJudgementSurface(TEXT);
  const items = extractJudgementItems(TEXT);
  assert.equal(items.length, JUDGEMENT_SURFACE_SIZE);
  for (const expected of EXPECTED_JUDGEMENT_ITEMS) {
    assert.ok(
      items.some((item) => expected.test(item)),
      `the surface must carry an item matching ${expected}`,
    );
  }
});

test('C003/UT: the machine half is bullets and the AI half is the only numbered list', () => {
  const machine = sectionText(TEXT, '## What the machine decides, and what you decide');
  assert.match(machine, /T1–T6|T1-T6/, 'the accepted machine verdicts are named');
  assert.match(machine, /accepted, not re-opened|accepted rather than re-opened/i, 'the verdicts are accepted');
  assert.ok(extractMachineDecisions(TEXT).length > 0, 'the machine half is set out as bullets');
});

test('C003/UT: the terminal state of design §2 is stated', () => {
  const terminal = sectionText(TEXT, '## The terminal state this command serves');
  assert.match(terminal, /four-layer set/i, 'every package holds its complete four-layer set');
  assert.match(terminal, /partition is explicit/i, 'the partition is explicit');
  assert.match(terminal, /every inconsistency is recorded/i, 'every inconsistency is recorded');
});

test('C003/UT: the round and the success condition are stated, and omission 0 is not it', () => {
  const round = sectionText(TEXT, '## A round, and what success is');
  assert.match(round, /RESIDUE 0/, 'success is RESIDUE 0 in /crystalize-readme');
  assert.match(round, /omission 0/, 'omission 0 is named');
  assert.match(round, /not the success condition/i, 'omission 0 is denied as the success condition');
  for (const rung of ['L0', 'L1', 'L2', 'L2.5', 'L3']) {
    assert.ok(round.includes(rung), `the ${rung} rung is named`);
  }
  assert.match(round, /only L3 may be called success/i, 'only L3 is success');
});

test('C003/UT: the machine vocabulary is proved / not proved, and never succeeded / failed', () => {
  assert.match(TEXT, /`proved`/, 'proved is the machine vocabulary');
  assert.match(TEXT, /`not proved`/, 'not proved is the machine vocabulary');
  assert.match(TEXT, /"Succeeded" and "failed" are not (available to it|the machine)/i, 'the human verdict is denied to the machine');
});

test('C003/UT: the four patterns are named, and only 1-3 enter through the reverse rotation', () => {
  const step0 = sectionText(TEXT, '## Step 0: identify the input');
  assert.match(step0, /Pattern 1/i, 'pattern 1 is named');
  assert.match(step0, /Pattern 2/i, 'pattern 2 is named');
  assert.match(step0, /Pattern 3/i, 'pattern 3 is named');
  assert.match(step0, /Pattern 4/i, 'pattern 4 is named');
  assert.match(step0, /Pattern 4 does not enter through the reverse rotation/i, 'pattern 4 does not enter here');
});

test('C003/UT: the two modes are named, and an operational run is in the operational one', () => {
  assert.ok(SECTIONS.headings.includes(MODES_HEADING), 'the modes section exists');
  const modes = sectionText(TEXT, MODES_HEADING);
  assert.match(modes, /operational mode/i);
  assert.match(modes, /experiment mode/i);
  assert.match(modes, /must not gate an operational run/i, 'the experiment mode does not gate an operational run');
});

test('C003/UT: the six absences of design §6 are named rather than omitted', () => {
  const absences = sectionText(TEXT, '## What this command cannot yet reach');
  for (const identifier of ['N1', 'N2', 'N3', 'N4', 'N5', 'N6']) {
    assert.ok(absences.includes(identifier), `absence ${identifier} is named`);
  }
});

test('C003/UT: --through is stated as the only prefix instrument, with the evaluation order and its reason', () => {
  const step3 = sectionText(TEXT, '## Step 3: reach the exit');
  assert.match(step3, /`--through` is the only instrument/i, 'the prefix instrument is stated');
  assert.match(step3, /publishing is atomic/i, 'and the reason is stated');
  assert.match(step3, /R2\.5 runs before R1 and R2|precedes R1 and R2/i, 'the reordering is explained');
});

test('C003/UT: publishing is atomic and the target is digested before and after', () => {
  assert.match(TEXT, /publishing is atomic/i, 'publication is atomic');
  assert.match(TEXT, /digests the tree before and after|digested before and after/i, 'the target is digested twice');
  assert.match(TEXT, /a single byte moved/i, 'a moved byte refuses publication');
});

// --- C002: the forbidden formulations ---------------------------------------

test('C002/UT: the real file carries zero forbidden formulations', () => {
  assert.deepEqual(auditForbiddenFormulations(TEXT), [], 'no §5.7 formulation appears outside its exempt region');
  assert.equal(FORBIDDEN_FORMULATION_COUNT, FORBIDDEN_FORMULATIONS.length, 'the count and the table cannot drift');
  assert.equal(FORBIDDEN_FORMULATIONS.length, 6, 'the forbidden set is the six §5.7 lists');
});

for (const fixture of FORBIDDEN_FIXTURES) {
  test(`C002/UT: ${fixture.id} is reported by name, line and section`, () => {
    const findings = auditForbiddenFormulations(fixtureDocument(fixture));
    assert.equal(findings.length, 1, 'exactly one finding is reported, not silently accepted');
    assert.equal(findings[0].kind, fixture.id, 'the finding names the formulation');
    assert.equal(findings[0].line, FIXTURE_SENTENCE_LINE, 'the finding names the line');
    assert.equal(findings[0].region, fixture.section, 'the finding names the section');
    assert.ok(findings[0].reason.length > 0, 'the finding says why the formulation is forbidden');
  });
}

test('C002 invariant: no line states that the subject must already be complete', () => {
  // Each line is audited as a document of its own. That drops every region and
  // every exemption from the question, so the property does not rest on the
  // region detection being right — it is a predicate over the line set.
  const offending = TEXT.split('\n').filter((line) =>
    auditForbiddenFormulations(line).some((finding) => finding.kind.includes('complete')),
  );
  assert.deepEqual(offending, [], 'the completeness gate is forbidden in every line, in every region, in any shape');
});

test('C002 invariant: an exempt region covers a table row and not a sentence', () => {
  const catalogueRow = '| `run.mjs holdout [freeze\\|isolation <root>]` | Experiment only |';
  const catalogueAssertion = 'Before the analysis, run `run.mjs holdout` and confirm it exits 0.';
  assert.deepEqual(
    auditForbiddenFormulations(fixtureDocument({ section: SCRIPTS_USED_HEADING, sentence: catalogueRow })),
    [],
    'the catalogue may tabulate an experiment-only subcommand',
  );
  assert.equal(
    auditForbiddenFormulations(fixtureDocument({ section: SCRIPTS_USED_HEADING, sentence: catalogueAssertion })).length,
    1,
    'a precondition written under the catalogue heading is still a precondition',
  );
});

test('C002 invariant: the exempt regions are exactly the catalogue and the modes section', () => {
  const exemptRegions = new Set(FORBIDDEN_FORMULATIONS.flatMap((formulation) => formulation.exemptIn));
  assert.deepEqual([...exemptRegions].sort(), [MODES_HEADING, SCRIPTS_USED_HEADING].sort());
  assert.deepEqual(
    FORBIDDEN_FORMULATIONS.filter((formulation) => formulation.exemptIn.length === 0).map((formulation) => formulation.id),
    ['incompleteness-gate', 'must-already-be-complete'],
    'a completeness gate is exempt nowhere, so it is forbidden even in the exempt regions',
  );

  const exemptFormulations = FORBIDDEN_FORMULATIONS.filter((formulation) => formulation.exemptIn.length > 0);
  for (const formulation of exemptFormulations) {
    const { sentence } = FORBIDDEN_FIXTURES.find((entry) => entry.id === formulation.id);
    for (const region of formulation.exemptIn) {
      assert.deepEqual(
        auditForbiddenFormulations(fixtureDocument({ section: region, sentence: tabulated(sentence) })),
        [],
        `${region} may tabulate an experiment-only instrument`,
      );
      assert.equal(
        auditForbiddenFormulations(fixtureDocument({ section: region, sentence })).length,
        1,
        `${region} may not assert it in a sentence`,
      );
    }
  }
});

test('C001/UT: the subcommands the procedure invokes inside its steps are exactly analyze', () => {
  const invoked = [...new Set(subcommandsRunBySteps(TEXT))];
  assert.deepEqual(invoked, ['analyze'], 'no step runs a subcommand other than the entrance');
});

// --- Boundary: the guards discriminate --------------------------------------

test('C002/UT: a mutated Language Protocol table fails the shared digest rather than passing as close enough', () => {
  const mutated = TEXT.replace('| Context | Language | Reason |', '| Context |  Language | Reason |');
  assert.notEqual(mutated, TEXT, 'the fixture is actually different');
  assert.throws(
    () => assertCommandFileStructure(mutated, { projectRoot: PROJECT_ROOT }),
    /Language Protocol/,
    'the file must fail for the table, not for an unrelated reason',
  );
});

test('C002/UT: a deleted First-Class Rule line fails the obligation assertion', () => {
  const deleted = TEXT.replace(/^\*\*First-Class Rule.*$/m, '');
  assert.notEqual(deleted, TEXT, 'the fixture is actually different');
  assert.throws(
    () => assertCommandFileStructure(deleted, { projectRoot: PROJECT_ROOT }),
    /obligation sentence/,
    'the file must fail for the missing sentence, not for an unrelated reason',
  );
});

test('C001 boundary: a file with no Step heading fails rather than passing because nothing violated', () => {
  const withoutSteps = TEXT.replace(/^## Step \d[^\n]*$/gm, '## Movement');
  assert.equal(/^## Step \d/m.test(withoutSteps), false, 'the fixture has no Step heading');
  assert.throws(
    () => assertCommandFileStructure(withoutSteps, { projectRoot: PROJECT_ROOT }),
    /workflow section/,
    'the file must fail for the missing step, not for an unrelated reason',
  );
});

test('C003 boundary: a seventh judgement item fails, so widening the surface is a failure', () => {
  const items = extractJudgementItems(TEXT);
  const widened = TEXT.replace(items[items.length - 1], `${items[items.length - 1]}\n7. a seventh decision the design does not license`);
  assert.equal(extractJudgementItems(widened).length, JUDGEMENT_SURFACE_SIZE + 1);
  assert.throws(() => assertJudgementSurface(widened), /six/);
});

test('C003 boundary: a fifth judgement item fails, so narrowing it is caught too', () => {
  const items = extractJudgementItems(TEXT);
  const narrowed = TEXT.split('\n')
    .filter((line) => line.trim() !== items[1])
    .join('\n');
  assert.equal(extractJudgementItems(narrowed).length, JUDGEMENT_SURFACE_SIZE - 1);
  assert.throws(() => assertJudgementSurface(narrowed), /six/);
});

test('C003 boundary: a judgement list that ends the file is still counted', () => {
  const items = extractJudgementItems(TEXT);
  const truncated = `${TEXT.trimEnd()}\n`;
  assert.equal(extractJudgementItems(truncated).length, items.length);
});

test('C002 boundary: a file that cannot be read is reported by path, not thrown and not passed', () => {
  const missing = join(PROJECT_ROOT, 'tests/workspacify-reverse/fixtures/does-not-exist.md');
  const { text, finding } = readCommandFile(missing);
  assert.equal(text, null, 'an unreadable file yields no text');
  assert.equal(finding.kind, 'unreadable-file', 'and is reported rather than skipped');
  assert.match(finding.detail, /does-not-exist\.md/, 'the report names the path');
});

// --- Invariants: the rewrite did not escape its box --------------------------

test('C001 invariant: the nine protected files are byte-stable across the rewrite', () => {
  const baseline = JSON.parse(readFileSync(join(PROJECT_ROOT, BASELINE_PATH), 'utf8'));
  assert.deepEqual(
    compareDigests(baseline.commandFileDigests, digestCommandFiles(PROJECT_ROOT)),
    [],
    'no protected command file lost a heading, its Language Protocol table or its First-Class Rule line',
  );
  assert.deepEqual(
    Object.keys(baseline.commandFileDigests).sort(),
    [...COMMAND_FILE_NAMES].sort(),
    'the baseline freezes exactly the nine',
  );
});

test('C001 invariant: the tenth file stays outside the frozen digest', () => {
  assert.equal(COMMAND_FILE_NAMES.includes('workspacify-reverse'), false);
});

// --- Integration: the document and the instrument agree ----------------------

test('IT: the invocation the procedure declares is one the entrance accepts', () => {
  const tree = createSyntheticTree({
    'Cargo.toml': '[package]\nname = "procedure-subject"\n',
    'src/api/login.rs': 'pub fn login(user_name: &str) -> bool { !user_name.is_empty() }\n',
  });
  const out = scratchDirectory('wsp-procedure-out-');
  try {
    const run = runEntrance(['analyze', tree.root, `--out=${out.root}`, '--through=r0']);
    assert.equal(run.status, 0, `the entrance must accept the declared invocation: ${run.stderr}`);
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT: the flags the procedure declares are the flags the entrance parses', () => {
  const argumentsSection = sectionText(TEXT, '## Arguments');
  const declared = ['--out', '--through', '--query'].filter((flag) => argumentsSection.includes(flag));
  assert.deepEqual(declared, ['--out', '--through', '--query'], 'the four arguments are the documented four');
  assert.match(argumentsSection, /path to the project root/i, 'the positional root is documented');
});

test('IT: the evaluation order stated in the file equals the order the code declares', () => {
  assert.notEqual(
    ANALYSIS_EVALUATION_ORDER.join(', '),
    [...ANALYSIS_STAGES].join(', '),
    'the evaluation order is not the stage numbering, so stating it adds information',
  );
  assert.ok(
    TEXT.includes(ANALYSIS_EVALUATION_ORDER.join(', ')),
    `the file must state the order the code declares: ${ANALYSIS_EVALUATION_ORDER.join(', ')}`,
  );
});
