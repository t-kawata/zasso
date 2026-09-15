// @verifies C001
// @verifies C002
/**
 * The artefact walk — an excluded subtree is one entry, and it is still there.
 *
 * `listArtefacts` descends into `target`, `vendor` and `node_modules` and
 * records every file it finds, marking each `out_of_scope`. On the experiment
 * input that is 7,785 rows for files the run has already decided not to
 * measure: the tree is 1.1G across 7,945 files, of which `target/` is 1.1G and
 * `src/` is 2.0M, so both the walk and the boundary it publishes are about 98%
 * devoted to build output.
 *
 * Collapsing a subtree must not remove it. The record exists so that "we did
 * not measure it" stays distinguishable from "it is not there" (failure F12),
 * and an entry naming the directory is what carries that distinction once the
 * files inside it are no longer enumerated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  EXCLUDED_SUBTREE_RECORDED_NAMES,
  listArtefacts,
} from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import { BUILD_DATABASE_NAMES } from '../../../.claude/scripts/workspacify-reverse/lib/build-database.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

const CARGO_MANIFEST = '[package]\nname = "walk-subject"\n';
const RUST_SOURCE = 'pub fn a() -> u8 { 1 }\n';
const FIRST_OBJECT = 'x'.repeat(64);
const SECOND_OBJECT = 'y'.repeat(32);

const byteLength = (text) => Buffer.byteLength(text, 'utf8');

/** An in-scope file beside an excluded subtree nested deeper than one level. */
// [::TICKET::] P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-6 --for-spec --no-implementation-order`.
function treeWithExcludedSubtree() {
  return createSyntheticTree({
    'Cargo.toml': CARGO_MANIFEST,
    'src/lib.rs': RUST_SOURCE,
    'deep/nested/target/debug/artifact.o': FIRST_OBJECT,
    'deep/nested/target/debug/other.o': SECOND_OBJECT,
  });
}

const entryAt = (artefacts, path) => artefacts.find((artefact) => artefact.path === path);

test('an excluded subtree is one entry, and no file beneath it is its own entry', () => {
  const tree = treeWithExcludedSubtree();
  try {
    const artefacts = listArtefacts(tree.root);
    const collapsed = artefacts.filter((artefact) => artefact.path === 'deep/nested/target');

    assert.equal(collapsed.length, 1, 'the subtree is present exactly once');
    assert.equal(collapsed[0].exclusion, true);
    assert.equal(collapsed[0].kind, 'directory');
    assert.equal(collapsed[0].count, 2, 'and says how many files it stands for');
    assert.equal(collapsed[0].size, byteLength(FIRST_OBJECT) + byteLength(SECOND_OBJECT));
    assert.equal(
      artefacts.some((artefact) => artefact.path.startsWith('deep/nested/target/')),
      false,
      'no file beneath a collapsed subtree appears as its own entry',
    );
  } finally {
    tree.dispose();
  }
});

test('the in-scope population is recorded exactly as it was before the collapse', () => {
  const tree = createSyntheticTree({ 'Cargo.toml': CARGO_MANIFEST, 'src/lib.rs': RUST_SOURCE });
  try {
    const artefacts = listArtefacts(tree.root);
    const source = entryAt(artefacts, 'src/lib.rs');

    assert.deepEqual(source, {
      path: 'src/lib.rs',
      kind: 'file',
      size: byteLength(RUST_SOURCE),
      readStatus: 'readable',
      exclusion: false,
      reason: null,
    }, 'a collapse that also altered in-scope records would fail here');
  } finally {
    tree.dispose();
  }
});

test('an excluded directory that cannot be listed is recorded, not dropped', () => {
  // The unreadable directory sits under `deep/`, which is not itself excluded:
  // under `vendor/` the collapse would happen at the excluded parent and the
  // locked directory would be inside the summary rather than an entry of its own.
  const tree = createSyntheticTree({ 'src/lib.rs': RUST_SOURCE, 'deep/target/inner.o': 'x'.repeat(8) });
  const locked = join(tree.root, 'deep/target');
  chmodSync(locked, 0o000);
  try {
    const recorded = listArtefacts(tree.root).filter((artefact) => artefact.path === 'deep/target');

    assert.equal(recorded.length, 1, 'the subtree is present once even when it cannot be read');
    assert.equal(recorded[0].exclusion, true);
    assert.equal(recorded[0].readStatus, 'unreadable');
    assert.equal(recorded[0].count, null, 'a partial total is not published as a total');
    assert.match(recorded[0].reason, /EACCES|permission/i, 'and names why');
  } finally {
    chmodSync(locked, 0o755);
    tree.dispose();
  }
});

