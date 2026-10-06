// PX-223 @verifies C001
// PX-223 @verifies C003
// PX-223 @verifies C004
// PX-228 @verifies C001
// PX-228 @verifies C003
//
// The command is exercised as a process, in a workspace built for the case. The expected
// stdout is written out in full rather than produced by the renderer, so a passing
// comparison is evidence about the command rather than a restatement of its own output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXPLAIN_FILE_NAME, RFC_FILE_NAME, materializeOrderWorkspace } from '../helpers/order-workspace.mjs';

const RUN = fileURLToPath(new URL('../../../.claude/scripts/workspacify-order/run.mjs', import.meta.url));

/** One package, as the stage-one manifest would carry it. */
const ONE_PACKAGE = { id: 'pkg-0001', name: 'package-1', path: 'crates/protocol/package-1', layer: 'protocol' };

/** Run the command and keep both sinks as text. */
// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function runOrder(argv, { cwd } = {}) {
  return spawnSync(process.execPath, [RUN, ...argv], { cwd, encoding: 'utf8' });
}

// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function threePackageWorkspace(t) {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002', 'pkg-0003'],
    edges: [
      ['pkg-0002', 'pkg-0001'],
      ['pkg-0003', 'pkg-0001'],
    ],
    levels: [['pkg-0001'], ['pkg-0002', 'pkg-0003']],
  });
  t.after(() => workspace.remove());
  return workspace;
}

// [::TICKET::] PX-223, PX-228 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-223|PX-228) --for-spec --no-implementation-order`.
function expectedPlan(workspace) {
  return [
    // The command opens the plan with a blank line and a Markdown H1, so the expected bytes
    // start there too; without them this helper describes a plan the command stopped printing.
    '',
    `# ${basename(workspace.root)} implementation order — 3 dirs / 2 levels / 2 dependencies`,
    '',
    'level  0    alone     1 dir',
    '  * crates/protocol/package-1',
    '',
    'level  1    parallel  2 dirs',
    '  * crates/protocol/package-2',
    '    crates/protocol/package-3',
    '',
    'parallel width   level   0  1',
    '                 dirs    1  2',
    '',
    'critical chain   package-1 → package-2',
    '',
  ].join('\n');
}

test('IT: with no argument from the workspace root the command prints the plan and exits 0', (t) => {
  const workspace = threePackageWorkspace(t);

  const result = runOrder([], { cwd: workspace.root });

  assert.equal(result.stderr, '');
  assert.equal(result.stdout, expectedPlan(workspace));
  assert.equal(result.status, 0);
});

test('IT: from a nested directory the command prints the same bytes as from the root', (t) => {
  const workspace = threePackageWorkspace(t);
  const nested = join(workspace.root, 'crates', 'protocol', 'package-1');

  const fromRoot = runOrder([], { cwd: workspace.root });
  const fromNested = runOrder([], { cwd: nested });

  assert.equal(fromNested.stdout, fromRoot.stdout);
  assert.equal(fromNested.status, 0);
});

test('IT: given a seed path the plan is unchanged and the focused block is appended', (t) => {
  const workspace = threePackageWorkspace(t);

  const result = runOrder([workspace.seedPathOf('pkg-0003')], { cwd: workspace.root });

  assert.equal(result.status, 0);
  assert.ok(result.stdout.startsWith(expectedPlan(workspace)));
  const block = result.stdout.slice(expectedPlan(workspace).length);
  assert.match(block, /^─+\n▶ crates\/protocol\/package-3 +level 1 · 3rd\n/);
  assert.match(block, / {2}waits for \(1\)\n {4}crates\/protocol\/package-1 +level 0\n/);
  assert.match(block, / {2}parallel in this level \(1\)\n {4}crates\/protocol\/package-2 +level 1\n/);
  assert.match(block, / {2}used by \(0\)\n/);
});

test('IT: a seed path given as a relative path from the workspace root resolves', (t) => {
  const workspace = threePackageWorkspace(t);
  const relative = join('crates', 'protocol', 'package-2', 'RFC-SEED.md');

  const result = runOrder([relative], { cwd: workspace.root });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /▶ crates\/protocol\/package-2/);
});

test('IT: from a directory with no manifest the command names the artefact and prints no plan', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'workspacify-order-bare-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));

  const result = runOrder([], { cwd: scratch });

  assert.equal(result.stdout, '');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /WORKSPACIFY-TREE-MANIFEST\.json/);
});

