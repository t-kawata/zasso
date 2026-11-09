// PX-393 @verifies C004
// PX-393 @verifies C005
// PX-393 @verifies C007
// PX-393 @verifies C008
// The plan is a two-row grid: row 1 rides on the path line, row 2 and the TICKETS row
// start at markColumn. Every column is two glyph columns plus one space plus the widest
// text in the paired fields, so a count that grows never moves the next glyph.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { materializeOrderWorkspace } from '../helpers/order-workspace.mjs';
import { buildModel, displayWidth } from '../../../.claude/scripts/workspacify-order/lib/levels.mjs';
import { buildPlanLayout, renderPlan } from '../../../.claude/scripts/workspacify-order/lib/render.mjs';

// [::TICKET::] PX-393 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-393 --for-spec --no-implementation-order`.
function modelOf(workspace) {
  return buildModel({
    root: workspace.root,
    treeManifest: workspace.treeManifest,
    allocateManifest: workspace.allocateManifest,
  });
}

/** The display column where a needle starts. */
// [::TICKET::] PX-393 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-393 --for-spec --no-implementation-order`.
function columnOf(text, needle) {
  const index = text.indexOf(needle);
  assert.notEqual(index, -1, `missing ${needle}: ${text}`);
  return displayWidth(text.slice(0, index));
}

/** Write the three downstream artifacts and their generations for one package. */
// [::TICKET::] PX-393 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-393 --for-spec --no-implementation-order`.
function writePipelineArtifacts(workspace, id, { graph, boundify, split }) {
  const directory = workspace.directoryOf(id);
  writeFileSync(join(directory, 'RFC-GRAPH.json'), '{}');
  writeFileSync(join(directory, 'RFC-Dirs-Tree.json'), '{}');
  writeFileSync(join(directory, 'Tickets.json'), JSON.stringify({ phases: [] }));
  writeFileSync(join(directory, 'RFC-GRAPHIFY-Status.json'), JSON.stringify({ generation: graph }));
  writeFileSync(join(directory, 'RFC-BOUNDIFY-Status.json'), JSON.stringify({ generation: boundify }));
  writeFileSync(join(directory, 'RFC-SPLIT-Status.json'), JSON.stringify({ generation: split }));
}

/** Write a ticket ledger whose first `reviewed` tickets are reviewed and the rest made. */
// [::TICKET::] PX-393 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-393 --for-spec --no-implementation-order`.
function writeLedger(workspace, id, total, reviewed = 0) {
  writeFileSync(join(workspace.directoryOf(id), 'Tickets.json'), JSON.stringify({
    phases: [{
      id: 0,
      tickets: Array.from({ length: total }, (_, index) => ({
        id: index + 1,
        status: index < reviewed ? 'reviewed' : 'made',
      })),
    }],
  }, null, 2));
}

test('C004 each column is the widest paired field, and both rows start at markColumn', (t) => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002'],
    edges: [['pkg-0002', 'pkg-0001']],
    levels: [['pkg-0001'], ['pkg-0002']],
    documents: {
      explained: ['pkg-0001', 'pkg-0002'],
      grilled: ['pkg-0001', 'pkg-0002'],
      carried: ['pkg-0001', 'pkg-0002'],
    },
    rootCounters: { educe: 3, smooth: 20 },
    counters: {
      'pkg-0001': { completedSessions: 3, grillGeneration: 3, distributionGeneration: 3 },
      'pkg-0002': { completedSessions: 3, grillGeneration: 3, distributionGeneration: 3 },
    },
  });
  t.after(() => workspace.remove());
  for (const id of ['pkg-0001', 'pkg-0002']) {
    writePipelineArtifacts(workspace, id, { graph: 1, boundify: 1, split: 1 });
  }

  const model = modelOf(workspace);
  const layout = buildPlanLayout(model);

  assert.deepEqual(layout.columns.map((column) => column.keys), [
    ['edu', 'smo'], ['exp', 'gra'], ['gri', 'bou'], ['seq', 'spl'],
  ]);
  assert.equal(layout.columns[0].width, 6);
  assert.equal(layout.columns[1].width, 5);
  assert.equal(layout.columns[2].width, 5);
  assert.equal(layout.columns[3].width, 5);

  const lines = renderPlan(model).split('\n');
  const pathIndex = lines.findIndex((line) => line.includes('crates/protocol/package-1'));
  assert.match(lines[pathIndex], /🟤 EDU:3 {2}🔴 EXP {3}🟠 GRI:3 🟡 SEQ:3/);
  assert.equal(columnOf(lines[pathIndex], '🟤'), model.markColumn);
  assert.equal(columnOf(lines[pathIndex + 1], '🟢'), model.markColumn);
  assert.equal(columnOf(lines[pathIndex], '🔴'), columnOf(lines[pathIndex + 1], '🔵'));
  assert.equal(columnOf(lines[pathIndex], '🟠'), columnOf(lines[pathIndex + 1], '🟣'));
  assert.equal(columnOf(lines[pathIndex], '🟡'), columnOf(lines[pathIndex + 1], '⚫️'));
});

