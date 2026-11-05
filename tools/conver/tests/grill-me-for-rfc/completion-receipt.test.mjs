// PX-371 @verifies C001
// The receipt is the evidence that the gate list passed. The module owns its shape so
// the writer, the reader and the guard cannot drift into three spellings of one file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  COMPLETION_RECEIPT_FILE,
  consumeCompletionReceipt,
  readCompletionReceipt,
  writeCompletionReceipt,
} from '../../.claude/scripts/grill-me-for-rfc/completion-receipt.js';

const REQUIRED = ['design-tree-resolved', 'checklist-approved'];

/** A fresh directory that may hold one receipt. */
// [::TICKET::] PX-371 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-371 --for-spec --no-implementation-order`.
function makeDirectory() {
  return mkdtempSync(join(tmpdir(), 'px371-receipt-'));
}

test('C001 normal: a written receipt reads back the gate list it recorded', () => {
  const directory = makeDirectory();
  try {
    const written = writeCompletionReceipt(directory, [
      { name: REQUIRED[0], exitCode: 0 },
      { name: REQUIRED[1], exitCode: 0 },
    ]);

    const read = readCompletionReceipt(written.path, REQUIRED);

    assert.equal(read.ok, true);
    assert.deepEqual(read.receipt.gateNames, REQUIRED);
    assert.deepEqual(read.receipt.gates.map((gate) => gate.name), REQUIRED);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('C001 error: an absent receipt is named, not guessed', () => {
  const directory = makeDirectory();
  try {
    const read = readCompletionReceipt(join(directory, COMPLETION_RECEIPT_FILE), REQUIRED);

    assert.equal(read.ok, false);
    assert.equal(read.code, 'COMPLETION_RECEIPT_MISSING');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('C001 error: a malformed receipt is invalid', () => {
  const directory = makeDirectory();
  try {
    const receiptPath = join(directory, COMPLETION_RECEIPT_FILE);
    writeFileSync(receiptPath, '{not json', 'utf8');

    const read = readCompletionReceipt(receiptPath, REQUIRED);

    assert.equal(read.ok, false);
    assert.equal(read.code, 'COMPLETION_RECEIPT_INVALID');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('C001 invariant: a receipt missing a required gate name is invalid', () => {
  const directory = makeDirectory();
  try {
    const written = writeCompletionReceipt(directory, [{ name: REQUIRED[0], exitCode: 0 }]);

    const read = readCompletionReceipt(written.path, REQUIRED);

    assert.equal(read.ok, false);
    assert.equal(read.code, 'COMPLETION_RECEIPT_INVALID');
    assert.deepEqual(read.missing, [REQUIRED[1]]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('C001 invariant: a receipt with a non-zero gate is refused by name', () => {
  const directory = makeDirectory();
  try {
    const written = writeCompletionReceipt(directory, [
      { name: REQUIRED[0], exitCode: 1 },
      { name: REQUIRED[1], exitCode: 0 },
    ]);

    const read = readCompletionReceipt(written.path, REQUIRED);

    assert.equal(read.ok, false);
    assert.equal(read.code, 'COMPLETION_GATE_FAILED');
    assert.equal(read.gate, REQUIRED[0]);
    assert.equal(read.exitCode, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('C001 invariant: consuming a receipt removes the evidence it carried', () => {
  const directory = makeDirectory();
  try {
    const written = writeCompletionReceipt(directory, [
      { name: REQUIRED[0], exitCode: 0 },
      { name: REQUIRED[1], exitCode: 0 },
    ]);

    const consumed = consumeCompletionReceipt(written.path, REQUIRED);

    assert.equal(consumed.ok, true);
    assert.equal(existsSync(written.path), false);
    assert.equal(readCompletionReceipt(written.path, REQUIRED).code, 'COMPLETION_RECEIPT_MISSING');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
