// PX-223 @verifies C004
//
// The rendered text is the deliverable, so the expected strings below are written out in
// full rather than rebuilt from the renderer's own constants. Two fixtures are used: a
// two-level workspace whose every line can be asserted exactly, and a wide one whose only
// job is to prove that a long provider list grows downward instead of sideways.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { materializeChainWorkspace, materializeOrderWorkspace, materializeWideProviderWorkspace } from '../helpers/order-workspace.mjs';
import { buildModel } from '../../../.claude/scripts/workspacify-order/lib/levels.mjs';
import {
  CRITICAL_MARKER,
  FOCUS_MARKER,
  formatOrdinal,
  maxLineWidth,
  render,
  renderFocus,
  renderPlan,
} from '../../../.claude/scripts/workspacify-order/lib/render.mjs';

// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function twoLevelModel(workspace) {
  return buildModel({
    root: workspace.root,
    treeManifest: JSON.parse(readFileSync(workspace.treeManifestPath, 'utf8')),
    allocateManifest: JSON.parse(readFileSync(workspace.allocateManifestPath, 'utf8')),
  });
}

// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function fixture(t) {
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

test('C004 postcondition: the plan renders the level blocks, the width row and the chain row', (t) => {
  const workspace = fixture(t);
  const text = renderPlan(twoLevelModel(workspace));

  assert.equal(
    text,
    [
      `${basename(workspace.root)} implementation order — 3 dirs / 2 levels / 2 dependencies`,
      '',
      'level  0    alone     1 dir',
      `  ${CRITICAL_MARKER} crates/protocol/package-1`,
      '',
      'level  1    parallel  2 dirs',
      `  ${CRITICAL_MARKER} crates/protocol/package-2`,
      '    crates/protocol/package-3',
      '',
      'parallel width   level   0  1',
      '                 dirs    1  2',
      '',
      'critical chain   package-1 → package-2',
      '',
    ].join('\n'),
  );
});

test('C004 postcondition: the plan carries no explanatory legend', (t) => {
  const workspace = fixture(t);
  const text = renderPlan(twoLevelModel(workspace));

  assert.doesNotMatch(text, /level = /);
  assert.doesNotMatch(text, /cannot be shortened/);
  assert.doesNotMatch(text, /implemented in parallel/);
});

test('C004 postcondition: every line of the plan and the focused block stays inside the computed width', (t) => {
  const workspace = fixture(t);
  const model = twoLevelModel(workspace);

  for (const text of [renderPlan(model), renderFocus({ model, packageId: 'pkg-0003' })]) {
    const limit = maxLineWidth(text);
    for (const line of text.split('\n')) {
      assert.ok(line.length <= limit, `line exceeds ${limit}: ${line}`);
    }
  }
});

test('C004 precondition: a path longer than any terminal width still renders on one line', (t) => {
  const longPath = 'crates/adapters/storage/gaia-store-postgresql-extension-used-for-testing';
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002'],
    edges: [['pkg-0002', 'pkg-0001']],
    levels: [['pkg-0001'], ['pkg-0002']],
    paths: { 'pkg-0002': longPath },
  });
  t.after(() => workspace.remove());

  const text = renderPlan(twoLevelModel(workspace));

  assert.ok(text.includes(`  ${CRITICAL_MARKER} ${longPath}`));
  assert.ok(maxLineWidth(text) >= longPath.length + 4);
});

test('C004 boundary: a provider list grows downward one line per provider and leaves the plan unchanged', (t) => {
  const wide = materializeWideProviderWorkspace(16);
  t.after(() => wide.remove());
  const model = twoLevelModel(wide);

  const planBefore = renderPlan(model);
  const block = renderFocus({ model, packageId: 'pkg-9999' });

  assert.equal(block.split('\n').filter((line) => line.includes('crates/')).length, 16 + 1);
  assert.match(block, /waits for \(16\)/);
  assert.equal(renderPlan(model), planBefore);
});

test('C004 boundary: a workspace with a single package renders one alone level and a chain of length one', (t) => {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001'], edges: [], levels: [['pkg-0001']] });
  t.after(() => workspace.remove());

  const text = renderPlan(twoLevelModel(workspace));

  assert.match(text, /level  0 {4}alone {5}1 dir/);
  assert.match(text, /critical chain {3}package-1\n/);
});

test('C004 boundary: formatOrdinal is correct at the boundary numbers', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(formatOrdinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th'],
  );
});

