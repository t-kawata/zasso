/**
 * Read the supplied census a sourceEnumerations pin names.
 *
 * The pin records the file, the digest and the shape that reads it. This module
 * resolves that file under the workspace's supplied directory, verifies the digest
 * and parses the fenced jsonl block. A refusal is named, never silent: a missing
 * file and an empty census would otherwise look the same to the caller.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const JSONL_BLOCK = /```jsonl\s*\n([\s\S]*?)```/;
const SUPPLIED_DIRECTORY = 'educe-sequences';
const SUPPLIED_SUBDIRECTORY = 'supplied';
const SUPPORTED_SHAPE = 'jsonFieldRows';

/** A named refusal the caller can report without guessing. */
// [::TICKET::] PX-303 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-303 --for-spec --no-implementation-order`.
function makeRefusal(code, problem) {
  return { ok: false, code, problem };
}

/**
 * Resolve a pinned census to its rows.
 *
 * @param {string} root — the workspace root
 * @param {object} pin — the sourceEnumerations entry
 * @returns {{ ok: true, rows: Array<object>, byKey: Map<string, object>, path: string }
 *   | { ok: false, code: string, problem: string }}
 */
export function readPinnedCensus(root, pin) {
  const file = pin?.source?.file;
  if (typeof file !== 'string' || file === '') {
    return makeRefusal('CENSUS_SOURCE_UNSTATED', 'the pin names no source file');
  }
  const shape = pin?.selector?.shape;
  if (shape !== SUPPORTED_SHAPE) {
    return makeRefusal('CENSUS_SHAPE_UNSUPPORTED', `the selector shape ${shape} is not ${SUPPORTED_SHAPE}`);
  }
  const parameter = pin?.selector?.parameter;
  if (typeof parameter !== 'string' || parameter === '') {
    return makeRefusal('CENSUS_KEY_UNSTATED', 'the selector names no key parameter');
  }

  const path = join(root, SUPPLIED_DIRECTORY, SUPPLIED_SUBDIRECTORY, file);
  if (!existsSync(path)) return makeRefusal('CENSUS_FILE_MISSING', `${path} does not exist`);

  const text = readFileSync(path, 'utf8');
  const digest = createHash('sha256').update(text).digest('hex');
  if (typeof pin.source.sha256 === 'string' && pin.source.sha256 !== '' && digest !== pin.source.sha256) {
    return makeRefusal('CENSUS_DIGEST_MISMATCH', `${file} digests to ${digest}; the pin records ${pin.source.sha256}`);
  }

  const block = JSONL_BLOCK.exec(text);
  if (block === null) return makeRefusal('CENSUS_BLOCK_MISSING', `${file} carries no fenced jsonl block`);

  const rows = [];
  const byKey = new Map();
  for (const line of block[1].split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    let row;
    try {
      row = JSON.parse(trimmed);
    } catch {
      return makeRefusal('CENSUS_ROW_INVALID', `${file} carries a row that is not JSON`);
    }
    const key = row?.[parameter];
    if (typeof key !== 'string' || key === '') {
      return makeRefusal('CENSUS_ROW_MISSING_KEY', `${file} carries a row without ${parameter}`);
    }
    if (byKey.has(key)) {
      return makeRefusal('CENSUS_DUPLICATE_KEY', `${file} names ${key} twice`);
    }
    byKey.set(key, row);
    rows.push(row);
  }

  return { ok: true, rows, byKey, path };
}
