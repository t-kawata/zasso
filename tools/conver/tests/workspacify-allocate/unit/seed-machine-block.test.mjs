// [::TICKET::] PX-193 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-193 --for-spec --no-implementation-order`.
// PX-193 @verifies C002
// Section 1 and section 2 of a seed are machine-injected: the renderer builds them
// from the manifest and the verified contracts, and AI text for either section is
// rejected rather than merged.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-render.mjs';
import { parseSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parse.mjs';
import {
  SEED_REQUIRED_SECTIONS,
  SEED_MACHINE_SECTION_INDEX,
  SEED_CONTRACT_SECTION_INDEX,
  SEED_AUTHORING_SECTION_INDEXES,
} from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';
import { buildReferenceBlock } from '../../../.claude/scripts/workspacify-allocate/lib/reference-block.mjs';
import { buildContractEdge } from '../../../.claude/scripts/workspacify-allocate/lib/contract-model.mjs';
import { buildValidManifest, baseAiSections } from '../helpers/build-valid-manifest.mjs';

function fixture() {
  const { manifest } = buildValidManifest();
  const pkg = manifest.workspace.packages[0];
  const boundary = manifest.dependencies.boundaries[0];
  const referenceBlock = {
    package: { id: pkg.id, name: pkg.name, path: pkg.path, layer: pkg.layer, kind: pkg.kind, responsibilities: pkg.responsibilities },
    source_spec: { path: 'spec.md', sha256: manifest.input.source_hash },
    stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: manifest.integrity.manifest_hash },
    stage2_manifest: { path: 'WORKSPACIFY-ALLOCATE-MANIFEST.json' },
    implementation_order: { before: [], after: ['pkg-b'], parallel_with: [], serial_index: 0, wave: 0 },
    contract_refs: ['contract-boundary-001'],
    source_segments: ['s-000001'],
  };
  const contractEdge = buildContractEdge({
      boundaryId: boundary.id,
      sides: {
        consumer: { packageId: boundary.consumer_package },
        provider: { packageId: boundary.provider_package },
      },
      relation: { direction: 'consumer_to_provider', connectionKind: 'value_only' },
      content: { owners: { semantic: 'pkg-a' }, sourceRefs: ['s-000001'], clauses: { input: 'i', output: 'o', preconditions: ['p'], postconditions: ['q'], invariants: ['r'], errors: [], canonicalization: 'c', tests: ['t'] } },
    });
  const expectedAllocation = [{ category: 'object', inventory_ref: 'obj-000001', canonical_name: 'Alpha Record' }];
  return { manifest, pkg, boundary, referenceBlock, contractEdge, expectedAllocation };
}

test('C002 the machine sections are rendered from the block and the contracts', () => {
  const { manifest, pkg, referenceBlock, contractEdge, expectedAllocation } = fixture();
  const { seedText, fileName } = renderSeed({
    package: pkg, machine: { manifest, expectedAllocation, referenceBlock, contractEdges: [contractEdge] }, aiSections: baseAiSections(),
  });

  assert.equal(fileName, 'RFC-SEED.md');
  assert.ok(seedText.startsWith('# RFC Seed: alpha'));
  assert.ok(seedText.includes('"stage2_manifest"'));
  assert.ok(seedText.includes('"contract_edges"'));
  assert.ok(seedText.includes('contract-boundary-001'));

  const parsed = parseSeed(seedText);
  assert.equal(parsed.headings.length, SEED_REQUIRED_SECTIONS.length);
  assert.equal(parsed.headings[0].title, SEED_REQUIRED_SECTIONS[0].title);
  assert.equal(parsed.referenceBlock.package.id, pkg.id);
  assert.deepEqual(parsed.referenceBlock.stage2_manifest, { path: 'WORKSPACIFY-ALLOCATE-MANIFEST.json' });
  assert.equal(parsed.contractEdges.length, 1);
  assert.equal(parsed.contractEdges[0].contract_id, 'contract-boundary-001');
  assert.ok(parsed.allocationIndexRows.some((row) => row.inventory_ref === 'obj-000001'));
});

test('C002 the grammar keeps the machine sections first and the AI surface bounded', () => {
  assert.equal(SEED_MACHINE_SECTION_INDEX, 1);
  assert.equal(SEED_CONTRACT_SECTION_INDEX, 2);
  assert.deepEqual(SEED_AUTHORING_SECTION_INDEXES, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(SEED_REQUIRED_SECTIONS.length, 14);
  assert.equal(SEED_REQUIRED_SECTIONS[0].title, 'Identity and Position in the Whole System');
  assert.equal(SEED_REQUIRED_SECTIONS[1].title, 'Coupling Contracts (I/O Boundary)');
  assert.equal(SEED_REQUIRED_SECTIONS[13].title, 'Source Traceability Index');
});

test('C002 AI text for a machine section is rejected, and a missing authoring section too', () => {
  const { manifest, pkg, referenceBlock, contractEdge, expectedAllocation } = fixture();
  const render = (aiSections) => renderSeed({ package: pkg, machine: { manifest, expectedAllocation, referenceBlock, contractEdges: [contractEdge] }, aiSections });

  assert.throws(() => render({ ...baseAiSections(), 1: 'AI wrote the machine block' }), (error) => error.gateId === 'G3.6');
  assert.throws(() => render({ ...baseAiSections(), 2: 'AI wrote the contracts' }), (error) => error.gateId === 'G3.6');

  const withoutInvariants = { ...baseAiSections() };
  delete withoutInvariants[11];
  assert.throws(() => render(withoutInvariants), (error) => error.gateId === 'G3.6' && /11/.test(error.message));

  assert.throws(() => render({ ...baseAiSections(), 13: 'not_applicable' }), (error) => error.gateId === 'G3.6');
});

test('C002 a seed without a contract edge still states that it has no external contracts', () => {
  const { manifest, pkg, referenceBlock, expectedAllocation } = fixture();
  const { seedText } = renderSeed({ package: pkg, machine: { manifest, expectedAllocation, referenceBlock, contractEdges: [] }, aiSections: baseAiSections() });
  const parsed = parseSeed(seedText);
  assert.deepEqual(parsed.contractEdges, []);
  assert.equal(parsed.contractBlock.no_external_contracts, true);
  assert.ok(parsed.contractBlock.no_external_contracts_reason.length > 0);
});

test('C002 a rendered seed parses back to the same machine facts', () => {
  const { manifest, pkg, referenceBlock, contractEdge, expectedAllocation } = fixture();
  const { seedText } = renderSeed({ package: pkg, machine: { manifest, expectedAllocation, referenceBlock, contractEdges: [contractEdge] }, aiSections: baseAiSections() });
  const parsed = parseSeed(seedText);
  assert.deepEqual(parsed.referenceBlock, referenceBlock);
  assert.deepEqual(parsed.contractEdges, [contractEdge]);
  assert.ok(parsed.traceabilityRows.some((row) => typeof row.segmentId === 'string' && row.segmentId.startsWith('s-')));
});
