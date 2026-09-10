// [::TICKET::] PX-194 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-194 --for-spec --no-implementation-order`.
// PX-194 @verifies C004
// The walker reads the published artefacts, not renderer state: it walks the
// directory tree and lifts the machine block and the contract block from every
// RFC-SEED.md, so the verification can run over what was actually written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { walkSeedContracts } from '../../../.claude/scripts/workspacify-allocate/walk-seed-contracts.mjs';
import { renderSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-render.mjs';
import { parseSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parse.mjs';
import { buildContractEdge } from '../../../.claude/scripts/workspacify-allocate/lib/contract-model.mjs';
import { buildValidManifest, baseAiSections, makeDecisions, DEFAULT_SPEC_TEXT } from '../helpers/build-valid-manifest.mjs';

const PLAN = {
  relativeDirs: ['crates', 'crates/protocol', 'crates/protocol/alpha', 'crates/protocol/beta'],
};

function publishSeedsInto(dir) {
  const { manifest } = buildValidManifest();
  for (const pkg of manifest.workspace.packages) {
    const seed = makeDecisions(manifest).seeds.find((entry) => entry.packageId === pkg.id);
    const contractEdges = seed.contractEdges.map((edge) => buildContractEdge({
      boundaryId: edge.boundary_id, consumerPackage: edge.consumer_package, providerPackage: edge.provider_package,
      direction: edge.direction, connectionKind: edge.connection_kind, owners: edge.owners, clauses: edge.clauses, sourceRefs: edge.source_refs,
    }));
    const { seedText } = renderSeed({
      package: pkg, manifest, expectedAllocation: [], contractEdges, aiSections: baseAiSections(),
      referenceBlock: {
        package: { id: pkg.id, name: pkg.name, path: pkg.path, layer: pkg.layer, kind: pkg.kind, responsibilities: pkg.responsibilities },
        source_spec: { path: manifest.input.spec_path, sha256: manifest.input.source_hash },
        stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: manifest.integrity.manifest_hash },
        stage2_manifest: { path: 'WORKSPACIFY-ALLOCATE-MANIFEST.json' },
        implementation_order: { before: [], after: [], parallel_with: [], serial_index: 0, wave: 0 },
        contract_refs: contractEdges.map((edge) => edge.contract_id),
        source_segments: [],
      },
    });
    mkdirSync(join(dir, pkg.path), { recursive: true });
    writeFileSync(join(dir, pkg.path, 'RFC-SEED.md'), seedText);
  }
  return manifest;
}

test('C004 a tree without seeds reports the missing leaves', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-194-walk-'));
  try {
    mkdirSync(join(dir, 'crates/protocol/alpha'), { recursive: true });
    const walk = walkSeedContracts({ root: dir, plan: PLAN });
    assert.deepEqual(walk.missingSeeds.sort(), ['crates/protocol/alpha', 'crates/protocol/beta']);
    assert.deepEqual(walk.byPackage.size, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C004 the walker lifts the machine block and the contracts from every seed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-194-walk-'));
  try {
    const manifest = publishSeedsInto(dir);
    const walk = walkSeedContracts({ root: dir, plan: PLAN, manifest, manifestPath: join(dir, 'WORKSPACIFY-TREE-MANIFEST.json') });
    assert.deepEqual(walk.missingSeeds, []);
    assert.deepEqual(walk.unreadableSeeds, []);
    assert.deepEqual(walk.missingReferences, []);
    assert.equal(walk.byPackage.size, 2);
    const alpha = walk.byPackage.get('pkg-a');
    assert.equal(alpha.referenceBlock.stage2_manifest.path, 'WORKSPACIFY-ALLOCATE-MANIFEST.json');
    assert.equal(alpha.contractEdges.length, 1);
    assert.equal(alpha.contractEdges[0].direction, 'provider_to_consumer');
    assert.deepEqual(walkSeedContracts({ root: dir, plan: PLAN, manifest, manifestPath: join(dir, 'WORKSPACIFY-TREE-MANIFEST.json') }).missingSeeds, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C004 a seed whose machine block lost a reference is reported, and an unreadable seed too', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-194-walk-'));
  try {
    const manifest = publishSeedsInto(dir);
    // A parseable seed whose machine block lost one of the three references.
    const alpha = manifest.workspace.packages[0];
    const { seedText } = renderSeed({
      package: alpha, manifest, expectedAllocation: [], contractEdges: [], aiSections: baseAiSections(),
      referenceBlock: {
        package: { id: alpha.id, name: alpha.name, path: alpha.path, layer: alpha.layer, kind: alpha.kind, responsibilities: alpha.responsibilities },
        stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: manifest.integrity.manifest_hash },
        stage2_manifest: { path: 'WORKSPACIFY-ALLOCATE-MANIFEST.json' },
        implementation_order: {}, contract_refs: [], source_segments: [],
      },
    });
    writeFileSync(join(dir, 'crates/protocol/alpha/RFC-SEED.md'), seedText);
    const walk = walkSeedContracts({ root: dir, plan: PLAN });
    assert.deepEqual(walk.missingReferences, ['crates/protocol/alpha']);
    assert.deepEqual(walk.byPackage.get('pkg-a').missing_references, ['source_spec.path']);

    writeFileSync(join(dir, 'crates/protocol/beta/RFC-SEED.md'), 'not a seed at all\n');
    const broken = walkSeedContracts({ root: dir, plan: PLAN });
    assert.deepEqual(broken.unreadableSeeds, ['crates/protocol/beta']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
