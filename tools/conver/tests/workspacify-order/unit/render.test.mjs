// PX-223 @verifies C004
// PX-228 @verifies C001
// PX-228 @verifies C002
// PX-228 @verifies C004
//
// The rendered text is the deliverable, so the expected strings below are written out in
// full rather than rebuilt from the renderer's own constants. Two fixtures are used: a
// two-level workspace whose every line can be asserted exactly, and a wide one whose only
// job is to prove that a long provider list grows downward instead of sideways.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import {
  EXPLAIN_FILE_NAME,
  RFC_FILE_NAME,
  SEQUENCES_FILE_NAME,
  VIEW_FILE_NAME,
  materializeChainWorkspace,
  materializeOrderWorkspace,
  materializeWideProviderWorkspace,
  writeCarriedView,
  writePreCarriageView,
  writeView,
} from '../helpers/order-workspace.mjs';
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
      // The heading is a Markdown H1: renderPlan opens the plan with a blank line and the
      // hash marker, and both are asserted here so a heading that loses either is caught.
      '',
      `# ${basename(workspace.root)} implementation order — 3 dirs / 2 levels / 2 dependencies`,
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

// PX-228 — the explained mark.
//
// The mark answers one question: does EXPLAIN-RFC-SEED.md exist in this package directory.
// The glyph is spelled as a literal in the assertions below rather than read from
// EXPLAINED_LABEL, so a typo inside that constant cannot satisfy the test meant to catch it.

/** The two-level fixture with pkg-0001 and pkg-0003 explained: one on the chain, one beside it. */
// [::TICKET::] PX-228, PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-228|PX-269) --for-spec --no-implementation-order`.
function explainedFixture(t) {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001', 'pkg-0002', 'pkg-0003'], edges: [
      ['pkg-0002', 'pkg-0001'],
      ['pkg-0003', 'pkg-0001'],
    ], levels: [['pkg-0001'], ['pkg-0002', 'pkg-0003']], documents: { explained: ['pkg-0001', 'pkg-0003'] } });
  t.after(() => workspace.remove());
  return workspace;
}

/** The plan of that fixture, line by line, written out rather than rebuilt from the renderer. */
// [::TICKET::] PX-228 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-228 --for-spec --no-implementation-order`.
function explainedPlanLines(workspace) {
  return [
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
  ];
}

test('C001 precondition: the model names exactly the packages whose directory holds the document', (t) => {
  const workspace = explainedFixture(t);
  const model = twoLevelModel(workspace);

  assert.ok(model.explainedIds instanceof Set);
  assert.deepEqual([...model.explainedIds].sort(), ['pkg-0001', 'pkg-0003']);
  assert.ok([...model.explainedIds].every((id) => model.pathOf.has(id)));
});

test('C001 postcondition: an explained package carries the label after its path, an unexplained one carries nothing', (t) => {
  const workspace = explainedFixture(t);

  assert.equal(renderPlan(twoLevelModel(workspace)), explainedPlanLines(workspace).join('\n'));
});

test('C001 invariant: the label is appended and never padded, so no line carries trailing whitespace', (t) => {
  const workspace = explainedFixture(t);
  const text = renderPlan(twoLevelModel(workspace));

  // Asserted before the whitespace rule so the case is red while the label is absent: a
  // whitespace check alone holds in a plan that carries no label at all, and would pass
  // whatever the renderer did with the mark.
  assert.ok(text.includes('  * crates/protocol/package-1 🔴 EXPLAINED'));
  for (const line of text.split('\n')) {
    assert.equal(line, line.trimEnd(), `trailing whitespace: ${JSON.stringify(line)}`);
  }
  // The unexplained line ends at its path: nothing follows it, not even a space, which is
  // what keeps the path column from widening when a workspace explains nothing.
  assert.ok(text.includes('\n  * crates/protocol/package-2\n'));
});

