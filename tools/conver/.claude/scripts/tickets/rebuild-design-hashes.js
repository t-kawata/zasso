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
const {
  ARTIFACT_KINDS,
  ARTIFACT_STATES,
  resolveArtifactStates,
  resolveWorkspaceRoot,
} = require('./lib/design-amendment-state.js');

const TREE_MANIFEST_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
const ALLOCATE_MANIFEST_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
const FORMULA_SIDECAR_NAME = 'RFC-FORMULAS.json';
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
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function digestBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Read a JSON file, or null when it is absent. */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function rebuildDistributionDigests({ ticketsPath }) {
  const document = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const before = JSON.stringify(document);
  refreshTicketDistributionDigests(document.phases);
  const after = JSON.stringify(document);
  if (before !== after) writeJsonAtomically(ticketsPath, document);
  return { refreshed: before !== after };
}

/** The stable view of a receipt used for the transaction digest. */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
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

/** The workspace tree manifest at the git top-level, or null. */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function workspaceManifestPath(workspaceRoot) {
  if (!workspaceRoot) return null;
  const candidate = path.join(workspaceRoot, TREE_MANIFEST_NAME);
  return fs.existsSync(candidate) ? candidate : null;
}

/** The JSON reference block a seed carries in section 1. */
// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
function extractReferenceBlock(seedText) {
  const match = /```json\s*\n([\s\S]*?)\n```/.exec(seedText);
  if (match === null) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Verify the stage-1 -> stage-2 hash chain without rewriting it.
 *
 * The allocate manifest records the stage-1 hash and every seed hash; each seed
 * records the stage-1 hash again. Recomputing the chain in place would need the
 * allocate owner, so a mismatch is a finding with that owner as its repair route.
 *
 * @param {{ workspaceRoot: string }} input
 * @returns {Promise<{ findings: object[], skipped: string[] }>}
 */
// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
async function verifyAllocateChain({ workspaceRoot }) {
  const treePath = path.join(workspaceRoot, TREE_MANIFEST_NAME);
  const allocatePath = path.join(workspaceRoot, ALLOCATE_MANIFEST_NAME);
  if (!fs.existsSync(treePath) || !fs.existsSync(allocatePath)) {
    return { findings: [], skipped: ['allocate-absent'] };
  }

  let tree;
  let allocate;
  try {
    tree = JSON.parse(fs.readFileSync(treePath, 'utf8'));
    allocate = JSON.parse(fs.readFileSync(allocatePath, 'utf8'));
  } catch (error) {
    return {
      findings: [{
        code: 'ALLOCATE_CHAIN_UNREADABLE',
        asset: allocatePath,
        problem: error.message,
        fixes: [],
        rerun: 'repair the allocate manifest and rerun verify-amendment.js',
      }],
      skipped: [],
    };
  }

  const { computeAllocateSelfHash } = await import('../workspacify-allocate/lib/allocate-manifest.mjs');
  const findings = [];
  const expectedHash = tree.integrity?.manifest_hash ?? null;
  const rerun = 'run /workspacify-allocate, then re-run verify-amendment.js';

  if (allocate.input_tree_manifest?.hash !== expectedHash) {
    findings.push({ code: 'ALLOCATE_CHAIN_STALE', asset: allocatePath, problem: 'input_tree_manifest.hash does not match the tree manifest', fixes: [], rerun });
  }
  if (allocate.input_tree_manifest?.spec?.sha256 !== tree.input?.source_hash) {
    findings.push({ code: 'ALLOCATE_SPEC_HASH_STALE', asset: allocatePath, problem: 'input_tree_manifest.spec.sha256 does not match the tree manifest source hash', fixes: [], rerun });
  }
  if (allocate.integrity?.manifest_hash !== computeAllocateSelfHash(allocate)) {
    findings.push({ code: 'ALLOCATE_SELF_HASH_MISMATCH', asset: allocatePath, problem: 'allocate manifest self-hash does not survive recomputation', fixes: [], rerun });
  }

  for (const entry of allocate.seed_index ?? []) {
    const seedPath = path.join(workspaceRoot, entry.path);
    if (!fs.existsSync(seedPath)) {
      findings.push({ code: 'ALLOCATE_SEED_MISSING', asset: seedPath, problem: 'seed named by seed_index is absent', fixes: [], rerun });
      continue;
    }
    const seedDigest = digestBytes(fs.readFileSync(seedPath));
    if (seedDigest !== entry.sha256) {
      findings.push({ code: 'ALLOCATE_SEED_HASH_MISMATCH', asset: seedPath, problem: 'seed bytes do not match seed_index.sha256', fixes: [], rerun });
    }
    const block = extractReferenceBlock(fs.readFileSync(seedPath, 'utf8'));
    if (block === null || block.stage1_manifest?.hash !== expectedHash) {
      findings.push({ code: 'ALLOCATE_SEED_REFERENCE_STALE', asset: seedPath, problem: 'seed reference block does not bind the current stage-1 hash', fixes: [], rerun });
    }
  }

  return { findings, skipped: [] };
}

/**
 * Verify that the formula sidecar binds the RFC body.
 *
 * `computeRfcDigest` hashes the body above the Formula ledger appendix. An
 * amendment appended after that appendix leaves the digest unchanged; a change
 * that lands in the body makes the sidecar stale and names its repair route.
 *
 * @param {{ packageDir: string, rfcPath: string }} input
 * @returns {Promise<{ findings: object[], skipped: string[] }>}
 */
// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
async function verifyFormulaDigest({ packageDir, rfcPath }) {
  const sidecarPath = path.join(packageDir, FORMULA_SIDECAR_NAME);
  if (!fs.existsSync(sidecarPath)) return { findings: [], skipped: ['no-sidecar'] };

  let sidecar;
  try {
    sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
  } catch (error) {
    return {
      findings: [{ code: 'FORMULA_SIDECAR_UNREADABLE', asset: sidecarPath, problem: error.message, fixes: [], rerun: 'repair RFC-FORMULAS.json and rerun verify-amendment.js' }],
      skipped: [],
    };
  }

  const { computeRfcDigest } = await import('../spec-formula/ledger.mjs');
  const digest = computeRfcDigest(fs.readFileSync(rfcPath, 'utf8'));
  if (sidecar.rfcDigest !== digest) {
    return {
      findings: [{
        code: 'FORMULA_DIGEST_STALE',
        asset: sidecarPath,
        problem: 'rfcDigest does not reproduce the current RFC body',
        fixes: [],
        rerun: 'run the formula owner (/grill-me-for-rfc or deduplicate-headings.js), then re-run verify-amendment.js',
      }],
      skipped: [],
    };
  }
  return { findings: [], skipped: [] };
}

/**
 * Rebuild every digest that belongs to an artifact present in the package.
 *
 * @param {{ cwd: string }} input
 * @returns {Promise<{ digest: string, manifestHash: string|null, receipts: object,
 *           skipped: string[], findings: object[], allocateSkipped: string[],
 *           formulaSkipped: string[] }>}
 */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
async function rebuildDesignHashes({ cwd }) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
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
  const manifestPath = spec ? workspaceManifestPath(workspaceRoot) : null;
  if (manifestPath) {
    const manifest = await rebuildTreeManifestHashes({ manifestPath, specPath: spec.path });
    manifestHash = manifest.integrity?.manifest_hash ?? null;
  }

  const allocate = spec && workspaceRoot
    ? await verifyAllocateChain({ workspaceRoot })
    : { findings: [], skipped: ['no-workspace'] };
  const formula = rfc
    ? await verifyFormulaDigest({ packageDir: cwd, rfcPath: rfc.path })
    : { findings: [], skipped: ['no-rfc'] };
  const findings = [...allocate.findings, ...formula.findings];

  const stable = JSON.stringify({
    receipts: receiptDigestView(receiptResult.receipts),
    manifestHash,
    findings: findings.map((finding) => finding.code),
  });
  return {
    digest: digestBytes(Buffer.from(stable, 'utf8')),
    manifestHash,
    receipts: receiptResult.receipts,
    skipped,
    findings,
    allocateSkipped: allocate.skipped,
    formulaSkipped: formula.skipped,
  };
}

module.exports = {
  ALLOCATE_MANIFEST_NAME,
  FORMULA_SIDECAR_NAME,
  TREE_MANIFEST_NAME,
  rebuildStageReceipts,
  rebuildTreeManifestHashes,
  rebuildDistributionDigests,
  rebuildDesignHashes,
  verifyAllocateChain,
  verifyFormulaDigest,
};
