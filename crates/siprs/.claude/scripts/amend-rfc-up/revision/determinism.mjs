// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function sha256Text(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function sha256Tree(root) {
  const hash = createHash('sha256');
  for (const file of listFiles(root)) {
    hash.update(file).update('\0').update(readFileSync(join(root, file))).update('\n');
  }
  return hash.digest('hex');
}

export function assertByteIdentical(left, right, message = 'artifact drift') {
  if (left !== right) {
    throw Object.assign(new Error(message), { code: 'REVISION_NOT_DETERMINISTIC' });
  }
  return true;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function listFiles(root) {
  const files = [];
  for (const entry of readdirSync(root).sort()) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listFiles(path).map((file) => join(entry, file)));
    } else {
      files.push(entry);
    }
  }
  return files.sort();
}
