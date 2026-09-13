// @verifies C001
// @verifies C002
// @verifies C003
/**
 * A seed written by an older conver is handled honestly.
 *
 * The design records the question as unverified: `seed-parse.mjs`'s exact
 * heading-count check may reject an `RFC-SEED.md` produced by an older conver. A
 * pattern-2 or pattern-3 project may carry a seed written under different rules,
 * and design 1.2 says incompleteness is the input, never a refusal condition.
 *
 * So the format becomes data and the parser reads it. The format is determined
 * from the seed's own declaration and never from its heading count — inferring it
 * from the count would make the check unfalsifiable, because the count is the
 * very property the format defines. A seed that names no format, or one the table
 * does not declare, produces a compatibility finding and the run continues.
 *
 * What the change must not do is trade a false refusal for a false acceptance.
 * The current format's exactness is therefore re-asserted *through the new path*:
 * a fifteenth heading and a transposed heading are exercised after the change,
 * not only before it, so a resolver that fell through to acceptance fails here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALLOCATE_MANIFEST_FILE_NAME,
  CURRENT_SEED_FORMAT_VERSION,
  SEED_FILE_NAME,
  SEED_CONTRACT_SECTION_INDEX,
  SEED_CONTRACT_SECTION_POSITION,
  SEED_FORMAT_MARKER,
  SEED_MACHINE_SECTION_INDEX,
  SEED_REQUIRED_SECTIONS,
  SEED_FORMATS,
  currentSeedFormat,
  defineSeedFormats,
  resolveSeedFormat,
} from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';
import { parseSeed, scanSeedHeadings, determineSeedFormat, reportSeedCompatibility } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parse.mjs';
import { GATE_STATUS } from '../../../.claude/scripts/workspacify-tree/lib/errors.mjs';
import {
  ALLOCATE_MODES,
  REVERSE_GATE_IDS,
  assertSectionOneIndex,
  renderReverseAllocateReport,
  runReverseAllocateGates,
  summarizeReverseAllocateGates,
} from '../../../.claude/scripts/workspacify-allocate/lib/reverse-mode.mjs';
import { BASELINE_RELATIVE_PATH } from '../../../.claude/scripts/workspacify-reverse/lib/regression-gate.mjs';
import {
  FIXTURE_TOP_LEVEL_DIRECTORIES,
  PLANNED_PATHS,
  corruptMachineJson,
  olderFormatRow,
  packetWithExcerpt,
  renderCurrentSeed,
  renderReverseSeed,
  renderSeedUnderFormat,
  stripMachineJsonBlock,
  declaredReverseSeed,
  swapHeadingIndexes,
  swapHeadingTitles,
  withDuplicateMachineField,
  withMachineField,
} from '../helpers/seed-format-fixture.mjs';
import {
  buildReverseWorkspace,
  createdEntries,
  fingerprintTree,
  removeTree,
} from '../reverse/helpers/reverse-fixture.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ALLOCATE_RUN = join(PROJECT_ROOT, '.claude/scripts/workspacify-allocate/run.mjs');

/**
 * Every other reverse-gate input satisfied, so the only thing under judgement is
 * the seed's format. A3 needs a packet carrying the excerpt it owes, A2 needs the
 * writes to be the two the reverse rotation is allowed, and A5 needs the parity
 * maps it is handed.
 */
// [::TICKET::] P23-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-10 --for-spec --no-implementation-order`.
function reverseGateInputs({ seedTexts }) {
  return {
    mode: ALLOCATE_MODES.REVERSE,
    plannedPaths: PLANNED_PATHS,
    existingPaths: PLANNED_PATHS,
    seedTexts,
    expectedByPackage: new Map(),
    parsedByPackage: new Map(),
    packets: [packetWithExcerpt()],
    writes: [{ path: `${PLANNED_PATHS[2]}/${SEED_FILE_NAME}` }, { path: ALLOCATE_MANIFEST_FILE_NAME }],
    topLevelDirectoriesBefore: FIXTURE_TOP_LEVEL_DIRECTORIES,
    topLevelDirectoriesAfter: FIXTURE_TOP_LEVEL_DIRECTORIES,
  };
}