test('IT: a path that is not a seed prints no plan and exits non-zero', (t) => {
  const workspace = threePackageWorkspace(t);

  const result = runOrder([join(workspace.root, 'README.md')], { cwd: workspace.root });

  assert.equal(result.stdout, '');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /RFC-SEED\.md/);
});

test('IT: more than one argument is refused rather than interpreted', (t) => {
  const workspace = threePackageWorkspace(t);

  const result = runOrder(['a', 'b'], { cwd: workspace.root });

  assert.equal(result.stdout, '');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /argument/);
});

test('IT: a manifest missing the fields the order comes from fails in one line, not with a stack trace', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'workspacify-order-broken-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  writeFileSync(join(scratch, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({ workspace: { packages: [ONE_PACKAGE] } }));
  writeFileSync(join(scratch, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ implementation_order: { serial: [], levels: [] } }));

  const result = runOrder([], { cwd: scratch });

  assert.equal(result.stdout, '');
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim().split('\n').length, 1);
  assert.match(result.stderr, /^\[workspacify-order\] .*dependencies\.dag\.canonical_edges/);
});

test('IT: tests/check-conventions.mjs names this directory with the module system it resolves', () => {
  const result = spawnSync(process.execPath, ['tests/check-conventions.mjs'], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\*\*workspacify-order\*\* — esm \(decided by extension\), \d+ file\(s\), conforms/);
});

// PX-228 — the marks, exercised through the process.

/**
 * The three-package fixture, with each document in the directories its list names.
 *
 * The two lists are independent, so a caller may mark a directory as explained, as grilled,
 * as both or as neither, and the expected stdout of each shape is written out in full.
 */
// [::TICKET::] PX-228 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-228 --for-spec --no-implementation-order`.
function markedWorkspace(t, { explained = [], grilled = [] } = {}) {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002', 'pkg-0003'],
    edges: [
      ['pkg-0002', 'pkg-0001'],
      ['pkg-0003', 'pkg-0001'],
    ],
    levels: [['pkg-0001'], ['pkg-0002', 'pkg-0003']],
    explained,
    grilled,
  });
  t.after(() => workspace.remove());
  return workspace;
}

/** Every entry below a directory with its size, so two digests prove a run wrote nothing. */
// [::TICKET::] PX-228 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-228 --for-spec --no-implementation-order`.
function digestTree(root) {
  const entries = [];
// [::TICKET::] PX-228 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-228 --for-spec --no-implementation-order`.
  (function walk(directory) {
    const children = readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const absolute = join(directory, child.name);
      entries.push(`${relative(root, absolute)}:${child.isDirectory() ? 'dir' : readFileSync(absolute, 'utf8').length}`);
      if (child.isDirectory()) walk(absolute);
    }
  })(root);
  return entries.join('\n');
}

test('IT: an explained workspace prints the label after the path and exits 0', (t) => {
  const workspace = markedWorkspace(t, { explained: ['pkg-0001', 'pkg-0003'] });

  const result = runOrder([], { cwd: workspace.root });

  assert.equal(result.stderr, '');
  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    [
      '',
      `# ${basename(workspace.root)} implementation order — 3 dirs / 2 levels / 2 dependencies`,
      '',
      'level  0    alone     1 dir',
      '  * crates/protocol/package-1 🔴 EXPLAINED',
      '',
      'level  1    parallel  2 dirs',
      '  * crates/protocol/package-2',
      '    crates/protocol/package-3 🔴 EXPLAINED',
      '',
      'parallel width   level   0  1',
      '                 dirs    1  2',
      '',
      'critical chain   package-1 → package-2',
      '',
    ].join('\n'),
  );
});

test('IT: an unexplained workspace prints byte for byte the plan it printed before this ticket', (t) => {
  const workspace = markedWorkspace(t);

  const result = runOrder([], { cwd: workspace.root });

  assert.equal(result.stdout, expectedPlan(workspace));
  assert.doesNotMatch(result.stdout, /EXPLAINED/);
  assert.equal(result.status, 0);
});

