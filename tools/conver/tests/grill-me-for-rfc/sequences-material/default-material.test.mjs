// PX-357 @verifies C001
// PX-357 @verifies C002
// PX-357 @verifies C003
/**
 * The material a grill run discovers before it is given any argument.
 *
 * Discovery is unconditional: the package directory supplies the research material and
 * the workspace root supplies the one sequences artifact. Arguments are additions, so
 * the merge is asserted separately from the discovery. The file system is injected, so
 * every case is decided without touching a tree.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  MATERIAL_UNREADABLE,
  mergeDiscoveredWithArguments,
  resolveDefaultMaterial,
} from '../../../.claude/scripts/grill-me-for-rfc/lib/default-material.mjs';

const ARTIFACT_FILENAME = 'SyntheticSpec-sequences.json';

/**
 * A file system that answers from a map.
 *
 * `unreadable` names the directories whose read must fail the way an unreadable
 * directory does, which is the only branch that must not degrade into an empty list.
 */
// [::TICKET::] PX-357 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-357 --for-spec --no-implementation-order`.
function makeIo({ entries = {}, workspaceRoot = null, unreadable = [] } = {}) {
  const unreadableDirectories = new Set(unreadable);
  return {
// [::TICKET::] PX-357 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-357 --for-spec --no-implementation-order`.
    readDirectory(directory) {
      if (unreadableDirectories.has(directory)) {
        const error = new Error(`EACCES: ${directory}`);
        error.code = 'EACCES';
        throw error;
      }
      return entries[directory] ?? [];
    },
    workspaceRootOf: () => workspaceRoot,
    join: path.posix.join,
    resolvePath: (value) => value,
  };
}

test('C001 returns every ordinary entry in codepoint order', () => {
  const io = makeIo({ entries: { '/pkg': ['gamma', 'beta.md', 'alpha.md'] } });

  const result = resolveDefaultMaterial({ rfcDir: '/pkg', io });

  assert.deepEqual(result.materialPaths, ['/pkg/alpha.md', '/pkg/beta.md', '/pkg/gamma']);
  assert.deepEqual(result.excluded, []);
});

test('C001 excludes hidden entries, command outputs and backups, and reports them apart', () => {
  const io = makeIo({
    entries: {
      '/pkg': [
        '.git',
        '.env',
        'RFC.md',
        'Status.json',
        'DesignTree.json',
        'CheckList.md',
        'SEQUENCES.md',
        'SEQUENCES.json',
        'SEQUENCES-DISTRIBUTIONS.json',
        'RFC.2026.bak.md',
        'Specification.md',
      ],
    },
  });

  const result = resolveDefaultMaterial({ rfcDir: '/pkg', io });

  assert.deepEqual(result.materialPaths, ['/pkg/Specification.md']);
  assert.deepEqual(result.excluded.sort(), [
    '.env',
    '.git',
    'CheckList.md',
    'DesignTree.json',
    'RFC.2026.bak.md',
    'RFC.md',
    'SEQUENCES-DISTRIBUTIONS.json',
    'SEQUENCES.json',
    'SEQUENCES.md',
    'Status.json',
  ]);
});

test('C001 is deterministic across runs', () => {
  const io = makeIo({ entries: { '/pkg': ['beta.md', 'alpha.md', 'gamma'] } });

  const first = resolveDefaultMaterial({ rfcDir: '/pkg', io });
  const second = resolveDefaultMaterial({ rfcDir: '/pkg', io });

  assert.deepEqual(second.materialPaths, first.materialPaths);
});

test('C001 treats an unreadable package directory as a named error, never an empty list', () => {
  const io = makeIo({ unreadable: ['/pkg'] });

  assert.throws(
    () => resolveDefaultMaterial({ rfcDir: '/pkg', io }),
    (error) => error.code === MATERIAL_UNREADABLE && error.message.includes('/pkg'),
  );
});