test('the rule is about a directory, and an empty subtree is not omitted', () => {
  const tree = createSyntheticTree({ 'src/target': 'not a directory\n' });
  mkdirSync(join(tree.root, 'deep/target'), { recursive: true });
  try {
    const artefacts = listArtefacts(tree.root);

    const asFile = entryAt(artefacts, 'src/target');
    assert.equal(asFile.kind, 'file', 'a file named target is not a subtree');
    assert.equal('count' in asFile, false);

    const empty = artefacts.filter((artefact) => artefact.path === 'deep/target');
    assert.equal(empty.length, 1, 'an excluded directory holding no file is still one entry');
    assert.equal(empty[0].count, 0);
    assert.equal(empty[0].size, 0);
  } finally {
    tree.dispose();
  }
});

test('no record path is a descendant of a collapsed entry', () => {
  const tree = treeWithExcludedSubtree();
  try {
    const artefacts = listArtefacts(tree.root);
    const collapsed = artefacts.filter((artefact) => artefact.exclusion && artefact.kind === 'directory');

    assert.ok(collapsed.length > 0, 'the fixture must produce a collapsed entry, or this proves nothing');
    for (const directory of collapsed) {
      for (const artefact of artefacts) {
        assert.equal(
          artefact.path.startsWith(`${directory.path}/`),
          false,
          `${artefact.path} is beneath the collapsed ${directory.path}`,
        );
      }
    }
  } finally {
    tree.dispose();
  }
});

test('a build database inside an excluded subtree is still recorded, and by its own path', () => {
  // A build system writes its database where its output goes, so `target/` is
  // where `compile_commands.json` usually is. Excluding the tree must not hide
  // the file that configures the analysis of the project that owns it.
  const tree = createSyntheticTree({
    'src/widget.cpp': 'int widget() { return 1; }\n',
    'target/compile_commands.json': '[]',
    'target/debug/artifact.o': FIRST_OBJECT,
  });
  try {
    const artefacts = listArtefacts(tree.root);
    const database = entryAt(artefacts, 'target/compile_commands.json');

    assert.ok(database, 'the database is recorded rather than folded into the summary');
    assert.equal(database.exclusion, true, 'and is still marked out_of_scope, which is not the same as absent');
    assert.equal(database.readStatus, 'readable');

    const summary = entryAt(artefacts, 'target');
    assert.equal(summary.count, 2, 'the summary counts it as part of the subtree it stands for');
    assert.equal(
      artefacts.some((artefact) => artefact.path === 'target/debug/artifact.o'),
      false,
      'while a file the record does not need by name stays inside the summary',
    );
  } finally {
    tree.dispose();
  }
});

test('the names an excluded subtree records cover every name the build-database reader looks for', () => {
  // The walk does not import from `build-database.mjs`, so nothing but this
  // test stops the two lists from drifting apart in silence.
  for (const name of BUILD_DATABASE_NAMES) {
    assert.ok(
      EXCLUDED_SUBTREE_RECORDED_NAMES.includes(name),
      `${name} is searched for by name, so an excluded subtree must still record it`,
    );
  }
});

test('one more file inside an excluded subtree adds one to a count and no entries', () => {
  const smaller = createSyntheticTree({ 'src/lib.rs': RUST_SOURCE, 'target/debug/one.o': FIRST_OBJECT });
  const larger = createSyntheticTree({
    'src/lib.rs': RUST_SOURCE,
    'target/debug/one.o': FIRST_OBJECT,
    'target/debug/two.o': SECOND_OBJECT,
  });
  try {
    const before = listArtefacts(smaller.root);
    const after = listArtefacts(larger.root);

    assert.equal(after.length, before.length, 'the record does not grow with the excluded subtree');

    const inScope = (artefacts) => artefacts.filter((artefact) => !artefact.exclusion);
    assert.deepEqual(inScope(after), inScope(before), 'the measured population is identical');

    assert.equal(entryAt(after, 'target').count - entryAt(before, 'target').count, 1, 'the count moves by one');
    assert.equal(entryAt(after, 'target').size - entryAt(before, 'target').size, byteLength(SECOND_OBJECT));
  } finally {
    smaller.dispose();
    larger.dispose();
  }
});