// ---------------------------------------------------------------------------
// C001 — the format is determined mechanically, and never inferred
// ---------------------------------------------------------------------------

test('C001 precondition: the declared formats are a table whose rows carry a version, ordered sections and a machine section index', () => {
  assert.ok(Array.isArray(SEED_FORMATS), 'the table is an array');
  assert.ok(SEED_FORMATS.length >= 1, 'the table declares at least one format');
  for (const row of SEED_FORMATS) {
    assert.deepEqual(Object.keys(row).sort(), ['machineSectionIndex', 'sections', 'version']);
    assert.equal(typeof row.version, 'string');
    assert.ok(Array.isArray(row.sections) && row.sections.length > 0);
    assert.equal(typeof row.machineSectionIndex, 'number');
    assert.equal(Object.isFrozen(row), true, 'a row is frozen');
  }
  assert.equal(SEED_FORMAT_MARKER, 'seed_format');
});

test('C001 postcondition: a seed declaring the current format resolves to it, and the determination names the field it read', () => {
  const declared = withMachineField(renderCurrentSeed(), SEED_FORMAT_MARKER, CURRENT_SEED_FORMAT_VERSION);
  const determined = determineSeedFormat(declared);

  assert.equal(determined.version, CURRENT_SEED_FORMAT_VERSION);
  assert.equal(determined.marker, SEED_FORMAT_MARKER, 'the determination names the field it read');
  assert.match(determined.evidence, /seed_format/);
  assert.match(determined.evidence, new RegExp(CURRENT_SEED_FORMAT_VERSION.replace(/\./g, '\\.')));
  assert.equal(resolveSeedFormat(determined).version, CURRENT_SEED_FORMAT_VERSION);
});

test('C001 postcondition: a seed whose machine block carries no format field is unversioned, and says no marker was present', () => {
  const silent = renderCurrentSeed();
  assert.equal(/(^|[^a-z_])seed_format/.test(silent), false, 'the fixture really carries no marker');

  const determined = determineSeedFormat(silent);

  assert.equal(determined.version, null);
  assert.equal(determined.marker, null);
  assert.match(determined.evidence, /no seed_format|carries no seed_format/);
});

test('C001 postcondition: a seed declaring a version absent from the table is unrecognised, naming the string it declared', () => {
  const stranger = withMachineField(renderCurrentSeed(), SEED_FORMAT_MARKER, '9.9.9');
  const determined = determineSeedFormat(stranger);

  assert.equal(determined.version, '9.9.9', 'the declared string is reported, not swallowed');
  assert.equal(determined.marker, SEED_FORMAT_MARKER);
  assert.equal(resolveSeedFormat(determined), null, 'no row of the table matches it');
});

test('C001 invariant: the format is never inferred from the heading count', () => {
  const silent = renderCurrentSeed();
  assert.equal(scanSeedHeadings(silent).length, SEED_REQUIRED_SECTIONS.length, 'the fixture has exactly the current count');

  const determined = determineSeedFormat(silent);

  assert.equal(determined.version, null, 'the count is not evidence of the format');
  assert.equal(determined.marker, null);
  assert.equal(resolveSeedFormat(determined), null, 'a 14-heading seed is not assumed current');
});

// ---------------------------------------------------------------------------
// C002 — a seed parses under its own declared format, and exactness survives
// ---------------------------------------------------------------------------

test('C002 postcondition: a seed declaring an older format parses under that format, and its sections are addressed by its indices', () => {
  const older = olderFormatRow();
  const table = defineSeedFormats([older, SEED_FORMATS[0]]);
  const olderSeed = withMachineField(renderSeedUnderFormat(older), SEED_FORMAT_MARKER, older.version);

  const parsed = parseSeed(olderSeed, { formats: table });

  assert.equal(parsed.headings.length, older.sections.length);
  assert.deepEqual(parsed.headings.map((heading) => heading.index), older.sections.map((section) => section.index));
  assert.equal(parsed.referenceBlock.package.id, 'pkg-a', 'the machine block is read at the format own index');
  assert.deepEqual(parsed.traceabilityRows, [], 'a section the format does not carry yields no rows');
});

