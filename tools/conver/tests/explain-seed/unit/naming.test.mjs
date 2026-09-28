// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
// PX-222 @verifies C002
// PX-222 @verifies C003
//
// Two agents read these artefacts: the AI writes the explanation, and the human decides what
// only a human can. A pronoun cannot tell those two apart, and the artefacts are read by both
// — the AI opens the explanation to write into it, and the section addressed to the human is
// sitting right there when it does. So each of them is named, and neither is addressed as
// "you": a second person in a slash command's own instructions reads as the AI, which is
// exactly the wrong reading when the sentence is about the human.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  FRAME_SECTIONS,
  buildFrame,
} from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import { syntheticFacts } from '../helpers/synthetic-facts.mjs';

const COMMAND_FILE = fileURLToPath(new URL('../../../.claude/commands/explain-seed.md', import.meta.url));

const SECOND_PERSON = /\b(you|your|yours|yourself)\b/i;

/** Any pronoun that could stand for one of the two agents. */
const AGENT_PRONOUN = /\b(you|your|yours|yourself|they|them|their|theirs)\b/i;

const BARE_READER = /\b(?:the|a) reader\b/i;

/** Japanese second person, which is what the explanation used to address the human with. */
const JAPANESE_SECOND_PERSON = /あなた/;

test('C003 invariant: the command file addresses neither agent as "you"', () => {
  const commandFile = readFileSync(COMMAND_FILE, 'utf8');

  assert.doesNotMatch(commandFile, SECOND_PERSON, 'a second person in these instructions reads as the AI, even where the human is meant');
  assert.doesNotMatch(commandFile, AGENT_PRONOUN, 'and no pronoun stands in for either agent');
});

test('C003 invariant: the command file names both agents rather than leaving either to a role', () => {
  const commandFile = readFileSync(COMMAND_FILE, 'utf8');

  assert.match(commandFile, /\bthe AI\b/, 'the agent that writes is named');
  assert.match(commandFile, /\bthe human\b/, 'the agent that decides is named');
  assert.doesNotMatch(commandFile, BARE_READER, '"the reader" does not say which of the two is meant');
});

test('C003 invariant: the explanation names the human in the section the human decides in', () => {
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });

  assert.match(FRAME_SECTIONS[4].title, /人間/, 'the section title names the human rather than addressing them');
  assert.doesNotMatch(frame.text, JAPANESE_SECOND_PERSON, 'and nothing in the document addresses either agent as あなた');
});

test('C003 invariant: the command file quotes the section titles the frame actually writes', () => {
  const commandFile = readFileSync(COMMAND_FILE, 'utf8');

  for (const section of FRAME_SECTIONS) {
    if (!commandFile.includes(section.title)) continue;
    assert.ok(commandFile.includes(`「${section.title}」`), `${section.title} is quoted as the frame writes it`);
  }
  for (const title of ['あなたが決めること（ここだけ）']) {
    assert.equal(commandFile.includes(title), false, 'no reference survives a title the frame no longer writes');
  }
});

test('C002 invariant: the facts document and the explanation name their own reader', () => {
  const commandFile = readFileSync(COMMAND_FILE, 'utf8');

  assert.match(commandFile, /its reader is a machine or an AI/, 'the facts state who reads them');
  assert.match(commandFile, /its reader is a person/, 'and the explanation states who reads it');
});
