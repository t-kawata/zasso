// PX-371 — the evidence that a grill run's gate list passed.
//
// DONE used to be a state any caller could write. complete-run.js evaluated the ten
// required gates and then asked update-status.js to write DONE, but update-status.js
// had no way to know whether that evaluation happened. The receipt is that missing
// fact: complete-run.js writes it only after every gate exits zero, and
// update-status.js consumes it for the one DONE transition.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The file complete-run.js writes beside Status.json. */
export const COMPLETION_RECEIPT_FILE = '.conver-completion.json';

/** The receipt shape this module writes and reads. */
export const RECEIPT_FORMAT = 1;

/**
 * Write the gate evidence for one completion.
 *
 * @param {string} rfcDir — the package directory holding Status.json
 * @param {{ name: string, exitCode: number }[]} gates
 * @returns {{ path: string, receipt: object }}
 */
export function writeCompletionReceipt(rfcDir, gates) {
  const receiptPath = path.join(rfcDir, COMPLETION_RECEIPT_FILE);
  const receipt = {
    format: RECEIPT_FORMAT,
    gateNames: gates.map((gate) => gate.name),
    gates: gates.map(({ name, exitCode }) => ({ name, exitCode })),
    writtenAt: new Date().toISOString(),
  };
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { path: receiptPath, receipt };
}

/** A refusal in the shape the caller reports it. */
// [::TICKET::] PX-371 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-371 --for-spec --no-implementation-order`.
function refusal(code, detail = {}) {
  return { ok: false, code, ...detail };
}

/** Whether one gate record has the shape the receipt promises. */
// [::TICKET::] PX-371 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-371 --for-spec --no-implementation-order`.
function isGateRecord(gate) {
  return gate !== null
    && typeof gate === 'object'
    && typeof gate.name === 'string'
    && gate.name.length > 0
    && Number.isInteger(gate.exitCode);
}

/**
 * Read and validate the receipt without consuming it.
 *
 * Validation is ordered: the file must exist, be readable JSON with the declared
 * shape, name every required gate, and report every gate at exit zero. The order
 * matters because each refusal names a different repair: a missing receipt is a
 * completion that did not run, a missing gate is an incomplete gate list, and a
 * non-zero gate is a run that must be repaired before DONE.
 *
 * @param {string} receiptPath
 * @param {string[]} requiredGateNames
 * @returns {{ ok: true, receipt: object } | { ok: false, code: string, [key: string]: unknown }}
 */
export function readCompletionReceipt(receiptPath, requiredGateNames = []) {
  if (!existsSync(receiptPath)) return refusal('COMPLETION_RECEIPT_MISSING');

  let receipt;
  try {
    receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch {
    return refusal('COMPLETION_RECEIPT_INVALID', { detail: 'the receipt is not JSON' });
  }

  if (receipt?.format !== RECEIPT_FORMAT
    || !Array.isArray(receipt.gates)
    || !receipt.gates.every(isGateRecord)) {
    return refusal('COMPLETION_RECEIPT_INVALID', { detail: 'the receipt shape is not recognized' });
  }

  const gateNames = receipt.gates.map((gate) => gate.name);
  const missing = requiredGateNames.filter((name) => !gateNames.includes(name));
  if (missing.length > 0) {
    return refusal('COMPLETION_RECEIPT_INVALID', { missing, detail: 'the receipt names no evidence for a required gate' });
  }

  const failed = receipt.gates.find((gate) => gate.exitCode !== 0);
  if (failed !== undefined) {
    return refusal('COMPLETION_GATE_FAILED', { gate: failed.name, exitCode: failed.exitCode });
  }

  return { ok: true, receipt };
}

/**
 * Read the receipt and remove it, so the same evidence cannot authorize a second DONE.
 *
 * The removal happens only after a successful read. A malformed or failing receipt is
 * left in place: it is the state the reader repairs, and deleting it would hide the
 * gate that failed.
 *
 * @param {string} receiptPath
 * @param {string[]} requiredGateNames
 * @returns {ReturnType<typeof readCompletionReceipt>}
 */
export function consumeCompletionReceipt(receiptPath, requiredGateNames = []) {
  const read = readCompletionReceipt(receiptPath, requiredGateNames);
  if (read.ok) unlinkSync(receiptPath);
  return read;
}
