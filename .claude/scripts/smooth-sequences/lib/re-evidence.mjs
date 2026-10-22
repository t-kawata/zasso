// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
/**
 * The one-time migration from the PX-290 generated evidence to an honest re-read.
 *
 * This module copies generated artifacts into an audit archive, removes them from the
 * live set, restores the inquest's original readers and clears the old receipts. It does
 * not produce a judgment, an attack or a reading: those are the reader's work.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  readManifestAt,
  sha256File,
  writeManifestAt,
} from '../../shared-obligations/evidence.mjs';

export const ARCHIVE_DIRECTORY = 'smooth-sequences/archive/px290-generated';
export const INQUEST_FILE = 'educe-sequences/readings-inquest.jsonl';
export const MANIFEST_DIRECTORY = 'educe-sequences';

/** The generated evidence kept for audit, in the order the archive records it. */
export const ARCHIVE_FILES = Object.freeze([
  'educe-sequences/readings-judgment.jsonl',
  'educe-sequences/readings-attack.jsonl',
  'educe-sequences/readings-effort.jsonl',
  'educe-sequences/readings-uncovered.jsonl',
  'educe-sequences/readings-span.jsonl',
  'educe-sequences/readings-adjudicate.jsonl',
  'educe-sequences/readings-adversarial.jsonl',
  'educe-sequences/readings-reroute.jsonl',
  INQUEST_FILE,
  'educe-sequences/EVIDENCE-MANIFEST.json',
  'smooth-sequences/REMEDIATION-OBLIGATIONS.json',
  'smooth-sequences/COMPLETION-CERTIFICATE.json',
  'smooth-sequences/JUDGMENT-WORKLIST.json',
  'smooth-sequences/SMOOTH-SEQUENCES.json',
  'smooth-sequences/SMOOTH-SEQUENCES.md',
]);

/** The generated files removed from the live set after the archive verifies them. */
export const REMOVE_FILES = Object.freeze([
  'educe-sequences/readings-judgment.jsonl',
  'educe-sequences/readings-attack.jsonl',
  'educe-sequences/readings-uncovered.jsonl',
  'smooth-sequences/REMEDIATION-OBLIGATIONS.json',
  'smooth-sequences/COMPLETION-CERTIFICATE.json',
  'smooth-sequences/JUDGMENT-WORKLIST.json',
]);

/** Write JSONL with one object per line. */
// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
function writeJsonLines(path, rows) {
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

/**
 * Copy generated evidence to the archive, verify every digest, then remove the live copy.
 *
 * A failed copy or a digest mismatch returns with nothing removed, so a caller can retry
 * without losing the evidence it was trying to preserve.
 */
// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
export function archiveGeneratedEvidence(root, { directory = join(root, ARCHIVE_DIRECTORY) } = {}) {
  mkdirSync(directory, { recursive: true });
  const files = [];
  for (const relative of ARCHIVE_FILES) {
    const source = join(root, relative);
    if (!existsSync(source)) continue;
    const archivePath = join(directory, relative);
    mkdirSync(dirname(archivePath), { recursive: true });
    copyFileSync(source, archivePath);
    const sourceDigest = sha256File(source);
    const archiveDigest = sha256File(archivePath);
    if (sourceDigest !== archiveDigest) {
      throw new Error(`archive digest mismatch for ${relative}`);
    }
    files.push({
      path: relative,
      archivePath,
      sha256: sourceDigest,
      bytes: statSync(source).size,
    });
  }
  writeFileSync(join(directory, 'INDEX.json'), `${JSON.stringify({
    schemaVersion: 1,
    createdFrom: root,
    files,
  }, null, 2)}\n`);

  const removed = [];
  for (const relative of REMOVE_FILES) {
    const path = join(root, relative);
    if (!existsSync(path)) continue;
    rmSync(path);
    removed.push(relative);
  }
  return { directory, files, removed };
}

/**
 * Restore every inquest row to the reader that actually answered it.
 *
 * `originalReader` and the remediation `anchor` are evidence of the migration, not of the
 * answer; the archive keeps the generated form. A row without `originalReader` keeps its
 * reader and is reported rather than relabelled.
 */
// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
export function restoreInquestReaders(root) {
  const path = join(root, INQUEST_FILE);
  if (!existsSync(path)) return { total: 0, restored: 0, withoutOriginal: 0 };
  const rows = readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
  const restored = rows.map(({ originalReader, anchor, ...row }) => {
    const reader = typeof originalReader === 'string' && originalReader !== '' ? originalReader : row.reader;
    return { ...row, reader };
  });
  writeJsonLines(path, restored);
  return {
    total: rows.length,
    restored: rows.filter((row) => typeof row.originalReader === 'string' && row.originalReader !== '').length,
    withoutOriginal: rows.filter((row) => typeof row.originalReader !== 'string' || row.originalReader === '').length,
  };
}

/**
 * Clear the manifest's receipts so the next generation re-opens every done phase.
 *
 * Deleting the manifest would make the receipt list null and preserve the carried status;
 * an empty array is the value that says "no phase has a current receipt".
 */
// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
export function resetManifestReceipts(root) {
  const directory = join(root, MANIFEST_DIRECTORY);
  const manifest = readManifestAt(directory);
  if (manifest === null) return { receipts: 0, manifest: null };
  const cleared = { ...manifest, receipts: [] };
  const path = writeManifestAt(directory, cleared);
  return { receipts: 0, manifest: path };
}

/** The archive index, or null when no archive exists. */
export function summarizeArchive(root) {
  const path = join(root, ARCHIVE_DIRECTORY, 'INDEX.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}