test('IT: the mark follows the directory and not the manifest, so writing the document alone changes the plan', (t) => {
  const workspace = markedWorkspace(t);
  const readManifests = () => [readFileSync(workspace.treeManifestPath, 'utf8'), readFileSync(workspace.allocateManifestPath, 'utf8')];
  const manifestsBefore = readManifests();

  const before = runOrder([], { cwd: workspace.root });
  writeFileSync(join(workspace.root, workspace.pathOf.get('pkg-0003'), EXPLAIN_FILE_NAME), '');
  const after = runOrder([], { cwd: workspace.root });

  assert.notEqual(after.stdout, before.stdout);
  assert.ok(after.stdout.includes('    crates/protocol/package-3 🔴 EXPLAINED\n'));
  assert.deepEqual(readManifests(), manifestsBefore);
});

test('IT: a seed run prints the mark in the plan and no mark in the focused block', (t) => {
  const workspace = markedWorkspace(t, { explained: ['pkg-0003'] });

  const result = runOrder([workspace.seedPathOf('pkg-0003')], { cwd: workspace.root });

  assert.equal(result.status, 0);
  // The rule of dashes opens the focused block, so everything before it is the plan.
  const [plan, block] = result.stdout.split('─'.repeat(66));
  assert.ok(plan.includes('    crates/protocol/package-3 🔴 EXPLAINED\n'));
  assert.ok(plan.includes('\n  * crates/protocol/package-2\n'));
  assert.match(block, /▶ crates\/protocol\/package-3 +level 1 · 3rd\n/);
  assert.doesNotMatch(block, /EXPLAINED/);
});

test('IT: the command writes nothing, so an unmarked workspace stays unmarked', (t) => {
  const workspace = markedWorkspace(t);
  const before = digestTree(workspace.root);

  const result = runOrder([], { cwd: workspace.root });

  assert.equal(result.status, 0);
  assert.equal(digestTree(workspace.root), before);
  for (const fileName of [EXPLAIN_FILE_NAME, RFC_FILE_NAME]) {
    assert.equal(existsSync(join(workspace.root, workspace.pathOf.get('pkg-0001'), fileName)), false);
  }
});

test('IT: a grilled workspace prints the grill mark after the path and exits 0', (t) => {
  const workspace = markedWorkspace(t, { grilled: ['pkg-0002', 'pkg-0003'] });

  const result = runOrder([], { cwd: workspace.root });

  assert.equal(result.stderr, '');
  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    [
      '',
      `# ${basename(workspace.root)} implementation order — 3 dirs / 2 levels / 2 dependencies`,
      '',
      'level  0    alone     1 dir',
      '  * crates/protocol/package-1',
      '',
      'level  1    parallel  2 dirs',
      '  * crates/protocol/package-2 🟡 GRILLED',
      '    crates/protocol/package-3 🟡 GRILLED',
      '',
      'parallel width   level   0  1',
      '                 dirs    1  2',
      '',
      'critical chain   package-1 → package-2',
      '',
    ].join('\n'),
  );
});

test('IT: a directory holding both documents prints both marks, explained first', (t) => {
  const workspace = markedWorkspace(t, {
    explained: ['pkg-0001', 'pkg-0003'],
    grilled: ['pkg-0001', 'pkg-0002'],
  });

  const result = runOrder([], { cwd: workspace.root });

  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    [
      '',
      `# ${basename(workspace.root)} implementation order — 3 dirs / 2 levels / 2 dependencies`,
      '',
      'level  0    alone     1 dir',
      '  * crates/protocol/package-1 🔴 EXPLAINED 🟡 GRILLED',
      '',
      'level  1    parallel  2 dirs',
      '  * crates/protocol/package-2 🟡 GRILLED',
      '    crates/protocol/package-3 🔴 EXPLAINED',
      '',
      'parallel width   level   0  1',
      '                 dirs    1  2',
      '',
      'critical chain   package-1 → package-2',
      '',
    ].join('\n'),
  );
});

test('IT: the grill mark follows the directory and not the manifest, so writing RFC.md alone changes the plan', (t) => {
  const workspace = markedWorkspace(t);
  const readManifests = () => [readFileSync(workspace.treeManifestPath, 'utf8'), readFileSync(workspace.allocateManifestPath, 'utf8')];
  const manifestsBefore = readManifests();

  const before = runOrder([], { cwd: workspace.root });
  writeFileSync(join(workspace.root, workspace.pathOf.get('pkg-0003'), RFC_FILE_NAME), '');
  const after = runOrder([], { cwd: workspace.root });

  assert.notEqual(after.stdout, before.stdout);
  assert.ok(after.stdout.includes('    crates/protocol/package-3 🟡 GRILLED\n'));
  assert.deepEqual(readManifests(), manifestsBefore);
});
