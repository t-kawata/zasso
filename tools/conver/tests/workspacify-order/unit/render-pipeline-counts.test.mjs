import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { materializeOrderWorkspace } from '../helpers/order-workspace.mjs';
import { buildModel } from '../../../.claude/scripts/workspacify-order/lib/levels.mjs';
import { renderPlan } from '../../../.claude/scripts/workspacify-order/lib/render.mjs';

// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
function modelFor(t, { statuses = {}, artifacts = true } = {}) {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001'],
    documents: { explained: ['pkg-0001'], grilled: ['pkg-0001'] },
    rootCounters: { educe: 1, smooth: 1 },
  });
  t.after(() => workspace.remove());
  const directory = workspace.directoryOf('pkg-0001');
  writeFileSync(join(directory, 'RFC.md'), '# RFC\n');
  if (artifacts) {
    writeFileSync(join(directory, 'RFC-GRAPH.json'), '{}');
    writeFileSync(join(directory, 'RFC-Dirs-Tree.json'), '{}');
    writeFileSync(join(directory, 'Tickets.json'), '{}');
  }
  for (const [name, status] of Object.entries(statuses)) {
    writeFileSync(join(directory, name), JSON.stringify(status));
  }
  return buildModel({
    root: workspace.root,
    treeManifest: JSON.parse(readFileSync(workspace.treeManifestPath, 'utf8')),
    allocateManifest: JSON.parse(readFileSync(workspace.allocateManifestPath, 'utf8')),
  });
}

// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
function packageLine(model) {
  return renderPlan(model).split('\n').find((line) => line.includes('package-1'));
}

test('a known stage generation renders GRA:<n>, BOU:<n>, SPL:<n>', (t) => {
  const line = packageLine(modelFor(t, {
    statuses: {
      'RFC-GRAPHIFY-Status.json': { generation: 3 },
      'RFC-BOUNDIFY-Status.json': { generation: 2 },
      'RFC-SPLIT-Status.json': { generation: 1 },
    },
  }));
  assert.match(line, /GRA:3/);
  assert.match(line, /BOU:2/);
  assert.match(line, /SPL:1/);
});

test('an artifact with no status renders KEY:? rather than a fabricated count', (t) => {
  const line = packageLine(modelFor(t, { artifacts: true }));
  assert.match(line, /GRA:\?/);
  assert.match(line, /BOU:\?/);
  assert.match(line, /SPL:\?/);
});

test('a package without artifacts acquires no trailing stage field', (t) => {
  const line = packageLine(modelFor(t, { artifacts: false }));
  assert.doesNotMatch(line, /GRA|BOU|SPL/);
});

test('a malformed status is unknown, never a count', (t) => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001'],
    documents: { explained: ['pkg-0001'], grilled: ['pkg-0001'] },
    rootCounters: { educe: 1, smooth: 1 },
  });
  t.after(() => workspace.remove());
  const directory = workspace.directoryOf('pkg-0001');
  writeFileSync(join(directory, 'RFC.md'), '# RFC\n');
  writeFileSync(join(directory, 'RFC-GRAPH.json'), '{}');
  writeFileSync(join(directory, 'RFC-GRAPHIFY-Status.json'), '{not json');
  const model = buildModel({
    root: workspace.root,
    treeManifest: JSON.parse(readFileSync(workspace.treeManifestPath, 'utf8')),
    allocateManifest: JSON.parse(readFileSync(workspace.allocateManifestPath, 'utf8')),
  });
  assert.match(packageLine(model), /GRA:\?/);
});
