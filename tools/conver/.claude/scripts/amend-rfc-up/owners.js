'use strict';

/**
 * /amend-rfc-up owner artifact verification.
 *
 * An owner receipt is evidence only when the artifact actually changed, the
 * owner status file reports a finished run, and the receipt describes the
 * current bytes. A self-reported ok flag is not enough.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const OWNER_ARTIFACTS = Object.freeze({
  graphify: Object.freeze(['RFC-GRAPH.json']),
  boundify: Object.freeze(['RFC-Dirs-Tree.json']),
  split: Object.freeze(['Tickets.json']),
});
const OWNER_STATUS_FILES = Object.freeze({
  graphify: 'RFC-GRAPHIFY-Status.json',
  boundify: 'RFC-BOUNDIFY-Status.json',
  split: 'RFC-SPLIT-Status.json',
});
const OWNER_COMMANDS = Object.freeze({
  graphify: '/graphify-rfc',
  boundify: '/boundify-graph',
  split: '/split-to-tickets',
});
const FINISHED_STEP_VALUES = Object.freeze(new Set(['done', 'skipped']));

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function ownerArtifactPath({ packageDir, owner }) {
  const artifacts = OWNER_ARTIFACTS[owner];
  if (!artifacts) throw fail('OWNER_UNKNOWN', `unknown owner: ${owner}`, { owner });
  return path.join(path.resolve(packageDir), artifacts[0]);
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function snapshotOwnerArtifacts({ packageDir, owner }) {
  const artifactPath = ownerArtifactPath({ packageDir, owner });
  const exists = fs.existsSync(artifactPath);
  return {
    owner,
    artifactPath,
    exists,
    digest: exists ? sha256File(artifactPath) : null,
  };
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function buildOwnerPlan({ packageDir, owner, change = null }) {
  const snapshot = snapshotOwnerArtifacts({ packageDir, owner });
  return {
    ok: true,
    mode: 'owner',
    owner,
    changeId: change?.id || null,
    command: OWNER_COMMANDS[owner],
    packageDir: path.resolve(packageDir),
    beforeDigest: snapshot.digest,
    expectedArtifacts: [...(OWNER_ARTIFACTS[owner] || [])],
    statusFile: OWNER_STATUS_FILES[owner] || null,
  };
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function readStatus({ packageDir, statusFile }) {
  const statusPath = path.join(path.resolve(packageDir), statusFile);
  if (!fs.existsSync(statusPath)) {
    throw fail('OWNER_RECEIPT_INVALID', `owner status file is missing: ${statusFile}`, { statusFile });
  }
  let document;
  try {
    document = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  } catch (error) {
    throw fail('OWNER_RECEIPT_INVALID', `owner status file is not JSON: ${error.message}`, { statusFile });
  }
  return document;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function statusIsSuccessful(document) {
  if (!document || typeof document !== 'object') return false;
  if (typeof document.lastOutputDigest !== 'string' || document.lastOutputDigest.trim() === '') return false;
  if (typeof document.runs !== 'number' || document.runs < 1) return false;
  if (document.steps && typeof document.steps === 'object') {
    return Object.values(document.steps).every((value) => FINISHED_STEP_VALUES.has(value));
  }
  return true;
}

/** Accept a receipt only when it describes the current artifact and a finished run. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function validateOwnerReceipt({ packageDir, owner, receipt, requireDelta = true } = {}) {
  if (!receipt || receipt.owner !== owner) {
    throw fail('OWNER_RECEIPT_INVALID', 'receipt owner does not match the change owner', { owner });
  }
  if (receipt.exit !== 0) {
    throw fail('OWNER_RECEIPT_INVALID', `owner command exited ${receipt.exit}`);
  }
  const statusDocument = readStatus({ packageDir, statusFile: receipt.statusFile });
  if (!statusIsSuccessful(statusDocument)) {
    throw fail('OWNER_RECEIPT_INVALID', 'owner status file does not report a finished run');
  }
  const current = snapshotOwnerArtifacts({ packageDir, owner });
  if (!current.exists || current.digest !== receipt.afterDigest) {
    throw fail('OWNER_RECEIPT_INVALID', 'receipt afterDigest does not match the current artifact');
  }
  if (requireDelta && receipt.afterDigest === receipt.beforeDigest) {
    throw fail('OWNER_NO_DELTA', `owner ${owner} did not change its artifact`, { owner });
  }
  return { ok: true };
}

module.exports = {
  OWNER_ARTIFACTS,
  OWNER_COMMANDS,
  OWNER_STATUS_FILES,
  buildOwnerPlan,
  sha256File,
  snapshotOwnerArtifacts,
  validateOwnerReceipt,
};
