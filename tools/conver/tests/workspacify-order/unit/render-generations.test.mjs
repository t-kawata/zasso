// PX-309 @verifies C006
// The line reports the two generation counters and the three downstream artifacts in
// pipeline order. A package with no downstream artifact keeps the earlier fields and
// acquires no trailing marks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { materializeOrderWorkspace } from '../helpers/order-workspace.mjs';
import { buildModel, displayWidth } from '../../../.claude/scripts/workspacify-order/lib/levels.mjs';
import { maxLineWidth, renderPlan } from '../../../.claude/scripts/workspacify-order/lib/render.mjs';

// [::TICKET::] PX-309, PX-313 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-309|PX-313) --for-spec --no-implementation-order`.
function modelFor(t, { artifacts = false, status } = {}) {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001'],
    documents: { explained: ['pkg-0001'], grilled: ['pkg-0001'] },
    rootCounters: { educe: 3, smooth: 4 },
  });
  t.after(() => workspace.remove());
  const directory = workspace.directoryOf('pkg-0001');
  writeFileSync(join(directory, 'Status.json'), JSON.stringify(status ?? {
    state: 'DONE',
    grillGeneration: 2,
    distributionGeneration: 2,
    distributionDigest: 'b'.repeat(64),
  }));
  writeFileSync(join(directory, 'RFC.md'), '# RFC\n\n```json distribution-map\n{}\n```\n');
  if (artifacts) {
    writeFileSync(join(directory, 'RFC-GRAPH.json'), '{}');
    writeFileSync(join(directory, 'RFC-Dirs-Tree.json'), '{}');
    writeFileSync(join(directory, 'Tickets.json'), '{}');
    writeFileSync(join(directory, 'RFC-GRAPHIFY-Status.json'), JSON.stringify({ generation: 3 }));
    writeFileSync(join(directory, 'RFC-BOUNDIFY-Status.json'), JSON.stringify({ generation: 2 }));
    writeFileSync(join(directory, 'RFC-SPLIT-Status.json'), JSON.stringify({ generation: 1 }));
  }
  return buildModel({
    root: workspace.root,
    treeManifest: JSON.parse(readFileSync(workspace.treeManifestPath, 'utf8')),
    allocateManifest: JSON.parse(readFileSync(workspace.allocateManifestPath, 'utf8')),
  });
}

// [::TICKET::] PX-309, PX-393 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-309|PX-393) --for-spec --no-implementation-order`.
function packageBlock(model) {
  const lines = renderPlan(model).split('\n');
  const start = lines.findIndex((line) => line.includes('package-1'));
  const end = lines.findIndex((line, index) => index > start && line === '');
  return lines.slice(start, end === -1 ? undefined : end);
}

test('C006 the eight fields render in pipeline order across the two grid rows', (t) => {
  const block = packageBlock(modelFor(t, { artifacts: true }));
  assert.equal(block[0], '  * crates/protocol/package-1 🟤 EDU:3 🔴 EXP   🟠 GRI:2 🟡 SEQ:2');
  assert.match(block[1], /^ {30}🟢 SMO:4 🔵 GRA:3 🟣 BOU:2 ⚫️ SPL:1$/);
  assert.match(block[2], /^ {30}⚪️ TICKETS: \[ \] 0\/0$/);
});

test('C006 a package without downstream artifacts acquires no trailing marks', (t) => {
  const block = packageBlock(modelFor(t, { artifacts: false }));
  assert.equal(block[0], '  * crates/protocol/package-1 🟤 EDU:3 🔴 EXP 🟠 GRI:2 🟡 SEQ:2');
  assert.match(block[1], /^ {30}🟢 SMO:4$/);
});

test('C006 an absent generation falls back to the documented lower bounds', (t) => {
  const model = modelFor(t, { status: { state: 'DONE', completedSessions: 3 } });
  const block = packageBlock(model).join('\n');
  assert.match(block, /🟠 GRI:3/);
  assert.match(block, /🟡 SEQ:1/);
});

test('C006 the black circle measures two columns like every other glyph', () => {
  assert.equal(displayWidth('⚫️'), 2);
});

test('C006 the rendered plan stays inside its own computed width', (t) => {
  const text = renderPlan(modelFor(t, { artifacts: true }));
  const limit = maxLineWidth(text);
  for (const line of text.split('\n')) assert.ok(displayWidth(line) <= limit, `line exceeds ${limit}: ${line}`);
});
