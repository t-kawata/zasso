// [::TICKET::] PX-197 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-197 --for-spec --no-implementation-order`.
// PX-197 @verifies C001 C002
// Stage 1 must not publish a manifest stage 2 would refuse. The two gates are
// therefore one predicate: the stage-1 gate asks the stage-2 entry gate and adds
// its own parity checks on top, so a gap in either direction cannot survive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

import { checkTreeEntryGate } from '../../../.claude/scripts/workspacify-tree/lib/entry-parity.mjs';
import { checkAllocateEntryGate } from '../../../.claude/scripts/workspacify-allocate/lib/tree-manifest-input.mjs';
import { materializeTreeFixture } from '../helpers/build-valid-tree-manifest.mjs';

/** Each case removes or corrupts exactly one thing stage 2 depends on. */
const MUTATIONS = [
  ['the segment ownership declaration', (manifest) => { for (const segment of manifest.structure.segments) { delete segment.owned_inventory_ids; } }],
  ['the dependency proof', (manifest) => { delete manifest.dependencies.dag; }],
  ['the implementation order', (manifest) => { delete manifest.dependencies.dag.implementation_order; }],
  ['the boundary clause scope', (manifest) => { manifest.dependencies.boundaries[0].stage2_contract_scope = ['input']; }],
  ['the package responsibilities', (manifest) => { manifest.workspace.packages[0].responsibilities = []; }],
  ['the contract boundaries mirror', (manifest) => { manifest.stage2_handoff.contract_boundaries = []; }],
  ['the artifact kind', (manifest) => { manifest.artifact_kind = 'something-else'; }],
];

function fixture() {
  const prepared = materializeTreeFixture();
  const base = JSON.parse(JSON.stringify(prepared.manifest));
  base.integrity.manifest_hash = require_hash(base);
  return { ...prepared, base };
}

function require_hash(manifest) {
  // The fixture helper hashes through assembleManifest; recompute for a mutated copy.
  return manifest.integrity.manifest_hash;
}

test('C001 the stage-1 gate accepts exactly what the stage-2 entry gate accepts', () => {
  const prepared = materializeTreeFixture();
  try {
    const manifest = prepared.manifest;
    const stageOne = checkTreeEntryGate(manifest, prepared.specPath);
    const stageTwo = checkAllocateEntryGate(manifest, prepared.dir);
    assert.equal(stageOne.ok, true, JSON.stringify(stageOne.errors));
    assert.equal(stageTwo.ok, true, JSON.stringify(stageTwo.errors));
  } finally {
    rmSync(prepared.dir, { recursive: true, force: true });
  }
});

test('C001 every requirement stage 2 relies on is refused by the stage-1 gate too', () => {
  const prepared = materializeTreeFixture();
  try {
    const pristine = prepared.manifest;
    for (const [label, mutate] of MUTATIONS) {
      const mutant = JSON.parse(JSON.stringify(pristine));
      mutate(mutant);
      const stageTwo = checkAllocateEntryGate(mutant, prepared.dir);
      const stageOne = checkTreeEntryGate(mutant, prepared.specPath);
      assert.equal(stageTwo.ok, false, `stage 2 should refuse a manifest missing ${label}`);
      assert.equal(stageOne.ok, false, `stage 1 must refuse a manifest missing ${label}`);
    }
  } finally {
    rmSync(prepared.dir, { recursive: true, force: true });
  }
});

test('C002 the stage-1 gate reports the stage-2 verdict in its own errors', () => {
  const prepared = materializeTreeFixture();
  try {
    const mutant = JSON.parse(JSON.stringify(prepared.manifest));
    delete mutant.dependencies.dag;
    const stageOne = checkTreeEntryGate(mutant, prepared.specPath);
    assert.equal(stageOne.ok, false);
    // The refusal text must name the stage-2 requirement, so the operator fixes the
    // right thing instead of guessing which side objected.
    assert.ok(stageOne.errors.some((message) => /dag|implementation_order|stage-2|stage 2/i.test(message)), JSON.stringify(stageOne.errors));
  } finally {
    rmSync(prepared.dir, { recursive: true, force: true });
  }
});