test('C002 invariant: a seed declaring the current format with fifteen headings still fails, naming both counts', () => {
  const fifteen = `${declaredReverseSeed()}\n## 15. An invented heading\n\nbody\n`;

  assert.throws(
    () => parseSeed(fifteen),
    (error) => error.gateId === 'G3.6' && /15 headings, expected 14/.test(error.message),
    'the compatibility path must not accept a fifteenth heading',
  );

  const record = assertSectionOneIndex({ seedText: fifteen, mode: ALLOCATE_MODES.REVERSE });
  assert.equal(record.status, GATE_STATUS.BLOCKED);
  assert.match(record.reasons.join('\n'), /15/);
  assert.match(record.reasons.join('\n'), /14/);
});

test('C002 invariant: a seed declaring the current format with a mismatched title still fails, naming both titles', () => {
  const transposed = swapHeadingTitles(declaredReverseSeed(), 4, 5);

  assert.throws(
    () => parseSeed(transposed),
    (error) => error.gateId === 'G3.6'
      && /heading 4 has title/.test(error.message)
      && /In-Scope Objects/.test(error.message)
      && /Incoming Dependencies/.test(error.message),
    'the mismatch names the heading and both titles',
  );

  // A4 judges the count and the reverse index, not the titles: a transposition
  // keeps the count, so the defect is refused by the parse the reverse entry
  // point runs over every seed it is about to write.
  assert.equal(
    assertSectionOneIndex({ seedText: transposed, mode: ALLOCATE_MODES.REVERSE }).status,
    GATE_STATUS.PASS,
  );
});

test('C002 invariant: a seed declaring the current format with a transposed index still fails, naming the index', () => {
  const transposed = swapHeadingIndexes(declaredReverseSeed(), 4, 5);

  assert.throws(
    () => parseSeed(transposed),
    (error) => error.gateId === 'G3.6' && /heading 4 has index 5, expected 4/.test(error.message),
  );
});

test('SEED_FORMATS current row: its sections equal SEED_REQUIRED_SECTIONS element by element, so the two cannot drift', () => {
  const currentRow = SEED_FORMATS[SEED_FORMATS.length - 1];
  assert.equal(currentRow.sections.length, SEED_REQUIRED_SECTIONS.length);
  for (let position = 0; position < SEED_REQUIRED_SECTIONS.length; position += 1) {
    assert.equal(currentRow.sections[position].index, SEED_REQUIRED_SECTIONS[position].index);
    assert.equal(currentRow.sections[position].title, SEED_REQUIRED_SECTIONS[position].title);
  }
  assert.equal(currentRow.machineSectionIndex, SEED_MACHINE_SECTION_INDEX);
  assert.equal(CURRENT_SEED_FORMAT_VERSION, currentRow.version);
  assert.equal(currentSeedFormat().version, currentRow.version);
});

// ---------------------------------------------------------------------------
// C003 — an incompatibility is published, and no gate refuses
// ---------------------------------------------------------------------------

test('C003 precondition: an unrecognised seed leaves a compatibility gap against the format the run needs', () => {
  const stranger = declaredReverseSeed('9.9.9');
  const determined = determineSeedFormat(stranger);
  const required = currentSeedFormat();

  assert.equal(resolveSeedFormat(determined), null, 'the seed is unrecognised');
  assert.equal(required.version, CURRENT_SEED_FORMAT_VERSION);
  assert.notEqual(determined.version, required.version, 'a gap really exists');
});

test('C003 postcondition: the finding names the seed, the determined format, the required format and the reconciling change', () => {
  const seedPath = `${PLANNED_PATHS[2]}/${SEED_FILE_NAME}`;
  const finding = reportSeedCompatibility({
    determined: determineSeedFormat(declaredReverseSeed('9.9.9')),
    required: currentSeedFormat(),
    seed: seedPath,
  });

  assert.equal(typeof finding, 'string');
  assert.match(finding, /RFC-SEED\.md/, 'the seed is named');
  assert.match(finding, /9\.9\.9/, 'the determined format is named');
  assert.match(finding, new RegExp(CURRENT_SEED_FORMAT_VERSION.replace(/\./g, '\\.')), 'the required format is named');
  assert.match(finding, /seed_format/, 'the change that would reconcile them is stated');
  assert.equal(/"[a-z_]+":/.test(finding), false, 'the finding is prose, not a serialisation');
});

