// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
// P22-11 @verifies C001
// T1 to T4: the reverse rotation must be grounded in a tree that was measured,
// not in one that was assumed. Every difference is named, and a gate that cannot
// see its input says so rather than passing quietly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  MEASURED_TREE_EXCLUSIONS,
  assertGrounding,
  assertNoBehaviouralLoss,
  assertStructureParity,
  measureDirectoryTree,
  measureImplementationOrder,
} from '../../../.claude/scripts/workspacify-tree/lib/structure-parity.mjs';
import {
  FIXTURE_DIRECTORIES,
  FIXTURE_SOURCE_FILES,
  removeTree,
  writeTree,
} from './helpers/reverse-fixture.mjs';

/** Run a body against a freshly written measured tree and always clean up. */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function withMeasuredTree(body) {
  const root = writeTree();
  try {
    return body(root, measureDirectoryTree(root));
  } finally {
    removeTree(root);
  }
}

test('T1 measures the directory set from the filesystem, with one shared exclusion population', () => {
  assert.ok(MEASURED_TREE_EXCLUSIONS.includes('vendor'), 'vendor must be excluded');
  assert.ok(MEASURED_TREE_EXCLUSIONS.includes('target'), 'target must be excluded');
  assert.ok(MEASURED_TREE_EXCLUSIONS.includes('node_modules'), 'node_modules must be excluded');
  assert.ok(MEASURED_TREE_EXCLUSIONS.includes('.git'), '.git must be excluded');

  withMeasuredTree((root, measured) => {
    assert.deepEqual(measured.directories, FIXTURE_DIRECTORIES);
    assert.deepEqual(measured.sourceFiles, FIXTURE_SOURCE_FILES);
    assert.ok(measured.excluded.includes('vendor'), 'the excluded population is reported, not silently dropped');
    assert.ok(measured.excluded.includes('target'));
    assert.ok(!existsSync(join(root, 'vendor', 'pjsip', 'pj.c')) === false, 'the vendor file really exists on disk');
  });
});

test('T1 passes when the manifest package paths equal the measured directories in both directions', () => {
  withMeasuredTree((root, measured) => {
    const record = assertStructureParity({
      packagePaths: ['examples', 'src', 'src/api'],
      measuredDirectories: measured.directories,
    });
    assert.equal(record.gateId, 'T1');
    assert.equal(record.status, 'PASS');
    assert.deepEqual(record.counts, { extra: 0, missing: 0 });
    assert.deepEqual(record.extras, []);
    assert.deepEqual(record.missing, []);
    assert.ok(record.reasons.length > 0, 'a verdict is always accompanied by a sentence');
  });
});

test('T1 names every difference as either extra or missing', () => {
  const record = assertStructureParity({
    packagePaths: ['examples', 'src', 'src/api'],
    measuredDirectories: ['examples', 'src', 'src/audio', 'src/security'],
  });
  assert.equal(record.status, 'FAIL');
  assert.deepEqual(record.extras, ['src/audio', 'src/security']);
  assert.deepEqual(record.missing, ['src/api']);
  assert.deepEqual(record.counts, { extra: 2, missing: 1 });
  const text = record.reasons.join('\n');
  assert.match(text, /extra/, 'the report must say a path is extra');
  assert.match(text, /missing/, 'the report must say a path is missing');
  assert.match(text, /src\/audio/);
  assert.match(text, /src\/api/);
});

test('T1 treats an empty directory set as an explicit result rather than a vacuous pass', () => {
  const empty = assertStructureParity({ packagePaths: [], measuredDirectories: [] });
  assert.equal(empty.status, 'PASS');
  assert.deepEqual(empty.counts, { extra: 0, missing: 0 });
  assert.ok(empty.reasons.length > 0, 'even an empty comparison states what it compared');

  const oneSided = assertStructureParity({ packagePaths: [], measuredDirectories: FIXTURE_DIRECTORIES });
  assert.equal(oneSided.status, 'FAIL');
  assert.deepEqual(oneSided.extras, [...FIXTURE_DIRECTORIES]);
});

test('T1 never excludes a directory name that can also be ordinary source', () => {
  // `src/build/` is a real source directory in the target project. Excluding it
  // by name would drop its files from T2's population in silence, and a file
  // dropped before the gate runs can never be reported as unowned.
  assert.ok(!MEASURED_TREE_EXCLUSIONS.includes('build'), 'build must be measured, not excluded');
  assert.ok(!MEASURED_TREE_EXCLUSIONS.includes('coverage'));

  const root = writeTree({ 'src/build/mod.rs': 'pub fn linked() {}\n' });
  try {
    const measured = measureDirectoryTree(root);
    // `src` holds no file directly, so only the directory that does is measured.
    assert.deepEqual(measured.directories, ['src/build']);
    assert.deepEqual(measured.sourceFiles, ['src/build/mod.rs']);
    assert.deepEqual(measured.excluded, []);
  } finally {
    removeTree(root);
  }
});

