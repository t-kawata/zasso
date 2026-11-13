/**
 * Write one index.md per directory in the OKF linked-list form.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { baseName, directoryOf, relativeLink } from '../paths/directory.mjs';

export function writeDirectoryIndexes({ bundle, outDir }) {
  const conceptsByDirectory = groupConcepts(bundle);
  const childDirectories = groupChildDirectories(bundle);
  for (const directory of bundle.directories) {
    const lines = [`# ${directory === '' ? 'Knowledge' : baseName(directory)}`, ''];
    for (const child of childDirectories.get(directory) ?? []) {
      lines.push(`- [${baseName(child)}](${relativeLink(directory, `${child}/index.md`)})`);
    }
    for (const concept of conceptsByDirectory.get(directory) ?? []) {
      lines.push(`- [${concept.title ?? baseName(concept.path)}](${relativeLink(directory, concept.path)})`);
    }
    lines.push('');
    const path = join(outDir, directory, 'index.md');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${lines.join('\n').replace(/\n+$/, '')}\n`);
  }
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function groupConcepts(bundle) {
  const groups = new Map();
  for (const concept of bundle.concepts) {
    const directory = directoryOf(concept.path);
    if (!groups.has(directory)) groups.set(directory, []);
    groups.get(directory).push(concept);
  }
  for (const concepts of groups.values()) concepts.sort((left, right) => left.path.localeCompare(right.path));
  return groups;
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function groupChildDirectories(bundle) {
  const groups = new Map();
  for (const directory of bundle.directories) {
    if (directory === '') continue;
    const parent = directoryOf(directory);
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(directory);
  }
  for (const directories of groups.values()) directories.sort();
  return groups;
}
