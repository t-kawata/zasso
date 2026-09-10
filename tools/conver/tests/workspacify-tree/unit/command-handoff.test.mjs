// [::TICKET::] PX-192 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-192 --for-spec --no-implementation-order`.
// PX-192 @verifies C006
// The stage-2 hand-off is a contract, so the operator document must state it and
// the approval checklist must ask for the dependency proof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DOC = readFileSync(
  fileURLToPath(new URL('../../../.claude/commands/workspacify-tree.md', import.meta.url)),
  'utf8',
);

test('C006 the document carries a stage-2 hand-off section', () => {
  assert.match(DOC, /## .*hand-off|## .*second stage/i, 'a hand-off section must exist');
  for (const anchor of ['implementation_order', 'DAG', 'segment', 'responsibilities', 'clause']) {
    assert.ok(DOC.includes(anchor), `the hand-off section must mention ${anchor}`);
  }
});

test('C006 the hand-off section states what stage 2 may rely on', () => {
  const section = DOC.split(/^## /m).find((part) => /^[^\n]*hand-off/i.test(part));
  assert.ok(section, 'the hand-off section must be findable');
  assert.match(section, /provider/);
  assert.match(section, /precondition/);
  assert.match(section, /invariant/);
  assert.match(section, /must not/);
});

test('C006 the approval checklist asks for the dependency proof', () => {
  const checklist = DOC.split(/^## /m).find((part) => part.includes('final approval'));
  assert.ok(checklist, 'the approval checklist must exist');
  assert.match(checklist, /dependenc/i);
  assert.match(checklist, /implementation_order|DAG/);
});
