// PX-234 @verifies C004
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
/**
 * One rule text in three files.
 *
 * grill and drill must not diverge on the mechanism they share, and explain-seed is
 * where the mechanism came from. Encoding that as an intention is worth nothing —
 * three texts agree today and drift the first time one of them is edited. A
 * delimited block compared byte for byte turns the intention into a check.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const BEGIN = '<!-- question-gate:begin -->';
const END = '<!-- question-gate:end -->';
const COMMAND_FILES = ['explain-seed', 'grill-me-for-rfc', 'drill-rfc-down'].map((name) =>
  join(PROJECT_ROOT, '.claude', 'commands', `${name}.md`),
);

const read = (file) => readFileSync(file, 'utf8');

/** The text between the two delimiters, or null when the file carries no pair. */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function delimitedBlock(text) {
  const start = text.indexOf(BEGIN);
  const stop = text.indexOf(END);
  if (start === -1 || stop === -1 || stop < start) return null;
  return text.slice(start + BEGIN.length, stop).trim();
}

/** The first place two blocks disagree, as a line number and a line. */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function firstDifference(block, reference) {
  const lines = block.split('\n');
  const referenceLines = reference.split('\n');
  for (let index = 0; index < Math.max(lines.length, referenceLines.length); index += 1) {
    if (lines[index] !== referenceLines[index]) {
      return `line ${index + 1}: ${JSON.stringify(lines[index])} vs ${JSON.stringify(referenceLines[index])}`;
    }
  }
  return 'the blocks differ only in length';
}

test('C004 postcondition: each command file carries exactly one delimiter pair', () => {
  for (const file of COMMAND_FILES) {
    const text = read(file);
    assert.equal(text.split(BEGIN).length - 1, 1, `${file} carries one opening delimiter`);
    assert.equal(text.split(END).length - 1, 1, `${file} carries one closing delimiter`);
  }
});

test('C004 postcondition: the delimited block is byte-identical across the three files', () => {
  const blocks = COMMAND_FILES.map((file) => delimitedBlock(read(file)));
  assert.ok(blocks.every((block) => block !== null), 'every file carries a block');

  for (const [index, block] of blocks.entries()) {
    assert.equal(
      block,
      blocks[0],
      `${COMMAND_FILES[index]} diverges from ${COMMAND_FILES[0]} at ${firstDifference(block, blocks[0])}`,
    );
  }
});

test('C004 invariant: the shared block states the gate, the ladder and the refusals', () => {
  const block = delimitedBlock(read(COMMAND_FILES[1]));

  for (const line of ['決定', '根拠', '覆す条件', '決められなかった理由']) {
    assert.ok(block.includes(line), `the block states ${line}`);
  }
  for (const refusal of [
    'flag-is-not-a-ground',
    'foreign-package-doubt',
    'author-only-is-material-not-exemption',
    'weight-alone-does-not-bind',
  ]) {
    assert.ok(block.includes(refusal), `the block names the refusal ${refusal}`);
  }
  for (const q of ['Q0', "Q0'", 'Q1', 'Q2', 'Q3']) {
    assert.ok(block.includes(q), `the block states the ladder rung ${q}`);
  }
});

test('C004 invariant: the block is the same text the two commands act on, not a summary', () => {
  const block = delimitedBlock(read(COMMAND_FILES[1]));

  assert.ok(block.length > 1500, 'a block that fits in a paragraph cannot carry the rule');
  assert.equal(block.includes('RFC-SEED.md'), false, 'the block speaks the vocabulary both commands share, not one command’s file names');
});