test('C003 invariant: no gate refuses the run on a seed-format incompatibility, and the published key set is unchanged', () => {
  const current = runReverseAllocateGates(reverseGateInputs({ seedTexts: [declaredReverseSeed()] }));
  const foreign = runReverseAllocateGates(reverseGateInputs({ seedTexts: [declaredReverseSeed('9.9.9')] }));

  assert.deepEqual(
    foreign.map((record) => record.gateId),
    current.map((record) => record.gateId),
    'the same gates are judged in the same order',
  );
  assert.equal(summarizeReverseAllocateGates(foreign).status, GATE_STATUS.COMPLETE, 'no gate refuses');
  assert.deepEqual(
    Object.keys(summarizeReverseAllocateGates(foreign)).sort(),
    Object.keys(summarizeReverseAllocateGates(current)).sort(),
    'the published document key set is unchanged by a compatibility gap',
  );

  const a4 = foreign.find((record) => record.gateId === REVERSE_GATE_IDS.A4);
  assert.equal(a4.status, GATE_STATUS.PASS);
  assert.equal(a4.compatibilityFindings.length, 1);
  assert.match(a4.compatibilityFindings[0], /9\.9\.9/);
  assert.deepEqual(current.find((record) => record.gateId === REVERSE_GATE_IDS.A4).compatibilityFindings, []);
});

// ---------------------------------------------------------------------------
// boundaries and failure modes
// ---------------------------------------------------------------------------

test('boundary: a seed whose section 1 machine block is absent fails the existing parse, and no format is read from nothing', () => {
  assert.throws(
    () => parseSeed(stripMachineJsonBlock(renderCurrentSeed())),
    (error) => error.gateId === 'G3.6' && /section 1 must carry a json code block/.test(error.message),
  );
  assert.throws(
    () => determineSeedFormat(stripMachineJsonBlock(renderCurrentSeed())),
    (error) => error.gateId === 'G3.6' && /section 1 must carry a json code block/.test(error.message),
    'a version read from a missing block is not a version',
  );
});

test('error: a format declared in a malformed machine block fails the machine-block parse', () => {
  assert.throws(
    () => parseSeed(corruptMachineJson(renderCurrentSeed())),
    (error) => error.gateId === 'G3.6' && /section 1 json code block is not valid JSON/.test(error.message),
  );
});

test('error: determineSeedFormat refuses a value that is not a seed instead of calling it unversioned', () => {
  for (const notASeed of [null, undefined, 42, {}, '', '   ']) {
    assert.throws(
      () => determineSeedFormat(notASeed),
      (error) => error.gateId === 'G3.6' && /seed text/.test(error.message),
      `${JSON.stringify(notASeed)} is not a seed and must not be reported as unversioned`,
    );
  }
});

test('boundary: a machine block declaring the same field twice is malformed, not resolved to one of them', () => {
  const twice = withDuplicateMachineField(renderCurrentSeed(), SEED_FORMAT_MARKER, CURRENT_SEED_FORMAT_VERSION, '0.9.0');
  assert.throws(
    () => determineSeedFormat(twice),
    (error) => error.gateId === 'G3.6' && /more than once/.test(error.message),
  );
});

test('boundary: a format table with nothing to resolve against is refused at construction', () => {
  assert.throws(() => defineSeedFormats([]), (error) => /at least one/.test(error.message));
  assert.throws(
    () => defineSeedFormats([{ version: '1.0.0', sections: [], machineSectionIndex: 1 }]),
    (error) => /at least one section/.test(error.message),
  );
  assert.throws(
    () => defineSeedFormats([{ version: '', sections: SEED_REQUIRED_SECTIONS, machineSectionIndex: 1 }]),
    (error) => /version string/.test(error.message),
  );
});

