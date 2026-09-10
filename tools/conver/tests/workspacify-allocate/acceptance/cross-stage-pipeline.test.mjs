// [::TICKET::] PX-196 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-196 --for-spec --no-implementation-order`.
// PX-196 @verifies C002 C003
// The two stages are always run one after the other, so the coupling itself must
// be proven: a real stage-1 CLI run produces the manifest that a real stage-2 CLI
// run consumes and publishes. The specification deliberately contains a prose
// segment with no harvested material, which is what a real specification looks
// like and what the synthetic fixtures used to hide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { harvestObjectCandidates } from '../../../.claude/scripts/workspacify-tree/lib/extraction.mjs';
import { buildHeadingTree } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { segmentAtHeadings } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const TREE_RUN = join(ROOT, '.claude/scripts/workspacify-tree/run.mjs');
const ALLOCATE_RUN = join(ROOT, '.claude/scripts/workspacify-allocate/run.mjs');

// The gaia fixture is a real specification: a table of records plus prose chapters,
// so it yields harvested objects and at least one segment that carries none.
const SPEC_FIXTURE = join(ROOT, 'tests/workspacify-tree/fixtures/gaia-like-spec.md');

/** Harvest the candidate ids the stage-1 extractor actually produces. */
function harvestCandidateIds(specPath) {
  const sourceText = readFileSync(specPath, 'utf8');
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  return harvestObjectCandidates({ sourceText, headings, segments }).map((item) => item.id);
}

/** The approvals the stage-1 decisions need for this specification's candidates. */
function fixtureApprovals() {
  return JSON.parse(readFileSync(join(ROOT, 'tests/workspacify-tree/fixtures/gaia-decisions.json'), 'utf8')).approvals ?? [];
}

function packageOf(id, name, leaf, owns) {
  return {
    id, name, path: `crates/protocol/${leaf}`, layer: 'protocol', kind: 'production-library',
    responsibilities: [`own the ${name} semantics`], seed_required: true, owns,
  };
}

function ownsOnly(objectIds) {
  return { objects: objectIds, claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] };
}

function stageOneDecisions(objectIds) {
  const [firstId, secondId] = objectIds;
  return {
    workspace: [packageOf('pkg-a', 'alpha', 'alpha', ownsOnly([firstId])), packageOf('pkg-b', 'beta', 'beta', ownsOnly([secondId]))],
    tree: [{
      name: 'crates', path: 'crates', kind: 'dir',
      children: [{
        name: 'protocol', path: 'crates/protocol', kind: 'dir',
        children: [
          { name: 'alpha', path: 'crates/protocol/alpha', kind: 'dir', children: [] },
          { name: 'beta', path: 'crates/protocol/beta', kind: 'dir', children: [] },
        ],
      }],
    }],
    ownership: [{ objectId: firstId, packageId: 'pkg-a' }, { objectId: secondId, packageId: 'pkg-b' }],
    dependencies: [{ from: 'pkg-b', to: 'pkg-a', reasonCode: 'direct-value-dependency', reason: 'beta consumes the alpha record' }],
    boundaries: [{ consumer: 'pkg-b', provider: 'pkg-a', dependencyReasonCode: 'direct-value-dependency' }],
    adapters: {},
    approvals: fixtureApprovals(),
    semantic_review: { status: 'APPROVED', statement: 'reviewed the split and the dependency', approver: 'cross-stage-test' },
  };
}

