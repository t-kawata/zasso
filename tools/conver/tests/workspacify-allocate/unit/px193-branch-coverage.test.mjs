// [::TICKET::] PX-193 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-193 --for-spec --no-implementation-order`.
// PX-193 @verifies C001 C003 C004 C005
// Branch hardening for the coupling-first modules: the rejection paths that the
// behaviour suites exercise only through one example each.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildContractEdge, validateContractEdge, validateSeedContractEdges, indexBoundariesByContractId, assertContractEdgeBuildable, contractIdForBoundary, canonicalizeClauses } from '../../../.claude/scripts/workspacify-allocate/lib/contract-model.mjs';
import { buildCoverageProof, assertSegmentCoverage } from '../../../.claude/scripts/workspacify-allocate/lib/coverage-proof.mjs';
import { buildReferenceBlock } from '../../../.claude/scripts/workspacify-allocate/lib/reference-block.mjs';
import { buildAuthoringPacket, resolveSourceExcerpt } from '../../../.claude/scripts/workspacify-allocate/lib/seed-authoring-packet.mjs';
import { runSeedLocalChecks } from '../../../.claude/scripts/workspacify-allocate/lib/seed-local-checks.mjs';
import { SEED_REQUIRED_SECTIONS, ALLOCATE_MANIFEST_FILE_NAME } from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';
import { buildValidManifest, materializeManifestDir, materializeSeedFixture, makeDecisions, baseAiSections, DEFAULT_SPEC_TEXT } from '../helpers/build-valid-manifest.mjs';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runValidate, runPlan, runPacket, runGate, runFinalize } from '../../../.claude/scripts/workspacify-allocate/run.mjs';
import { parseSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parse.mjs';
import { validateDecisionsAuthoringSurface } from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';
import { computeSelfHash } from '../../../.claude/scripts/workspacify-tree/lib/render.mjs';

function boundary() {
  return buildValidManifest().manifest.dependencies.boundaries[0];
}

function edge(overrides = {}) {
  return buildContractEdge({
      boundaryId: 'boundary-001',
      ...overrides,
      sides: {
        consumer: { packageId: 'pkg-b' },
        provider: { packageId: 'pkg-a' },
      },
      relation: { direction: 'consumer_to_provider', connectionKind: 'value_only' },
      // Overrides land in the group they belong to, so edge({ owners: {} }) still replaces the owners.
      content: { owners: { semantic: 'pkg-a' }, clauses: { input: 'i', output: 'o', preconditions: ['p'], postconditions: ['q'], invariants: ['r'], tests: ['t'] }, sourceRefs: ['s-000001', 's-000001'], ...overrides },
    });
}

test('contract-model C003: seed-level validation reports every defect class', () => {
  const boundariesById = indexBoundariesByContractId(buildValidManifest().manifest);
  assert.equal(validateSeedContractEdges({ contractEdges: [edge()], boundariesById, packageId: 'pkg-b' }).ok, true);

  const repeated = validateSeedContractEdges({ contractEdges: [edge(), edge()], boundariesById, packageId: 'pkg-b' });
  assert.ok(repeated.errors.some((message) => message.includes('repeats the contract')));

  const undeclared = validateSeedContractEdges({
    contractEdges: [edge({ boundaryId: 'boundary-999' })], boundariesById, packageId: 'pkg-b',
  });
  assert.ok(undeclared.errors.some((message) => message.includes('no declared boundary')));

  const outOfScope = validateSeedContractEdges({
    contractEdges: [{ ...edge(), clauses: { ...edge().clauses, signature: 'sig' } }], boundariesById, packageId: 'pkg-b',
  });
  assert.ok(outOfScope.errors.some((message) => message.includes('out-of-scope clause "signature"')));

  const missing = validateSeedContractEdges({
    contractEdges: [{ ...edge(), clauses: { input: 'i' } }], boundariesById, packageId: 'pkg-b',
  });
  assert.ok(missing.errors.some((message) => message.includes('missing the clause "output"')));

  const empty = validateSeedContractEdges({
    contractEdges: [{ ...edge(), clauses: { ...edge().clauses, preconditions: '   ' } }], boundariesById, packageId: 'pkg-b',
  });
  assert.ok(empty.errors.some((message) => message.includes('leaves the clause "preconditions" empty')));
});

test('contract-model C003: ownership slots default and the id is derived from the boundary', () => {
  assert.equal(contractIdForBoundary('boundary-007'), 'contract-boundary-007');
  const defaulted = edge({ owners: {} });
  for (const slot of ['semantic', 'state', 'side_effect', 'port', 'adapter']) {
    assert.equal(defaulted.owners[slot], 'not_applicable');
  }
  assert.deepEqual(defaulted.source_refs, ['s-000001'], 'source refs are deduplicated');
  assert.equal(validateContractEdge(defaulted, boundary()).ok, true);
  assert.equal(validateContractEdge({ ...defaulted, owners: {} }, boundary()).ok, false);

  assert.throws(() => assertContractEdgeBuildable({ contract_id: 'contract-x' }), (error) => error.gateId === 'G3.2');
  assert.equal(assertContractEdgeBuildable(edge()).contract_id, 'contract-boundary-001');
  assert.deepEqual(canonicalizeClauses({ input: 'i' }), { input: 'i' });
});

test('coverage-proof C004: the unallocated path fails the gate and inventory categories are counted', () => {
  const { manifest } = buildValidManifest();
  const proof = buildCoverageProof({
    manifest,
    expectedAllocation: new Map([['pkg-a', []], ['pkg-b', []]]),
    parsedByPackage: new Map([['pkg-a', { referenceBlock: { source_segments: manifest.structure.segments.map((s) => s.id) }, traceabilityRows: [] }]]),
  });
  assert.ok(proof.unallocated_items.length > 0);
  assert.throws(() => assertSegmentCoverage(proof), (error) => error.gateId === 'G3.5' && /allocation is incomplete/.test(error.message));
  assert.doesNotThrow(() => assertSegmentCoverage({ uncovered: [], unallocated_items: [] }));

  const { manifest: richManifest } = buildValidManifest({
    inventory: {
      objects: [{ id: 'o-1' }], claims: [{ id: 'c-1' }], invariants: [{ id: 'i-1' }],
      state_machines: [{ id: 'm-1' }], error_codes: [{ id: 'e-1' }], required_tests: [{ id: 't-1' }],
      terms: [], normalization_decisions: [], unresolved_candidates: [],
    },
  });
  const richProof = buildCoverageProof({ manifest: richManifest, expectedAllocation: new Map(), parsedByPackage: new Map() });
  assert.deepEqual(richProof.unallocated_items, ['object:o-1', 'claim:c-1', 'invariant:i-1', 'state_machine:m-1', 'error_code:e-1', 'required_test:t-1']);
});

test('reference-block C001: malformed inputs and unreadable manifests are rejected', () => {
  const fixture = materializeManifestDir();
  try {
    const base = {
      manifestRef: { manifest: fixture.manifest, manifestPath: fixture.manifestPath, manifestDir: fixture.dir },
      seed: { package: fixture.manifest.workspace.packages[0] },
    };
    assert.throws(() => buildReferenceBlock({ ...base, seed: { package: undefined } }), (error) => error.gateId === 'G3.1');
    assert.throws(
      () => buildReferenceBlock({ ...base, manifestRef: { ...base.manifestRef, manifest: { ...fixture.manifest, input: {} } } }),
      (error) => error.gateId === 'G3.1' && /spec_path/.test(error.message),
    );
    assert.throws(
      () => buildReferenceBlock({ ...base, manifestRef: { ...base.manifestRef, manifestPath: `${fixture.dir}/missing-manifest.json` } }),
      (error) => error.gateId === 'G3.1',
    );
    const block = buildReferenceBlock({ ...base, seed: { ...base.seed, contractIds: ['contract-b', 'contract-a', 'contract-a'] } });
    assert.deepEqual(block.contract_refs, ['contract-a', 'contract-b'], 'contract refs are deduplicated and sorted');
    assert.equal(block.stage2_manifest.path, ALLOCATE_MANIFEST_FILE_NAME);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('seed-local-checks C001/C003: every reference and contract defect is reported', () => {
  const { manifest } = buildValidManifest();
  const fixture = materializeManifestDir();
  try {
    const headings = SEED_REQUIRED_SECTIONS.map((section) => ({ index: section.index, title: section.title, body: 'x' }));
    const goodBlock = {
      package: { id: 'pkg-a', name: 'alpha', path: 'crates/protocol/alpha', layer: 'protocol', kind: 'production-library', responsibilities: ['x'] },
      source_spec: { path: 'spec.md', sha256: manifest.input.source_hash },
      stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: manifest.integrity.manifest_hash },
      stage2_manifest: { path: ALLOCATE_MANIFEST_FILE_NAME },
      implementation_order: {}, contract_refs: [], source_segments: [],
    };
    const pkg = manifest.workspace.packages[0];
    const base = {
      package: pkg,
      expectedAllocation: [{ category: 'object', inventory_ref: 'obj-000001', canonical_name: 'Alpha Record' }, { category: 'object', inventory_ref: 'obj-000002', canonical_name: 'Beta Record' }],
      workspace: { manifest, manifestPath: fixture.manifestPath, manifestDir: fixture.dir, segmentIds: manifest.structure.segments.map((segment) => segment.id) },
    };
    const allocationRows = [{ category: 'object', inventory_ref: 'obj-000001', canonical_name: 'Alpha Record' }, { category: 'object', inventory_ref: 'obj-000002', canonical_name: 'Beta Record' }];

    const clean = runSeedLocalChecks({
      ...base,
      parsedSeed: { headings, allocationIndexRows: allocationRows, referenceBlock: goodBlock, contractEdges: [edge()], traceabilityRows: [] },
    });
    assert.equal(clean.ok, true, JSON.stringify(clean.errors));

    const cases = [
      { block: { ...goodBlock, source_spec: { path: 'spec.md', sha256: 'f'.repeat(64) } }, expect: /source_spec.sha256/ },
      { block: { ...goodBlock, source_spec: { path: 'other.md', sha256: manifest.input.source_hash } }, expect: /source_spec.path does not match/ },
      { block: { ...goodBlock, stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: 'a'.repeat(64) } }, expect: /stage1_manifest.hash/ },
      { block: { ...goodBlock, stage1_manifest: { path: 'OTHER.json', hash: manifest.integrity.manifest_hash } }, expect: /stage1_manifest.path/ },
      { block: { ...goodBlock, stage2_manifest: { path: 'elsewhere.json' } }, expect: /stage2_manifest.path/ },
      { block: { ...goodBlock, source_spec: { path: '../escape.md', sha256: manifest.input.source_hash } }, expect: /inside the workspace root/ },
      { block: { ...goodBlock, source_spec: { path: 'absent.md', sha256: manifest.input.source_hash } }, expect: /does not resolve inside the workspace/ },
    ];
    for (const item of cases) {
      const report = runSeedLocalChecks({
        ...base,
        parsedSeed: { headings, allocationIndexRows: allocationRows, referenceBlock: item.block, contractEdges: [edge()], traceabilityRows: [] },
      });
      assert.equal(report.ok, false, `expected a failure for ${item.expect}`);
      assert.ok(report.errors.some((message) => item.expect.test(message)), JSON.stringify(report.errors));
    }

    const noContract = runSeedLocalChecks({
      ...base,
      parsedSeed: { headings, allocationIndexRows: allocationRows, referenceBlock: goodBlock, contractEdges: [], traceabilityRows: [] },
    });
    assert.ok(noContract.errors.some((message) => message.includes('does not carry its declared contract')));

    const unknownSegment = runSeedLocalChecks({
      ...base,
      parsedSeed: {
        headings, allocationIndexRows: allocationRows,
        referenceBlock: { ...goodBlock, source_segments: ['s-999999'] },
        contractEdges: [edge()], traceabilityRows: [{ segmentId: 's-888888' }],
      },
    });
    assert.ok(unknownSegment.errors.some((message) => message.includes('unknown segment s-999999')));
    assert.ok(unknownSegment.errors.some((message) => message.includes('unknown segment s-888888')));
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('seed-authoring-packet C005: support kinds, missing counterparts and unresolved excerpts', () => {
  const support = buildValidManifest({
    workspace: {
      tree: [{ name: 'crates', path: 'crates', kind: 'dir', children: [] }],
      packages: [
        { id: 'pkg-a', name: 'alpha', path: 'crates', layer: 'protocol', kind: 'test-support', seed_required: true, owns: {} },
      ],
      ownership: { entries: [], packages: [] },
    },
  }).manifest;
  const devPacket = buildAuthoringPacket({ manifest: support, sourceText: DEFAULT_SPEC_TEXT, packageId: 'pkg-a' });
  assert.match(devPacket.conformance_obligation, /dev-only helper/);

  const orphanEdge = buildValidManifest({
    dependencies: {
      orientation: 'consumer_to_direct_dependency', normal_edges: [], forbidden_edges: [],
      forbidden_layer_rules: [], dev_dependency_policy: [], boundaries: [],
    },
  }).manifest;
  orphanEdge.dependencies.forbidden_edges = [{ from: 'pkg-a', to: 'pkg-gone', reasonCode: 'x', reason: 'y' }];
  const orphanPacket = buildAuthoringPacket({ manifest: orphanEdge, sourceText: DEFAULT_SPEC_TEXT, packageId: 'pkg-a' });
  assert.equal(orphanPacket.forbidden_edges[0].counterpart_package.id, 'pkg-gone');
  assert.equal(orphanPacket.forbidden_edges[0].counterpart_package.name, undefined);

  assert.equal(resolveSourceExcerpt({ sourceText: 'a\nb\n', sourceRefs: [], canonicalName: 'zzz' }), null);
});

test('run.mjs C001/C003/C004: in-process handlers over a real fixture', () => {
  const fixture = materializeSeedFixture();
  try {
    const decisionsPath = join(fixture.dir, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify(makeDecisions(fixture.manifest)));
    const quiet = (callback) => {
      const stdout = process.stdout.write;
      const stderr = process.stderr.write;
      process.stdout.write = () => true;
      process.stderr.write = () => true;
      try {
        return callback();
      } finally {
        process.stdout.write = stdout;
        process.stderr.write = stderr;
      }
    };
    assert.doesNotThrow(() => quiet(() => runValidate(['validate', fixture.manifestPath])));
    assert.doesNotThrow(() => quiet(() => runPlan(['plan', fixture.manifestPath])));
    assert.doesNotThrow(() => quiet(() => runPacket(['packet', fixture.manifestPath, '--package=pkg-b'])));
    assert.doesNotThrow(() => quiet(() => runGate(['gate', fixture.manifestPath, `--decisions=${decisionsPath}`])));
    assert.doesNotThrow(() => quiet(() => runFinalize(['finalize', fixture.manifestPath, `--decisions=${decisionsPath}`])));

    // The published seed carries the machine block and the provider-side contract.
    const seedText = readFileSync(join(fixture.dir, 'crates/protocol/alpha/RFC-SEED.md'), 'utf8');
    const parsed = parseSeed(seedText);
    assert.equal(parsed.contractEdges[0].direction, 'provider_to_consumer');
    assert.equal(parsed.referenceBlock.stage2_manifest.path, ALLOCATE_MANIFEST_FILE_NAME);
    assert.ok(parsed.referenceBlock.implementation_order.wave >= 0);

    // A decisions payload that authors a machine section is rejected before rendering.
    writeFileSync(decisionsPath, JSON.stringify({ ...makeDecisions(fixture.manifest), seeds: [{ packageId: 'pkg-a', aiSections: { ...baseAiSections(), 1: 'nope' } }] }));
    assert.throws(() => runGate(['gate', fixture.manifestPath, `--decisions=${decisionsPath}`]), (error) => error.gateId === 'G3');

    // The published set is the tree, the seeds and the allocate manifest.
    assert.equal(existsSync(join(fixture.dir, 'WORKSPACIFY-ALLOCATE-MANIFEST.json')), true);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('seed-model C002: the authoring surface rejects a payload without seeds or with a malformed object', () => {
  assert.equal(validateDecisionsAuthoringSurface({ seeds: [] }).ok, false);
  assert.equal(validateDecisionsAuthoringSurface({ seeds: [{ packageId: 'p', aiSections: [] }] }).ok, false);
  assert.equal(validateDecisionsAuthoringSurface({ seeds: [{ packageId: 'p', aiSections: null }] }).ok, false);
});

test('seed-local-checks C002: heading defects are reported without a manifest', () => {
  const { manifest } = buildValidManifest();
  const pkg = manifest.workspace.packages[0];
  const goodHeadings = SEED_REQUIRED_SECTIONS.map((section) => ({ index: section.index, title: section.title, body: 'x' }));

  const tooFew = runSeedLocalChecks({ parsedSeed: { headings: goodHeadings.slice(0, 5), allocationIndexRows: [] }, package: pkg, expectedAllocation: [] });
  assert.ok(tooFew.errors.some((message) => message.includes('headings, expected')));

  const mistitled = goodHeadings.map((heading, index) => (index === 3 ? { ...heading, title: 'Wrong' } : heading));
  const report = runSeedLocalChecks({ parsedSeed: { headings: mistitled, allocationIndexRows: [] }, package: pkg, expectedAllocation: [] });
  assert.ok(report.errors.some((message) => message.includes('out of order or mistitled')));

  const emptyBody = goodHeadings.map((heading, index) => (index === 4 ? { ...heading, body: '' } : heading));
  const bodyReport = runSeedLocalChecks({ parsedSeed: { headings: emptyBody, allocationIndexRows: [] }, package: pkg, expectedAllocation: [] });
  assert.ok(bodyReport.errors.some((message) => message.includes('body invalid')));

  const unknownCategory = runSeedLocalChecks({
    parsedSeed: { headings: goodHeadings, allocationIndexRows: [{ category: 'bogus', inventory_ref: 'x', canonical_name: 'x' }] },
    package: pkg,
    expectedAllocation: [],
  });
  assert.ok(unknownCategory.errors.some((message) => message.includes('unknown category')));
});

test('coverage-proof C004: per-package segments and reasonless not_applicable are reported', () => {
  const { manifest } = buildValidManifest();
  const parsedByPackage = new Map([
    ['pkg-a', { referenceBlock: { source_segments: [manifest.structure.segments[0].id] }, traceabilityRows: [{ segmentId: manifest.structure.segments[1].id }], headings: [{ index: 3, body: 'not_applicable' }] }],
  ]);
  const proof = buildCoverageProof({ manifest, expectedAllocation: new Map([['pkg-a', []]]), parsedByPackage });
  assert.deepEqual(proof.per_package_segments['pkg-a'], [manifest.structure.segments[0].id, manifest.structure.segments[1].id]);
  assert.deepEqual(proof.uncovered, []);
  assert.deepEqual(proof.not_applicable_without_reason, ['pkg-a:3']);
});

test('run.mjs C002/C005: failure paths stay typed and publish nothing', () => {
  const fixture = materializeSeedFixture();
  try {
    const decisionsPath = join(fixture.dir, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify(makeDecisions(fixture.manifest)));

    // Missing arguments are rejected before any work.
    assert.throws(() => runFinalize(['finalize']), (error) => error.gateId !== undefined);
    assert.throws(() => runGate(['gate', fixture.manifestPath]), (error) => error.gateId !== undefined);

    // Malformed decisions JSON is rejected at the decisions load.
    writeFileSync(decisionsPath, '{ not json');
    assert.throws(() => runGate(['gate', fixture.manifestPath, `--decisions=${decisionsPath}`]), (error) => error.gateId === 'G3');

    // A non-fresh workspace blocks finalize before anything is staged.
    mkdirSync(join(fixture.dir, 'crates', 'protocol', 'alpha'), { recursive: true });
    writeFileSync(join(fixture.dir, 'crates', 'protocol', 'alpha', 'sentinel.txt'), 'keep');
    writeFileSync(decisionsPath, JSON.stringify(makeDecisions(fixture.manifest)));
    assert.throws(() => runFinalize(['finalize', fixture.manifestPath, `--decisions=${decisionsPath}`]), (error) => error.gateId !== undefined);
    assert.equal(readFileSync(join(fixture.dir, 'crates', 'protocol', 'alpha', 'sentinel.txt'), 'utf8'), 'keep');
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('coverage-proof C004: sparse parsed seeds contribute nothing instead of crashing', () => {
  const { manifest } = buildValidManifest();
  const proof = buildCoverageProof({
    manifest,
    expectedAllocation: new Map([['pkg-a', []]]),
    parsedByPackage: new Map([['pkg-a', { traceabilityRows: [{ segmentId: 42 }, { segmentId: 's-000001' }], headings: [{ index: 8, body: 'not_applicable — no I/O' }, { index: 9 }] }]]),
  });
  assert.deepEqual(proof.per_package_segments['pkg-a'], ['s-000001']);
  assert.deepEqual(proof.not_applicable_without_reason, []);
});

test('seed-authoring-packet C005: a counterpart without source refs yields no excerpts', () => {
  const { manifest } = buildValidManifest({
    inventory: {
      objects: [{ id: 'obj-000001', canonical_name: 'Alpha Record', source_refs: [] }],
      claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [], terms: [],
      normalization_decisions: [], unresolved_candidates: [],
    },
  });
  const packet = buildAuthoringPacket({ manifest, sourceText: DEFAULT_SPEC_TEXT, packageId: 'pkg-b' });
  assert.deepEqual(packet.contract_context[0].counterpart_excerpts, []);
  assert.equal(packet.contract_context[0].required_clauses.length > 0, true);
});

test('run.mjs C001: a package without responsibilities blocks the reference block at gate time', () => {
  const fixture = materializeSeedFixture();
  try {
    const stripped = JSON.parse(readFileSync(fixture.manifestPath, 'utf8'));
    stripped.workspace.packages[0].responsibilities = [];
    stripped.integrity.manifest_hash = computeSelfHash(stripped);
    writeFileSync(fixture.manifestPath, JSON.stringify(stripped));
    const decisionsPath = join(fixture.dir, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify(makeDecisions(stripped)));
    assert.throws(
      () => runGate(['gate', fixture.manifestPath, `--decisions=${decisionsPath}`]),
      (error) => error.gateId !== undefined && /responsibilit/i.test(error.message),
    );
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});