test('C002 appends the single workspace artifact last and exactly once', () => {
  const io = makeIo({
    entries: {
      '/ws/pkg': ['Specification.md'],
      '/ws': [ARTIFACT_FILENAME, 'WORKSPACIFY-TREE-MANIFEST.json'],
    },
    workspaceRoot: '/ws',
  });

  const result = resolveDefaultMaterial({ rfcDir: '/ws/pkg', io });

  assert.equal(result.workspaceRoot, '/ws');
  assert.equal(result.sequenceArtifact, `/ws/${ARTIFACT_FILENAME}`);
  assert.deepEqual(result.materialPaths, ['/ws/pkg/Specification.md', `/ws/${ARTIFACT_FILENAME}`]);
  assert.equal(result.materialPaths.filter((entry) => entry.endsWith('-sequences.json')).length, 1);
});

test('C002 does not append the artifact twice when the package directory is the workspace root', () => {
  const io = makeIo({
    entries: { '/ws': ['Specification.md', ARTIFACT_FILENAME] },
    workspaceRoot: '/ws',
  });

  const result = resolveDefaultMaterial({ rfcDir: '/ws', io });

  // The artifact is already a package entry, so discovery order governs and the artifact
  // is not appended a second time.
  assert.deepEqual(result.materialPaths, ['/ws/Specification.md', `/ws/${ARTIFACT_FILENAME}`]);
  assert.equal(result.materialPaths.filter((entry) => entry.endsWith('-sequences.json')).length, 1);
});

test('C002 names every candidate and selects none when the workspace holds several', () => {
  const io = makeIo({
    entries: { '/ws': ['B-sequences.json', 'A-sequences.json'] },
    workspaceRoot: '/ws',
  });

  const result = resolveDefaultMaterial({ rfcDir: '/ws/pkg', io });

  assert.equal(result.sequenceArtifact, null);
  assert.deepEqual(result.ambiguousSequenceArtifacts, ['A-sequences.json', 'B-sequences.json']);
});

test('C002 proceeds without an artifact outside a workspace or when the root holds none', () => {
  const outside = resolveDefaultMaterial({ rfcDir: '/plain', io: makeIo() });
  assert.equal(outside.workspaceRoot, null);
  assert.equal(outside.sequenceArtifact, null);
  assert.deepEqual(outside.ambiguousSequenceArtifacts, []);

  const emptyRoot = resolveDefaultMaterial({
    rfcDir: '/ws/pkg',
    io: makeIo({ entries: { '/ws': ['WORKSPACIFY-TREE-MANIFEST.json'] }, workspaceRoot: '/ws' }),
  });
  assert.equal(emptyRoot.workspaceRoot, '/ws');
  assert.equal(emptyRoot.sequenceArtifact, null);
});

test('C003 places discovered paths first and arguments after them in argv order', () => {
  const merged = mergeDiscoveredWithArguments({
    discovered: ['/pkg/Specification.md', '/ws/Spec-sequences.json'],
    argumentPaths: ['/extra/Design.md', '/extra/Notes.md'],
    resolvePath: (value) => value,
  });

  assert.deepEqual(merged.materialPaths, [
    '/pkg/Specification.md',
    '/ws/Spec-sequences.json',
    '/extra/Design.md',
    '/extra/Notes.md',
  ]);
  assert.deepEqual(merged.addedArguments, ['/extra/Design.md', '/extra/Notes.md']);
});

test('C003 an explicit duplicate contributes one entry at its first position', () => {
  const merged = mergeDiscoveredWithArguments({
    discovered: ['/pkg/Specification.md', '/ws/Spec-sequences.json'],
    argumentPaths: ['/ws/Spec-sequences.json', '/extra/Design.md'],
    resolvePath: (value) => value,
  });

  assert.deepEqual(merged.materialPaths, [
    '/pkg/Specification.md',
    '/ws/Spec-sequences.json',
    '/extra/Design.md',
  ]);
  assert.deepEqual(merged.addedArguments, ['/extra/Design.md']);
});

test('C003 arguments never remove a discovered path', () => {
  const discovered = ['/pkg/Specification.md'];

  const merged = mergeDiscoveredWithArguments({
    discovered,
    argumentPaths: ['/pkg/Specification.md', '/pkg/Added.md'],
    resolvePath: (value) => value,
  });

  for (const discoveredPath of discovered) {
    assert.equal(merged.materialPaths.includes(discoveredPath), true);
  }
});
