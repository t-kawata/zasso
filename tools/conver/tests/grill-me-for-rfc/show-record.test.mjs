// PX-239 @verifies C006
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
/**
 * Opening the cited section, so "verify before carrying" is one command.
 *
 * A defect inherited from another package's appendix is a reading, not a record. The
 * command that opens the source section is what turns the reading into something a
 * run can confirm — and a heading that does not resolve is itself the finding, since
 * a defect citing a section that does not exist is a defect in the claim.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GRILL_SHOW_RECORD, runCommand } from '../question-gate/helpers/fixture-workspace.mjs';

/** A record holding two sections, one of them with a nested subsection. */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function makeRecord() {
  const dir = mkdtempSync(join(tmpdir(), 'px239-show-'));
  const path = join(dir, 'RFC.md');
  writeFileSync(
    path,
    '# RFC\n\n' +
      '## 3.9 Write path\n\n## 3.9.4 Atomic batch, and no transaction handle\n\n' +
      'Atomicity is a batch, not a handle. Nothing outlives the call.\n\n' +
      '### 3.9.4.1 Consequences\n\nThe arena is freed on return.\n\n' +
      '## 3.10 Read path\n\nThe read result carries a proof bundle.\n',
    'utf8',
  );
  return path;
}

test('C006 postcondition: a resolvable heading prints its body, not its heading alone', () => {
  const result = runCommand(GRILL_SHOW_RECORD, [makeRecord(), '--section', '§3.9.4']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Atomicity is a batch/, 'the body is printed');
  assert.match(result.stdout, /Consequences/, 'a nested subsection is part of the section');
});

test('C006 invariant: the section stops at the next heading of its own level', () => {
  const result = runCommand(GRILL_SHOW_RECORD, [makeRecord(), '--section', '§3.9.4']);

  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    !result.stdout.includes('The read result carries a proof bundle'),
    'the following sibling section is not swallowed',
  );
});

test('C006 postcondition: a heading may be given with or without its level marker', () => {
  const bare = runCommand(GRILL_SHOW_RECORD, [makeRecord(), '--section', '3.9.4']);
  const marked = runCommand(GRILL_SHOW_RECORD, [makeRecord(), '--section', '## 3.9.4']);

  assert.equal(bare.status, 0, bare.stderr);
  assert.equal(marked.status, 0, marked.stderr);
});

test('C006 error: an unresolvable heading exits 1 and names what it could not resolve', () => {
  const result = runCommand(GRILL_SHOW_RECORD, [makeRecord(), '--section', '§9.9 Not present']);

  assert.equal(result.status, 1, 'a defect citing a section that does not exist is a defect in the claim');
  assert.match(result.stderr, /9\.9/);
});

test('C006 error: a missing file exits 1 rather than throwing', () => {
  const result = runCommand(GRILL_SHOW_RECORD, ['/nonexistent/RFC.md', '--section', '§1']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /RFC\.md/);
});

test('C006 precondition: a missing --section is a usage error, not an empty print', () => {
  const result = runCommand(GRILL_SHOW_RECORD, [makeRecord()]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage|section/i);
});