test('C002 postcondition: explainedIds equals the set of packages whose directory holds the document', (t) => {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001', 'pkg-0002', 'pkg-0003'], edges: [
      ['pkg-0002', 'pkg-0001'],
      ['pkg-0003', 'pkg-0001'],
    ], levels: [['pkg-0001'], ['pkg-0002', 'pkg-0003']], documents: { explained: ['pkg-0002'] } });
  t.after(() => workspace.remove());

  // The manifests say nothing about explanations, so the answer can only have come from the
  // directory. A manifest field would allow this to pass while the probe was never made.
  assert.equal(
    workspace.treeManifest.workspace.packages.some((pkg) => Object.hasOwn(pkg, 'explained')),
    false,
  );
  assert.deepEqual(twoLevelModel(workspace).explainedIds, new Set(['pkg-0002']));
});

test('C002 precondition: a package with no path fails before the probe, naming the missing field', (t) => {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001'], levels: [['pkg-0001']] });
  t.after(() => workspace.remove());

  assert.throws(
    () =>
      buildModel({
        root: workspace.root,
        treeManifest: { ...workspace.treeManifest, workspace: { packages: [{ id: 'pkg-0001', name: 'package-1' }] } },
        allocateManifest: workspace.allocateManifest,
      }),
    (error) => error instanceof Error && /no path/.test(error.message),
  );
});

test('C002 invariant: a zero-byte document marks its package, and a directory without one is never marked', (t) => {
  const zeroByte = materializeOrderWorkspace({ packages: ['pkg-0001'], levels: [['pkg-0001']], documents: { explained: ['pkg-0001'] } });
  t.after(() => zeroByte.remove());
  const plain = materializeOrderWorkspace({ packages: ['pkg-0001'], levels: [['pkg-0001']] });
  t.after(() => plain.remove());

  // Existence is the whole rule, so an empty document is never opened, parsed or weighed.
  assert.equal(statSync(zeroByte.explainPathOf('pkg-0001')).size, 0);
  assert.deepEqual(twoLevelModel(zeroByte).explainedIds, new Set(['pkg-0001']));
  assert.deepEqual(twoLevelModel(plain).explainedIds, new Set());
});

test('C002 boundary: only the whole entry name counts, so a prefixed or suffixed document marks nothing', (t) => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002'],
    edges: [['pkg-0002', 'pkg-0001']],
    levels: [['pkg-0001'], ['pkg-0002']],
  });
  t.after(() => workspace.remove());
  const directory = join(workspace.root, workspace.pathOf.get('pkg-0001'));
  writeFileSync(join(directory, `${EXPLAIN_FILE_NAME}.bak`), '');
  writeFileSync(join(directory, 'INFO-RFC-SEED.md'), '');

  assert.equal(existsSync(join(directory, EXPLAIN_FILE_NAME)), false);
  assert.deepEqual(twoLevelModel(workspace).explainedIds, new Set());
});

test('C002 boundary: the document is found in the package directory and in no directory around it', (t) => {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001', 'pkg-0002'], edges: [['pkg-0002', 'pkg-0001']], levels: [['pkg-0001'], ['pkg-0002']], documents: { explained: ['pkg-0002'] } });
  t.after(() => workspace.remove());
  const parent = join(workspace.root, 'crates', 'protocol');
  mkdirSync(parent, { recursive: true });
  // A sibling package, its parent directory, and the workspace root all carry a document
  // that belongs to none of them. The literal name is asserted rather than the imported
  // constant, so a constant that drifted from the name explain-seed writes fails here.
  writeFileSync(join(workspace.root, 'EXPLAIN-RFC-SEED.md'), '');
  writeFileSync(join(parent, 'EXPLAIN-RFC-SEED.md'), '');
  assert.equal(existsSync(join(workspace.root, workspace.pathOf.get('pkg-0002'), 'EXPLAIN-RFC-SEED.md')), true);

  assert.deepEqual(twoLevelModel(workspace).explainedIds, new Set(['pkg-0002']));
});

