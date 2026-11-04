// PX-355 @verifies C004
// PX-355 @verifies C005
// PX-355 @verifies C007
// PX-355 @verifies C008
// The workspace root may itself be a package. These tests read the root through the same
// readers every other package uses: its RFC-SEED.md, its OBLIGATION.json, its record key,
// and its label in the obligation-state report. The manifest is the authority; a root view
// without a manifest declaration is not a package.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readWorkspacePackageSegments } from '../../.claude/scripts/sequences-slice/lib/segments.mjs';
import { readWorkspaceObligations } from '../../.claude/scripts/sequences-slice/lib/obligation.mjs';
import { packageRecordFor, projectPackageView } from '../../.claude/scripts/sequences-slice/lib/project-package.mjs';
import { describeEntry } from '../../.claude/scripts/grill-me-for-rfc/report-obligation-state.js';
import { buildSyntheticTriple, removeSyntheticTriple } from './fixtures/synthetic-workspace.mjs';

const TREE_MANIFEST_FILENAME = 'WORKSPACIFY-TREE-MANIFEST.json';

/** A workspace whose tree manifest names the root and one nested package. */
// [::TICKET::] PX-355 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-355 --for-spec --no-implementation-order`.
function workspaceWithRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px355-root-'));
  fs.mkdirSync(path.join(root, 'crates', 'pkg-a'), { recursive: true });
  fs.writeFileSync(path.join(root, TREE_MANIFEST_FILENAME), JSON.stringify({
    workspace: { packages: [{ id: 'pkg-root', path: '.' }, { id: 'pkg-a', path: 'crates/pkg-a' }] },
    inventory: { objects: [] },
  }));
  return root;
}

// [::TICKET::] PX-355 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-355 --for-spec --no-implementation-order`.
function treeManifestOf(root) {
  return JSON.parse(fs.readFileSync(path.join(root, TREE_MANIFEST_FILENAME), 'utf8'));
}

/** A ledger appendix the parser accepts, with no rows and a composition check. */
// [::TICKET::] PX-355 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-355 --for-spec --no-implementation-order`.
function emptyLedger() {
  return [
    '# Package RFC',
    '',
    '## Distribution ledger',
    '',
    'This document is canonical over the material it was written from.',
    '',
    '| Unit | Kind | Owner | RFC location | Ground |',
    '| --- | --- | --- | --- | --- |',
    '',
    '**Composition check.** nothing was distributed to this package.',
    '',
  ].join('\n');
}

