// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-377 --for-spec --no-implementation-order`.
/**
 * The lineage receipt every derivation stage records beside its own status.
 *
 * A stage status already says which output digest it wrote. It did not say which RFC
 * bytes it read, so a package could hold a graph derived from an older RFC and no stage
 * could tell. The receipt is that missing half: the RFC digest at the moment the stage
 * completed, the input digests it consumed, the output digest it wrote and the step
 * verdicts that admitted the write.
 *
 * The receipt is additive. A status file written before this module existed has no
 * receipt and is read as legacy, never as stale, so the first chain run can populate it.
 */
'use strict';

const { createHash } = require('node:crypto');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const RECEIPT_FIELD = 'receipt';

/** The status file each stage owns, in the order the rederive chain runs. */
const STAGE_STATUS_FILES = Object.freeze({
  graphify: 'RFC-GRAPHIFY-Status.json',
  boundify: 'RFC-BOUNDIFY-Status.json',
  split: 'RFC-SPLIT-Status.json',
});

const RECEIPT_STATE = Object.freeze({
  MISSING: 'missing',
  FRESH: 'fresh',
  STALE: 'stale',
});

/** The sha256 of a file, or null when it is absent or unreadable. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function digestFile(filePath) {
  if (typeof filePath !== 'string' || !existsSync(filePath)) return null;
  try {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
  } catch {
    return null;
  }
}

/** A status document, or null when it is absent or unreadable. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function readStatus(statusPath) {
  if (!existsSync(statusPath)) return null;
  try {
    return JSON.parse(readFileSync(statusPath, 'utf8'));
  } catch {
    return null;
  }
}

/** The status path for one stage under a package directory. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function resolveStageStatusPath(directory, stage) {
  return join(directory, STAGE_STATUS_FILES[stage]);
}

/** Read the receipt a status carries, or null. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function readStageReceipt(status) {
  return status?.[RECEIPT_FIELD] ?? null;
}

/** The receipt state of every stage against the current RFC digest. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function readStageReceipts(directory, rfcDigest) {
  const receipts = {};
  for (const stage of Object.keys(STAGE_STATUS_FILES)) {
    const status = readStatus(resolveStageStatusPath(directory, stage));
    const receipt = readStageReceipt(status);
    if (receipt === null) {
      receipts[stage] = { state: RECEIPT_STATE.MISSING, receipt: null };
      continue;
    }
    const state = typeof rfcDigest === 'string' && receipt.sourceDigest === rfcDigest
      ? RECEIPT_STATE.FRESH
      : RECEIPT_STATE.STALE;
    receipts[stage] = { state, receipt };
  }
  return receipts;
}

/**
 * Record the receipt a stage writes into its own status.
 *
 * The caller passes the already-computed output digest; recomputing it here would let
 * the status and the receipt disagree if the file moved between the two reads.
 */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function recordStageReceipt(status, receiptInput) {
  const {
    stage,
    rfcPath,
    inputs = {},
    outputPath,
    outputDigest = null,
    gateVerdicts = [],
  } = receiptInput;
  const inputDigests = {};
  for (const [name, filePath] of Object.entries(inputs)) inputDigests[name] = digestFile(filePath);
  return {
    ...status,
    [RECEIPT_FIELD]: {
      stage,
      sourceDigest: digestFile(rfcPath),
      inputDigests,
      outputDigest: outputDigest ?? digestFile(outputPath),
      gateVerdicts,
      recordedAt: new Date().toISOString(),
    },
  };
}

/** The step verdicts a stage status already carries, in a receipt-friendly shape. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function collectStageGateVerdicts(status) {
  return Object.entries(status?.steps ?? {}).map(([step, verdict]) => ({ step, verdict }));
}

/** Findings that say why the rederive chain is not discharged. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function compareStageReceipts(directory, chain, rfcDigest) {
  const findings = [];
  for (const stage of chain) {
    const status = readStatus(resolveStageStatusPath(directory, stage));
    const receipt = readStageReceipt(status);
    if (receipt === null) {
      findings.push({ code: 'RECEIPT_MISSING', stage });
      continue;
    }
    if (receipt.sourceDigest !== rfcDigest) {
      findings.push({ code: 'RECEIPT_STALE', stage, expected: rfcDigest, actual: receipt.sourceDigest });
      continue;
    }
    if (status.lastOutputDigest !== null && receipt.outputDigest !== status.lastOutputDigest) {
      findings.push({ code: 'RECEIPT_OUTPUT_MISMATCH', stage, expected: status.lastOutputDigest, actual: receipt.outputDigest });
    }
  }
  return findings;
}

module.exports = {
  RECEIPT_FIELD,
  RECEIPT_STATE,
  STAGE_STATUS_FILES,
  compareStageReceipts,
  digestFile,
  readStageReceipt,
  readStageReceipts,
  recordStageReceipt,
  collectStageGateVerdicts,
  resolveStageStatusPath,
};