test('C002 boundary: a package whose directory is absent stays unexplained instead of failing the plan', (t) => {
  const workspace = explainedFixture(t);
  rmSync(join(workspace.root, workspace.pathOf.get('pkg-0003')), { recursive: true, force: true });
  const model = twoLevelModel(workspace);

  assert.deepEqual([...model.explainedIds], ['pkg-0001']);
  assert.equal(renderPlan(model).includes('package-3 🔴 EXPLAINED'), false);
});

test('C001 boundary: a workspace that explains everything marks every line, and one that explains nothing marks none', (t) => {
  const all = materializeOrderWorkspace({ packages: ['pkg-0001', 'pkg-0002'], edges: [['pkg-0002', 'pkg-0001']], levels: [['pkg-0001'], ['pkg-0002']], documents: { explained: ['pkg-0001', 'pkg-0002'] } });
  t.after(() => all.remove());
  const allText = renderPlan(twoLevelModel(all));

  assert.equal(allText.match(/🔴 EXPLAINED/g).length, 2);
  assert.ok(allText.includes('  * crates/protocol/package-1 🔴 EXPLAINED'));
  assert.ok(allText.includes('  * crates/protocol/package-2 🔴 EXPLAINED'));
  assert.doesNotMatch(renderPlan(twoLevelModel(fixture(t))), /EXPLAINED/);
});

test('C001 invariant: the focused block is unchanged by the explained state', (t) => {
  const explained = explainedFixture(t);
  const plain = fixture(t);
  const focus = (workspace) => renderFocus({ model: twoLevelModel(workspace), packageId: 'pkg-0003' });

  // The plan of the very fixture whose block is compared carries the mark, so this case is
  // red while the label is absent and green only once the mark exists and is confined to it.
  assert.equal(renderPlan(twoLevelModel(explained)).match(/🔴 EXPLAINED/g).length, 2);
  // The mark belongs to the level listing. The focused block answers a different question,
  // and this pins that boundary so a later change cannot widen the printed surface by accident.
  assert.equal(focus(explained), focus(plain));
  assert.doesNotMatch(focus(explained), /EXPLAINED/);
});

test('C004 boundary: the heading is a blank line followed by the hash-marked H1', (t) => {
  const workspace = fixture(t);
  const lines = renderPlan(twoLevelModel(workspace)).split('\n');
  const name = basename(workspace.root);

  assert.deepEqual(lines.slice(0, 3), ['', `# ${name} implementation order — 3 dirs / 2 levels / 2 dependencies`, '']);
  // The stale expectation this file carried started at the name, with neither the blank line
  // nor the marker, so the two expectations cannot be confused for one another.
  assert.notEqual(lines[1], `${name} implementation order — 3 dirs / 2 levels / 2 dependencies`);
});

// The grilled mark.
//
// It answers one question: does RFC.md exist in this package directory. The mark is
// independent of the explained one — a grill session accepts a directory that was never
// explained, so a package may carry either mark, both or neither — and the glyph is spelled
// as a literal in the assertions below for the same reason as the explained mark above.

/** The two-level fixture marked on both axes: pkg-0001 both, pkg-0002 grilled only, pkg-0003 explained only. */
// [::TICKET::] PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
function grilledFixture(t) {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001', 'pkg-0002', 'pkg-0003'], edges: [
      ['pkg-0002', 'pkg-0001'],
      ['pkg-0003', 'pkg-0001'],
    ], levels: [['pkg-0001'], ['pkg-0002', 'pkg-0003']], documents: { explained: ['pkg-0001', 'pkg-0003'], grilled: ['pkg-0001', 'pkg-0002'] } });
  t.after(() => workspace.remove());
  return workspace;
}

