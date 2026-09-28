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
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  FRAME_SECTIONS,
  buildFrame,
} from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import { syntheticFacts } from '../helpers/synthetic-facts.mjs';

const COMMAND_FILE = fileURLToPath(new URL('../../../.claude/commands/explain-seed.md', import.meta.url));

const SECOND_PERSON = /\b(you|your|yours|yourself)\b/i;

/**
 * A third person pronoun is a defect only where it can stand for one of the two agents:
 * both read the same page, so "they decide" leaves which of the two decides unanswered.
 * A pronoun whose own sentence names a thing to stand for is unambiguous, and is allowed.
 */
const THIRD_PERSON = /\b(they|them|their|theirs)\b/i;

/** The things a pronoun may stand for. Never a person. */
const INANIMATE_ANTECEDENT = /\b(tables?|sections?|items?|entries?|documents?|facts|markers?|questions?|contracts?|clauses?|rules?|lines?|files?|sentences?|columns?|rows?|prose)\b/i;

const BARE_READER = /\b(?:the|a) reader\b/i;

/** A document's sentences, so a pronoun is judged against the words of its own sentence. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function sentencesOf(documentText) {
  return documentText.split(/(?<=[.!?])\s+/);
}

/** Every module of the implementation that builds the two documents. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function implementationFiles() {
  const directory = fileURLToPath(new URL('../../../.claude/scripts/explain-seed/', import.meta.url));
  return readdirSync(directory, { recursive: true })
    .filter((name) => name.endsWith('.mjs'))
    .map((name) => `${directory}${name}`);
}

/** Japanese second person, which is what the explanation used to address the human with. */
const JAPANESE_SECOND_PERSON = /あなた/;

test('C003 invariant: no pronoun stands for either agent', () => {
  const commandFile = readFileSync(COMMAND_FILE, 'utf8');

  assert.doesNotMatch(commandFile, SECOND_PERSON, 'a second person in these instructions reads as the AI, even where the human is meant');
  for (const sentence of sentencesOf(commandFile)) {
    if (!THIRD_PERSON.test(sentence)) continue;
    assert.match(sentence, INANIMATE_ANTECEDENT, `a pronoun must have a thing to stand for, not one of the agents: ${sentence.trim()}`);
  }
});

test('C003 invariant: the implementation addresses neither agent as "you" either', () => {
  const sources = implementationFiles();

  assert.ok(sources.length > 1, 'the scan found the implementation, so an empty list cannot pass this');
  for (const sourceFile of sources) {
    assert.doesNotMatch(
      readFileSync(sourceFile, 'utf8'),
      SECOND_PERSON,
      `${sourceFile} is read by the AI, so a second person in it reads as the AI`,
    );
  }
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

test('C002 invariant: each document says which of the two agents it is for', () => {
  const commandFile = readFileSync(COMMAND_FILE, 'utf8');

  assert.match(commandFile, /this is what the AI works from/, 'the facts say the AI works from them');
  assert.match(commandFile, /human's writing under the placeholders/, 'and the explanation says the human writes into it');
});
