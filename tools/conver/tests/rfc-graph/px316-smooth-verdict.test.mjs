// PX-316 smooth verdict contracts: the workspace receipt, its freshness and the gate.
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// @verifies C006
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  sha256File,
  verifySmoothReceipt,
  verifySmoothVerdict,
} from '../../.claude/scripts/sequences-slice/lib/smooth-verdict.mjs';
import {
  multiPackageFixture,
  writePackage,
  writeSmoothVerdict,
  writeWorkspaceManifests,
} from '../sequences-slice/helpers/multi-package-fixture.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const VERIFY_CHAIN = fileURLToPath(new URL('../../.claude/scripts/sequences-slice/verify-chain.mjs', import.meta.url));
const VERIFY_SMOOTH = fileURLToPath(new URL('../../.claude/scripts/rfc-graph/verify-smooth-verdict.mjs', import.meta.url));

const PASS_VERDICT = Object.freeze({ exitCode: 0, findings: 0, blocked: 0, withheld: 0, readings: 0 });

// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
function createWorkspace(options = {}) {
  const { legacy = false, verdict = PASS_VERDICT } = options;
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'px316-'));
  writeWorkspaceManifests(workspaceRoot);
  const fixture = multiPackageFixture();
  writeFileSync(join(workspaceRoot, 'P-sequences.json'), JSON.stringify(fixture.artifact));
  const packageDir = join(workspaceRoot, 'pkg');
  writePackage(packageDir, fixture, { withDirs: true });
  if (!legacy) {
    mkdirSync(join(workspaceRoot, 'educe-sequences'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'educe-sequences', 'EVIDENCE-MANIFEST.json'), '{}');
  }
  const smooth = writeSmoothVerdict(workspaceRoot, { verdict, certificate: legacy ? null : 'complete' });
  return { workspaceRoot, packageDir, fixture, ...smooth };
}

// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
function run(command, args) {
  return spawnSync(process.execPath, [command, ...args], { cwd: ROOT, encoding: 'utf8' });
}

test('C001 a pass verdict is accepted and a non-pass verdict is refused', () => {
  const fixture = createWorkspace();
  try {
    assert.deepEqual(verifySmoothVerdict({ packageDir: fixture.packageDir }).findings, []);
    writeFileSync(fixture.statusPath, JSON.stringify({
      ...fixture.status,
      verdict: { exitCode: 1, findings: 1, blocked: 0, withheld: 0, readings: 0 },
    }));
    const refused = verifySmoothVerdict({ packageDir: fixture.packageDir });
    assert.ok(refused.findings.some((finding) => finding.code === 'SMOOTH_VERDICT_NOT_PASS'));
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  }
});

test('C002 a design file changed after smooth is STALE_SMOOTH_VERDICT', () => {
  const fixture = createWorkspace();
  try {
    assert.deepEqual(verifySmoothVerdict({ packageDir: fixture.packageDir }).findings, []);
    writeFileSync(join(fixture.packageDir, 'RFC.md'), '# Changed after smooth\n');
    const stale = verifySmoothVerdict({ packageDir: fixture.packageDir });
    assert.ok(stale.findings.some((finding) => finding.code === 'STALE_SMOOTH_VERDICT'));
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  }
});

test('C003 the certificate must be complete and bind the live artifact', () => {
  const fixture = createWorkspace();
  try {
    writeFileSync(fixture.certificatePath, JSON.stringify({
      status: 'incomplete',
      inputs: { artifact: fixture.artifactDigest },
    }));
    assert.ok(verifySmoothVerdict({ packageDir: fixture.packageDir }).findings
      .some((finding) => finding.code === 'SMOOTH_CERTIFICATE_INCOMPLETE'));
    writeFileSync(fixture.certificatePath, JSON.stringify({
      status: 'complete',
      inputs: { artifact: '0'.repeat(64) },
    }));
    assert.ok(verifySmoothVerdict({ packageDir: fixture.packageDir }).findings
      .some((finding) => finding.code === 'SMOOTH_ARTIFACT_MISMATCH'));
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  }
});

test('C004 the accepted verdict is frozen in a workspace-level receipt', () => {
  const fixture = createWorkspace();
  try {
    const written = verifySmoothVerdict({ packageDir: fixture.packageDir, writeReceipt: true });
    assert.deepEqual(written.findings, []);
    const receiptPath = join(fixture.workspaceRoot, 'SMOOTH-VERDICT.json');
    assert.equal(existsSync(receiptPath), true);
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    assert.deepEqual(Object.keys(receipt).sort(), [
      'artifactDigest', 'certificateStatus', 'checkedAt', 'generation', 'inputDigest',
      'legacy', 'reportDigest', 'schemaVersion', 'statusDigest', 'verdictPass', 'workspaceRoot',
    ]);
    assert.equal(receipt.statusDigest, sha256File(fixture.statusPath));
    const firstBytes = readFileSync(receiptPath, 'utf8');
    verifySmoothVerdict({ packageDir: fixture.packageDir, writeReceipt: true });
    assert.equal(readFileSync(receiptPath, 'utf8'), firstBytes);
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  }
});

test('C005 downstream refuses a missing receipt and a receipt whose status moved', () => {
  const fixture = createWorkspace();
  try {
    verifySmoothVerdict({ packageDir: fixture.packageDir, writeReceipt: true });
    rmSync(join(fixture.workspaceRoot, 'SMOOTH-VERDICT.json'));
    assert.ok(verifySmoothReceipt(fixture.packageDir)
      .some((finding) => finding.code === 'MISSING_SMOOTH_RECEIPT'));

    verifySmoothVerdict({ packageDir: fixture.packageDir, writeReceipt: true });
    writeFileSync(fixture.statusPath, JSON.stringify({ ...fixture.status, generation: 107 }));
    assert.ok(verifySmoothReceipt(fixture.packageDir)
      .some((finding) => finding.code === 'STALE_SMOOTH_VERDICT'));
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  }
});

test('C005 a root artifact changed after the receipt is stale', () => {
  const fixture = createWorkspace();
  try {
    verifySmoothVerdict({ packageDir: fixture.packageDir, writeReceipt: true });
    writeFileSync(join(fixture.workspaceRoot, 'P-sequences.json'), JSON.stringify({ ...fixture.fixture.artifact, changed: true }));
    assert.ok(verifySmoothReceipt(fixture.packageDir)
      .some((finding) => finding.code === 'STALE_SMOOTH_VERDICT'));
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  }
});

test('C006 outside a workspace the gate is skipped and reports the skip', () => {
  const outside = mkdtempSync(join(tmpdir(), 'px316-outside-'));
  try {
    const result = verifySmoothVerdict({ packageDir: outside });
    assert.equal(result.skipped, 'outside-workspace');
    assert.deepEqual(result.findings, []);
    assert.equal(result.receipt, null);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test('C004 the graphify gate writes the receipt and verify-chain then proceeds', () => {
  const fixture = createWorkspace({ legacy: true });
  try {
    const before = run(VERIFY_CHAIN, ['--stage=graphify', `--package=${fixture.packageDir}`]);
    assert.equal(before.status, 1);
    assert.match(before.stderr, /MISSING_SMOOTH_RECEIPT/);

    const gate = run(VERIFY_SMOOTH, [`--package=${fixture.packageDir}`, '--write']);
    assert.equal(gate.status, 0, gate.stderr);
    assert.equal(existsSync(join(fixture.workspaceRoot, 'SMOOTH-VERDICT.json')), true);

    const after = run(VERIFY_CHAIN, ['--stage=graphify', `--package=${fixture.packageDir}`]);
    assert.equal(after.status, 0, after.stderr);
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  }
});

