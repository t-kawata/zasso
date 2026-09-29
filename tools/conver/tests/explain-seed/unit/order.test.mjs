// PX-224 @verifies C001
// PX-224 @verifies C002
// PX-224 @verifies C003
// PX-224 @verifies C004
// PX-224 @verifies C005
//
// The order facts are read from the command that owns the ordering rule, and the tests below
// hold the two things that command cannot check for us: that a package sharing the next level
// without an edge is never reported as something to wait for, and that the reader never
// degrades to an empty list when the order view says something it cannot parse.
//
// `FOCUS_CAPTURE` is a recording of that command's stdout for the two-package fixture, with
// the temporary workspace name normalised. It is a capture rather than a construction: a
// builder here would be a second renderer, and the test would then agree with itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  materializeAdjacentLevelWorkspace,
  materializeExplainSeedWorkspace,
} from '../helpers/explain-seed-workspace.mjs';
import { produceInfo } from '../../../.claude/scripts/explain-seed/run.mjs';
import { loadOrderFacts, parseFocusBlock } from '../../../.claude/scripts/explain-seed/lib/order.mjs';
import { ExplainSeedError } from '../../../.claude/scripts/explain-seed/lib/errors.mjs';
import { renderPosition } from '../../../.claude/scripts/explain-seed/lib/render.mjs';
import { EXPLAIN_SECTION_FACTS, computeFrameDigests } from '../../../.claude/scripts/explain-seed/lib/digest.mjs';
import { syntheticInfoSections } from '../helpers/synthetic-facts.mjs';

const ORDER_MODULE = fileURLToPath(new URL('../../../.claude/scripts/explain-seed/lib/order.mjs', import.meta.url));

const RULE = '─'.repeat(66);

/** The order view's stdout for the two-package fixture, as recorded from a real run. */
const FOCUS_CAPTURE = [
  '',
  '# explain-seed-fixture implementation order — 2 dirs / 2 levels / 1 dependencies',
  '',
  'level  0    alone     1 dir',
  '  * crates/protocol/alpha',
  '',
  'level  1    alone     1 dir',
  '  * crates/protocol/beta',
  '',
  'parallel width   level   0  1',
  '                 dirs    1  1',
  '',
  'critical chain   alpha → beta',
  RULE,
  '▶ crates/protocol/alpha  level 0 · 1st · on the critical path',
  '',
  '  waits for (0)',
  '',
  '  parallel in this level (0)     → this level is alone, so this step is serial',
  '',
  '  used by (1)',
  '    crates/protocol/beta   level 1',
  '',
].join('\n');

/** The order facts for one package of a fixture, with the packages they are resolved against. */
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
function orderOf(workspace, packageId) {
  return loadOrderFacts({
    root: workspace.root,
    seedPath: workspace.seedPathOf(packageId),
    packages: workspace.manifests.tree.workspace.packages,
  });
}

test('C001 precondition: the fixture workspace yields the order the manifests publish', () => {
  const workspace = materializeExplainSeedWorkspace();

  const order = orderOf(workspace, 'pkg-0001');

  assert.equal(order.level, 0, 'pkg-0001 is at level 0 in the published order');
  assert.equal(order.ordinal, 1, 'the order view prints 1st for the first serial position');
  assert.equal(order.onCriticalPath, true);
  assert.deepEqual(order.waitsFor, [], 'nothing is declared to come before pkg-0001');
  assert.deepEqual(order.usedBy, ['pkg-0002'], 'pkg-0002 holds the only declared edge');
  assert.deepEqual(order.parallelInLevel, [], 'pkg-0001 is alone at level 0 here');
  assert.equal(order.plan.directories, 2);
  assert.equal(order.plan.levels, 2);
  assert.equal(order.plan.dependencies, 1);
  assert.equal(order.plan.criticalChainLength, 2);
});

test('C001 postcondition: every id the order facts name resolves against workspace.packages', () => {
  const workspace = materializeAdjacentLevelWorkspace();
  const packages = workspace.manifests.tree.workspace.packages;

  const order = orderOf(workspace, 'pkg-0001');

  for (const id of [...order.waitsFor, ...order.usedBy, ...order.parallelInLevel]) {
    assert.ok(packages.some((pkg) => pkg.id === id), `${id} is a package this workspace holds`);
  }
});

test('C001 invariant: the level reported is the index of the published level holding this package', () => {
  const workspace = materializeAdjacentLevelWorkspace();
  const published = workspace.manifests.allocate.implementation_order.levels;

  const order = orderOf(workspace, 'pkg-0001');

  assert.equal(order.level, published.findIndex((level) => level.includes('pkg-0001')));
  assert.equal(order.plan.levels, published.length);
});

test('C001 invariant: a package reported through the command carries the same facts as the reader', () => {
  const workspace = materializeAdjacentLevelWorkspace();

  const { info } = produceInfo(workspace.seedPathOf('pkg-0001'));

  assert.match(info.sections.I2, /level 0/);
  assert.match(info.sections.I2, /crates\/protocol\/beta/);
});