test('C004 a missing middle field keeps a blank cell, so the later column does not move', (t) => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002'],
    edges: [['pkg-0002', 'pkg-0001']],
    levels: [['pkg-0001'], ['pkg-0002']],
    documents: {
      explained: ['pkg-0001'],
      grilled: ['pkg-0001', 'pkg-0002'],
      carried: ['pkg-0001', 'pkg-0002'],
    },
    rootCounters: { educe: 10 },
    counters: {
      'pkg-0001': { completedSessions: 0, distributionGeneration: 3 },
      'pkg-0002': { completedSessions: 0, distributionGeneration: 3 },
    },
  });
  t.after(() => workspace.remove());
  const model = modelOf(workspace);
  const lines = renderPlan(model).split('\n');
  const first = lines.find((line) => line.includes('package-1'));
  const second = lines.find((line) => line.includes('package-2'));

  assert.match(second, /🟤 EDU:10 {8}🟠 GRI:\?/);
  assert.equal(columnOf(first, '🟡'), columnOf(second, '🟡'));
});

test('C004 multi-digit counters keep the paired columns aligned', (t) => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002'],
    edges: [['pkg-0002', 'pkg-0001']],
    levels: [['pkg-0001'], ['pkg-0002']],
    documents: { grilled: ['pkg-0001', 'pkg-0002'], carried: ['pkg-0001', 'pkg-0002'] },
    rootCounters: { smooth: 20 },
    counters: {
      'pkg-0001': { completedSessions: 3, distributionGeneration: 3 },
      'pkg-0002': { completedSessions: 12, distributionGeneration: 3 },
    },
  });
  t.after(() => workspace.remove());
  const model = modelOf(workspace);
  const lines = renderPlan(model).split('\n');
  const smoothLines = lines.filter((line) => line.includes('🟢 SMO:20'));

  assert.equal(smoothLines.length, 2);
  assert.match(lines.find((line) => line.includes('GRI:3')), /🟡 SEQ:3/);
  assert.match(lines.find((line) => line.includes('GRI:12')), /🟡 SEQ:3/);
  assert.equal(
    columnOf(lines.find((line) => line.includes('GRI:3')), '🟡'),
    columnOf(lines.find((line) => line.includes('GRI:12')), '🟡'),
  );
});

test('C004 a failed SEQ and a complete SEQ keep SMO at the same display column', (t) => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002'],
    edges: [['pkg-0002', 'pkg-0001']],
    levels: [['pkg-0001'], ['pkg-0002']],
    documents: { grilled: ['pkg-0001', 'pkg-0002'], carried: ['pkg-0001', 'pkg-0002'] },
    rootCounters: { smooth: 20 },
    counters: {
      'pkg-0001': { distributionGeneration: 3 },
      'pkg-0002': { distributionGeneration: 3 },
    },
  });
  t.after(() => workspace.remove());
  writeFileSync(workspace.viewPathOf('pkg-0002'), '');
  const text = renderPlan(modelOf(workspace));
  const tickled = text.split('\n').filter((line) => line.includes('🟢'));

  assert.equal(tickled.length, 2);
  assert.equal(columnOf(tickled[0], '🟢'), columnOf(tickled[1], '🟢'));
  assert.match(text, /❌ SEQ:3/);
});

test('C005 12-, 11- and 7-ticket ledgers align their fractions', (t) => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002', 'pkg-0003'],
    edges: [['pkg-0002', 'pkg-0001'], ['pkg-0003', 'pkg-0002']],
    levels: [['pkg-0001'], ['pkg-0002'], ['pkg-0003']],
  });
  t.after(() => workspace.remove());
  writeLedger(workspace, 'pkg-0001', 12, 3);
  writeLedger(workspace, 'pkg-0002', 11);
  writeLedger(workspace, 'pkg-0003', 7);

  const text = renderPlan(modelOf(workspace));
  const ticketLines = text.split('\n').filter((line) => line.includes('TICKETS:'));

  assert.equal(ticketLines.length, 3);
  assert.match(ticketLines.find((line) => line.includes('3/12')), /\[ x x x _ _ _ _ _ _ _ _ _ \] 3\/12/);
  const starts = ticketLines.map((line) => columnOf(line, line.match(/\d+\/\d+/)[0]));
  assert.equal(new Set(starts).size, 1);
});

test('C008 the plan uses <level N>, omits the width and order-source rows, and keeps the chain', (t) => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002'],
    edges: [['pkg-0002', 'pkg-0001']],
    levels: [['pkg-0001'], ['pkg-0002']],
  });
  t.after(() => workspace.remove());
  const text = renderPlan(modelOf(workspace));

  assert.match(text, /^<level 0>$/m);
  assert.match(text, /^<level 1>$/m);
  assert.doesNotMatch(text, /parallel width/);
  assert.doesNotMatch(text, /order source:/);
  assert.match(text, /^critical chain {3}package-1 → package-2$/m);
});

test('C007 no line carries trailing whitespace or a tab, and the white circle is two columns', (t) => {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001'] });
  t.after(() => workspace.remove());
  writeLedger(workspace, 'pkg-0001', 3);

  assert.equal(displayWidth('⚪️'), 2);
  for (const line of renderPlan(modelOf(workspace)).split('\n')) {
    assert.equal(line, line.trimEnd());
    assert.equal(line.includes('\t'), false);
  }
});
