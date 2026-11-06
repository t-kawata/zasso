// PX-372 @verifies C004
// A cross-package repair is authorized by evidence the tool generated: the baseline
// it measured, the finding it was asked to repair, and the target package's gates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';

import { buildEvidence } from '../../.claude/scripts/api-consistency/cross-package-evidence.mjs';
import { verifyApiConsistency } from '../../.claude/scripts/api-consistency/verify-api-consistency.mjs';
import { materializeApiWorkspace } from './helpers/workspace.mjs';

// [::TICKET::] PX-372, PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-372|PX-382) --for-spec --no-implementation-order`.
function measurableWorkspace() {
  return materializeApiWorkspace({
    consumerRust: 'use provider::Missing; pub fn use_it(value: Missing) {}',
  });
}

test('C004: evidence names the baseline, the repair and the target gates', () => {
  const workspace = measurableWorkspace();
  try {
    const report = verifyApiConsistency({ workspaceRoot: workspace.root });
    const finding = report.findings.find((entry) => entry.severity === 'blocking');
    assert.ok(finding, JSON.stringify(report.findings));

    const result = buildEvidence({
      workspaceRoot: workspace.root,
      packageDir: dirname(workspace.consumerRfc),
      packageId: 'pkg-0002',
      repairs: [finding.id],
      gates: [{ name: 'verify-api-consistency', exitCode: 1 }],
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.evidence.format, 2);
    assert.equal(result.evidence.editedPackages[0].package, dirname(workspace.consumerRfc));
    assert.deepEqual(result.evidence.editedPackages[0].repairs, [finding.id]);
    assert.match(result.evidence.baseline.digest, /^[0-9a-f]{64}$/);
    assert.ok(result.evidence.baseline.findings.some((entry) => entry.id === finding.id));
  } finally {
    workspace.remove();
  }
});

test('C004: evidence refuses a repair the baseline does not hold', () => {
  const workspace = measurableWorkspace();
  try {
    const result = buildEvidence({
      workspaceRoot: workspace.root,
      packageDir: dirname(workspace.consumerRfc),
      packageId: 'pkg-0002',
      repairs: ['0000000000000000'],
      gates: [{ name: 'verify-api-consistency', exitCode: 1 }],
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'REPAIR_NOT_FOUND');
  } finally {
    workspace.remove();
  }
});

test('C004: evidence refuses a non-API gate that did not pass', () => {
  const workspace = measurableWorkspace();
  try {
    const result = buildEvidence({
      workspaceRoot: workspace.root,
      packageDir: dirname(workspace.consumerRfc),
      packageId: 'pkg-0002',
      repairs: [],
      gates: [{ name: 'obligation-coverage', exitCode: 1 }],
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'GATE_FAILED');
  } finally {
    workspace.remove();
  }
});

test('C004: evidence refuses an advisory finding as a repair', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'macro_rules! make_ops { () => {} }',
    consumerRust: '',
  });
  try {
    const report = verifyApiConsistency({ workspaceRoot: workspace.root });
    const advisory = report.findings.find((entry) => entry.severity === 'advisory');
    assert.ok(advisory, JSON.stringify(report.findings));

    const result = buildEvidence({
      workspaceRoot: workspace.root,
      packageDir: dirname(workspace.providerRfc),
      packageId: 'pkg-0001',
      repairs: [advisory.id],
      gates: [{ name: 'verify-api-consistency', exitCode: 1 }],
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'REPAIR_NOT_FOUND');
  } finally {
    workspace.remove();
  }
});
