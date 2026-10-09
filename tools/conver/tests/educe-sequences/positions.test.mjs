// An exclusion is a place an operation may be, and the partition is the level the
// document states its procedures at (PX-246, C003, C006).
//
// `UNREACHED_ESCAPES` named `excluded` and the schema did not: an operation could be
// excused from the reach check and impossible to satisfy the placement check, so the run
// that met the campaign's 72 excluded rows had to drop them. And the partition was fixed
// at `## ` while the procedures are stated at `### `, which is why a single-step operation
// could not name the section it is defined by.
//
// @verifies C003
// @verifies C006
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OPERATION_POSITIONS, UNREACHED_ESCAPES, checkAll } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { DEFAULT_SECTION_LEVEL, blocksFromHeadings, sectionLevelOf } from '../../.claude/scripts/educe-sequences/rail/pins.mjs';
import { validateDeclaration } from '../../.claude/scripts/educe-sequences/rail/readings.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SPEC_PATH = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.md');
const GOLDEN_PATH = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger-sequences.json');

const spec = readSpecification(SPEC_PATH);

/** The golden artifact, read fresh so no test can hand another a mutated one. */
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
function golden() {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
}

/** The verdicts one check raised over an artifact, by check id. */
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
function verdictsOf(artifact, check) {
  return checkAll({ specLines: spec.lines, artifact }).verdicts.filter((verdict) => verdict.check === check);
}

// ---------------------------------------------------------------------------
// C003 — an excluded operation is placed by the line that says so
// ---------------------------------------------------------------------------

test('C003 an excluded operation is placed when it cites a line, and refused when it cites prose or nothing', () => {
  const artifact = golden();
  const operation = artifact.operations[0];
  operation.position = 'excluded';
  operation.grounding = { line: 59, note: 'the section states no ordered procedure' };
  assert.deepEqual(verdictsOf(artifact, 'every-operation-placed'), [], 'an integer line inside the document places it');

  operation.grounding = { note: 'the section states no ordered procedure' };
  assert.deepEqual(verdictsOf(artifact, 'every-operation-placed').map((verdict) => verdict.subject), [operation.id]);

  operation.grounding = { line: spec.lines.length + 5 };
  assert.equal(verdictsOf(artifact, 'every-operation-placed').length, 1, 'a line past the end resolves to nothing');
});

test('C003 an excluded operation is exempt from the reach check, which is why it must be placeable', () => {
  const artifact = golden();
  // The row the campaign's 72 exclusions look like: an operation no step names, because
  // the section that would have performed it states no ordered procedure.
  artifact.operations.push({
    id: 'NoOrderHere', position: 'excluded', grounding: { line: 59, note: 'the section states no ordered procedure' },
  });

  assert.equal(artifact.steps.some((step) => step.operation === 'NoOrderHere'), false, 'no step reaches it, and none has to');
  assert.deepEqual(verdictsOf(artifact, 'every-operation-reached'), [], 'the exclusion is the escape the reach check declares');
  assert.deepEqual(verdictsOf(artifact, 'every-operation-placed'), [], 'and the line places it');
});

test('C003 every position that exempts an operation from the reach check is a position the placement check can place', () => {
  for (const escape of UNREACHED_ESCAPES) {
    assert.equal(OPERATION_POSITIONS.includes(escape), true, `${escape} exempts an operation and cannot place it`);
  }
  assert.equal(OPERATION_POSITIONS.includes('excluded'), true);
});

// ---------------------------------------------------------------------------
// C006 — the partition is the level the document states its procedures at
// ---------------------------------------------------------------------------

