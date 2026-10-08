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

import { BRIEF_NAMES } from '../../.claude/scripts/educe-sequences/rail/reading.mjs';
import { PHASES } from '../../.claude/scripts/educe-sequences/rail/gates.mjs';

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

test('C011 the file states no count it could read from an array instead', () => {
  assert.equal(/\b\d+ checks\b/.test(COMMAND), false, 'the check count is derived from CHECKS and must not be restated');
  assert.equal(/\b\d+ pins\b/.test(COMMAND), false, 'the pin count is derived from the artifact and must not be restated');
  assert.equal(/\b\d+ briefs\b/.test(COMMAND), false, 'the brief count is derived from BRIEF_NAMES and must not be restated');
});