test('C001 invariant: a stage-two manifest with no implementation_order fails naming the artefact', () => {
  const workspace = materializeExplainSeedWorkspace();
  const allocate = workspace.manifests.allocate;
  workspace.writeAllocateManifest({ ...allocate, implementation_order: undefined });

  assert.throws(
    () => produceInfo(workspace.seedPath),
    (error) => error instanceof ExplainSeedError && /implementation_order/.test(error.message),
  );
});

test('C001 invariant: a stage-one manifest with no canonical_edges fails naming that field', () => {
  const workspace = materializeExplainSeedWorkspace();
  const tree = workspace.manifests.tree;
  workspace.writeTreeManifest({
    ...tree,
    dependencies: { ...tree.dependencies, dag: { ...tree.dependencies.dag, canonical_edges: undefined } },
  });

  assert.throws(
    () => produceInfo(workspace.seedPath),
    (error) => error instanceof ExplainSeedError && /canonical_edges/.test(error.message),
  );
});

test('C002 precondition: a level-mate with no edge is parallel, and is never reported as a wait', () => {
  // pkg-0001 and pkg-0004 at level 0; pkg-0002 and pkg-0003 at level 1; the edges are
  // pkg-0002 -> pkg-0001 and pkg-0003 -> pkg-0004 alone. The seed keeps the adjacency-style
  // values stage two injects, so a renderer of the seed's `after` lists pkg-0003 as a wait.
  const workspace = materializeAdjacentLevelWorkspace();

  const { info } = produceInfo(workspace.seedPathOf('pkg-0001'));
  const positionSection = info.sections.I2;

  assert.match(positionSection, /serial[\s\S]*crates\/protocol\/beta/);
  assert.doesNotMatch(positionSection, /serial[^\n]*crates\/protocol\/gamma/);
  assert.match(positionSection, /parallel[\s\S]*crates\/protocol\/delta/);
  assert.match(positionSection, /different level is not an ordering/);
});

test('C004 invariant: a projection the renderer cannot name directories from fails by field, not by TypeError', () => {
  const order = {
    level: 0,
    ordinal: 1,
    onCriticalPath: false,
    waitsFor: ['pkg-0002'],
    usedBy: [],
    parallelInLevel: [],
    plan: { directories: 2, levels: 2, dependencies: 1, criticalChainLength: 2 },
  };

  assert.throws(
    () => renderPosition({ position: { wave: null, level: null, serial_index: null, order }, totals: { packages: 2, layers: 1, boundaries: 1 } }),
    (error) => error instanceof ExplainSeedError && error.field === 'workspace.packages',
  );
});

test('C002 invariant: the rendered serial set is exactly the declared edge set', () => {
  const workspace = materializeAdjacentLevelWorkspace();
  const declared = workspace.manifests.tree.dependencies.dag.canonical_edges
    .filter((edge) => edge.from === 'pkg-0001')
    .map((edge) => edge.to);

  const order = orderOf(workspace, 'pkg-0001');

  assert.deepEqual([...order.waitsFor].sort(), [...declared].sort());
  assert.equal(order.waitsFor.includes('pkg-0003'), false, 'no edge means no serial claim');
});

test('C002 invariant: the rendered parallel set is exactly the published level minus this package', () => {
  const workspace = materializeAdjacentLevelWorkspace();
  const published = workspace.manifests.allocate.implementation_order.levels;

  const order = orderOf(workspace, 'pkg-0001');

  assert.deepEqual(order.parallelInLevel, ['pkg-0004'], 'level 0 holds pkg-0001 and pkg-0004');

  assert.deepEqual(order.parallelInLevel, ['pkg-0004'], 'delta shares level 0 and holds no edge to alpha');

  const consumerOrder = orderOf(workspace, 'pkg-0003');
  assert.deepEqual(consumerOrder.parallelInLevel, ['pkg-0002']);
  assert.equal(published[consumerOrder.level].length, 2);
});

test('C002 boundary: an empty serial set and an empty parallel set are each stated, not omitted', () => {
  const workspace = materializeExplainSeedWorkspace();

  const { info } = produceInfo(workspace.seedPath);
  const positionSection = info.sections.I2;

  assert.match(positionSection, /serial[^\n]*[:]\s*none/);
  assert.match(positionSection, /parallel[^\n]*[:][^\n]*none/);
  assert.match(positionSection, /alone/, 'a level of one says so');
});

test('C002 boundary: counts are spelled as prose, in the singular and the plural', () => {
  const workspace = materializeAdjacentLevelWorkspace();

  const { info } = produceInfo(workspace.seedPathOf('pkg-0001'));
  const positionSection = info.sections.I2;

  assert.match(positionSection, /4 packages, 1 layer and 1 boundary\./, 'a count of one takes the singular form');
  assert.match(positionSection, /4 directories, 2 levels, 2 declared edges/, 'a plural noun is spelled out, not suffixed');
});

