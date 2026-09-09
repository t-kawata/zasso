// [::TICKET::] PX-175 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-175 --for-spec --no-implementation-order`.
/**
 * Filesystem guard for the single input argument (G0 Input lock).
 *
 * readSpecInput validates that the path denotes a readable, non-empty regular
 * file that decodes as UTF-8, and returns its raw bytes for normalization.
 * Every invalid input raises WorkSpacifyTreeError with gateId "G0" so the
 * command stops before any artifact can be created or replaced.
 */
import { statSync, readFileSync } from 'node:fs';
import { TextDecoder } from 'node:util';

import { WorkSpacifyTreeError } from './errors.mjs';

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

/** True when the path resolves to a regular file (missing and directories are false). */
export function isReadableRegularFile(absPath) {
  try {
    return statSync(absPath).isFile();
  } catch {
    return false;
  }
}

/**
 * Read and validate the specification input.
 *
 * @param {string} absPath - absolute path to the specification markdown file
 * @returns {{ absPath: string, rawBuffer: Buffer, bytes: Uint8Array, encoding: string }}
 * @throws {WorkSpacifyTreeError} gateId "G0" for any invalid input
 */
export function readSpecInput(absPath) {
  let stat;
  try {
    stat = statSync(absPath);
  } catch {
    throw new WorkSpacifyTreeError(`spec path does not exist: ${absPath}`, { gateId: 'G0' });
  }
  if (!stat.isFile()) {
    throw new WorkSpacifyTreeError(`spec path is not a regular file: ${absPath}`, { gateId: 'G0' });
  }
  if (stat.size === 0) {
    throw new WorkSpacifyTreeError(`spec file is empty: ${absPath}`, { gateId: 'G0' });
  }

  let rawBuffer;
  try {
    rawBuffer = readFileSync(absPath);
  } catch {
    throw new WorkSpacifyTreeError(`spec file is not readable: ${absPath}`, { gateId: 'G0' });
  }
  if (rawBuffer.length === 0) {
    throw new WorkSpacifyTreeError(`spec file is empty after reading: ${absPath}`, { gateId: 'G0' });
  }
  try {
    UTF8_DECODER.decode(rawBuffer);
  } catch {
    throw new WorkSpacifyTreeError(`spec file is not valid UTF-8: ${absPath}`, { gateId: 'G0' });
  }

  return {
    absPath,
    rawBuffer,
    bytes: new Uint8Array(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength),
    encoding: 'UTF-8',
  };
}
