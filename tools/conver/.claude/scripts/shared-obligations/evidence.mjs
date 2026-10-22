// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
/**
 * The evidence manifest, phase receipts and content digests.
 *
 * A reading file is evidence only when the manifest says which bytes the gate read. A
 * phase verdict is evidence only when the receipt's input digests still match the files
 * on disk. Both comparisons are mechanical and neither reads prose.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const EVIDENCE_MANIFEST_FILE_NAME = 'EVIDENCE-MANIFEST.json';
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const EVIDENCE_MANIFEST_SCHEMA_VERSION = 1;

/** The sha256 of a byte string. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function sha256Text(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

/** The sha256 of a file, or null when the file is absent. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function sha256File(path) {
  if (!existsSync(path)) return null;
  return sha256Text(readFileSync(path, 'utf8'));
}

/** A stable JSON encoding with sorted object keys. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
// [::TICKET::] PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The digest of a judgment worklist context or one obligation's evidence context. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function contextDigest(context) {
  return sha256Text(canonicalJson(context));
}

/** The stable id of a record, over everything except the id itself. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function recordIdOf(record) {
  const { recordId, ...body } = record ?? {};
  return contextDigest(body);
}

/** The manifest path inside a run directory. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function manifestAt(directory) {
  return join(directory, EVIDENCE_MANIFEST_FILE_NAME);
}

/** Read the manifest in one run directory, or null when it is absent or unreadable. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function readManifestAt(directory) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const path = manifestAt(directory);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Write the manifest into one run directory, exactly where the run keeps it. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function writeManifestAt(directory, manifest) {
  mkdirSync(directory, { recursive: true });
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const path = manifestAt(directory);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return path;
}

/** Bind the manifest to the artifact the reading phases will measure. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function updateManifestArtifact(directory, { spec, artifactPath }) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const manifest = readManifestAt(directory);
  if (manifest === null) return null;
  return writeManifestAt(directory, {
    ...manifest,
    spec: spec === undefined ? manifest.spec : { path: spec.path, sha256: spec.sha256 },
    artifact: { path: artifactPath, sha256: sha256File(artifactPath) },
  });
}

/** The lines of a specification between two 1-indexed positions, inclusive. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function sliceSpecLines(lines, from, to) {
  if (!Array.isArray(lines)) return '';
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const start = Math.max(1, Number.isInteger(from) ? from : 1);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const end = Math.min(lines.length, Number.isInteger(to) ? to : lines.length);
  if (start > end) return '';
  return lines.slice(start - 1, end).join('\n');
}

/**
 * Validate one phase receipt against the current input digests.
 *
 * A receipt with no inputs is valid only when the caller states no required input; an
 * absent receipt is never valid, because a carried verdict without a receipt closes
 * nothing.
 */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function validateReceipt(receipt, currentDigests = {}) {
  if (receipt === null || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return { valid: false, code: 'MISSING_RECEIPT', reason: 'no receipt was recorded', mismatches: [] };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const inputs = receipt.inputs;
  if (inputs === null || typeof inputs !== 'object' || Array.isArray(inputs)) {
    return { valid: false, code: 'MISSING_RECEIPT', reason: 'the receipt carries no input digest map', mismatches: [] };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const mismatches = Object.keys(inputs).filter((name) => currentDigests[name] !== inputs[name]);
  if (mismatches.length > 0) {
    return {
      valid: false,
      code: 'STALE_RECEIPT',
      reason: `input digest changed for ${mismatches.join(', ')}`,
      mismatches,
    };
  }
  return { valid: true, code: null, reason: null, mismatches: [] };
}

/** Validate every phase receipt in a manifest against the current input digests. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function validateManifestReceipts(manifest, currentDigests = {}) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const receipts = Array.isArray(manifest?.receipts) ? manifest.receipts : [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const stale = [];
  for (const receipt of receipts) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const validity = validateReceipt(receipt, currentDigests);
    if (!validity.valid) {
      stale.push({
        phase: receipt?.phase ?? null,
        code: validity.code ?? 'STALE_RECEIPT',
        mismatches: validity.mismatches ?? [],
      });
    }
  }
  return { valid: stale.length === 0, stale };
}

/** The digest map for the files a phase read or wrote. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function digestFiles(root, paths) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const digests = {};
  for (const path of paths) digests[path] = sha256File(join(root, path));
  return digests;
}

/** Write the evidence manifest and return its path. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function writeEvidenceManifest(root, manifest = {}) {
  const { spec, artifact, generation, files = [], receipts = [] } = manifest;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const body = {
    schemaVersion: EVIDENCE_MANIFEST_SCHEMA_VERSION,
    spec: spec ?? null,
    artifact: artifact ?? null,
    generation: generation ?? null,
    files: files.map((entry) => ({
      path: entry.path,
      sha256: entry.sha256 ?? sha256File(join(root, entry.path)),
      records: entry.records ?? null,
    })),
    receipts,
  };
  return writeManifestAt(join(root, 'educe-sequences'), body);
}

/**
 * Merge one phase receipt into an existing manifest.
 *
 * The run directory is the manifest's directory. A run with no manifest is legacy and
 * receives no receipt: the migration marker is what turns receipt checking on.
 */
// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function appendReceipt(runDirectory, receipt) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const manifest = readManifestAt(runDirectory);
  if (manifest === null) return null;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const receipts = (Array.isArray(manifest.receipts) ? manifest.receipts : [])
    .filter((entry) => entry?.phase !== receipt?.phase);
  receipts.push(receipt);
  manifest.receipts = receipts.sort((left, right) => (left.phase ?? 0) - (right.phase ?? 0));
  return writeManifestAt(runDirectory, manifest);
}

/** Read the evidence manifest, or null when it is absent or unreadable. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function readEvidenceManifest(root) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const candidates = [
    join(root, 'educe-sequences', EVIDENCE_MANIFEST_FILE_NAME),
    join(root, EVIDENCE_MANIFEST_FILE_NAME),
  ];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const path = candidates.find((candidate) => existsSync(candidate));
  if (path === undefined) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** The digest of a receipt's input map, for binding a verdict to its evidence. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function receiptDigest(receipt) {
  return contextDigest({ phase: receipt?.phase ?? null, inputs: receipt?.inputs ?? {}, outputs: receipt?.outputs ?? {} });
}
