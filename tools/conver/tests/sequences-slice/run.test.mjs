// PX-256 @verifies C003
// run.mjs runs inside a pipeline, so it must never stop one. Every failure here is a
// reported reason and exit 0, and every success writes exactly two files inside the named
// package directory and nothing anywhere else. The strongest assertion is the one over
// the whole workspace root before and after.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  CALIBRATE,
  RUN,
  VIEW_JSON_NAME,
  VIEW_MARKDOWN_NAME,
  changedPaths,
  digestDirectory,
} from '../grill-me-for-rfc/sequences-material/fixtures/session-tree.mjs';
import { buildSyntheticTriple, removeSyntheticTriple } from './fixtures/synthetic-workspace.mjs';

const ARTIFACT_FILENAME = 'SyntheticSpec-sequences.json';

/** A synthetic workspace whose tree manifest names packages at the recorded paths. */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
function workspaceWithNamedPackages() {
  const root = buildSyntheticTriple();
  const manifestPath = path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ ...manifest, workspace: { packages: manifest.workspace.packages.map((entry, index) => ({ ...entry, path: `crates/protocol/gaia-package-${String(index + 1).padStart(4, '0')}` })) } }),
  );
  return root;
}

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
function runWriter(root, packageDir) {
  const result = spawnSync(process.execPath, [RUN, path.join(root, ARTIFACT_FILENAME), path.join(root, packageDir)], { encoding: 'utf8' });
  let report = null;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    report = null;
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, report };
}

// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
// [::TICKET::] PX-261 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-261 --for-spec --no-implementation-order`.
test('PX-260 a record the run cannot read leaves the package declaring nothing, and the refusal is reported', () => {
  const root = workspaceWithNamedPackages();
  try {
    const packageDir = 'crates/protocol/gaia-package-0011';
    fs.mkdirSync(path.join(root, packageDir), { recursive: true });
    fs.writeFileSync(path.join(root, packageDir, 'OBLIGATION.json'), '{ not json');

    const result = runWriter(root, packageDir);

    assert.equal(result.status, 0, 'the projection never stops a pipeline');
    assert.equal(result.report.reason, null, 'the view is still written');
    assert.equal(result.report.refused.length, 1);
    assert.match(result.report.refused[0], /OBLIGATION\.json/);
    const view = JSON.parse(fs.readFileSync(path.join(root, packageDir, VIEW_JSON_NAME), 'utf8'));
    assert.deepEqual(view.obligationUnits, []);
    assert.equal(view.obligationSource, 'undeclared', 'a refusal is not read as a declaration');
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 the writer produces exactly the two view files inside the named package', () => {
  const root = workspaceWithNamedPackages();
  try {
    const packageDir = 'crates/protocol/gaia-package-0011';
    fs.mkdirSync(path.join(root, packageDir), { recursive: true });
    const result = runWriter(root, packageDir);
    assert.equal(result.status, 0);
    assert.deepEqual([...result.report.written].sort(), [VIEW_JSON_NAME, VIEW_MARKDOWN_NAME]);
    assert.equal(fs.existsSync(path.join(root, packageDir, VIEW_MARKDOWN_NAME)), true);
    assert.equal(fs.existsSync(path.join(root, packageDir, VIEW_JSON_NAME)), true);
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 no file outside the named package directory is written', () => {
  const root = workspaceWithNamedPackages();
  try {
    const packageDir = 'crates/protocol/gaia-package-0011';
    const otherDir = 'crates/protocol/gaia-package-0012';
    fs.mkdirSync(path.join(root, packageDir), { recursive: true });
    fs.mkdirSync(path.join(root, otherDir), { recursive: true });
    const before = digestDirectory(root);
    runWriter(root, packageDir);
    const after = digestDirectory(root);
    assert.deepEqual(changedPaths(before, after), [
      path.join(packageDir, VIEW_JSON_NAME),
      path.join(packageDir, VIEW_MARKDOWN_NAME),
    ].sort());
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 two runs over unchanged inputs produce identical bytes', () => {
  const root = workspaceWithNamedPackages();
  try {
    const packageDir = 'crates/protocol/gaia-package-0011';
    fs.mkdirSync(path.join(root, packageDir), { recursive: true });
    runWriter(root, packageDir);
    const first = [fs.readFileSync(path.join(root, packageDir, VIEW_MARKDOWN_NAME), 'utf8'), fs.readFileSync(path.join(root, packageDir, VIEW_JSON_NAME), 'utf8')];
    runWriter(root, packageDir);
    assert.deepEqual([fs.readFileSync(path.join(root, packageDir, VIEW_MARKDOWN_NAME), 'utf8'), fs.readFileSync(path.join(root, packageDir, VIEW_JSON_NAME), 'utf8')], first);
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 a missing tree manifest writes nothing and exits 0 with the path named', () => {
  const root = buildSyntheticTriple({ omitTreeManifest: true });
  try {
    const packageDir = 'crates/protocol/gaia-asset';
    fs.mkdirSync(path.join(root, packageDir), { recursive: true });
    const before = digestDirectory(root);
    const result = runWriter(root, packageDir);
    assert.equal(result.status, 0);
    assert.deepEqual(result.report.written, []);
    assert.match(result.report.reason, /WORKSPACIFY-TREE-MANIFEST\.json/);
    assert.deepEqual(changedPaths(before, digestDirectory(root)), []);
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 a missing allocate manifest writes nothing and exits 0 with the path named', () => {
  const root = buildSyntheticTriple({ omitAllocateManifest: true });
  try {
    const packageDir = 'crates/protocol/gaia-asset';
    fs.mkdirSync(path.join(root, packageDir), { recursive: true });
    const result = runWriter(root, packageDir);
    assert.equal(result.status, 0);
    assert.deepEqual(result.report.written, []);
    assert.match(result.report.reason, /WORKSPACIFY-ALLOCATE-MANIFEST\.json/);
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 a directory that names no package writes nothing and exits 0 with the path named', () => {
  const root = buildSyntheticTriple();
  try {
    const packageDir = 'crates/protocol/not-a-package';
    fs.mkdirSync(path.join(root, packageDir), { recursive: true });
    const result = runWriter(root, packageDir);
    assert.equal(result.status, 0);
    assert.deepEqual(result.report.written, []);
    assert.match(result.report.reason, /not-a-package/);
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 an artifact that does not parse writes nothing and exits 0 with the path named', () => {
  const root = buildSyntheticTriple();
  try {
    fs.writeFileSync(path.join(root, ARTIFACT_FILENAME), '{ not json');
    const packageDir = 'crates/protocol/gaia-asset';
    fs.mkdirSync(path.join(root, packageDir), { recursive: true });
    const result = runWriter(root, packageDir);
    assert.equal(result.status, 0);
    assert.deepEqual(result.report.written, []);
    assert.match(result.report.reason, /SyntheticSpec-sequences\.json/);
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 a workspace whose packages carry no seed writes nothing and exits 0 with the path named', () => {
  const root = buildSyntheticTriple({ omitCratesTree: true });
  try {
    const packageDir = 'crates/adapters/gaia-ekyc-adapter';
    fs.mkdirSync(path.join(root, packageDir), { recursive: true });
    const before = digestDirectory(root);
    const result = runWriter(root, packageDir);
    assert.equal(result.status, 0);
    assert.deepEqual(result.report.written, []);
    assert.match(result.report.reason, /no package seed was readable/);
    assert.match(result.report.reason, /crates/);
    assert.deepEqual(changedPaths(before, digestDirectory(root)), []);
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 a package root that cannot be walked writes nothing and exits 0 with the path named', () => {
  const root = buildSyntheticTriple({ omitCratesTree: true });
  try {
    fs.writeFileSync(path.join(root, 'crates'), 'not a directory');
    const packageDir = 'crates/adapters/gaia-ekyc-adapter';
    const before = digestDirectory(root);
    const result = runWriter(root, packageDir);
    assert.equal(result.status, 0);
    assert.deepEqual(result.report.written, []);
    assert.match(result.report.reason, /crates could not be read/);
    assert.deepEqual(changedPaths(before, digestDirectory(root)), []);
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 the view names the same package the calibration counted, and the reachable packages agree', () => {
  const root = workspaceWithNamedPackages();
  try {
    const packageDir = 'crates/protocol/gaia-package-0011';
    fs.mkdirSync(path.join(root, packageDir), { recursive: true });
    const written = runWriter(root, packageDir);
    const calibrated = spawnSync(process.execPath, [CALIBRATE, path.join(root, ARTIFACT_FILENAME), '--json'], { encoding: 'utf8' });
    assert.equal(calibrated.status, 0);

    const report = JSON.parse(calibrated.stdout);
    const view = JSON.parse(fs.readFileSync(path.join(root, packageDir, VIEW_JSON_NAME), 'utf8'));

    // The writer and the calibration must read one workspace the same way: a package the
    // calibration says no operation reaches gets an empty view, and one it reaches does not.
    assert.equal(written.report.packageId, view.packageId);
    if (report.packages.reachedPackageIds.includes(view.packageId)) {
      assert.ok(view.ownedOperationUnits.length > 0 || view.crossBoundarySequenceUnits.length > 0);
    } else {
      assert.deepEqual(view.ownedOperationUnits, []);
    }
  } finally {
    removeSyntheticTriple(root);
  }
});
