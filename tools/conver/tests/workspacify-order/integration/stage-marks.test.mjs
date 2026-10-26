// PX-309 @verifies C006
// The command a reader runs must print the same eight fields the model carries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { materializeOrderWorkspace } from '../helpers/order-workspace.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RUN = join(PROJECT_ROOT, '.claude/scripts/workspacify-order/run.mjs');

// [::TICKET::] PX-309, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-309|PX-313) --for-spec --no-implementation-order`.
function workspace(t, { artifacts }) {
  const materialized = materializeOrderWorkspace({
    packages: ['pkg-0001'],
    documents: { explained: ['pkg-0001'], grilled: ['pkg-0001'] },
    rootCounters: { educe: 3, smooth: 4 },
  });
  t.after(() => materialized.remove());
  const directory = materialized.directoryOf('pkg-0001');
  writeFileSync(join(directory, 'Status.json'), JSON.stringify({
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
  return materialized;
}

test('C006 run.mjs prints both generations and the three downstream marks', (t) => {
  const materialized = workspace(t, { artifacts: true });
  const output = execFileSync(process.execPath, [RUN], { cwd: materialized.root, encoding: 'utf8' });
  assert.match(output, /🟤 EDU:3 🔴 EXP 🟠 GRI:2 🟡 SEQ:2 🟢 SMO:4 🔵 GRA:3 🟣 BOU:2 ⚫️ SPL:1/);
});

test('C006 run.mjs omits the downstream marks when the artifacts are absent', (t) => {
  const materialized = workspace(t, { artifacts: false });
  const output = execFileSync(process.execPath, [RUN], { cwd: materialized.root, encoding: 'utf8' });
  assert.doesNotMatch(output, /GRA|BOU|SPL/);
  assert.match(output, /🟠 GRI:2 🟡 SEQ:2 🟢 SMO:4/);
});