test('boundary: a seed with a title but no headings fails structurally, not as a format problem', () => {
  const titleOnly = '# RFC Seed: alpha\n\nthe body carries no section heading\n';

  assert.throws(
    () => parseSeed(titleOnly),
    (error) => error.gateId === 'G3.6' && /0 headings, expected 14/.test(error.message),
  );
  assert.equal(determineSeedFormat(titleOnly).version, null, 'the determination is unversioned, not an error');
  assert.equal(assertSectionOneIndex({ seedText: titleOnly, mode: ALLOCATE_MODES.REVERSE }).status, GATE_STATUS.BLOCKED);
});

test('boundary: a seed declaring the current format with exactly fourteen correct headings parses', () => {
  const declared = declaredReverseSeed();
  const parsed = parseSeed(declared);

  assert.equal(parsed.headings.length, SEED_REQUIRED_SECTIONS.length);
  const record = assertSectionOneIndex({ seedText: declared, mode: ALLOCATE_MODES.REVERSE });
  assert.equal(record.status, GATE_STATUS.PASS);
  assert.deepEqual(record.compatibilityFindings, []);
});

test('boundary: an older format carrying fewer sections reports the absent ones as absent by format', () => {
  const older = olderFormatRow();
  const table = defineSeedFormats([older, SEED_FORMATS[0]]);
  const olderSeed = withMachineField(renderSeedUnderFormat(older), SEED_FORMAT_MARKER, older.version);

  const parsed = parseSeed(olderSeed, { formats: table });
  assert.deepEqual(parsed.traceabilityRows, []);
  assert.deepEqual(parsed.allocationIndexRows, [], 'the older format carries neither section');

  const finding = reportSeedCompatibility({
    determined: determineSeedFormat(olderSeed, { formats: table }),
    required: currentSeedFormat(),
  });
  assert.match(finding, /0\.9\.0/);
  assert.match(finding, /1\.0\.0/);
});

// ---------------------------------------------------------------------------
// properties — the check must hold for every mutation, not for the ones named above
// ---------------------------------------------------------------------------

test('invariant property: every mutation of a current-format seed is refused, naming its specific defect', () => {
  const declared = declaredReverseSeed();
  const base = renderReverseSeed();
  const mutations = [];
  for (let count = 0; count < 5; count += 1) {
    mutations.push({ text: `${declared}\n## ${15 + count}. An invented heading\n\nbody\n`, expected: /headings, expected 14/ });
  }
  for (let index = 2; index <= 13; index += 1) {
    mutations.push({ text: swapHeadingTitles(declared, index, index + 1), expected: new RegExp(`heading ${index} has title`) });
  }
  for (let index = 2; index <= 5; index += 1) {
    mutations.push({ text: swapHeadingIndexes(declared, index, index + 1), expected: new RegExp(`heading ${index} has index`) });
  }
  for (let index = 4; index <= 6; index += 1) {
    mutations.push({ text: declared.replace(new RegExp(`## ${index}\\. `), `## ${index}. `).concat(`\n## ${index}. A duplicate\n\nbody\n`), expected: /headings, expected 14/ });
  }
  assert.ok(mutations.length >= 20, 'the property is exercised over at least twenty mutations');

  for (const mutation of mutations) {
    assert.throws(
      () => parseSeed(mutation.text),
      (error) => error.gateId === 'G3.6' && mutation.expected.test(error.message),
      `a mutation was accepted or misreported: ${mutation.expected}`,
    );
  }
  assert.equal(parseSeed(base).headings.length, SEED_REQUIRED_SECTIONS.length, 'the unmutated reverse render still parses');
});

test('invariant property: over twenty foreign seeds, the published document key set is identical to the current run', () => {
  const baseline = Object.keys(summarizeReverseAllocateGates(
    runReverseAllocateGates(reverseGateInputs({ seedTexts: [declaredReverseSeed()] })),
  )).sort();

  for (let index = 0; index < 20; index += 1) {
    const foreignSeed = declaredReverseSeed(`9.9.${index}`);
    const summary = summarizeReverseAllocateGates(runReverseAllocateGates(reverseGateInputs({ seedTexts: [foreignSeed] })));
    assert.equal(summary.status, GATE_STATUS.COMPLETE, `foreign seed ${index} was refused`);
    assert.deepEqual(Object.keys(summary).sort(), baseline);
  }
});

