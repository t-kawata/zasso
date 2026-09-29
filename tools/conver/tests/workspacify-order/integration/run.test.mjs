// PX-223 @verifies C001
// PX-223 @verifies C003
// PX-223 @verifies C004
//
// The command is exercised as a process, in a workspace built for the case. The expected
// stdout is written out in full rather than produced by the renderer, so a passing
// comparison is evidence about the command rather than a restatement of its own output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { materializeOrderWorkspace } from '../helpers/order-workspace.mjs';

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

// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function expectedPlan(workspace) {
  return [
    `${basename(workspace.root)} implementation order — 3 dirs / 2 levels / 2 dependencies`,
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
