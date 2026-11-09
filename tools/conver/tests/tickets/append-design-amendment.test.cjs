'use strict';

/**
 * PX-400 — append-only amendment writer.
 *
 * Every pre-existing byte survives; only a new amendment section is appended.
 * A missing target is a named refusal, never a silent create.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  appendAmendment,
  verifyAppendOnly,
} = require('../../.claude/scripts/tickets/append-design-amendment.js');

// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function tempFile(name, content) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px400-append-'));
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

test('C006: an append leaves every pre-existing byte unchanged', () => {
  const filePath = tempFile('RFC.md', '# RFC\n\n## Clause\n\nOriginal prose.\n');
  const before = fs.readFileSync(filePath);

  const result = appendAmendment({
    filePath,
    ticketKey: 'PX-400',
    title: 'Missing clause',
    body: 'The implementation adds the missing clause.',
  });

  const after = fs.readFileSync(filePath);
  assert.equal(result.ok, true);
  assert.equal(result.noChange, false);
  assert.ok(after.subarray(0, before.length).equals(before));
  assert.equal(verifyAppendOnly(before, after), true);
  assert.ok(after.toString('utf8').includes('## Design Amendments'));
  assert.ok(after.toString('utf8').includes('### Amendment PX-400-1'));
});

test('C009: an identical second amendment is a no-op', () => {
  const filePath = tempFile('RFC.md', '# RFC\n');
  const input = { filePath, ticketKey: 'PX-400', title: 'Same', body: 'Same body.' };

  appendAmendment(input);
  const before = fs.readFileSync(filePath);
  const second = appendAmendment(input);
  const after = fs.readFileSync(filePath);

  assert.equal(second.ok, true);
  assert.equal(second.noChange, true);
  assert.ok(after.equals(before));
});

test('C006: a sequence collision is refused', () => {
  const filePath = tempFile('RFC.md', '# RFC\n');
  appendAmendment({ filePath, ticketKey: 'PX-400', title: 'First', body: 'First body.' });

  const result = appendAmendment({
    filePath,
    ticketKey: 'PX-400',
    title: 'Second',
    body: 'Second body.',
    sequence: 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'AMENDMENT_ANCHOR_COLLISION');
});

test('C006: an edit operation is refused', () => {
  const filePath = tempFile('RFC.md', '# RFC\n');

  const result = appendAmendment({
    filePath,
    ticketKey: 'PX-400',
    title: 'Edit',
    body: 'Edit body.',
    op: 'replace',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'AMENDMENT_EDIT_REFUSED');
});

test('C006: a missing target is refused without creating a file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px400-append-'));
  const filePath = path.join(directory, 'RFC.md');

  const result = appendAmendment({ filePath, ticketKey: 'PX-400', title: 'X', body: 'Y' });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'APPEND_TARGET_MISSING');
  assert.equal(fs.existsSync(filePath), false);
});

test('C006: verifyAppendOnly rejects a rewrite of an existing byte', () => {
  const before = Buffer.from('original');
  const appended = Buffer.from('original and more');
  const rewritten = Buffer.from('OriginaL and more');

  assert.equal(verifyAppendOnly(before, appended), true);
  assert.equal(verifyAppendOnly(before, rewritten), false);
});
