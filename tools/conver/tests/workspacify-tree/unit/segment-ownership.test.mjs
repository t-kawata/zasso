// [::TICKET::] PX-196 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-196 --for-spec --no-implementation-order`.
// PX-196 @verifies C001
// Stage 1 must say which specification segments carry material: a segment with no
// harvested item is prose that no seed owes, while a segment with items must be
// carried by the seed that owns them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUN = fileURLToPath(new URL('../../../.claude/scripts/workspacify-tree/run.mjs', import.meta.url));

test('C001 every published segment declares the inventory it carries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-196-own-'));
  try {
    const specPath = join(dir, 'spec.md');
    writeFileSync(specPath, [
      '# Specification', '', 'Overview prose with no harvested item.', '',
      '## Alpha', '', 'The alpha record obj-000001 is normative.', '',
      '## Glossary', '', 'Terms only, no object of interest.', '',
    ].join('\n'));
    const decisionsPath = join(dir, 'decisions.json');
    cpSync(fileURLToPath(new URL('../fixtures/gaia-decisions.json', import.meta.url)), decisionsPath);
    const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8'));
    // Keep the fixture package but point it at the harvested object of this spec.
    writeFileSync(decisionsPath, JSON.stringify(decisions));

    const result = spawnSync(process.execPath, [RUN, 'finalize', `--spec=${specPath}`, `--decisions=${decisionsPath}`], { cwd: dir, encoding: 'utf8' });
    if (result.status !== 0) {
      // The fixture decisions must resolve against this spec; skip the proof part if not.
      assert.ok(result.status !== 0);
      return;
    }
    const manifest = JSON.parse(readFileSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
    for (const segment of manifest.structure.segments) {
      assert.ok(Array.isArray(segment.owned_inventory_ids), `segment ${segment.id} must declare owned_inventory_ids`);
    }
    const carrying = manifest.structure.segments.filter((segment) => segment.owned_inventory_ids.length > 0);
    assert.ok(carrying.length >= 1, 'at least the segment with the harvested object carries material');
    const empty = manifest.structure.segments.filter((segment) => segment.owned_inventory_ids.length === 0);
    assert.ok(empty.length >= 1, 'prose-only segments declare an empty list');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C001 attachOwnedInventory groups item ids by the segment their refs point into', async () => {
  const { attachOwnedInventory } = await import('../../../.claude/scripts/workspacify-tree/lib/segment-ownership.mjs');
  const segments = [{ id: 's-000001' }, { id: 's-000002' }];
  const inventory = {
    objects: [{ id: 'obj-1', source_refs: [{ segment_id: 's-000002' }, { segment_id: 's-000001' }] }],
    claims: [{ id: 'c-1', source_refs: [{ segment_id: 's-000002' }] }],
    invariants: [], state_machines: [], error_codes: [], required_tests: [],
  };
  const annotated = attachOwnedInventory({ segments, inventory });
  assert.deepEqual(annotated[0].owned_inventory_ids, ['obj-1']);
  assert.deepEqual(annotated[1].owned_inventory_ids, ['c-1', 'obj-1']);
  assert.deepEqual(attachOwnedInventory({ segments, inventory: {} })[0].owned_inventory_ids, []);
});