test('T1 excludes a nested dependency tree, because a monorepo nests node_modules', () => {
  const root = writeTree({
    'packages/app/src/lib.rs': 'pub fn app() {}\n',
    'packages/app/node_modules/dep/src/index.js': 'export const dep = 1;\n',
    'packages/app/vendor/dep/src/lib.rs': 'pub fn vendored() {}\n',
  });
  try {
    const measured = measureDirectoryTree(root);
    assert.deepEqual(measured.directories, ['packages/app/src']);
    assert.deepEqual(measured.sourceFiles, ['packages/app/src/lib.rs']);
    assert.deepEqual(measured.excluded, ['packages/app/node_modules', 'packages/app/vendor']);
  } finally {
    removeTree(root);
  }
});

test('T2 passes only when every hand-written source file is owned by a package path', () => {
  const record = assertNoBehaviouralLoss({
    packages: [
      { id: 'p-examples', path: 'examples' },
      { id: 'p-src', path: 'src' },
    ],
    sourceFiles: FIXTURE_SOURCE_FILES,
  });
  assert.equal(record.gateId, 'T2');
  assert.equal(record.status, 'PASS');
  assert.equal(record.counts.unowned, 0);
  assert.ok(record.reasons.length > 0);
});

test('T2 names a source file that no package owns', () => {
  const record = assertNoBehaviouralLoss({
    packages: [{ id: 'p-src', path: 'src' }],
    sourceFiles: FIXTURE_SOURCE_FILES,
  });
  assert.equal(record.status, 'FAIL');
  assert.deepEqual(record.unowned, ['examples/free.rs']);
  assert.equal(record.counts.unowned, 1);
  assert.match(record.reasons.join('\n'), /examples\/free\.rs/);
});

test('T2 lets a package with path "." own the files that sit at the project root', () => {
  const rootPackage = assertNoBehaviouralLoss({
    packages: [{ id: 'p-root', path: '.' }],
    sourceFiles: ['build.rs', 'wrapper.h'],
  });
  assert.equal(rootPackage.status, 'PASS', 'a root package owns root-level sources');

  const siblingTrap = assertNoBehaviouralLoss({
    packages: [{ id: 'p-src', path: 'src' }],
    sourceFiles: ['src-gen/generated.rs'],
  });
  assert.equal(siblingTrap.status, 'FAIL', 'a prefix that is not a path segment must not own the file');
  assert.deepEqual(siblingTrap.unowned, ['src-gen/generated.rs']);
});

test('T3 reports an unresolvable node with its identifier', () => {
  const root = writeTree();
  try {
    const record = assertGrounding({
      nodes: [
        { id: 'N0007', file: 'src/missing.rs' },
        { id: 'N0008', file: 'src/lib.rs' },
      ],
      resolveFilePath: (file) => join(root, file),
    });
    assert.equal(record.gateId, 'T3');
    assert.equal(record.status, 'FAIL');
    assert.deepEqual(record.unresolvable, ['N0007']);
    assert.equal(record.counts.nodes, 2);
    assert.match(record.reasons.join('\n'), /N0007/);
  } finally {
    removeTree(root);
  }
});

test('T3 passes when every node resolves to a file that exists', () => {
  const root = writeTree();
  try {
    const record = assertGrounding({
      nodes: [
        { id: 'N0001', file: 'src/lib.rs' },
        { id: 'N0002', file: 'src/api/mod.rs' },
      ],
      resolveFilePath: (file) => join(root, file),
    });
    assert.equal(record.status, 'PASS');
    assert.deepEqual(record.unresolvable, []);
    assert.ok(record.reasons.length > 0);
  } finally {
    removeTree(root);
  }
});

test('T3 fails when no graph was supplied, because an omitted graph is not an empty one', () => {
  const absent = assertGrounding({ nodes: undefined, resolveFilePath: (file) => file });
  assert.equal(absent.status, 'FAIL');
  assert.match(absent.reasons.join('\n'), /no graph node set was supplied/);

  // An explicitly empty graph is a claim, and it is reported as one.
  const explicitlyEmpty = assertGrounding({ nodes: [], resolveFilePath: (file) => file });
  assert.equal(explicitlyEmpty.status, 'PASS');
  assert.match(explicitlyEmpty.reasons.join('\n'), /all 0 node/);
});

test('T3 reports a node that names no file at all rather than skipping it', () => {
  const record = assertGrounding({
    nodes: [{ id: 'N0009' }, { id: 'N0010', file: '' }],
    resolveFilePath: (file) => file,
  });
  assert.equal(record.status, 'FAIL');
  assert.deepEqual(record.unresolvable, ['N0009', 'N0010']);
  assert.match(record.reasons.join('\n'), /N0009/);
});

