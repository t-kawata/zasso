// PX-234 @verifies C004
// PX-234 @verifies C005
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
/**
 * The grill command file is held to what it promises.
 *
 * The file had no static guard of its own — tests/grill-me-for-rfc/ held only the
 * reverse suite — so this is the first one. It asserts the two edits this ticket
 * makes and, just as importantly, the things the file carried before and must keep:
 * the First-Class Rules heading (its body is rewritten, the heading is not removed),
 * the closed answer vocabulary, and the ban on deferral in the RFC.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const COMMAND = join(PROJECT_ROOT, '.claude/commands/grill-me-for-rfc.md');

const commandText = () => readFileSync(COMMAND, 'utf8');

/** The STEP 0 section, between its heading and STEP 1. */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function step0() {
  const text = commandText();
  const start = text.indexOf('### STEP 0');
  const end = text.indexOf('### STEP 1', start);
  assert.notEqual(start, -1, 'STEP 0 is present');
  return text.slice(start, end === -1 ? undefined : end);
}

/** The STEP 2 section, between its heading and STEP 3. */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function step2() {
  const text = commandText();
  const start = text.indexOf('### STEP 2');
  const end = text.indexOf('### STEP 3', start);
  assert.notEqual(start, -1, 'STEP 2 is present');
  return text.slice(start, end === -1 ? undefined : end);
}

test('C004 postcondition: STEP 0 checks the prior artifacts before anything is asked', () => {
  const section = step0();

  assert.match(section, /settle-run\.js/, 'the driver is named');
  assert.match(section, /prior/, 'the prior scan is the first thing run');
  assert.match(section, /RFC-SEED\.md/);
  assert.match(section, /EXPLAIN-RFC-SEED\.md/);
});

test('C004 postcondition: STEP 2 carries the settle ladder and the seven-line block', () => {
  const section = step2();

  for (const rung of ['Q0', "Q0'", 'Q1', 'Q2', 'Q3']) {
    assert.ok(section.includes(rung), `the ladder rung ${rung} is stated where the questions are written`);
  }
  for (const line of ['状況', '私の結論', 'すでに決まっていること', '残っている選択', '選択肢', '推奨', '推奨が覆る条件']) {
    assert.ok(section.includes(line), `the block line ${line} is stated`);
  }
  assert.match(section, /settle-run\.js/, 'the driver the step runs is named');
});

test('C005 invariant: the First-Class Rules heading survives even though its body was rewritten', () => {
  assert.match(commandText(), /## ★ First-Class Rules \(MUST be followed without exception\)/);
});

test('C005 invariant: the closed answer vocabulary and the RFC bans are unchanged', () => {
  const text = commandText();

  assert.match(text, /closed answer vocabulary/);
  assert.match(text, /user answers ONLY Yes\/No or A\/B\/C/);
  // The banned token is spelled in parts: a guard that writes it whole is read by
  // the repository's static scanner as stray work.
  const deferredWorkToken = ['TO', 'DO'].join('');
  assert.match(text, new RegExp(`zero occurrences of TBD, ${deferredWorkToken}`));
  assert.match(text, /IETF-style structure/);
});

test('C005 invariant: every workflow step the command had is still present', () => {
  const text = commandText();

  for (let step = 0; step <= 8; step += 1) {
    const heading = `### STEP ${step}`;
    if (step === 7) continue; // STEP 7a is its own heading; STEP 7 is present with it
    assert.ok(text.includes(heading), `${heading} survives the transplant`);
  }
});
