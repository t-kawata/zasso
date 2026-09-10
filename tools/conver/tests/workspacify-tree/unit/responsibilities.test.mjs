// [::TICKET::] PX-192 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-192 --for-spec --no-implementation-order`.
// PX-192 @verifies C004
// Package responsibilities are the source of the seed's "role in the whole
// system". Counting them is not enough: an empty list must fail the run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePackageResponsibilities, runGatePipeline } from '../../../.claude/scripts/workspacify-tree/lib/validation.mjs';
import { buildValidTreeManifest } from '../helpers/build-valid-tree-manifest.mjs';

const RUN_SCRIPT = fileURLToPath(new URL('../../../.claude/scripts/workspacify-tree/run.mjs', import.meta.url));

test('C004 an empty or absent responsibilities list fails validation by package id', () => {
  const empty = validatePackageResponsibilities([
    { id: 'pkg-a', name: 'alpha', path: 'crates/alpha', layer: 'protocol', kind: 'production-library', responsibilities: [] },
  ]);
  assert.equal(empty.ok, false);
  assert.ok(empty.errors.some((message) => message.includes('pkg-a')), JSON.stringify(empty.errors));
  assert.equal(empty.missing_responsibilities_count, 1);

  const absent = validatePackageResponsibilities([
    { id: 'pkg-b', name: 'beta', path: 'crates/beta', layer: 'protocol', kind: 'production-library' },
  ]);
  assert.equal(absent.ok, false);
  assert.equal(absent.missing_responsibilities_count, 1);

  const declared = validatePackageResponsibilities([
    { id: 'pkg-a', name: 'alpha', path: 'crates/alpha', layer: 'protocol', kind: 'production-library', responsibilities: ['own alpha records'] },
  ]);
  assert.equal(declared.ok, true);
  assert.equal(declared.missing_responsibilities_count, 0);
  assert.deepEqual(declared.errors, []);
});

test('C004 a manifest whose packages declare responsibilities reports a zero count', () => {
  const { manifest } = buildValidTreeManifest();
  assert.equal(manifest.final_audit.missing_responsibilities_count, 0);
  for (const pkg of manifest.workspace.packages) {
    assert.ok(Array.isArray(pkg.responsibilities) && pkg.responsibilities.length > 0, `${pkg.id} must declare responsibilities`);
  }
});

test('C004 the gate pipeline fails G3 with a message naming the package', () => {
  const pipeline = runGatePipeline({
    structure: { reconstruction: { status: 'PASS' } },
    inventory: { objects: [], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [], terms: [], normalization_decisions: [], unresolved_candidates: [] },
    workspace: {
      tree: [{ name: 'crates', path: 'crates', kind: 'dir', children: [] }],
      packages: [{ id: 'pkg-a', name: 'alpha', path: 'crates', layer: 'protocol', kind: 'production-library', responsibilities: [], seed_required: true, owns: {} }],
      ownership: { entries: [], packages: [] },
    },
    dependencies: { orientation: 'consumer_to_direct_dependency', normal_edges: [], boundaries: [], forbidden_edges: [], dag: { edge_count: 0, cycle_count: 0, topological_order: [], canonical_edges: [], implementation_order: { serial: ['pkg-a'], levels: [['pkg-a']] } } },
    adapters: {},
    decisions: { approvals: [], semantic_review: { status: 'APPROVED', statement: 'reviewed', approver: 'ai' } },
  });

  const g3 = pipeline.gates.find((gate) => gate.id === 'G3');
  assert.notEqual(g3.status, 'PASS');
  assert.equal(g3.counts.missing_responsibilities_count, 1);
  assert.ok(g3.reasons.some((reason) => reason.includes('pkg-a')), JSON.stringify(g3.reasons));
  assert.ok(g3.reasons.some((reason) => /responsibilit/i.test(reason)), JSON.stringify(g3.reasons));
  assert.equal(pipeline.finalAudit.missing_responsibilities_count, 1);
});

test('C004 the CLI refuses a decision input whose package declares no responsibilities', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-192-resp-'));
  try {
    const specPath = join(dir, 'spec.md');
    cpSync(join(process.cwd(), 'tests/workspacify-tree/fixtures/gaia-like-spec.md'), specPath);
    const decisions = JSON.parse(readFileSync(join(process.cwd(), 'tests/workspacify-tree/fixtures/gaia-decisions.json'), 'utf8'));
    decisions.workspace = decisions.workspace.map((pkg) => ({ ...pkg, responsibilities: [] }));
    const decisionsPath = join(dir, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify(decisions));

    const result = spawnSync(process.execPath, [RUN_SCRIPT, 'finalize', `--spec=${specPath}`, `--decisions=${decisionsPath}`], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(result.status, 0, 'finalize must not succeed without responsibilities');
    assert.ok(
      /decision schema|responsibilit/i.test(result.stdout + result.stderr),
      result.stdout + result.stderr,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
