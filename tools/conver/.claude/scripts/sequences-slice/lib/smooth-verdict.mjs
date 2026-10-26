/**
 * The smooth verdict gate the graph stage sits behind.
 *
 * The package view is the frozen projection of the sequences artifact, and smooth is the
 * stage that proves the projection covers every sequence, operation and boundary. This
 * module reads that verdict, freezes the accepted status in a workspace-level receipt, and
 * lets graphify, boundify and split refuse to run when the receipt and the live status
 * disagree.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

import { snapshotDesignFiles } from '../../regeneration/lib/staging.mjs';

const require = createRequire(import.meta.url);
const { findAllocateManifest, findSingleSiblingPath } = require('../../lib/package-artifacts.js');

/** The receipt schema this module writes and reads. */
export const SMOOTH_VERDICT_SCHEMA_VERSION = 1;

/** The receipt filename at the workspace root. */
export const SMOOTH_VERDICT_RECEIPT_NAME = 'SMOOTH-VERDICT.json';

/** The named refusals the gate emits. */
export const SMOOTH_VERDICT_CODES = Object.freeze({
  MISSING_SMOOTH_VERDICT: 'MISSING_SMOOTH_VERDICT',
  SMOOTH_VERDICT_NOT_PASS: 'SMOOTH_VERDICT_NOT_PASS',
  STALE_SMOOTH_VERDICT: 'STALE_SMOOTH_VERDICT',
  SMOOTH_CERTIFICATE_INCOMPLETE: 'SMOOTH_CERTIFICATE_INCOMPLETE',
  SMOOTH_ARTIFACT_MISMATCH: 'SMOOTH_ARTIFACT_MISMATCH',
  MISSING_SMOOTH_RECEIPT: 'MISSING_SMOOTH_RECEIPT',
  MISSING_SMOOTH_ARTIFACT: 'MISSING_SMOOTH_ARTIFACT',
});

/** One named finding. */
// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
function finding(code, subject, message) {
  return { code, subject: subject ?? null, message };
}

