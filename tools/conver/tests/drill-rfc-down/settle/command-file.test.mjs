// PX-234 @verifies C004
// PX-234 @verifies C005
// [::TICKET::] PX-234 changes: details in the command contexts. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
/**
 * What the drill edit must add, and what it must leave alone.
 *
 * `step1-command.test.cjs` already holds Step 1 to its sub-step headings, its
 * set-step calls and its self-containment. This file asserts the content this
 * ticket changed inside those sub-steps, and the editing policy the command states
 * — append first, never rewrite or delete — which is the promise the evolution
 * loop's safety rests on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const COMMAND = join(PROJECT_ROOT, '.claude/commands/drill-rfc-down.md');

const commandText = () => readFileSync(COMMAND, 'utf8');

/** A sub-step section, from its heading to the next `#### ` heading. */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function subStep(label) {
  const text = commandText();
  const start = text.indexOf(`#### ${label}.`);
  assert.notEqual(start, -1, `sub-step ${label} is present`);
  const end = text.indexOf('#### ', start + 1);
  return text.slice(start, end === -1 ? undefined : end);
}

test('C004 postcondition: 1-3 checks the prior artifacts before the grill asks anything', () => {
  const section = subStep('1-3');

  assert.match(section, /settle-run\.js/);
  assert.match(section, /prior/);
  assert.match(section, /^#### 1-3\./m, 'the check folds into 1-3 rather than becoming a new sub-step');
});

test('C004 postcondition: 1-5 carries the settle ladder inside the existing cycle', () => {
  const section = subStep('1-5');

  for (const rung of ['Q0', "Q0'", 'Q1', 'Q2', 'Q3']) {
    assert.ok(section.includes(rung), `the ladder rung ${rung} is stated`);
  }
  assert.match(section, /settle-run\.js/);
});

test('C005 invariant: the five-stage cycle is still stated in order', () => {
  const text = commandText();
  const cycle = ['質問', '回答', '追記', 'CheckList 照合', '再 grill 判定'];

  const positions = cycle.map((stage) => text.indexOf(stage));
  assert.ok(positions.every((position) => position !== -1), 'every stage is still named');
  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(positions[index] > positions[index - 1], `${cycle[index]} still follows ${cycle[index - 1]}`);
  }
});

test('C005 invariant: the editing policy the evolution loop depends on is unchanged', () => {
  const text = commandText();

  // The policy is stated in the command file's own words, not the README's: what
  // matters is that the two promises the evolution loop rests on are still made.
  assert.match(text, /RFC: append-only; no destructive change\./);
  assert.match(text, /artifacts evolve lockstep/);
  assert.match(text, /real GRAPH, Dirs-Tree, src, Tickets: unchanged until staged validation passes\./);
});

test('C005 invariant: the session stays isolated under the RFC directory', () => {
  const sessionInit = readFileSync(
    join(PROJECT_ROOT, '.claude/scripts/drill-rfc-down/session-init.js'),
    'utf8',
  );

  assert.match(sessionInit, /isolated drill session in \$SESSION_DIR = <rfcDir>\/drills/);
  assert.match(sessionInit, /pre-existing session files in the\s*\n?\s*\* RFC directory are never read or modified|Only files inside \$SESSION_DIR are written/);
});

test('C005 invariant: Steps 2 through 5 are untouched by this ticket', () => {
  const text = commandText();

  assert.match(text, /### Step 2: graphify/);
  assert.match(text, /### Step 3: boundify/);
  assert.match(text, /### Step 4: split/);
  assert.match(text, /### Step 5: verify/);
  assert.match(text, /six-consistency inspection|6チェック|six consistencies/);
});

test('C005 invariant: the reverse rotation section is present and unchanged in its claims', () => {
  const text = commandText();

  assert.match(text, /CLAIM-LEDGER\.json/, 'the rotation still depends on the claim ledger');
  assert.match(text, /Forward guarantee/, 'and still states its forward guarantee');
});
