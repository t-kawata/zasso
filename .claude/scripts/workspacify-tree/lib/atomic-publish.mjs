// [::TICKET::] PX-178, PX-179 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-178|PX-179) --for-spec --no-implementation-order`.
/**
 * Atomic publication of the manifest (§13.1, §13.2).
 *
 * The manifest is written to a unique temporary file, re-read and verified
 * (self-hash), then renamed over the final name. When an existing manifest
 * records a different input source hash the publish is refused (BLOCKED) and
 * the existing artifact is never touched.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, openSync, fsyncSync, closeSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { computeSelfHash } from './render.mjs';

/** Temp files always follow this deterministic suffix pattern. */
const TEMP_FILE_SUFFIX = '.tmp';

/**
 * Publish manifest content atomically.
 *
 * @param {{ dir: string, fileName: string, content: string, sourceHash: string }} input
 * @returns {{ status: string, published: boolean, path?: string, reloadOk?: boolean, reason?: string }}
 */
export function atomicPublish({ dir, fileName, content, sourceHash }) {
  const targetPath = join(dir, fileName);
  sweepStaleTempFiles(dir, fileName);

  if (existsSync(targetPath)) {
    let existing;
    try {
      existing = JSON.parse(readFileSync(targetPath, 'utf8'));
    } catch {
      return { status: 'BLOCKED', published: false, reason: 'existing manifest is not valid JSON; refusing to replace' };
    }
    const existingHash = existing?.input?.source_hash;
    if (existingHash !== sourceHash) {
      return {
        status: 'BLOCKED',
        published: false,
        reason: `existing manifest source hash ${existingHash} differs from new input hash ${sourceHash}`,
      };
    }
  }

  const tempPath = join(dir, `${fileName}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(tempPath, content, 'utf8');
    syncFile(tempPath);
    const reloadText = readFileSync(tempPath, 'utf8');
    const parsed = JSON.parse(reloadText);
    const reloadOk = computeSelfHash(parsed) === parsed.integrity?.manifest_hash;
    if (!reloadOk) {
      rmSync(tempPath, { force: true });
      return { status: 'FAIL', published: false, reason: 'reload self-hash verification failed' };
    }
    renameSync(tempPath, targetPath);
    const finalText = readFileSync(targetPath, 'utf8');
    JSON.parse(finalText);
    return { status: 'PUBLISHED', published: true, path: targetPath, reloadOk: true };
  } catch (error) {
    rmSync(tempPath, { force: true });
    return { status: 'FAIL', published: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function sweepStaleTempFiles(dir, fileName) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  const prefix = `${fileName}.`;
  for (const entry of entries) {
    if (entry.startsWith(prefix) && entry.endsWith(TEMP_FILE_SUFFIX)) {
      rmSync(join(dir, entry), { force: true });
    }
  }
}

function syncFile(filePath) {
  let fileDescriptor;
  try {
    fileDescriptor = openSync(filePath, 'r+');
    fsyncSync(fileDescriptor);
  } finally {
    if (fileDescriptor !== undefined) {
      closeSync(fileDescriptor);
    }
  }
}