test('T1 and T2 agree about root-level sources, so both can pass on a project that has them', () => {
  const root = writeTree({ 'build.rs': 'fn main() {}\n', 'src/lib.rs': 'pub mod api;\n' });
  try {
    const measured = measureDirectoryTree(root);
    assert.deepEqual(measured.directories, ['.', 'src'], 'a root-level source is measured as the "." package');

    const packages = [
      { id: 'p-root', path: '.' },
      { id: 'p-src', path: 'src' },
    ];
    const parity = assertStructureParity({ packagePaths: packages.map((pkg) => pkg.path), measuredDirectories: measured.directories });
    const ownership = assertNoBehaviouralLoss({ packages, sourceFiles: measured.sourceFiles });
    assert.equal(parity.status, 'PASS', `T1 must accept the root package: ${parity.reasons.join('; ')}`);
    assert.equal(ownership.status, 'PASS', `T2 must find every file owned: ${ownership.reasons.join('; ')}`);
  } finally {
    removeTree(root);
  }
});

test('T4 proves the order from the measured DAG and requires the manifest to agree', () => {
  const agreed = measureImplementationOrder({
    packages: [{ id: 'a', path: 'a' }, { id: 'b', path: 'b' }],
    measuredEdges: [{ from: 'a', to: 'b' }],
    manifestOrder: { serial: ['b', 'a'] },
  });
  assert.equal(agreed.gateId, 'T4');
  assert.equal(agreed.status, 'PASS');
  assert.deepEqual(agreed.measuredOrder, ['b', 'a']);
  assert.deepEqual(agreed.manifestOrder, ['b', 'a']);
});

test('T4 names the packages whose order the measurement contradicts', () => {
  const record = measureImplementationOrder({
    packages: [{ id: 'a', path: 'a' }, { id: 'b', path: 'b' }],
    measuredEdges: [{ from: 'a', to: 'b' }],
    manifestOrder: { serial: ['a', 'b'] },
  });
  assert.equal(record.status, 'FAIL');
  assert.equal(record.counts.divergent, 2, 'both positions disagree');
  assert.match(record.reasons.join('\n'), /a/);
  assert.match(record.reasons.join('\n'), /b/);
});

test('T4 fails when the measured projection has a cycle, because a cycle has no order', () => {
  const record = measureImplementationOrder({
    packages: [{ id: 'a', path: 'a' }, { id: 'b', path: 'b' }],
    measuredEdges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
    manifestOrder: { serial: ['a', 'b'] },
  });
  assert.equal(record.status, 'FAIL');
  assert.ok(record.counts.cycles > 0);
  assert.deepEqual(record.measuredOrder, []);
  assert.match(record.reasons.join('\n'), /cycle/i);
});

test('T4 refuses to pass without a measured edge set, naming the missing input', () => {
  const record = measureImplementationOrder({
    packages: [{ id: 'a', path: 'a' }],
    measuredEdges: undefined,
    manifestOrder: { serial: ['a'] },
  });
  assert.equal(record.status, 'FAIL');
  assert.match(record.reasons.join('\n'), /measured/i);
});

test('T4 fails on a measured edge the manifest cannot place, and names it', () => {
  const record = measureImplementationOrder({
    packages: [{ id: 'a', path: 'a' }, { id: 'b', path: 'b' }],
    measuredEdges: [{ from: 'a', to: 'nowhere' }],
    manifestOrder: { serial: ['a', 'b'] },
  });
  assert.equal(record.status, 'FAIL', 'an edge the manifest cannot place is a disagreement, not a detail');
  assert.equal(record.counts.unknown, 1);
  assert.match(record.reasons.join('\n'), /a -> nowhere/, 'the offending endpoints are named');
});

test('T4 never claims a proof it does not have: a dropped edge cannot be reported as agreement', () => {
  // Edges run consumer -> provider, so `a -> b` means a depends on b and the
  // measured order is ['b', 'a'] while the manifest declares ['a', 'b']. The
  // endpoints are spelled `./a/` and `./b`, which resolution normalises; were
  // they dropped instead, the empty DAG would "prove" whatever the manifest
  // declared and the reasons would state a proof that does not exist.
  const record = measureImplementationOrder({
    packages: [{ id: 'a', path: './a/' }, { id: 'b', path: './b' }],
    measuredEdges: [{ from: './a/', to: './b' }],
    manifestOrder: { serial: ['a', 'b'] },
  });
  assert.equal(record.counts.unknown, 0, 'the endpoints resolve despite their spelling');
  assert.deepEqual(record.measuredOrder, ['b', 'a']);
  assert.equal(record.status, 'FAIL', 'the manifest order contradicts the measurement');
  assert.doesNotMatch(record.reasons.join('\n'), /proves/, 'no proof may be claimed when the orders differ');
});
