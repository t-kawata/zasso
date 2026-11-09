'use strict';

/**
 * Rebuild the digest chain the design artifacts carry.
 *
 * The RFC digest chain, the workspace tree manifest self-hash and the ticket
 * distribution digests all have an owner. This module calls those owners instead
 * of recomputing their formats, and it rebuilds only artifacts that exist.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const {
  STAGE_STATUS_FILES,
  recordStageReceipt,
  resolveStageStatusPath,
} = require('../rfc-graph/lib/stage-receipt.js');
const { writeJsonAtomically, refreshTicketDistributionDigests } = require('./add-tickets-for-phase.js');
const { ARTIFACT_KINDS, ARTIFACT_STATES, resolveArtifactStates } = require('./lib/design-amendment-state.js');

const TREE_MANIFEST_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
const HASH_MISMATCH = 'TREE_MANIFEST_HASH_MISMATCH';

/** The stage whose receipt names each output. */
const STAGE_OUTPUTS = Object.freeze({
  graphify: 'graphPath',
  boundify: 'dirsTreePath',
  split: 'ticketsPath',
});

/** The inputs each stage consumed. */
const STAGE_INPUTS = Object.freeze({
  graphify: [],
  boundify: ['graphPath'],
  split: ['graphPath', 'dirsTreePath'],
});

/** The sha256 of a buffer. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function digestBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Read a JSON file, or null when it is absent. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Rebuild the receipt of every stage status file that exists.
 *
 * A missing status file is not an error: a partially materialized package has
 * not run that stage, and the transaction must not create one.
 *
 * @param {{ directory: string, rfcPath: string, graphPath?: string|null,
 *           dirsTreePath?: string|null, ticketsPath?: string|null }} input
 * @returns {{ written: number, receipts: object }}
 */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function rebuildStageReceipts({ directory, rfcPath, graphPath = null, dirsTreePath = null, ticketsPath = null }) {
  const paths = { graphPath, dirsTreePath, ticketsPath };
  const receipts = {};
  let written = 0;

  for (const stage of Object.keys(STAGE_STATUS_FILES)) {
    const statusPath = resolveStageStatusPath(directory, stage);
    const status = readJsonIfPresent(statusPath);
    if (status === null) continue;
    const inputs = {};
    for (const key of STAGE_INPUTS[stage]) {
      if (paths[key]) inputs[key.replace(/Path$/, '')] = paths[key];
    }
    const outputPath = paths[STAGE_OUTPUTS[stage]];
    const nextStatus = recordStageReceipt(status, { stage, rfcPath, inputs, outputPath });
    writeJsonAtomically(statusPath, nextStatus);
    receipts[stage] = nextStatus.receipt;
    written += 1;
  }

  return { written, receipts };
}

/**
 * Rebuild the tree manifest input hash and self hash through its renderer.
 *
 * The hash over the SPEC is taken over the same normal form the tree pipeline
 * uses, so a CRLF checkout and an LF checkout produce one identity.
 *
 * @param {{ manifestPath: string, specPath: string }} input
 * @returns {Promise<object>} the reloaded manifest, validated
 */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
async function rebuildTreeManifestHashes({ manifestPath, specPath }) {
  const { normalizeTextBytes } = await import('../workspacify-tree/lib/normalization.mjs');
  const { sha256Hex } = await import('../workspacify-tree/lib/hash.mjs');
  const { computeSelfHash } = await import('../workspacify-tree/lib/render.mjs');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const specBytes = fs.readFileSync(specPath);
  const normalized = normalizeTextBytes(specBytes);
  const sourceText = Buffer.from(normalized.bytes).toString('utf8');

  manifest.input = {
    ...(manifest.input ?? {}),
    source_hash: sha256Hex(normalized.bytes),
    source_bytes: normalized.bytes.length,
    source_characters: [...sourceText].length,
    source_lines: sourceText.split('\n').length,
  };
  manifest.integrity = {
    ...(manifest.integrity ?? {}),
    input_hash_verified_at_finalize: true,
    reload_validation: 'PASS',
    manifest_hash: '',
  };
  manifest.integrity.manifest_hash = computeSelfHash(manifest);

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  const reloaded = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (computeSelfHash(reloaded) !== reloaded.integrity?.manifest_hash) {
    const error = new Error('tree manifest self-hash does not survive reload');
    error.code = HASH_MISMATCH;
    throw error;
  }
  return reloaded;
}

/**
 * Refresh the distribution digests a Tickets.json already carries.
 *
 * Exposed for the owner path only; the amendment transaction never calls it,
 * because Tickets.json is written through the mutation gate alone.
 */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function rebuildDistributionDigests({ ticketsPath }) {
  const document = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const before = JSON.stringify(document);
  refreshTicketDistributionDigests(document.phases);
  const after = JSON.stringify(document);
  if (before !== after) writeJsonAtomically(ticketsPath, document);
  return { refreshed: before !== after };
}

/** The stable view of a receipt used for the transaction digest. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function receiptDigestView(receipts) {
  const view = {};
  for (const [stage, receipt] of Object.entries(receipts)) {
    view[stage] = {
      sourceDigest: receipt.sourceDigest ?? null,
      inputDigests: receipt.inputDigests ?? {},
      outputDigest: receipt.outputDigest ?? null,
    };
  }
  return view;
}

/** Find the workspace tree manifest visible from a package directory. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function findTreeManifest(directory) {
  let current = path.resolve(directory);
  for (;;) {
    const candidate = path.join(current, TREE_MANIFEST_NAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Rebuild every digest that belongs to an artifact present in the package.
 *
 * @param {{ cwd: string }} input
 * @returns {Promise<{ digest: string, manifestHash: string|null, receipts: object, skipped: string[] }>}
 */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
async function rebuildDesignHashes({ cwd }) {
  const states = resolveArtifactStates({ cwd });
  const present = new Map(states.filter((state) => state.state === ARTIFACT_STATES.PRESENT).map((state) => [state.kind, state]));
  const skipped = states.filter((state) => state.state === ARTIFACT_STATES.ABSENT).map((state) => state.kind);

  const rfc = present.get(ARTIFACT_KINDS.RFC);
  const graph = present.get(ARTIFACT_KINDS.GRAPH);
  const dirsTree = present.get(ARTIFACT_KINDS.DIRS_TREE);
  const tickets = present.get(ARTIFACT_KINDS.TICKETS);
  const spec = present.get(ARTIFACT_KINDS.SPEC);

  const receiptResult = rfc
    ? rebuildStageReceipts({
      directory: cwd,
      rfcPath: rfc.path,
      graphPath: graph?.path ?? null,
      dirsTreePath: dirsTree?.path ?? null,
      ticketsPath: tickets?.path ?? null,
    })
    : { written: 0, receipts: {} };

  let manifestHash = null;
  const manifestPath = spec ? findTreeManifest(cwd) : null;
  if (manifestPath) {
    const manifest = await rebuildTreeManifestHashes({ manifestPath, specPath: spec.path });
    manifestHash = manifest.integrity?.manifest_hash ?? null;
  }

  const stable = JSON.stringify({ receipts: receiptDigestView(receiptResult.receipts), manifestHash });
  return {
    digest: digestBytes(Buffer.from(stable, 'utf8')),
    manifestHash,
    receipts: receiptResult.receipts,
    skipped,
  };
}

module.exports = {
  TREE_MANIFEST_NAME,
  rebuildStageReceipts,
  rebuildTreeManifestHashes,
  rebuildDistributionDigests,
  rebuildDesignHashes,
};
