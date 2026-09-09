// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// [::TICKET::] PX-180: workspacify-tree decision model and completeness gate tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-180 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { assertDecisionSchema } from '../../../.claude/scripts/workspacify-tree/lib/decision-input.mjs';
import { validateWorkspaceTree } from '../../../.claude/scripts/workspacify-tree/lib/workspace-model.mjs';
import { runOwnershipChecks } from '../../../.claude/scripts/workspacify-tree/lib/ownership.mjs';
import { runGatePipeline } from '../../../.claude/scripts/workspacify-tree/lib/validation.mjs';

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));
const readFixture = (name) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));

test('schema C001 [@verifies C001]: a decisions object with responsibilities seed_required and extended owns passes', async () => {
  const rich = readFixture('decisions-rich.json');
  const report = assertDecisionSchema(rich);
  assert.equal(report.ok, true);
  assert.equal(report.errors.length, 0);
});

test('schema C001 invariant [@verifies C001]: a workspace package missing responsibilities or seed_required is rejected', () => {
  const missing = {
    workspace: [{ id: 'pkg-1', name: 'a', path: 'a', layer: 'protocol', kind: 'production-library' }],
    ownership: [],
    dependencies: [],
    adapters: {},
    approvals: [],
  };
  const report = assertDecisionSchema(missing);
  assert.equal(report.ok, false);
  assert.ok(report.errors.length >= 1);
});

test('tree C002 [@verifies C002]: a mismatching workspace tree and catalog are inconsistent', () => {
  const tree = [{ name: 'crates', path: 'crates', kind: 'dir', children: [{ name: 'alpha', path: 'crates/alpha', kind: 'dir', children: [] }] }];
  const packages = [{ id: 'pkg-1', name: 'alpha', path: 'crates/p/alpha', layer: 'protocol', kind: 'production-library' }];
  const report = validateWorkspaceTree({ tree, packages });
  assert.equal(report.consistent, false);
  assert.ok(report.errors.length >= 1);
});

test('tree C002: a matching tree and catalog are consistent', () => {
  const rich = readFixture('decisions-rich.json');
  const report = validateWorkspaceTree({ tree: rich.tree, packages: rich.workspace });
  assert.equal(report.consistent, true);
  assert.equal(report.errors.length, 0);
});

test('ownership C003 [@verifies C003]: invariant/error orphans are counted as unallocated', () => {
  const result = runOwnershipChecks({
    invariants: [{ id: 'inv-1' }],
    errorCodes: [{ id: 'err-1' }],
    packages: [{ id: 'pkg-1', name: 'a', path: 'a', layer: 'protocol', kind: 'production-library', owns: { invariants: ['inv-1'], objects: [] } }],
  });
  assert.equal(result.invariant_orphan_count, 0);
  assert.ok(result.error_code_orphan_count >= 1);
  assert.ok(result.unallocated_count >= 1);
});

test('ownership C003 invariant: fully owned extended items yield unallocated zero', () => {
  const result = runOwnershipChecks({
    invariants: [{ id: 'inv-1' }],
    errorCodes: [{ id: 'err-1' }],
    requiredTests: [{ id: 'tst-1' }],
    packages: [{ id: 'pkg-1', name: 'a', path: 'a', layer: 'protocol', kind: 'production-library', owns: { invariants: ['inv-1'], error_codes: ['err-1'], required_tests: ['tst-1'] } }],
  });
  assert.equal(result.unallocated_count, 0);
});

test('boundary C004 [@verifies C004]: an unresolved boundary fails the completeness gate', () => {
  const pipeline = runGatePipeline({
    structure: { reconstruction: { status: 'PASS' } },
    inventory: {},
    workspace: { packages: [{ id: 'pkg-1', name: 'a', path: 'a', layer: 'protocol', kind: 'production-library', responsibilities: ['x'], seed_required: true }] },
    dependencies: { boundaries: [{ consumer: 'ghost', provider: 'pkg-1' }] },
    decisions: { approvals: [] },
  });
  assert.notEqual(pipeline.status, 'COMPLETE');
});

test('compat C005 [@verifies C005]: legacy minimal decisions still validate', async () => {
  const decisions = readFixture('decisions-ok.json');
  const report = assertDecisionSchema(decisions);
  assert.equal(report.ok, true);
});