test('invariant property: the determined format is a function of the declaration alone', () => {
  const declared = (seedText) => withMachineField(seedText, SEED_FORMAT_MARKER, CURRENT_SEED_FORMAT_VERSION);
  const withExtra = `${renderCurrentSeed()}\n## 15. An invented heading\n\nbody\n`;

  assert.equal(
    determineSeedFormat(declared(renderCurrentSeed())).version,
    determineSeedFormat(declared(withExtra)).version,
    'two seeds differing only in their headings resolve to the same format',
  );
  assert.equal(determineSeedFormat(declared(withExtra)).version, CURRENT_SEED_FORMAT_VERSION);
});

test('invariant: the forward fixtures canonical hash is byte-identical, and a forward render declares no format', () => {
  // The frozen baseline itself is reproduced by `forward-schema.test.mjs` through
  // `checkBaselines`, so this test does not re-freeze it. What it asserts is the
  // property that keeps the baseline true: the optional field is written in
  // reverse mode and nowhere else. A writer that defaulted it into every seed
  // would make "unversioned" unreachable and would move every forward seed's
  // bytes on the next render — which is the failure the baseline would catch.
  assert.equal(existsSync(join(PROJECT_ROOT, BASELINE_RELATIVE_PATH)), true, 'the forward baseline is present to be reproduced');
  assert.equal(/(^|[^a-z_])seed_format/.test(renderCurrentSeed()), false, 'a forward render declares no format');
  assert.match(renderReverseSeed(), /seed_format/, 'a reverse render declares the format it wrote');
});

test('invariant: a seed written by the reverse writer round-trips through the parser for all fourteen sections', () => {
  const seedText = renderReverseSeed();
  const parsed = parseSeed(seedText);

  assert.equal(parsed.headings.length, SEED_REQUIRED_SECTIONS.length);
  for (const section of SEED_REQUIRED_SECTIONS) {
    const heading = parsed.headings.find((entry) => entry.index === section.index);
    assert.equal(heading.title, section.title);
    assert.ok(heading.body.trim().length > 0);
  }
  assert.equal(parsed.referenceBlock[SEED_FORMAT_MARKER], CURRENT_SEED_FORMAT_VERSION);
});

// ---------------------------------------------------------------------------
// integration — the finding reaches the operator, not the log
// ---------------------------------------------------------------------------

test('integration: the compatibility finding is rendered into the reverse allocate report', () => {
  const finding = reportSeedCompatibility({
    determined: determineSeedFormat(declaredReverseSeed('9.9.9')),
    required: currentSeedFormat(),
    seed: `${PLANNED_PATHS[2]}/${SEED_FILE_NAME}`,
  });
  const report = renderReverseAllocateReport([
    { gateId: REVERSE_GATE_IDS.A4, status: GATE_STATUS.PASS, reasons: ['section 1 carries the reverse index'], compatibilityFindings: [finding] },
  ]);

  assert.match(report, /SEED-COMPATIBILITY\.md/);
  assert.match(report, /RFC-SEED\.md/);
  assert.match(report, /9\.9\.9/);
  assert.equal(/"[a-z_]+":/.test(report), false, 'the AI reads prose, not a serialisation');
});

test('integration: a reverse allocate run with no gap says so, and still names the section', () => {
  const report = renderReverseAllocateReport([
    { gateId: REVERSE_GATE_IDS.A4, status: GATE_STATUS.PASS, reasons: ['ok'], compatibilityFindings: [] },
  ]);

  assert.match(report, /SEED-COMPATIBILITY\.md/);
  assert.match(report, /[Ee]very seed/);
});

test('integration: the real reverse run publishes the finding beside its report, and publishes nothing else', () => {
  const workspace = buildReverseWorkspace();
  const decisionsPath = `${workspace.dir}.decisions.json`;
  writeFileSync(decisionsPath, JSON.stringify(workspace.decisions));
  try {
    const before = fingerprintTree(workspace.dir);
    const run = spawnSync(
      process.execPath,
      [ALLOCATE_RUN, 'reverse', `--root=${workspace.dir}`, `--decisions=${decisionsPath}`],
      { encoding: 'utf8' },
    );

    assert.equal(run.status, 0, `reverse allocate must exit 0\nstdout: ${run.stdout}\nstderr: ${run.stderr}`);
    assert.match(run.stdout, /SEED-COMPATIBILITY\.md/, 'the finding reaches the operator, not the log');
    assert.match(run.stdout, /Every seed declares the format this run reads/);

    const created = createdEntries(before, fingerprintTree(workspace.dir));
    assert.ok(
      created.every((line) => line.includes(SEED_FILE_NAME) || line.includes(ALLOCATE_MANIFEST_FILE_NAME)),
      `a compatibility finding is published beside the report, never as a third file: ${created.join(', ')}`,
    );
  } finally {
    removeTree(workspace.dir);
    rmSync(decisionsPath, { force: true });
  }
});