/** Author the stage-2 decisions from the manifest the first stage actually produced. */
function stageTwoDecisions(manifest) {
  const listClauses = new Set(['preconditions', 'postconditions', 'invariants', 'errors', 'tests']);
  const seeds = manifest.workspace.packages
    .filter((pkg) => pkg.seed_required !== false)
    .map((pkg) => ({
      packageId: pkg.id,
      aiSections: Object.fromEntries([4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((index) => [
        String(index),
        [7, 8].includes(index) ? 'not_applicable — nothing applies to this package' : `Authored body for section ${index} of ${pkg.name}.`,
      ])),
      contractEdges: manifest.dependencies.boundaries
        .filter((boundary) => boundary.consumer_package === pkg.id || boundary.provider_package === pkg.id)
        .map((boundary) => ({
          contract_id: `contract-${boundary.id}`,
          boundary_id: boundary.id,
          direction: boundary.consumer_package === pkg.id ? 'consumer_to_provider' : 'provider_to_consumer',
          connection_kind: 'value_only',
          consumer_package: boundary.consumer_package,
          provider_package: boundary.provider_package,
          owners: { semantic: boundary.provider_package, state: 'not_applicable', side_effect: 'not_applicable', port: 'not_applicable', adapter: 'not_applicable' },
          clauses: Object.fromEntries(boundary.stage2_contract_scope.map((clause) => [
            clause,
            listClauses.has(clause) ? [`${clause} of ${boundary.id}`] : `${clause} statement of ${boundary.id}`,
          ])),
          source_refs: [],
        })),
    }));
  return { seeds, semantic_review: { status: 'APPROVED', statement: 'reviewed the coupling contracts', approver: 'cross-stage-test' } };
}

test('C002/C003 a real stage-1 manifest drives a real stage-2 publish, prose segment included', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-196-cross-'));
  try {
    const specPath = join(dir, 'spec.md');
    cpSync(SPEC_FIXTURE, specPath);
    const objectIds = harvestCandidateIds(specPath);
    assert.ok(objectIds.length >= 2, 'the fixture specification yields at least two objects');
    const treeDecisionsPath = join(dir, 'tree-decisions.json');
    writeFileSync(treeDecisionsPath, JSON.stringify(stageOneDecisions(objectIds)));

    const stageOne = spawnSync(process.execPath, [TREE_RUN, 'finalize', `--spec=${specPath}`, `--decisions=${treeDecisionsPath}`], { cwd: dir, encoding: 'utf8' });
    assert.equal(stageOne.status, 0, stageOne.stdout + stageOne.stderr);

    const manifestPath = join(dir, 'WORKSPACIFY-TREE-MANIFEST.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.workspace.packages.length, 2);
    assert.equal(manifest.dependencies.boundaries.length, 1);

    // The prose segment carries no material and says so.
    const prose = manifest.structure.segments.filter((segment) => segment.owned_inventory_ids.length === 0);
    const material = manifest.structure.segments.filter((segment) => segment.owned_inventory_ids.length > 0);
    assert.ok(prose.length >= 1, 'at least one segment carries no material');
    assert.deepEqual(manifest.dependencies.dag.implementation_order.serial, ['pkg-a', 'pkg-b']);

    const decisionsPath = join(dir, 'allocate-decisions.json');
    writeFileSync(decisionsPath, JSON.stringify(stageTwoDecisions(manifest)));

    for (const stage of [['validate', manifestPath], ['plan', manifestPath]]) {
      const run = spawnSync(process.execPath, [ALLOCATE_RUN, ...stage], { encoding: 'utf8' });
      assert.equal(run.status, 0, `${stage[0]}: ${run.stdout}${run.stderr}`);
    }
    const finalize = spawnSync(process.execPath, [ALLOCATE_RUN, 'finalize', manifestPath, `--decisions=${decisionsPath}`], { encoding: 'utf8' });
    assert.equal(finalize.status, 0, finalize.stdout + finalize.stderr);
    const summary = JSON.parse(finalize.stdout);
    assert.equal(summary.published, true);
    assert.equal(summary.seedCount, 2);
    assert.equal(summary.contractCount, 1);
    assert.equal(summary.waveCount, 2);

    // Published set: tree, one seed per package, the allocate manifest, and nothing else.
    assert.ok(existsSync(join(dir, 'crates/protocol/alpha/RFC-SEED.md')));
    assert.ok(existsSync(join(dir, 'crates/protocol/beta/RFC-SEED.md')));
    const allocateManifest = JSON.parse(readFileSync(join(dir, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), 'utf8'));
    assert.equal(allocateManifest.source_coverage.uncovered.length, 0);
    assert.deepEqual(allocateManifest.source_coverage.material_segments.sort(), material.map((segment) => segment.id).sort());
    assert.deepEqual(allocateManifest.source_coverage.non_material_segments.sort(), prose.map((segment) => segment.id).sort());
    assert.deepEqual(allocateManifest.implementation_order.serial, ['pkg-a', 'pkg-b']);
    assert.deepEqual(readdirSync(dir).sort(), [
      'WORKSPACIFY-ALLOCATE-MANIFEST.json', 'WORKSPACIFY-TREE-MANIFEST.json',
      'allocate-decisions.json', 'crates', 'spec.md', 'tree-decisions.json',
    ]);

    // The seeds carry the contract on both sides and reference the published manifest.
    const alphaSeed = readFileSync(join(dir, 'crates/protocol/alpha/RFC-SEED.md'), 'utf8');
    const betaSeed = readFileSync(join(dir, 'crates/protocol/beta/RFC-SEED.md'), 'utf8');
    assert.match(alphaSeed, /provider_to_consumer/);
    assert.match(betaSeed, /consumer_to_provider/);
    assert.match(alphaSeed, /WORKSPACIFY-ALLOCATE-MANIFEST\.json/);

    // A second run is BLOCKED and leaves the published workspace untouched.
    const second = spawnSync(process.execPath, [ALLOCATE_RUN, 'finalize', manifestPath, `--decisions=${decisionsPath}`], { encoding: 'utf8' });
    assert.notEqual(second.status, 0);
    assert.equal(readFileSync(join(dir, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), 'utf8'), `${JSON.stringify(allocateManifest, null, 2)}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C002 a stage-2 run refuses a stage-1 manifest that does not declare segment material', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-196-cross-'));
  try {
    const specPath = join(dir, 'spec.md');
    cpSync(SPEC_FIXTURE, specPath);
    const objectIds = harvestCandidateIds(specPath);
    assert.ok(objectIds.length >= 2, 'the fixture specification yields at least two objects');
    const treeDecisionsPath = join(dir, 'tree-decisions.json');
    writeFileSync(treeDecisionsPath, JSON.stringify(stageOneDecisions(objectIds)));
    const stageOne = spawnSync(process.execPath, [TREE_RUN, 'finalize', `--spec=${specPath}`, `--decisions=${treeDecisionsPath}`], { cwd: dir, encoding: 'utf8' });
    assert.equal(stageOne.status, 0, stageOne.stdout + stageOne.stderr);

    const manifestPath = join(dir, 'WORKSPACIFY-TREE-MANIFEST.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    // An older or hand-edited manifest without the declaration must be refused,
    // otherwise the zero-omission proof would pass vacuously.
    for (const segment of manifest.structure.segments) {
      delete segment.owned_inventory_ids;
    }
    writeFileSync(manifestPath, JSON.stringify(manifest));

    const validate = spawnSync(process.execPath, [ALLOCATE_RUN, 'validate', manifestPath], { encoding: 'utf8' });
    assert.notEqual(validate.status, 0);
    assert.match(validate.stdout + validate.stderr, /owned_inventory_ids/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