test('C006 the partition follows the level it is given, and the two levels differ over one text', () => {
  const lines = ['# title', '## chapter', 'prose', '### procedure', 'step one', '### procedure two', 'step two'];

  const atThree = blocksFromHeadings(lines, 3);
  const atTwo = blocksFromHeadings(lines, 2);

  assert.deepEqual(atThree.map((block) => block.firstLine), [4, 6]);
  assert.deepEqual(atTwo.map((block) => block.firstLine), [2]);
  assert.notEqual(atThree.length, atTwo.length, 'an implementation that ignored its argument would return one of these twice');
  assert.equal(atThree[0].lastLine, atThree[1].firstLine - 1, 'a block ends where the next begins');
  assert.equal(atThree.at(-1).lastLine, lines.length, 'the last block reaches the last line');
});

test('C006 an omitted level reads as three, and a level the document does not use is not a partition of it', () => {
  assert.equal(DEFAULT_SECTION_LEVEL, 3);
  assert.equal(sectionLevelOf({}), 3);
  assert.equal(sectionLevelOf({ sectionLevel: 2 }), 2);
  assert.equal(sectionLevelOf({ sectionLevel: 7 }), 3, 'a level no document states is not a level');

  const noHeadings = ['# title', 'prose', 'more prose'];
  assert.deepEqual(blocksFromHeadings(noHeadings, 3), [], 'no heading means no block, not one block covering everything');
});

test('C006 a section list at one level is refused when the artifact says the other', () => {
  const artifact = golden();
  assert.equal(artifact.pins.sectionLevel, 2, 'the fixture states its sections with two hashes');
  assert.deepEqual(verdictsOf(artifact, 'sections-agree-with-blocks'), []);

  artifact.pins.sectionLevel = 3;
  assert.equal(verdictsOf(artifact, 'sections-agree-with-blocks').length > 0, true, 'the declared sections are not the level-3 partition');
  assert.equal(verdictsOf(artifact, 'block-partition-rederives').length > 0, true, 'and the partition pin re-derives at the same level');
});

test('C006 a single-step operation can name a section that exists at the declared level', () => {
  const artifact = golden();
  artifact.pins.sectionLevel = 3;
  artifact.pins.blocks = blocksFromHeadings(spec.lines, 3);
  artifact.sections = artifact.pins.blocks.map((block) => ({ ...block }));
  const operation = artifact.operations[0];
  operation.position = 'singleStep';
  operation.definingSection = artifact.sections[0].id;

  assert.deepEqual(verdictsOf(artifact, 'every-operation-placed'), [], 'the section it names is one the partition states');
  assert.deepEqual(checkAll({ specLines: spec.lines, artifact }).verdicts, [], 'and the artifact is otherwise whole');
});

test('C006 a document that states its sections at any heading level can be partitioned at that level', () => {
  // The apparatus reads documents, and a document states its sections at whatever depth it
  // uses. A vocabulary that stopped at two or three would make a specification written with
  // four hashes unrunnable — the apparatus refusing to read a shape rather than reading it.
  for (const level of [1, 2, 3, 4, 5, 6]) {
    assert.equal(sectionLevelOf({ sectionLevel: level }), level, `level ${level}`);
    const lines = ['# title', `${'#'.repeat(level)} procedure`, 'a step'];
    const blocks = blocksFromHeadings(lines, level);
    // At level 1 the title is a heading of that level too, so the partition starts there and
    // reaches the procedure; the assertion is that the procedure is partitioned at all.
    assert.equal(blocks.map((block) => block.firstLine).includes(2), true, `level ${level} partitions`);
    assert.equal(blocks.at(-1).lastLine, lines.length, `level ${level} reaches the last line`);
  }

  const declaration = {
    predicate: { limbs: ['a'] }, rowSchema: { fields: ['b'] },
    weakestLink: { subject: 's', why: 'w', tightenedBy: 't' },
    enumerations: [], forms: [], entries: [], sections: [], exemptions: [], sectionLevel: 4,
  };
  assert.deepEqual(validateDeclaration(declaration).filter((problem) => problem.includes('sectionLevel')), []);
  assert.equal(sectionLevelOf({ sectionLevel: 7 }), 3, 'a heading depth markdown does not have is not a level');
  assert.equal(sectionLevelOf({ sectionLevel: 'three' }), 3);
});