test('C004 postcondition: the focused block names providers, peers and consumers with their levels', (t) => {
  const workspace = fixture(t);
  const text = renderFocus({ model: twoLevelModel(workspace), packageId: 'pkg-0003' });

  assert.match(text, /^─{66}\n▶ crates\/protocol\/package-3 +level 1 · 3rd\n/);
  assert.match(text, / {2}waits for \(1\)\n {4}crates\/protocol\/package-1 +level 0\n/);
  assert.match(text, / {2}parallel in this level \(1\)\n {4}crates\/protocol\/package-2 +level 1\n/);
  assert.match(text, / {2}used by \(0\)\n/);
  assert.doesNotMatch(text, /this level is alone/);
});

test('C004 boundary: a package on the critical chain says so, and an isolated level says it is serial', (t) => {
  const chainWorkspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002', 'pkg-0003'],
    edges: [
      ['pkg-0002', 'pkg-0001'],
      ['pkg-0003', 'pkg-0002'],
    ],
    levels: [['pkg-0001'], ['pkg-0002'], ['pkg-0003']],
  });
  t.after(() => chainWorkspace.remove());

  const onChain = renderFocus({ model: twoLevelModel(chainWorkspace), packageId: 'pkg-0002' });
  assert.match(onChain, /▶ crates\/protocol\/package-2 +level 1 · 2nd · on the critical path\n/);
  assert.match(onChain, /parallel in this level \(0\) {5}→ this level is alone, so this step is serial/);

  // In the two-level fixture the chain runs through package-2, so package-3 is beside it.
  const beside = renderFocus({ model: twoLevelModel(fixture(t)), packageId: 'pkg-0003' });
  assert.doesNotMatch(beside, /on the critical path/);
});

test('C004 boundary: a chain longer than the wrap width continues on the next line, arrow first', (t) => {
  const workspace = materializeChainWorkspace(12);
  t.after(() => workspace.remove());

  const text = renderPlan(twoLevelModel(workspace));
  const chainLines = text.split('\n').filter((line) => line.startsWith('critical chain') || line.startsWith(' '.repeat(17) + '→'));

  assert.ok(chainLines.length > 1, 'the chain must wrap at this length');
  assert.equal(chainLines.length, 2);
  assert.doesNotMatch(chainLines[0], /→$/);
  assert.match(chainLines[1], /^ {17}→ package-/);
  for (const line of chainLines) assert.ok(line.length <= 96, `chain line exceeds the wrap width: ${line}`);
  assert.equal(chainLines.join(' ').match(/package-\d+/g).length, 12);
});

test('C004 postcondition: related directories are listed by level, not by manifest id order', (t) => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002', 'pkg-0003', 'pkg-0004'],
    // pkg-0004 is the lowest id among the consumers but comes last, so an id-ordered list
    // and a level-ordered list cannot be confused for one another.
    edges: [
      ['pkg-0004', 'pkg-0001'],
      ['pkg-0002', 'pkg-0001'],
      ['pkg-0003', 'pkg-0001'],
      ['pkg-0003', 'pkg-0002'],
    ],
    levels: [['pkg-0001'], ['pkg-0002', 'pkg-0004'], ['pkg-0003']],
  });
  t.after(() => workspace.remove());

  const text = renderFocus({ model: twoLevelModel(workspace), packageId: 'pkg-0001' });
  const lines = text.split('\n').filter((line) => /^ {4}crates\/.+ {2}level \d+$/.test(line));

  assert.equal(lines.length, 3);
  assert.deepEqual(
    lines.map((line) => line.trim().split(/\s+/).at(-1)),
    ['1', '1', '2'],
  );
  assert.ok(lines[0].includes('package-2') && lines[1].includes('package-4'));
});

test('C004 postcondition: no line carries trailing whitespace', (t) => {
  const workspace = fixture(t);
  const text = render(twoLevelModel(workspace), 'pkg-0003');

  for (const line of text.split('\n')) {
    assert.equal(line, line.trimEnd(), `trailing whitespace: ${JSON.stringify(line)}`);
  }
});

test('C004 postcondition: render with no focus equals the plan and render with a focus appends the block', (t) => {
  const workspace = fixture(t);
  const model = twoLevelModel(workspace);

  assert.equal(render(model, null), renderPlan(model));
  assert.equal(render(model, 'pkg-0003'), `${renderPlan(model)}${renderFocus({ model, packageId: 'pkg-0003' })}`);
});
