// PX-321 @verifies C007
// The smooth receipt must bind the distribution-map block, not only the view and artifact.
// A map edit after the receipt is stale; a prose-only RFC edit is not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  verifySmoothReceipt,
  verifySmoothVerdict,
} from '../../.claude/scripts/sequences-slice/lib/smooth-verdict.mjs';
import {
  multiPackageFixture,
  writePackage,
  writeSmoothVerdict,
  writeWorkspaceManifests,
} from '../sequences-slice/helpers/multi-package-fixture.mjs';

// [::TICKET::] PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-321 --for-spec --no-implementation-order`.
function createWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'px321-map-'));
  writeWorkspaceManifests(root);
  const fixture = multiPackageFixture();
  writeFileSync(join(root, 'P-sequences.json'), JSON.stringify(fixture.artifact));
  const packageDir = join(root, 'pkg');
  writePackage(packageDir, fixture, { withDirs: true });
  mkdirSync(join(root, 'educe-sequences'), { recursive: true });
  writeFileSync(join(root, 'educe-sequences', 'EVIDENCE-MANIFEST.json'), '{}');
  writeSmoothVerdict(root, { certificate: 'complete' });
  return { root, packageDir };
}

test('C007 a distribution-map edit after the receipt is stale', () => {
  const workspace = createWorkspace();
  try {
    assert.deepEqual(verifySmoothVerdict({ packageDir: workspace.packageDir, writeReceipt: true }).findings, []);
    const rfcPath = join(workspace.packageDir, 'RFC.md');
    const original = readFileSync(rfcPath, 'utf8');
    writeFileSync(rfcPath, original.replace('"schemaVersion": 1', '"schemaVersion": 2'));
    assert.ok(verifySmoothReceipt(workspace.packageDir).some((finding) => finding.code === 'STALE_SMOOTH_VERDICT'));
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

test('C007 a prose-only RFC edit is not stale', () => {
  const workspace = createWorkspace();
  try {
    assert.deepEqual(verifySmoothVerdict({ packageDir: workspace.packageDir, writeReceipt: true }).findings, []);
    const rfcPath = join(workspace.packageDir, 'RFC.md');
    const original = readFileSync(rfcPath, 'utf8');
    writeFileSync(rfcPath, `# Package\n\nA prose-only edit.\n\n${original.slice(original.indexOf('```json distribution-map'))}`);
    assert.deepEqual(verifySmoothReceipt(workspace.packageDir), []);
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

test('C007 a receipt without mapDigests is refused', () => {
  const workspace = createWorkspace();
  try {
    assert.deepEqual(verifySmoothVerdict({ packageDir: workspace.packageDir, writeReceipt: true }).findings, []);
    const receiptPath = join(workspace.root, 'SMOOTH-VERDICT.json');
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    delete receipt.mapDigests;
    writeFileSync(receiptPath, JSON.stringify(receipt));
    assert.ok(verifySmoothReceipt(workspace.packageDir).some((finding) => finding.code === 'MISSING_SMOOTH_RECEIPT'));
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});