test('C002 precondition: grilledIds names exactly the packages whose directory holds RFC.md', (t) => {
  const workspace = grilledFixture(t);
  const model = twoLevelModel(workspace);

  assert.ok(model.grilledIds instanceof Set);
  assert.deepEqual([...model.grilledIds].sort(), ['pkg-0001', 'pkg-0002']);
  assert.ok([...model.grilledIds].every((id) => model.pathOf.has(id)));
});

test('C002 postcondition: each mark follows its own document, so one line may carry both and another only one', (t) => {
  const workspace = grilledFixture(t);

  // Written out in full rather than rebuilt from the model: the three lines together pin the
  // independence of the marks (grilled only, explained only, both) and their order.
  assert.equal(
    renderPlan(twoLevelModel(workspace)),
    [
      '',
      `# ${basename(workspace.root)} implementation order — 3 dirs / 2 levels / 2 dependencies`,
      '',
      'level  0    alone     1 dir',
      '  * crates/protocol/package-1 🔴 EXPLAINED 🟠 GRILLED',
      '',
      'level  1    parallel  2 dirs',
      '  * crates/protocol/package-2 🟠 GRILLED',
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

test('C002 invariant: neither document stands in for the other, so a mark never appears without its own file', (t) => {
  const grilledOnly = materializeOrderWorkspace({ packages: ['pkg-0001'], levels: [['pkg-0001']], documents: { grilled: ['pkg-0001'] } });
  t.after(() => grilledOnly.remove());
  const explainedOnly = materializeOrderWorkspace({ packages: ['pkg-0001'], levels: [['pkg-0001']], documents: { explained: ['pkg-0001'] } });
  t.after(() => explainedOnly.remove());

  assert.equal(existsSync(grilledOnly.rfcPathOf('pkg-0001')), true);
  assert.equal(existsSync(grilledOnly.explainPathOf('pkg-0001')), false);
  const grilledModel = twoLevelModel(grilledOnly);
  assert.deepEqual(grilledModel.grilledIds, new Set(['pkg-0001']));
  assert.deepEqual(grilledModel.explainedIds, new Set());
  assert.ok(renderPlan(grilledModel).includes('package-1 🟠 GRILLED'));
  assert.equal(renderPlan(grilledModel).includes('EXPLAINED'), false);

  const explainedModel = twoLevelModel(explainedOnly);
  assert.deepEqual(explainedModel.explainedIds, new Set(['pkg-0001']));
  assert.deepEqual(explainedModel.grilledIds, new Set());
  assert.ok(renderPlan(explainedModel).includes('package-1 🔴 EXPLAINED'));
  assert.equal(renderPlan(explainedModel).includes('GRILLED'), false);
});

test('C002 boundary: only the whole entry name counts, so a prefixed or suffixed document marks nothing', (t) => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002'],
    edges: [['pkg-0002', 'pkg-0001']],
    levels: [['pkg-0001'], ['pkg-0002']],
  });
  t.after(() => workspace.remove());
  const directory = join(workspace.root, workspace.pathOf.get('pkg-0001'));
  writeFileSync(join(directory, `${RFC_FILE_NAME}.bak`), '');
  writeFileSync(join(directory, 'GRILL.md'), '');

  assert.equal(existsSync(join(directory, RFC_FILE_NAME)), false);
  assert.deepEqual(twoLevelModel(workspace).grilledIds, new Set());
});

test('C002 boundary: the document is found in the package directory and in no directory around it', (t) => {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001', 'pkg-0002'], edges: [['pkg-0002', 'pkg-0001']], levels: [['pkg-0001'], ['pkg-0002']], documents: { grilled: ['pkg-0002'] } });
  t.after(() => workspace.remove());
  const parent = join(workspace.root, 'crates', 'protocol');
  // The workspace root and the layer directory both carry a document that belongs to
  // neither of them, so a probe that walked upward would mark the wrong package.
  writeFileSync(join(workspace.root, RFC_FILE_NAME), '');
  writeFileSync(join(parent, RFC_FILE_NAME), '');
  assert.equal(existsSync(join(workspace.root, workspace.pathOf.get('pkg-0002'), RFC_FILE_NAME)), true);

  assert.deepEqual(twoLevelModel(workspace).grilledIds, new Set(['pkg-0002']));
});

test('C002 boundary: a package whose directory is absent stays ungrilled instead of failing the plan', (t) => {
  const workspace = grilledFixture(t);
  rmSync(join(workspace.root, workspace.pathOf.get('pkg-0002')), { recursive: true, force: true });
  const model = twoLevelModel(workspace);

  assert.deepEqual([...model.grilledIds], ['pkg-0001']);
  assert.equal(renderPlan(model).includes('package-2 🟠 GRILLED'), false);
});

test('C001 boundary: a workspace that grills everything marks every line, and one that grills nothing marks none', (t) => {
  const all = materializeOrderWorkspace({ packages: ['pkg-0001', 'pkg-0002'], edges: [['pkg-0002', 'pkg-0001']], levels: [['pkg-0001'], ['pkg-0002']], documents: { grilled: ['pkg-0001', 'pkg-0002'] } });
  t.after(() => all.remove());
  const allText = renderPlan(twoLevelModel(all));

  assert.equal(allText.match(/🟠 GRILLED/g).length, 2);
  assert.ok(allText.includes('  * crates/protocol/package-1 🟠 GRILLED'));
  assert.ok(allText.includes('  * crates/protocol/package-2 🟠 GRILLED'));
  assert.doesNotMatch(allText, /EXPLAINED/);
  assert.doesNotMatch(renderPlan(twoLevelModel(fixture(t))), /GRILLED/);
});

test('C001 invariant: the focused block is unchanged by the grilled state', (t) => {
  const grilled = materializeOrderWorkspace({ packages: ['pkg-0001', 'pkg-0002', 'pkg-0003'], edges: [
      ['pkg-0002', 'pkg-0001'],
      ['pkg-0003', 'pkg-0001'],
    ], levels: [['pkg-0001'], ['pkg-0002', 'pkg-0003']], documents: { grilled: ['pkg-0003'] } });
  t.after(() => grilled.remove());
  const plain = fixture(t);
  const focus = (workspace) => renderFocus({ model: twoLevelModel(workspace), packageId: 'pkg-0003' });

  // The plan of the very fixture whose block is compared carries the mark, so this case is
  // red while the label is absent and green only once the mark exists and is confined to it.
  assert.ok(renderPlan(twoLevelModel(grilled)).includes('    crates/protocol/package-3 🟠 GRILLED\n'));
  assert.equal(focus(grilled), focus(plain));
  assert.doesNotMatch(focus(grilled), /GRILLED/);
});

// The sequences verdict.
//
// It answers one question: do this package directory's own documents account for the work it was
// handed. The mark stopped being the presence of a file — a view written before the obligation
// carriage existed is present and answers the question with silence — so the plan prints three
// states. 🟡 SEQUENCED when the view carries units and its ledger accounts for all of them,
// ❌ FAILED-SEQ when a view that can carry obligations is there and its verification refutes it,
// and nothing at all when no attempt exists to judge. A directory the distribution never reached
// showing nothing is the point: a placeholder would read as a judgement. The glyphs are spelled
// as literals in the assertions below for the same reason as the two marks above — a typo inside
// the constant cannot satisfy the test meant to catch it.
//
// Position is part of the contract. The marks are written in the order the pipeline reaches a
// directory — explain-seed, then grill-me-for-rfc, then the slice — so a line carrying all of
// them reads left to right as the work happened.

/**
 * The two-level fixture with the marks mixed rather than nested.
 *
 * `pkg-0001` carries all three documents, `pkg-0002` a judged view and the RFC its ledger lives
 * in but no explanation, and `pkg-0003` an explanation alone. A renderer that printed a prefix
 * of the mark chain would get the first two lines wrong, and one that printed a mark for a
 * missing step would get the third wrong.
 */
// [::TICKET::] PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
function sequencedFixture(t) {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001', 'pkg-0002', 'pkg-0003'], edges: [
      ['pkg-0002', 'pkg-0001'],
      ['pkg-0003', 'pkg-0001'],
    ], levels: [['pkg-0001'], ['pkg-0002', 'pkg-0003']], documents: { explained: ['pkg-0001', 'pkg-0003'], grilled: ['pkg-0001', 'pkg-0002'], carried: ['pkg-0001', 'pkg-0002'] } });
  t.after(() => workspace.remove());
  return workspace;
}