/** The sha256 of a file the gate reads. */
// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** A JSON document, or null when it is absent or malformed. */
// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
function readJsonOrNull(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Whether a smooth status is a pass. */
// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
export function verdictIsPass(status) {
  const verdict = status?.verdict ?? {};
  return verdict.exitCode === 0
    && verdict.findings === 0
    && verdict.blocked === 0
    && (verdict.readings ?? 0) === 0
    && (verdict.withheld ?? 0) === 0;
}

/** The digest smooth-sequences/run.mjs computes over the frozen design snapshot. */
// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
export function computeInputDigest(root) {
  const snapshot = snapshotDesignFiles(root);
  const lines = Object.keys(snapshot).sort().map((path) => `${path}\u0000${snapshot[path]}`);
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** The workspace root that owns the package, or null outside a workspacify workspace. */
// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
export function findWorkspaceRoot(packageDir) {
  const manifest = findAllocateManifest(packageDir);
  return manifest === null ? null : dirname(manifest);
}

/** The single root artifact, or null when it is absent or ambiguous. */
// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
function rootArtifactPath(root) {
  return findSingleSiblingPath(root, '-sequences.json');
}

/** The receipt, or null. */
// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
export function readSmoothReceipt(root) {
  return readJsonOrNull(join(root, SMOOTH_VERDICT_RECEIPT_NAME));
}

/** Write the receipt by staging it beside its target and renaming it into place. */
// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
function writeSmoothReceipt(root, receipt) {
  const target = join(root, SMOOTH_VERDICT_RECEIPT_NAME);
  const staged = `${target}.partial.${process.pid}`;
  writeFileSync(staged, `${JSON.stringify(receipt, null, 2)}\n`);
  renameSync(staged, target);
}

/**
 * Verify the fresh smooth verdict and, when requested, freeze it in the workspace receipt.
 *
 * @param {{ packageDir: string, writeReceipt?: boolean }} input
 * @returns {{ ok: boolean, skipped?: string, findings: Array<object>, receipt: object|null }}
 */
// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
export function verifySmoothVerdict({ packageDir, writeReceipt = false }) {
  const workspaceRoot = findWorkspaceRoot(packageDir);
  if (workspaceRoot === null) {
    return { ok: true, skipped: 'outside-workspace', findings: [], receipt: null };
  }

  const statusPath = join(workspaceRoot, 'smooth-sequences', 'status.json');
  const status = readJsonOrNull(statusPath);
  if (status === null) {
    return {
      ok: false,
      findings: [finding(SMOOTH_VERDICT_CODES.MISSING_SMOOTH_VERDICT, statusPath, 'smooth status is missing or unreadable')],
      receipt: null,
    };
  }
  if (!verdictIsPass(status)) {
    return {
      ok: false,
      findings: [finding(SMOOTH_VERDICT_CODES.SMOOTH_VERDICT_NOT_PASS, statusPath, 'smooth verdict is not pass')],
      receipt: null,
    };
  }

  const artifactPath = rootArtifactPath(workspaceRoot);
  if (artifactPath === null) {
    return {
      ok: false,
      findings: [finding(SMOOTH_VERDICT_CODES.MISSING_SMOOTH_ARTIFACT, workspaceRoot, 'the root *-sequences.json is missing or ambiguous')],
      receipt: null,
    };
  }
  const artifactDigest = sha256File(artifactPath);
  const statusDigest = sha256File(statusPath);

  const existing = readSmoothReceipt(workspaceRoot);
  if (existing !== null
      && existing.schemaVersion === SMOOTH_VERDICT_SCHEMA_VERSION
      && existing.statusDigest === statusDigest
      && existing.artifactDigest === artifactDigest
      && existing.verdictPass === true) {
    return { ok: true, findings: [], receipt: existing };
  }

  const findings = [];
  const certificatePath = join(workspaceRoot, 'smooth-sequences', 'COMPLETION-CERTIFICATE.json');
  const certificate = readJsonOrNull(certificatePath);
  const evidenceManifestPath = join(workspaceRoot, 'educe-sequences', 'EVIDENCE-MANIFEST.json');
  if (certificate !== null) {
    if (certificate.status !== 'complete') {
      findings.push(finding(SMOOTH_VERDICT_CODES.SMOOTH_CERTIFICATE_INCOMPLETE, certificatePath, 'the completion certificate is not complete'));
    }
    if (certificate.inputs?.artifact !== artifactDigest) {
      findings.push(finding(SMOOTH_VERDICT_CODES.SMOOTH_ARTIFACT_MISMATCH, certificatePath, 'the certificate does not bind the live root artifact'));
    }
  } else if (existsSync(evidenceManifestPath)) {
    findings.push(finding(SMOOTH_VERDICT_CODES.SMOOTH_CERTIFICATE_INCOMPLETE, certificatePath, 'the evidence manifest is present and the certificate is missing'));
  }
  if (findings.length > 0) return { ok: false, findings, receipt: null };

  const inputDigest = computeInputDigest(workspaceRoot);
  if (status.inputDigest !== inputDigest) {
    return {
      ok: false,
      findings: [finding(SMOOTH_VERDICT_CODES.STALE_SMOOTH_VERDICT, statusPath, 'the frozen design snapshot no longer matches status.inputDigest')],
      receipt: null,
    };
  }

  const receipt = {
    schemaVersion: SMOOTH_VERDICT_SCHEMA_VERSION,
    workspaceRoot,
    statusDigest,
    inputDigest: status.inputDigest,
    reportDigest: status.reportDigest ?? null,
    generation: status.generation ?? null,
    artifactDigest,
    certificateStatus: certificate?.status ?? null,
    verdictPass: true,
    legacy: certificate === null,
    checkedAt: new Date().toISOString(),
  };
  if (writeReceipt) writeSmoothReceipt(workspaceRoot, receipt);
  return { ok: true, findings: [], receipt };
}

/**
 * The findings a downstream stage reports when the frozen receipt and the live workspace
 * disagree.
 *
 * @param {string} packageDir
 * @returns {Array<object>}
 */
// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
export function verifySmoothReceipt(packageDir) {
  const workspaceRoot = findWorkspaceRoot(packageDir);
  if (workspaceRoot === null) return [];

  const receiptPath = join(workspaceRoot, SMOOTH_VERDICT_RECEIPT_NAME);
  const receipt = readJsonOrNull(receiptPath);
  if (receipt === null) {
    return [finding(SMOOTH_VERDICT_CODES.MISSING_SMOOTH_RECEIPT, receiptPath, 'the workspace receipt is missing or unreadable')];
  }
  const findings = [];
  if (receipt.verdictPass !== true) {
    findings.push(finding(SMOOTH_VERDICT_CODES.SMOOTH_VERDICT_NOT_PASS, receiptPath, 'the receipt does not record a pass verdict'));
  }

  const statusPath = join(workspaceRoot, 'smooth-sequences', 'status.json');
  if (!existsSync(statusPath)) {
    findings.push(finding(SMOOTH_VERDICT_CODES.MISSING_SMOOTH_VERDICT, statusPath, 'smooth status is missing'));
  } else if (receipt.statusDigest !== sha256File(statusPath)) {
    findings.push(finding(SMOOTH_VERDICT_CODES.STALE_SMOOTH_VERDICT, statusPath, 'the smooth status changed after the receipt'));
  }

  const artifactPath = rootArtifactPath(workspaceRoot);
  if (artifactPath === null) {
    findings.push(finding(SMOOTH_VERDICT_CODES.MISSING_SMOOTH_ARTIFACT, workspaceRoot, 'the root *-sequences.json is missing or ambiguous'));
  } else if (receipt.artifactDigest !== sha256File(artifactPath)) {
    findings.push(finding(SMOOTH_VERDICT_CODES.STALE_SMOOTH_VERDICT, artifactPath, 'the root artifact changed after the receipt'));
  }
  return findings;
}
