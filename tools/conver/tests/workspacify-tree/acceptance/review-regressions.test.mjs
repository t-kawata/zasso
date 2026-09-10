// [::TICKET::] PX-202 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-202 --for-spec --no-implementation-order`.
// PX-202 @verifies C001 C002 C003 C004 C005
// The five defects the PX-192..PX-201 review found by hand, frozen as a regression:
// each must be refused by the real CLI, nothing may be published, and a clean payload
// must still publish. If any of these passes again, the review's evidence was for
// nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { harvestObjectCandidates } from '../../../.claude/scripts/workspacify-tree/lib/extraction.mjs';
import { buildHeadingTree } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { segmentAtHeadings } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';
import { settlePulseCandidates } from '../helpers/settle-pulse.mjs';
import { settleDependencyReviews } from '../helpers/settle-dependency-reviews.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const RUN = join(ROOT, '.claude/scripts/workspacify-tree/run.mjs');
const SPEC_FIXTURE = join(ROOT, 'tests/workspacify-tree/fixtures/gaia-like-spec.md');
const APPROVALS = JSON.parse(readFileSync(join(ROOT, 'tests/workspacify-tree/fixtures/gaia-decisions.json'), 'utf8')).approvals;

const owns = (objects) => ({ objects, claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] });

/** A two-package workspace that publishes cleanly when nothing is mutated. */
function decisionsFor(objectIds) {
  return {
    workspace: [
      { id: 'pkg-a', name: 'alpha', path: 'crates/protocol/alpha', layer: 'protocol', kind: 'production-library', responsibilities: ['own alpha'], seed_required: true, owns: owns([objectIds[0]]) },
      { id: 'pkg-b', name: 'beta', path: 'crates/protocol/beta', layer: 'protocol', kind: 'production-library', responsibilities: ['own beta'], seed_required: true, owns: owns([objectIds[1]]) },
    ],
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
    ownership: [{ objectId: objectIds[0], packageId: 'pkg-a' }, { objectId: objectIds[1], packageId: 'pkg-b' }],
    dependencies: [{ from: 'pkg-b', to: 'pkg-a', reasonCode: 'canonical-object', reason: 'beta consumes the alpha record' }],
    boundaries: [{ consumer: 'pkg-b', provider: 'pkg-a', dependencyReasonCode: 'canonical-object' }],
    adapters: { ports: [], databasePolicy: { applicable: false } },
    approvals: APPROVALS,
    semantic_review: { status: 'APPROVED', statement: 'reviewed the split and the dependency', approver: 'px-202' },
  };
}

/** Run finalize over a payload built from the base decisions through one mutation. */
function finalizeWith(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'wst-202-reg-'));
  const specPath = join(dir, 'spec.md');
  cpSync(SPEC_FIXTURE, specPath);
  const sourceText = readFileSync(specPath, 'utf8');
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  const objectIds = harvestObjectCandidates({ sourceText, headings, segments }).map((item) => item.id);
  const decisions = mutate(decisionsFor(objectIds));
  const settled = settlePulseCandidates({ specPath, decisions: settleDependencyReviews({ decisions }) });
  const decisionsPath = join(dir, 'decisions.json');
  writeFileSync(decisionsPath, JSON.stringify(settled));
  const result = spawnSync(process.execPath, [RUN, 'finalize', `--spec=${specPath}`, `--decisions=${decisionsPath}`], { cwd: dir, encoding: 'utf8' });
  return { dir, result, manifestPath: join(dir, 'WORKSPACIFY-TREE-MANIFEST.json') };
}

const DEFECTS = [
  ['the dropped ownership entry', (decisions) => ({ ...decisions, ownership: decisions.ownership.slice(0, 1) })],
  ['the unknown reason code', (decisions) => ({ ...decisions, dependencies: [{ ...decisions.dependencies[0], reasonCode: 'totally-made-up' }] })],
  ['the misspelled reason_code field', (decisions) => {
    const edge = { ...decisions.dependencies[0], reason_code: decisions.dependencies[0].reasonCode };
    delete edge.reasonCode;
    return { ...decisions, dependencies: [edge] };
  }],
  ['the pair declared both normal and forbidden', (decisions) => ({
    ...decisions,
    dependencies: [decisions.dependencies[0], { from: 'pkg-b', to: 'pkg-a', kind: 'forbidden', reasonCode: 'composition', reason: 'must not couple directly', alternative: 'port-injection' }],
  })],
];

test('C001..C005 every defect the review found is refused by the real CLI, and a clean payload still publishes', () => {
  for (const [label, mutate] of DEFECTS) {
    const run = finalizeWith(mutate);
    try {
      assert.notEqual(run.result.status, 0, `${label} must be refused:\n${run.result.stdout}${run.result.stderr}`);
      assert.equal(existsSync(run.manifestPath), false, `${label} must publish nothing`);
      assert.doesNotMatch(run.result.stdout, /"status":"COMPLETE"/, `${label} must not report COMPLETE`);
    } finally {
      rmSync(run.dir, { recursive: true, force: true });
    }
  }

  const clean = finalizeWith((decisions) => decisions);
  try {
    assert.equal(clean.result.status, 0, clean.result.stdout + clean.result.stderr);
    const manifest = JSON.parse(readFileSync(clean.manifestPath, 'utf8'));
    assert.equal(manifest.final_audit.ownership_disagreement_count, 0);
    assert.equal(manifest.final_audit.forbidden_dependency_count, 0);
    assert.equal(manifest.final_audit.status, 'PASS');
  } finally {
    rmSync(clean.dir, { recursive: true, force: true });
  }
});

test('C003 a contract edge with a clause outside the vocabulary is refused', async () => {
  const { buildContractEdge } = await import('../../../.claude/scripts/workspacify-allocate/lib/contract-model.mjs');
  assert.throws(
    () => buildContractEdge({
      boundaryId: 'boundary-001', consumerPackage: 'pkg-b', providerPackage: 'pkg-a', direction: 'consumer_to_provider', connectionKind: 'value_only',
      owners: { semantic: 'pkg-a' }, clauses: { input: 'i', output: 'o', made_up_clause: ['x'] }, sourceRefs: [],
    }),
    /made_up_clause/,
  );
});