test('C002 boundary: sixteen providers render sixteen lines without wrapping', () => {
  const providers = Array.from({ length: 16 }, (_, index) => `pkg-9${String(index).padStart(3, '0')}`);
  const order = {
    level: 3,
    ordinal: 20,
    onCriticalPath: false,
    waitsFor: providers,
    usedBy: [],
    parallelInLevel: [],
    plan: { directories: 28, levels: 11, dependencies: 82, criticalChainLength: 11 },
  };
  const pathOf = Object.fromEntries(providers.map((id, index) => [id, `crates/protocol/package-${index + 1}`]));

  const lines = renderPosition({ position: { wave: null, level: null, serial_index: null, order }, pathOf, totals: { packages: 28, layers: 9, boundaries: 82 } });
  const rendered = lines.join('\n');

  for (const provider of providers) assert.match(rendered, new RegExp(pathOf[provider]));
  assert.equal(lines.filter((line) => /package-\d+/.test(line)).length, 16, 'every provider is printed');
  assert.ok(Math.max(...lines.map((line) => line.length)) < 100, 'no line wraps the terminal');
});

test('C003 precondition: only the sections resting on INFO 2 reopen when the order moves', () => {
  const before = computeFrameDigests(syntheticInfoSections());
  const after = computeFrameDigests(
    syntheticInfoSections({ I2: '## 2. Where the package sits\n\n- serial: crates/protocol/beta\n' }),
  );

  const moved = Object.keys(after).filter((id) => after[id].digest !== before[id].digest);

  assert.deepEqual(moved, ['E1', 'E2']);
});

test('C003 invariant: the fact-to-section wiring still names INFO 2 alone for E2', () => {
  const wiring = Object.fromEntries(EXPLAIN_SECTION_FACTS.map((entry) => [entry.id, entry.restsOn]));

  assert.deepEqual(wiring.E2, ['I2']);
  assert.deepEqual(wiring.E1, ['I2', 'I3']);
});

test('C004 precondition: the focus block of a recorded run parses to the facts it states', () => {
  const parsed = parseFocusBlock(FOCUS_CAPTURE);

  assert.equal(parsed.level, 0);
  assert.equal(parsed.ordinal, 1);
  assert.equal(parsed.onCriticalPath, true);
  assert.deepEqual(parsed.waitsForPaths, []);
  assert.deepEqual(parsed.usedByPaths, ['crates/protocol/beta']);
  assert.deepEqual(parsed.parallelInLevelPaths, []);
  assert.deepEqual(parsed.plan, { directories: 2, levels: 2, dependencies: 1, criticalChainLength: 2 });
});

test('C004 invariant: truncated focus output raises rather than yielding empty lists', () => {
  const truncated = [
    'level  0    alone     1 dir',
    '  * crates/protocol/alpha',
    '',
    '  waits for (0)',
    '',
  ].join('\n');

  assert.throws(
    () => parseFocusBlock(truncated),
    (error) => error instanceof ExplainSeedError && error.field === 'implementation_order' && /focus/.test(error.message),
  );
});

test('C004 invariant: a declared count that disagrees with the entries raises', () => {
  const inconsistent = FOCUS_CAPTURE.replace('used by (1)', 'used by (2)');

  assert.throws(
    () => parseFocusBlock(inconsistent),
    (error) => error instanceof ExplainSeedError && /used by/.test(error.message),
  );
});

test('C004 postcondition: the order view speaks for itself and its bytes never reach stdout', () => {
  const workspace = materializeExplainSeedWorkspace();

  const { info } = produceInfo(workspace.seedPath);

  assert.match(info.text, /^# RFC-SEED record: /);
  assert.doesNotMatch(info.text, /implementation order — \d+ dirs/, 'the order view keeps its own stdout');
});

test('C005 invariant: the order module computes no level and walks no graph of its own', () => {
  const source = readFileSync(ORDER_MODULE, 'utf8');

  assert.doesNotMatch(source, /Math\.max\(\.\.\./, 'no longest-path computation');
  assert.doesNotMatch(source, /criticalChain\s*=/, 'no critical-chain walk');
  assert.doesNotMatch(source, /from '\.\.\/\.\.\/workspacify-order\/lib/, 'no import of the sibling library');
});

test('C005 boundary: a root the two commands disagree on raises rather than pairing two workspaces', () => {
  const workspace = materializeExplainSeedWorkspace();
  const elsewhere = materializeExplainSeedWorkspace();

  assert.throws(
    () =>
      loadOrderFacts({
        root: elsewhere.root,
        seedPath: workspace.seedPath,
        packages: workspace.manifests.tree.workspace.packages,
      }),
    (error) => error instanceof ExplainSeedError,
  );
});