test('C005 readWorkspacePackageSegments reads the root seed and keeps an empty seed', () => {
  const root = workspaceWithRoot();
  try {
    fs.writeFileSync(path.join(root, 'RFC-SEED.md'), ['# root', '```json', JSON.stringify({ source_segments: ['s-root'] }), '```'].join('\n'));
    fs.writeFileSync(path.join(root, 'crates', 'pkg-a', 'RFC-SEED.md'), ['# a', '```json', JSON.stringify({ source_segments: [] }), '```'].join('\n'));

    const segments = readWorkspacePackageSegments(root, treeManifestOf(root));

    assert.deepEqual(segments.map((entry) => entry.packagePath), ['.', 'crates/pkg-a']);
    assert.deepEqual(segments[0].segmentIds, ['s-root']);
    assert.deepEqual(segments[1].segmentIds, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C005 readWorkspacePackageSegments skips a package with no seed file', () => {
  const root = workspaceWithRoot();
  try {
    const treeManifest = { workspace: { packages: [{ id: 'pkg-a', path: 'crates/pkg-a' }] } };

    assert.deepEqual(readWorkspacePackageSegments(root, treeManifest), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C004 readWorkspaceObligations reads the root record and the root seed serves', () => {
  const root = workspaceWithRoot();
  try {
    fs.writeFileSync(path.join(root, 'RFC-SEED.md'), ['# root', '```json', JSON.stringify({ serves: [{ interfaceId: 'root-surface', column: 'verb', operationSet: 'VerbMethod' }] }), '```'].join('\n'));
    fs.writeFileSync(path.join(root, 'OBLIGATION.json'), JSON.stringify({ version: 2, serves: [], assignments: [{ unit: 'op-Root', ground: 'root ground' }], adjudications: [] }));
    fs.writeFileSync(path.join(root, 'crates', 'pkg-a', 'OBLIGATION.json'), JSON.stringify({ version: 2, serves: [], assignments: [{ unit: 'op-A', ground: 'a ground' }], adjudications: [] }));

    const read = readWorkspaceObligations(root, { contract_registry: [] }, treeManifestOf(root));

    assert.deepEqual(read.get('.').assignments.map((entry) => entry.unit), ['op-Root']);
    assert.deepEqual(read.get('crates/pkg-a').assignments.map((entry) => entry.unit), ['op-A']);
    assert.deepEqual(read.get('.').serves.map((entry) => entry.interfaceId), ['root-surface']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C004 readWorkspaceObligations canonicalizes declared_interfaces keys authored as pkg-a', () => {
  const root = workspaceWithRoot();
  try {
    const read = readWorkspaceObligations(root, {
      contract_registry: [],
      declared_interfaces: { 'pkg-a': [{ interfaceId: 'a-surface', column: 'verb', operationSet: 'VerbMethod' }] },
    }, treeManifestOf(root));

    assert.deepEqual(read.get('crates/pkg-a').serves.map((entry) => entry.interfaceId), ['a-surface']);
    assert.equal(read.has('pkg-a'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C007 packageRecordFor resolves the root and both nested key spellings', () => {
  const root = path.resolve('/workspace');
  const records = new Map([
    ['.', { assignments: [{ unit: 'op-Root' }] }],
    ['crates/protocol/pkg-a', { assignments: [{ unit: 'op-A' }] }],
    ['protocol/legacy', { assignments: [{ unit: 'op-L' }] }],
  ]);

  assert.equal(packageRecordFor(records, root, root).assignments[0].unit, 'op-Root');
  assert.equal(packageRecordFor(records, root, 'crates/protocol/pkg-a').assignments[0].unit, 'op-A');
  assert.equal(packageRecordFor(records, root, 'crates/protocol/legacy').assignments[0].unit, 'op-L');
  assert.equal(packageRecordFor(records, root, 'crates/absent'), null);
});

test('C008 describeEntry renders the root as . and leaves a nested directory unchanged', () => {
  const root = workspaceWithRoot();
  try {
    fs.writeFileSync(path.join(root, 'SEQUENCES.json'), JSON.stringify({
      packageId: 'pkg-root',
      ownedOperationUnits: [], ownedSequenceUnits: [], crossBoundarySequenceUnits: [],
      obligationUnits: [{ unitId: 'ctr-boundary-001', relation: 'carries' }],
      adjudicatedColumns: [], obligationSource: 'undeclared',
    }));
    fs.writeFileSync(path.join(root, 'RFC.md'), emptyLedger());
    fs.writeFileSync(path.join(root, 'crates', 'pkg-a', 'SEQUENCES.json'), JSON.stringify({
      packageId: 'pkg-a',
      ownedOperationUnits: [], ownedSequenceUnits: [], crossBoundarySequenceUnits: [],
      obligationUnits: [{ unitId: 'ctr-boundary-002', relation: 'carries' }],
      adjudicatedColumns: [], obligationSource: 'undeclared',
    }));
    fs.writeFileSync(path.join(root, 'crates', 'pkg-a', 'RFC.md'), emptyLedger());

    const rootEntry = describeEntry(root, { packageId: 'pkg-root', directory: root });
    assert.equal(rootEntry.directory, '.');
    assert.equal(rootEntry.state, 'failed');
    assert.match(rootEntry.repair, /re-run \/grill-me-for-rfc in \./);

    const nestedEntry = describeEntry(root, { packageId: 'pkg-a', directory: path.join(root, 'crates', 'pkg-a') });
    assert.equal(nestedEntry.directory, path.join('crates', 'pkg-a'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C005 projectPackageView writes the root view for the package the manifest names .', () => {
  const root = buildSyntheticTriple();
  try {
    const manifestPath = path.join(root, TREE_MANIFEST_FILENAME);
    const treeManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    treeManifest.workspace.packages.push({ id: 'pkg-root', path: '.' });
    fs.writeFileSync(manifestPath, JSON.stringify(treeManifest));
    fs.writeFileSync(path.join(root, 'RFC-SEED.md'), ['# root', '```json', JSON.stringify({ source_segments: [] }), '```'].join('\n'));

    projectPackageView(path.join(root, 'SyntheticSpec-sequences.json'), root);

    const view = JSON.parse(fs.readFileSync(path.join(root, 'SEQUENCES.json'), 'utf8'));
    assert.equal(view.packageId, 'pkg-root');
  } finally {
    removeSyntheticTriple(root);
  }
});
