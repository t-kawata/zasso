// The command file is a summary of the arrays it describes (PX-241, contract C011).
//
// PX-240's contract C016 states that the command file and the phase table cannot drift,
// because a step added to the document without a phase would fail a phase-table test.
// No test read the file, so the invariant was a claim. This is the check that makes it
// true: the file must name every phase, once, in the order the array declares them, and
// it must state no count it could derive instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BRIEF_NAMES, ADJUDICATION_OUTCOMES } from '../../.claude/scripts/educe-sequences/rail/reading.mjs';
import { PHASES } from '../../.claude/scripts/educe-sequences/rail/gates.mjs';
import { ADHOC_DIRECTORY } from '../../.claude/scripts/educe-sequences/rail/adhoc.mjs';
import { PHASE_EXPECTS, PINS_FILE, WORKLIST_FILE } from '../../.claude/scripts/educe-sequences/rail/phases.mjs';
import { ARCHIVE_DIRECTORY, DECLARATION_FILE, readingsFileName } from '../../.claude/scripts/educe-sequences/rail/readings.mjs';
import { RUN_DIRECTORY_NAME } from '../../.claude/scripts/educe-sequences/rail/run-state.mjs';
import { SUPPLIED_DIRECTORY } from '../../.claude/scripts/educe-sequences/rail/supplied.mjs';
import { UNREACHED_ESCAPES, DIAGRAMMED_OUTCOMES } from '../../.claude/scripts/educe-sequences/rail/load.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const COMMAND_PATH = `${PROJECT_ROOT}.claude/commands/educe-sequences.md`;
const COMMAND = readFileSync(COMMAND_PATH, 'utf8');