// ---------------------------------------------------------------------------
// review findings — defects found while verifying the acceptance criteria
// ---------------------------------------------------------------------------

test('review 1: a seed whose machine block is missing is judged, not thrown past', () => {
  const broken = stripMachineJsonBlock(renderReverseSeed());

  // The gate runner's contract is that every gate is judged even after an
  // earlier failure, so a malformed seed must come back as a BLOCKED record
  // carrying the existing parse message rather than as an exception that skips
  // A5 and hides the rest of the work.
  const record = assertSectionOneIndex({ seedText: broken, mode: ALLOCATE_MODES.REVERSE });
  assert.equal(record.gateId, REVERSE_GATE_IDS.A4);
  assert.equal(record.status, GATE_STATUS.BLOCKED);
  assert.match(record.reasons.join('\n'), /section 1 must carry a json code block/);
  assert.deepEqual(record.compatibilityFindings, []);

  const records = runReverseAllocateGates(reverseGateInputs({ seedTexts: [broken] }));
  assert.equal(records.length, 5, 'every gate is judged');
});

test('review 2: the finding names the seed it is about', () => {
  const foreign = declaredReverseSeed('9.9.9');
  const record = assertSectionOneIndex({ seedText: foreign, mode: ALLOCATE_MODES.REVERSE });

  assert.equal(record.compatibilityFindings.length, 1);
  assert.match(record.compatibilityFindings[0], /alpha/, 'the finding names the seed it is about');
  assert.doesNotMatch(record.compatibilityFindings[0], /^### the seed$/m);
});

test('review 3: the finding never reports a section difference it cannot know', () => {
  const required = currentSeedFormat();
  const unrecognised = reportSeedCompatibility({
    determined: determineSeedFormat(declaredReverseSeed('9.9.9')),
    required,
    seed: 'alpha',
  });
  const unversioned = reportSeedCompatibility({
    determined: determineSeedFormat(renderCurrentSeed()),
    required,
    seed: 'alpha',
  });

  for (const finding of [unrecognised, unversioned]) {
    assert.doesNotMatch(finding, /0 section\(s\)/, 'a count of zero would read as "no difference"');
    assert.match(finding, /14/);
  }
  assert.match(unrecognised, /unknown|not declared/);
  assert.match(unversioned, /no format|cannot be compared/);
});

test('review 4: a format table whose machine index is not its first section is refused at construction', () => {
  assert.throws(
    () => defineSeedFormats([{ version: '0.9.0', sections: SEED_REQUIRED_SECTIONS, machineSectionIndex: 5 }]),
    (error) => /first section/.test(error.message),
    'the resolver reads the first section, so the row must agree with it',
  );
});

test('review 5: the contract section index is derived from its position, not restated', () => {
  assert.equal(
    SEED_CONTRACT_SECTION_INDEX,
    SEED_REQUIRED_SECTIONS[SEED_CONTRACT_SECTION_POSITION - 1].index,
    'the current format numbers its sections in order, and the constant says so by derivation',
  );
  assert.equal(SEED_CONTRACT_SECTION_POSITION, 2);
});

test('review 6: a seed that cannot be judged is not reported as compatible', () => {
  const broken = stripMachineJsonBlock(renderReverseSeed());
  const record = assertSectionOneIndex({ seedText: broken, mode: ALLOCATE_MODES.REVERSE });

  assert.equal(record.status, GATE_STATUS.BLOCKED);
  assert.equal(record.counts.compatible, false, 'a seed that cannot be parsed does not declare the format this run reads');
});
