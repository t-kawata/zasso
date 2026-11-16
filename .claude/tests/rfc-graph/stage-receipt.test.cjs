// @verifies C008
'use strict';

/**
 * A receipt rebuild refreshes the fields it owns and preserves the rest.
 *
 * `recordStageReceipt` owns the stage, the digests, the gate verdicts and the
 * timestamp. A receipt may also carry provenance it does not own, such as the
 * mutation that promoted Tickets.json. A rebuild from a design amendment must
 * leave that record in place; dropping it erases the only link from the receipt
 * to the promoted merge.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLAUDE_DIR = path.resolve(__dirname, '../..');
const RECEIPT_MODULE = path.join(CLAUDE_DIR, 'scripts/rfc-graph/lib/stage-receipt.js');

// [::TICKET::] PX-431 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-431 --for-spec --no-implementation-order`.
function createInputs() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-receipt-'));
  const rfcPath = path.join(directory, 'RFC.md');
  const outputPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(rfcPath, 'rfc body\n');
  fs.writeFileSync(outputPath, '{"tickets":[]}\n');
  return { directory, rfcPath, outputPath };
}

describe('recordStageReceipt ownership', () => {
  test('refreshes owned fields and preserves an unowned mutation', () => {
    const { recordStageReceipt } = require(RECEIPT_MODULE);
    const { directory, rfcPath, outputPath } = createInputs();
    const mutation = {
      digest: 'a'.repeat(64),
      manifest: { command: 'find-omissions', reason: 'phasified omissions', added: [] },
      recordedAt: '2026-01-01T00:00:00.000Z',
    };
    const previous = {
      stage: 'split',
      sourceDigest: 'b'.repeat(64),
      inputDigests: { graph: 'c'.repeat(64) },
      outputDigest: 'd'.repeat(64),
      gateVerdicts: [{ step: '1', verdict: 'done' }],
      recordedAt: '2026-01-01T00:00:00.000Z',
      mutation,
    };

    try {
      const rebuilt = recordStageReceipt({ receipt: previous }, { stage: 'split', rfcPath, inputs: {}, outputPath });

      assert.strictEqual(rebuilt.receipt.stage, 'split');
      assert.notStrictEqual(rebuilt.receipt.sourceDigest, previous.sourceDigest);
      assert.notStrictEqual(rebuilt.receipt.outputDigest, previous.outputDigest);
      assert.deepStrictEqual(rebuilt.receipt.mutation, mutation);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('invents no field when no previous receipt exists', () => {
    const { recordStageReceipt } = require(RECEIPT_MODULE);
    const { directory, rfcPath, outputPath } = createInputs();
    try {
      const rebuilt = recordStageReceipt({}, { stage: 'split', rfcPath, inputs: {}, outputPath });
      assert.strictEqual(Object.hasOwn(rebuilt.receipt, 'mutation'), false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('treats a non-object receipt as no previous receipt', () => {
    const { recordStageReceipt } = require(RECEIPT_MODULE);
    const { directory, rfcPath, outputPath } = createInputs();
    try {
      const rebuilt = recordStageReceipt({ receipt: [] }, { stage: 'split', rfcPath, inputs: {}, outputPath });
      assert.strictEqual(Object.hasOwn(rebuilt.receipt, 'mutation'), false);
      assert.strictEqual(Array.isArray(rebuilt.receipt), false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
