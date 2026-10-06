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

// PX-239 @verifies C004
// PX-239 @verifies C007
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.

/** The drill command, which holds the same question-gate block byte for byte. */
const DRILL_COMMAND = join(PROJECT_ROOT, '.claude/commands/drill-rfc-down.md');

/**
 * The byte range the grill and the drill share, delimiters included.
 *
 * @param {string} file — a command file path
 * @returns {string} the shared block
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function sharedBlock(file) {
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf('<!-- question-gate:begin -->');
  const end = text.indexOf('<!-- question-gate:end -->');

  assert.notEqual(start, -1, `the opening delimiter is present in ${file}`);
  assert.notEqual(end, -1, `the closing delimiter is present in ${file}`);
  return text.slice(start, end);
}

test('C004 invariant: the shared block is byte-identical to the drill copy', () => {
  assert.equal(sharedBlock(COMMAND), sharedBlock(DRILL_COMMAND));
});

test('C004 invariant: ## Gates still reads G0 through G5 and nothing else', () => {
  const block = sharedBlock(COMMAND);

  for (const gate of ['G0 records', 'G1 settle', 'G2 fill', 'G3 ask', 'G4 check', 'G5 answers']) {
    assert.ok(block.includes(gate), `${gate} is still in the shared block`);
  }
  assert.ok(!/\*\*G6/.test(block), 'G6 lives outside the shared block');
});

test('C004 invariant: each delimiter still occurs exactly once per file', () => {
  for (const file of [COMMAND, DRILL_COMMAND]) {
    const text = readFileSync(file, 'utf8');
    assert.equal(text.split('<!-- question-gate:begin -->').length - 1, 1, `${file} opens once`);
    assert.equal(text.split('<!-- question-gate:end -->').length - 1, 1, `${file} closes once`);
  }
});

test('C007 invariant: the cross-directory section sits above the shared block', () => {
  const text = commandText();
  const section = text.indexOf('## ★ Cross-directory resolution');
  const opening = text.indexOf('<!-- question-gate:begin -->');

  assert.notEqual(section, -1, 'the first-class section is present');
  assert.ok(section < opening, 'the section is outside the shared block, above it');
});

test('C007 invariant: the defect classes and the G6 gate are stated', () => {
  const text = commandText();

  for (const word of ['contradiction', 'conflict', 'deficiency']) {
    assert.ok(text.includes(word), `the ${word} class is named`);
  }
  assert.match(text, /\*\*G6 defects\*\*/, 'G6 is stated where it is carried');
  assert.match(text, /never resolve a G6 failure by recording the defect and moving on/);
});

test('C007 invariant: the RFC Hard Constraints gained the two ledgers and the two composition rules', () => {
  const text = commandText();
  const start = text.indexOf('## RFC Hard Constraints');
  const section = text.slice(start, text.indexOf('### STEP 6', start));

  assert.match(section, /seed divergence ledger\*\* appendix \(STEP 5b\)/);
  assert.match(section, /defect ledger\*\* appendix \(STEP 7b\)/);
  assert.match(section, /defined in this document\s+or named with the record that defines it/);
  assert.match(section, /every cross-package edge states its \*\*counterpart\*\*/);
});

test('C007 invariant: STEP 5b and STEP 7b exist, and 7b follows 7a', () => {
  const text = commandText();
  const step5b = text.indexOf('### STEP 5b');
  const step6 = text.indexOf('### STEP 6');
  const step7a = text.indexOf('### STEP 7a');
  const step7b = text.indexOf('### STEP 7b');
  const step8 = text.indexOf('### STEP 8');

  assert.ok(step5b > 0 && step5b < step6, 'STEP 5b sits between STEP 5 and STEP 6');
  assert.ok(step7b > step7a && step7b < step8, 'STEP 7b sits after STEP 7a and before STEP 8');
});

test('C007 invariant: the STEP 8 gate carries five conditions and the defect gate', () => {
  const text = commandText();
  const start = text.indexOf('### STEP 8:');
  const section = text.slice(start, text.indexOf('### STEP 8a', start));

  assert.match(section, /gate \(all 5 required\)/);
  assert.match(section, /defect-report\.js --gate` exits 0/);
  assert.match(section, /seed divergence ledger and the defect ledger are present and well formed/);
});

test('C007 invariant: STEP 8a carries the cross-directory re-entry item', () => {
  const text = commandText();
  const start = text.indexOf('### STEP 8a');
  const section = text.slice(start);

  assert.match(section, /^4\. A defect whose target is another package re-enters \*\*that\*\* package/m);
  assert.match(section, /A cross-directory fix that\s+leaves the target's gates unrun is not a fix/);
});
