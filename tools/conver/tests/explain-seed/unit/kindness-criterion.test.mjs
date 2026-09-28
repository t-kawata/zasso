// PX-222 @verifies C003
// PX-222 @verifies C005
//
// The criterion for a kind explanation cannot live only in a preamble the AI has to
// remember to consult: the moment it is needed is the moment the AI is answering one
// instruction, and that is where it has to arrive. So this asserts the connection rather
// than the wording — the classification rule reaches the item the AI must classify, the
// "no formulaic override" rule reaches the marker it applies to, and the command file
// states both self-questions where the writing happens rather than only in a section
// further up the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  FRAME_SECTIONS,
  HUMAN_ITEM_HEADING,
  buildFrame,
} from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import { findOpenMarkers } from '../../../.claude/scripts/explain-seed/lib/markers.mjs';
import { syntheticFacts } from '../helpers/synthetic-facts.mjs';

const COMMAND_FILE = fileURLToPath(new URL('../../../.claude/commands/explain-seed.md', import.meta.url));

/** The marker instructions in one section of a fresh frame. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function instructionsIn(frameText, title) {
  const start = frameText.indexOf(`## ${title}`);
  const rest = frameText.slice(start + title.length + 3);
  const end = rest.search(/\n## /);
  const body = end < 0 ? rest : rest.slice(0, end);
  return findOpenMarkers(body).map((marker) => marker.text);
}

/** The body of one human-decision item in a fresh frame. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function firstHumanItem(frameText) {
  const start = frameText.indexOf(HUMAN_ITEM_HEADING);
  const rest = frameText.slice(start);
  const end = rest.indexOf(`\n${HUMAN_ITEM_HEADING}`, 1);
  return end < 0 ? rest : rest.slice(0, end);
}

/** One numbered item of the command file's flow, up to the next item. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function flowItem(commandFile, number) {
  const flowStart = commandFile.indexOf('\n## Flow');
  assert.notEqual(flowStart, -1, 'the command file has a flow to read');
  const flow = commandFile.slice(flowStart);
  const itemStart = flow.search(new RegExp(`^${number}\\. \\*\\*`, 'm'));
  assert.notEqual(itemStart, -1, `the flow has an item ${number}`);
  const item = flow.slice(itemStart);
  const end = item.search(new RegExp(`\\n${number + 1}\\. \\*\\*`));
  return end < 0 ? item : item.slice(0, end);
}

/** The `## ` section carrying a given block — found by the block, not by the section's own name. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function sectionAround(commandFile, token) {
  const at = commandFile.indexOf(token);
  assert.notEqual(at, -1, `the command file carries ${token}`);
  const section = commandFile.slice(commandFile.lastIndexOf('\n## ', at) + 1);
  const end = section.search(/\n## /);
  return end < 0 ? section : section.slice(0, end);
}

test('C005 invariant: the classification rule reaches the item the AI has to classify', () => {
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });
  const item = firstHumanItem(frame.text);

  assert.ok(
    item.includes(FRAME_SECTIONS[5].title),
    'the instruction says, where the AI is deciding, that an engineering question belongs in the pre-decided section',
  );
  assert.ok(
    item.includes('根拠') && item.includes('覆す条件'),
    'and says what the moved item must carry, so the rule can be followed rather than only known',
  );
});

test('C005 invariant: the rule against a formulaic override reaches the marker it applies to', () => {
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });
  const overrides = instructionsIn(frame.text, FRAME_SECTIONS[5].title).filter((text) => text.includes('覆す条件'));

  assert.ok(overrides.length > 0, 'the pre-decided items ask for the condition that would overturn them');
  for (const instruction of overrides) {
    assert.ok(
      /定型文|発火しない|そのままでは/.test(instruction),
      'the instruction says what an unacceptable answer looks like, not only what to write',
    );
  }
});

test('C003 invariant: every instruction says what an unacceptable answer looks like, not only what to write', () => {
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });
  const markers = findOpenMarkers(frame.text);
  const withStandard = markers.filter((marker) =>
    /書かない|投げ返|終わらせ|名指し|言い換え|並べない|移し|しない|見直す/.test(marker.text),
  );

  assert.ok(markers.length > 0, 'a fresh frame asks to be written');
  assert.equal(markers.length, withStandard.length, 'every instruction carries a standard, not just a topic');
});

test('C005 invariant: the command file states the classification where the writing happens', () => {
  const commandFile = readFileSync(COMMAND_FILE, 'utf8');
  const writingStep = flowItem(commandFile, 2);

  assert.match(writingStep, /could I write/i, 'the self-question for a handed-back engineering question is in the writing step');
  assert.match(writingStep, /would a reasonable engineer/i, 'and so is the self-question for a silently decided experiential one');
});

test('C005 invariant: the pre-decided section tells its reader how to challenge it', () => {
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });
  const body = frame.text.slice(frame.text.indexOf(`## ${FRAME_SECTIONS[5].title}`));
  const section = body.slice(0, body.indexOf('\n## '));

  assert.match(section, /grill で覆/, 'a reader who disagrees on how it feels is told that this is the place to say so');
});

test('C003 invariant: the command file tells the AI where the standard is applied', () => {
  const commandFile = readFileSync(COMMAND_FILE, 'utf8');
  const criterion = sectionAround(commandFile, '### Kind');

  assert.match(criterion, /\[::MUST-FILL::\]/, 'the criterion says the operative form of it arrives with each instruction');
});

test('C003 invariant: the command file sends the AI back to the criterion at the gate, not to a memory of it', () => {
  const commandFile = readFileSync(COMMAND_FILE, 'utf8');
  const gateStep = flowItem(commandFile, 3);

  assert.match(gateStep, /Kind\/Unfit/, 'the gate step names the criterion rather than gesturing at it');
  assert.match(gateStep, /≠|does \*\*not\*\* mean|does not mean/, 'and says plainly that passing the gate is not the criterion');
});
