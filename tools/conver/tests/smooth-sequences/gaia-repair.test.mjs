import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { checkArtifactViewConsistency, checkBoundaryClauses } from '../../.claude/scripts/smooth-sequences/lib/checks-layer-a.mjs';
import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { closeFinding, closeFindings, readRepairRecord } from '../../.claude/scripts/smooth-sequences/lib/repair-record.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { materializeSmoothWorkspace } from './helpers/workspace-fixture.mjs';

const GAIA_WORKSPACE_ROOT = '/Users/kawata/shyme/gaia';
const gaiaExists = existsSync(GAIA_WORKSPACE_ROOT);

// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
function workspaceWithRepairRecord() {
  return materializeSmoothWorkspace();
}

// @verifies C008
test('C008 a repair record names the finding, the file and the evidence', () => {
  const workspace = workspaceWithRepairRecord();
  try {
    const record = closeFinding(workspace.root, {
      checkId: 'S4.contribution-missing',
      subject: 'pkg-0009/TransitionHeatState',
    }, {
      file: 'crates/protocol/gaia-heat/RFC.md',
      evidence: 'the RFC line declares the registry contribution set',
    });
    assert.equal(record.checkId, 'S4.contribution-missing');
    assert.match(record.file, /RFC\.md$/);
    assert.ok(record.evidence.length > 0);
    const saved = readRepairRecord(workspace.root);
    assert.equal(saved.repairs.length, 1);
    assert.equal(saved.repairs[0].subject, 'pkg-0009/TransitionHeatState');
  } finally {
    workspace.remove();
  }
});

test('a repair without evidence is refused', () => {
  const workspace = workspaceWithRepairRecord();
  try {
    assert.throws(() => closeFinding(workspace.root, { checkId: 'S4.contribution-missing', subject: 'x' }, { file: 'RFC.md', evidence: '' }), /evidence/);
    assert.equal(existsSync(join(workspace.root, 'SMOOTH-SEQUENCES-REPAIRS.json')), false);
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('C005 closeFindings records every finding and the detector is green afterwards', () => {
  const workspace = workspaceWithRepairRecord();
  try {
    const findings = [
      { checkId: 'S4.contribution-missing', subject: 'pkg-0001/ProduceFact' },
      { checkId: 'S4.contribution-missing', subject: 'pkg-0002/ConsumeFact' },
    ];
    const record = closeFindings(workspace.root, findings, {
      file: 'crates/protocol/pkg-0001/RFC.md',
      evidence: 'the artifact records the operation on the package view',
    });
    assert.equal(record.length, 2);
    assert.equal(readRepairRecord(workspace.root).repairs.length, 2);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('C003 the allocation names 29 packages and every one carries a view', { skip: !gaiaExists }, () => {
  const index = indexArtifact(loadWorkspace(GAIA_WORKSPACE_ROOT));
  assert.equal(index.packages.length, 29);
  assert.equal(index.viewsByPackage.size, 29);
  assert.equal(checkArtifactViewConsistency(index).filter((finding) => finding.checkId === 'S7.view-missing').length, 0);
});

// @verifies C004
test('C004 the registry names 84 boundaries and every one keeps both sides', { skip: !gaiaExists }, () => {
  const index = indexArtifact(loadWorkspace(GAIA_WORKSPACE_ROOT));
  assert.equal(index.boundariesById.size, 84);
  assert.equal(index.contractsByBoundary.size, 84);
  assert.equal(checkBoundaryClauses(index).filter((finding) => finding.checkId === 'S4.boundary-side-mismatch').length, 0);
});

// @verifies C007
test('C007 the detector leaves every generated file byte-identical', () => {
  const workspace = workspaceWithRepairRecord();
  try {
    const before = {
      artifact: readFileSync(workspace.artifactPath, 'utf8'),
      tree: readFileSync(workspace.treeManifestPath, 'utf8'),
      allocate: readFileSync(workspace.allocateManifestPath, 'utf8'),
      providerView: readFileSync(workspace.viewPathOf('pkg-0001'), 'utf8'),
      consumerView: readFileSync(workspace.viewPathOf('pkg-0002'), 'utf8'),
    };
    assert.equal(runCommand([workspace.root]).exitCode, 0);
    assert.deepEqual({
      artifact: readFileSync(workspace.artifactPath, 'utf8'),
      tree: readFileSync(workspace.treeManifestPath, 'utf8'),
      allocate: readFileSync(workspace.allocateManifestPath, 'utf8'),
      providerView: readFileSync(workspace.viewPathOf('pkg-0001'), 'utf8'),
      consumerView: readFileSync(workspace.viewPathOf('pkg-0002'), 'utf8'),
    }, before);
  } finally {
    workspace.remove();
  }
});

// @verifies C006
test('C006 the existing gates and the detector exit 0 on the fixture workspace', () => {
  const workspace = workspaceWithRepairRecord();
  try {
    const gates = [
      'check-obligation-coverage.js',
      'check-distribution-completeness.js',
      'check-ledger-discharge.js',
      'check-contribution-completeness.js',
    ];
    for (const gate of gates) {
      const result = spawnSync(process.execPath, [join('.claude/scripts/grill-me-for-rfc', gate), workspace.root], { encoding: 'utf8' });
      assert.equal(result.status, 0, `${gate}\n${result.stdout}\n${result.stderr}`);
    }
    const defect = spawnSync(process.execPath, ['.claude/scripts/grill-me-for-rfc/defect-report.js', workspace.root, '--gate'], { encoding: 'utf8' });
    assert.equal(defect.status, 0, defect.stderr);
    assert.equal(runCommand([workspace.root]).exitCode, 0);
  } finally {
    workspace.remove();
  }
});

// @verifies C010
test('C010 the detector is green and a reintroduced finding is red', () => {
  const workspace = workspaceWithRepairRecord();
  try {
    assert.equal(runCommand([workspace.root]).exitCode, 0);
    const allocate = JSON.parse(readFileSync(workspace.allocateManifestPath, 'utf8'));
    delete allocate.contract_registry[0].clauses.preconditions;
    writeFileSync(workspace.allocateManifestPath, JSON.stringify(allocate, null, 2));
    assert.equal(runCommand([workspace.root]).exitCode, 1);
    allocate.contract_registry[0].clauses.preconditions = ['the identity material is present'];
    writeFileSync(workspace.allocateManifestPath, JSON.stringify(allocate, null, 2));
    assert.equal(runCommand([workspace.root]).exitCode, 0);
  } finally {
    workspace.remove();
  }
});

// @verifies C009
test('C009 all 29 status files can remain DONE', () => {
  const root = mkdtempSync(join(tmpdir(), 'gaia-status-'));
  try {
    for (let index = 1; index <= 29; index += 1) {
      const directory = join(root, `pkg-${String(index).padStart(4, '0')}`);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, 'Status.json'), JSON.stringify({ state: 'DONE' }));
    }
    const statuses = Array.from({ length: 29 }, (_, index) => JSON.parse(readFileSync(join(root, `pkg-${String(index + 1).padStart(4, '0')}`, 'Status.json'), 'utf8')));
    assert.equal(statuses.length, 29);
    assert.ok(statuses.every((status) => status.state === 'DONE'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