test('C001 precondition: the model carries one verdict for every package the manifest names', (t) => {
  const workspace = sequencedFixture(t);
  const model = twoLevelModel(workspace);

  assert.ok(model.sequenceVerdicts instanceof Map);
  assert.deepEqual([...model.sequenceVerdicts.keys()].sort(), ['pkg-0001', 'pkg-0002', 'pkg-0003']);
  for (const [id, verdict] of model.sequenceVerdicts) {
    assert.equal(['complete', 'failed', 'not-yet'].includes(verdict.state), true, id);
  }
});

test('C001 postcondition: the marks follow the pipeline order, and a package the distribution did not reach prints nothing', (t) => {
  const workspace = sequencedFixture(t);

  // Written out in full rather than rebuilt from the model: the three lines together pin the
  // order (explained, grilled, sequenced), that the judged mark survives alone, and that a
  // package carrying only the first mark prints no placeholder for the two it lacks.
  assert.equal(
    renderPlan(twoLevelModel(workspace)),
    [
      '',
      `# ${basename(workspace.root)} implementation order — 3 dirs / 2 levels / 2 dependencies`,
      '',
      'level  0    alone     1 dir',
      '  * crates/protocol/package-1 🔴 EXPLAINED 🟠 GRILLED 🟡 SEQUENCED',
      '',
      'level  1    parallel  2 dirs',
      '  * crates/protocol/package-2 🟠 GRILLED 🟡 SEQUENCED',
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

test('C001 invariant: the two judged marks are exclusive, and a line never ends in a blank where a mark would have gone', (t) => {
  const text = renderPlan(twoLevelModel(sequencedFixture(t)));

  assert.equal(/🟡 SEQUENCED ❌|❌ FAILED-SEQ 🟡/.test(text), false);
  assert.equal(
    text.split('\n').some((line) => line !== line.trimEnd()),
    false,
    'a not-yet package must end at its path, because a padded line reads as a mark that failed to print',
  );
});

test('C002 invariant: the judged mark appears without the explanation mark, and an explanation never stands in for it', (t) => {
  const carriedOnly = materializeOrderWorkspace({ packages: ['pkg-0001'], levels: [['pkg-0001']], documents: { carried: ['pkg-0001'] } });
  t.after(() => carriedOnly.remove());
  const explainedOnly = materializeOrderWorkspace({ packages: ['pkg-0001'], levels: [['pkg-0001']], documents: { explained: ['pkg-0001'] } });
  t.after(() => explainedOnly.remove());

  const carriedText = renderPlan(twoLevelModel(carriedOnly));
  assert.ok(carriedText.includes('  * crates/protocol/package-1 🟠 GRILLED 🟡 SEQUENCED'));
  assert.equal(carriedText.includes('EXPLAINED'), false);

  // And the reverse: an explanation alone is never read as a distribution, so neither probe is
  // satisfied by the other's document.
  const explainedText = renderPlan(twoLevelModel(explainedOnly));
  assert.equal(/🟡 SEQUENCED|❌ FAILED-SEQ/.test(explainedText), false);
});

test('C002 boundary: a complete package always carries the grill mark, because its ledger lives in the RFC a grill writes', (t) => {
  const text = renderPlan(twoLevelModel(sequencedFixture(t)));

  // The implication is stated rather than left implicit: a verdict reads a ledger out of RFC.md,
  // so a package the distribution reached without having been grilled is not a state this plan
  // can report, and a line claiming one would mean the reader looked in a second place.
  for (const line of text.split('\n')) {
    if (!line.includes('🟡 SEQUENCED')) continue;
    assert.ok(line.includes('🟠 GRILLED'), line);
  }
});

test('C002 boundary: only the whole entry name counts, so a renamed or stray view marks nothing', (t) => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002'],
    edges: [['pkg-0002', 'pkg-0001']],
    levels: [['pkg-0001'], ['pkg-0002']],
  });
  t.after(() => workspace.remove());
  const directory = join(workspace.root, workspace.pathOf.get('pkg-0001'));
  writeFileSync(join(directory, `${VIEW_FILE_NAME}.bak`), '{}');
  writeFileSync(join(directory, 'SEQUENCE.json'), '{}');
  // The prose view the slice also writes is not the judged document, and reading it would mark a
  // package whose projection carries nothing.
  writeFileSync(join(directory, SEQUENCES_FILE_NAME), '');

  assert.equal(existsSync(join(directory, VIEW_FILE_NAME)), false);
  assert.deepEqual(twoLevelModel(workspace).sequenceVerdicts.get('pkg-0001'), { state: 'not-yet', reason: 'no-view' });
  const lines = renderPlan(twoLevelModel(workspace))
    .split('\n')
    .filter((line) => line.includes('crates/protocol/package-1'));
  assert.deepEqual(lines, ['  * crates/protocol/package-1'], 'a directory with nothing to judge ends at its path');
});

test('C002 boundary: the view is read from the package directory and from no directory around it', (t) => {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001', 'pkg-0002'], edges: [['pkg-0002', 'pkg-0001']], levels: [['pkg-0001'], ['pkg-0002']], documents: { carried: ['pkg-0002'] } });
  t.after(() => workspace.remove());
  const parent = join(workspace.root, 'crates', 'protocol');
  // The workspace root and the layer directory both carry a view that belongs to neither of them,
  // so a reader that walked upward, or that took the first view it found, would judge pkg-0001.
  writeFileSync(join(workspace.root, VIEW_FILE_NAME), JSON.stringify({ packageId: 'pkg-0001', obligationUnits: [{ unitId: 'ctr-999' }], obligationSource: 'undeclared' }));
  writeFileSync(join(parent, VIEW_FILE_NAME), JSON.stringify({ packageId: 'pkg-0001', obligationUnits: [{ unitId: 'ctr-999' }], obligationSource: 'undeclared' }));

  const verdicts = twoLevelModel(workspace).sequenceVerdicts;
  assert.deepEqual(verdicts.get('pkg-0002'), { state: 'complete', reason: null });
  assert.deepEqual(verdicts.get('pkg-0001'), { state: 'not-yet', reason: 'no-view' });
});

test('C004 invariant: a view that cannot be read is a failure and never an unmarked directory', (t) => {
  const workspace = sequencedFixture(t);
  writeFileSync(workspace.viewPathOf('pkg-0003'), '');

  const text = renderPlan(twoLevelModel(workspace));
  assert.ok(text.includes('    crates/protocol/package-3 🔴 EXPLAINED ❌ FAILED-SEQ\n'));
  assert.deepEqual(twoLevelModel(workspace).sequenceVerdicts.get('pkg-0003'), { state: 'failed', reason: 'unreadable-view' });
});

test('C004 boundary: a view projected before the carriage shows no mark at all', (t) => {
  const workspace = sequencedFixture(t);
  // ~/shyme/gaia's 26 views: owned units, no obligationSource, and a ledger that accounts for
  // what they hold. Present, discharged, and a claim about a different question.
  rmSync(workspace.rfcPathOf('pkg-0001'), { force: true });
  writePreCarriageView(workspace, 'pkg-0001', { units: ['op-0001'] });

  const verdicts = twoLevelModel(workspace).sequenceVerdicts;
  assert.deepEqual(verdicts.get('pkg-0001'), { state: 'not-yet', reason: 'view-predates-the-carriage' });
  assert.ok(renderPlan(twoLevelModel(workspace)).includes('  * crates/protocol/package-1 🔴 EXPLAINED\n'));
});

test('C003 boundary: a view carrying a unit its own ledger omits prints the failure mark', (t) => {
  const workspace = sequencedFixture(t);
  writeCarriedView(workspace, 'pkg-0002', { units: ['ctr-boundary-001'] });
  writeView(workspace, 'pkg-0002', {
    packageId: 'pkg-0002',
    ownedOperationUnits: [],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [
      { unitId: 'ctr-boundary-001', relation: 'carries' },
      { unitId: 'ctr-boundary-002', relation: 'carries' },
    ],
    obligationSource: 'undeclared',
    specLines: 1,
    lineRange: { claimedLineCount: 1, multiClaimedLineCount: 0, unclaimedLineCount: 0, statement: '' },
  });

  const text = renderPlan(twoLevelModel(workspace));
  assert.ok(text.includes('  * crates/protocol/package-2 🟠 GRILLED ❌ FAILED-SEQ\n'));
  assert.equal(text.includes('package-2 🟠 GRILLED 🟡 SEQUENCED'), false);
});

test('C004 boundary: a package whose directory is absent stays unmarked instead of failing the plan', (t) => {
  const workspace = sequencedFixture(t);
  rmSync(workspace.directoryOf('pkg-0002'), { recursive: true, force: true });
  const model = twoLevelModel(workspace);

  assert.deepEqual(model.sequenceVerdicts.get('pkg-0002'), { state: 'not-yet', reason: 'no-view' });
  assert.equal(renderPlan(model).includes('package-2 '), false);
  assert.deepEqual(model.sequenceVerdicts.get('pkg-0001'), { state: 'complete', reason: null });
});

test('C001 boundary: a workspace where every package is judged complete marks every line, and one where none is marks none', (t) => {
  const all = materializeOrderWorkspace({ packages: ['pkg-0001', 'pkg-0002'], edges: [['pkg-0002', 'pkg-0001']], levels: [['pkg-0001'], ['pkg-0002']], documents: { grilled: ['pkg-0001', 'pkg-0002'], carried: ['pkg-0001', 'pkg-0002'] } });
  t.after(() => all.remove());
  const allText = renderPlan(twoLevelModel(all));

  assert.equal(allText.match(/🟡 SEQUENCED/g).length, 2);
  assert.ok(allText.includes('  * crates/protocol/package-1 🟠 GRILLED 🟡 SEQUENCED'));
  assert.ok(allText.includes('  * crates/protocol/package-2 🟠 GRILLED 🟡 SEQUENCED'));
  assert.doesNotMatch(allText, /EXPLAINED/);
  assert.doesNotMatch(allText, /❌/);
  assert.doesNotMatch(renderPlan(twoLevelModel(fixture(t))), /SEQUENCED|FAILED-SEQ/);
});

test('C001 invariant: the focused block is unchanged by the verdict', (t) => {
  const judged = sequencedFixture(t);
  const plain = fixture(t);
  const focus = (workspace) => renderFocus({ model: twoLevelModel(workspace), packageId: 'pkg-0003' });

  // The plan of the very fixture whose block is compared carries the marks, so this case is red
  // while they are absent and green only once they exist and are confined to the plan.
  assert.ok(renderPlan(twoLevelModel(judged)).includes('crates/protocol/package-1 🔴 EXPLAINED 🟠 GRILLED 🟡 SEQUENCED'));
  assert.equal(focus(judged), focus(plain));
  assert.doesNotMatch(focus(judged), /SEQUENCED|FAILED-SEQ/);
});