/** The Step headings, with the number each carries. */
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
function stepHeadings() {
  return [...COMMAND.matchAll(/^### Step (\d+) — (.+)$/gm)].map(([, id, title]) => ({ id: Number(id), title: title.trim() }));
}

test('C011 the command file names every phase, once, in the order the phase table declares them', () => {
  const headings = stepHeadings();
  assert.equal(headings.length > 0, true, 'the command file carries no Step heading');

  let previous = -1;
  for (const phase of PHASES) {
    const matches = headings.map((heading, index) => ({ heading, index })).filter(({ heading }) => heading.title.includes(phase.name));
    assert.equal(matches.length, 1, `the file names "${phase.name}" in ${matches.length} Step headings; a phase is named once`);

    const { heading, index } = matches[0];
    assert.equal(index >= previous, true, `phase ${phase.id} "${phase.name}" is named after a later phase`);
    assert.equal(heading.id > 0, true, `phase ${phase.id} is named under Step 0, which opens the run rather than performing a phase`);
    previous = index;
  }
});

test('C011 the phase count and the line count the file states are the length of the phase table', () => {
  const phases = /prints all (\d+) phases/.exec(COMMAND);
  const lines = /prints (\d+) lines/.exec(COMMAND);

  assert.notEqual(phases, null, 'the file states how many phases the status command prints');
  assert.notEqual(lines, null, 'the file states how many lines the status command prints');
  assert.equal(Number(phases[1]), PHASES.length);
  assert.equal(Number(lines[1]), PHASES.length);
});

test('C011 the brief names the file lists are the brief names the renderer accepts', () => {
  const listed = /Names are ((?:`[a-z]+`(?:, )?)+)/.exec(COMMAND);

  assert.notEqual(listed, null, 'the file lists the brief names');
  assert.deepEqual([...listed[1].matchAll(/`([a-z]+)`/g)].map(([, name]) => name), [...BRIEF_NAMES]);
});

/**
 * Where a run keeps everything it writes, named the way the argument names it.
 *
 * The directory name is read from the rail, so renaming it in the code without renaming
 * it here fails this test rather than leaving the file describing the old location.
 */
const RUN_DIRECTORY = `<dir of spec-file>/${RUN_DIRECTORY_NAME}`;

/**
 * The working files a run holds, other than the status file.
 *
 * The declaration and the readings come from the phase table, because a phase that starts
 * expecting a file brings that file into this check with it. The supplied material is
 * named here because no phase expects it: it is filed by `begin`, from the invocation,
 * and a run that received some has to be able to say where it put it. The status file is
 * left out because the sentence that defines the run directory lists it there, where the
 * directory is the subject and repeating its own path would say nothing.
 */
// [::TICKET::] PX-242, PX-243, PX-244, PX-254 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244|PX-254) --for-spec --no-implementation-order`.
function workingFiles() {
  const expectations = Object.values(PHASE_EXPECTS).join(' ');
  const readings = BRIEF_NAMES.map(readingsFileName).filter((name) => expectations.includes(name));
  return [DECLARATION_FILE, WORKLIST_FILE, PINS_FILE, ...readings, ADHOC_DIRECTORY, SUPPLIED_DIRECTORY, ARCHIVE_DIRECTORY];
}

/**
 * The backticked tokens written as paths, each split into its segments.
 *
 * A token is compared segment by segment rather than as a substring, so a module named
 * `rail/adhoc.mjs` is not read as the `adhoc` working directory of a run.
 */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function pathTokens() {
  return [...COMMAND.matchAll(/`([^`\n]*)`/g)]
    .map(([, token]) => token)
    .map((token) => token.split('/'))
    .filter((segments) => segments.length > 1);
}

test('C015 every working file of a run is named under the run directory the file defines', () => {
  const tokens = pathTokens();

  for (const name of workingFiles()) {
    const mentioning = tokens.filter((segments) => segments.includes(name));
    const under = mentioning.filter((segments) => segments.join('/').startsWith(`${RUN_DIRECTORY}/`));
    const elsewhere = mentioning.filter((segments) => !segments.join('/').startsWith(`${RUN_DIRECTORY}/`));

    assert.equal(under.length > 0, true, `the file names no path to ${name} under ${RUN_DIRECTORY}/`);
    assert.deepEqual(elsewhere.map((segments) => segments.join('/')), [], `${name} is named as a path outside ${RUN_DIRECTORY}/`);
  }
});

test('C011 the file states no count it could read from an array instead', () => {
  assert.equal(/\b\d+ checks\b/.test(COMMAND), false, 'the check count is derived from CHECKS and must not be restated');
  assert.equal(/\b\d+ pins\b/.test(COMMAND), false, 'the pin count is derived from the artifact and must not be restated');
  assert.equal(/\b\d+ briefs\b/.test(COMMAND), false, 'the brief count is derived from BRIEF_NAMES and must not be restated');
});

// ---------------------------------------------------------------------------
// PX-253 — the vocabularies the merge section names are the ones the rail declares
// ---------------------------------------------------------------------------

test('PX-253 every vocabulary the merge section names is the one the rail declares', () => {
  // The Merging section spells the escape positions and the outcomes, because a reader
  // repairing a dropped name must know the words without opening the schema. That makes
  // the section a second spelling of `UNREACHED_ESCAPES` and of `ADJUDICATION_OUTCOMES`,
  // and a second spelling is a second thing to keep in step: this is what keeps it.
  const mergeSection = /^## Merging[\s\S]*?(?=^## )/m.exec(COMMAND)?.[0] ?? '';

  assert.notEqual(mergeSection, '', 'the command file carries the merge section');
  // Both escapes repair a dropped operation and both non-claiming outcomes repair a dropped
  // entry, so those are the vocabularies the section must name. The claiming outcomes are
  // what a sequence is, and the repair is for the case where it is not one.
  const repairing = ADJUDICATION_OUTCOMES.filter((outcome) => !DIAGRAMMED_OUTCOMES.includes(outcome));
  const absentEscapes = UNREACHED_ESCAPES.filter((escape) => !mergeSection.includes(escape));
  const absentOutcomes = repairing.filter((outcome) => !mergeSection.includes(outcome));
  assert.deepEqual(absentEscapes, [], `the merge section does not name the escape(s): ${absentEscapes.join(', ')}`);
  assert.deepEqual(absentOutcomes, [], `the merge section does not name the outcome(s): ${absentOutcomes.join(', ')}`);
});
