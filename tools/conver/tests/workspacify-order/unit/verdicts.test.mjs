// PX-269 @verifies C002
// PX-269 @verifies C003
// PX-269 @verifies C004
// PX-269 @verifies C005
//
// The reader that turns a package directory into a verdict.
//
// It is total: every package the manifest names receives an answer, including the ones whose
// material is missing, unreadable or written by a tool that predates the carriage, because the
// plan exists to describe a workspace and a reader that threw would replace the picture with a
// stack trace. Each state below is built from real files rather than from a stubbed reader, so
// the case fails if the judgement and the reading drift apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  VIEW_FILE_NAME,
  materializeOrderWorkspace,
  writeCarriedView,
  writePreCarriageView,
  writeView,
} from '../helpers/order-workspace.mjs';
import { readSequenceVerdicts } from '../../../.claude/scripts/workspacify-order/lib/verdicts.mjs';
import { findPackageDirectories, readLedgers } from '../../../.claude/scripts/grill-me-for-rfc/check-ledger-discharge.js';
import { measureDischarge } from '../../../.claude/scripts/sequences-slice/lib/obligation-coverage.mjs';
import {
  SEQUENCE_VERDICT_COMPLETE,
  SEQUENCE_VERDICT_FAILED,
  SEQUENCE_VERDICT_NOT_YET,
} from '../../../.claude/scripts/sequences-slice/lib/package-verdict.mjs';

/** The three-package workspace the reader is asked about, with no package reached yet. */
// [::TICKET::] PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
function workspaceOf(t, options = {}) {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002', 'pkg-0003'],
    edges: [
      ['pkg-0002', 'pkg-0001'],
      ['pkg-0003', 'pkg-0001'],
    ],
    levels: [['pkg-0001'], ['pkg-0002', 'pkg-0003']],
    ...options,
  });
  t.after(() => workspace.remove());
  return workspace;
}

/** The verdicts of a workspace, read the way the plan reads them. */
// [::TICKET::] PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
function verdictsOf(workspace) {
  return readSequenceVerdicts({ root: workspace.root, packages: workspace.treeManifest.workspace.packages });
}

test('C002 postcondition: a package whose view carries units and whose ledger accounts for them is complete', (t) => {
  const workspace = workspaceOf(t, { documents: { carried: ['pkg-0001'] } });

  assert.deepEqual(verdictsOf(workspace).get('pkg-0001'), { state: SEQUENCE_VERDICT_COMPLETE, reason: null });
});

test('C003 postcondition: a unit its own ledger omits is unaccounted, and the ledger is read rather than counted', (t) => {
  const workspace = workspaceOf(t);
  writeCarriedView(workspace, 'pkg-0001', { units: ['ctr-boundary-001'] });
  // The view gains a unit the ledger does not name, which is the one way a well-formed ledger is
  // short: the row set is a subset of what the package was handed.
  writeView(workspace, 'pkg-0001', {
    packageId: 'pkg-0001',
    ownedOperationUnits: [],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [
      { unitId: 'ctr-boundary-001', relation: 'carries' },
      { unitId: 'ctr-boundary-002', relation: 'carries' },
    ],
    obligationSource: 'undeclared',
    specLines: 1,
    lineRange: { claimedLineCount: 1, multiClaimedLineCount: 0, unclaimedLineCount: 0, statement: '' },
  });

  assert.deepEqual(verdictsOf(workspace).get('pkg-0001'), { state: SEQUENCE_VERDICT_FAILED, reason: 'unaccounted-unit' });
});

test('C003 postcondition: a view carrying units with no ledger at all is without-ledger', (t) => {
  const workspace = workspaceOf(t);
  writeCarriedView(workspace, 'pkg-0001');
  rmSync(workspace.rfcPathOf('pkg-0001'), { force: true });

  assert.deepEqual(verdictsOf(workspace).get('pkg-0001'), { state: SEQUENCE_VERDICT_FAILED, reason: 'without-ledger' });
});

test('C003 postcondition: a ledger refused for its shape is ledger-refused, told apart from a missing one', (t) => {
  const workspace = workspaceOf(t);
  writeCarriedView(workspace, 'pkg-0001');
  // The parser accepts exactly the five declared columns, so a ledger with a fourth column is
  // present and refused, and reporting it as absent would name two repairs for one defect.
  writeFileSync(
    workspace.rfcPathOf('pkg-0001'),
    ['# pkg-0001 design', '', '## Distribution ledger', '', 'This document is canonical.', '', '| Unit | Kind | Owner | Ground |', '| --- | --- | --- | --- |', '| ctr-boundary-001 | contract | pkg-0001 | a dependency |', ''].join('\n'),
  );

  assert.deepEqual(verdictsOf(workspace).get('pkg-0001'), { state: SEQUENCE_VERDICT_FAILED, reason: 'ledger-refused' });
});

test('C003 postcondition: a ledger row citing a location the document does not hold is unresolved-location', (t) => {
  const workspace = workspaceOf(t);
  writeCarriedView(workspace, 'pkg-0001', { location: '9.9' });

  assert.deepEqual(verdictsOf(workspace).get('pkg-0001'), { state: SEQUENCE_VERDICT_FAILED, reason: 'unresolved-location' });
});

test('C003 boundary: a view that declares obligations and carries none is a wiring defect, not an unmade decision', (t) => {
  const workspace = workspaceOf(t);
  writeView(workspace, 'pkg-0001', { packageId: 'pkg-0001', obligationUnits: [], obligationSource: 'declared' });

  assert.deepEqual(verdictsOf(workspace).get('pkg-0001'), { state: SEQUENCE_VERDICT_FAILED, reason: 'declaration-did-not-bind' });
});

test('C004 invariant: a document that cannot be read is failed, and never read as work not yet begun', (t) => {
  const workspace = workspaceOf(t);
  for (const [id, text] of [['pkg-0001', ''], ['pkg-0002', '{ not json'], ['pkg-0003', 'null']]) {
    writeFileSync(workspace.viewPathOf(id), text);
    assert.deepEqual(verdictsOf(workspace).get(id), { state: SEQUENCE_VERDICT_FAILED, reason: 'unreadable-view' }, `${id}: ${text}`);
  }
});

test('C004 boundary: a document that parses but is not a projected view is failed, not not-yet', (t) => {
  const workspace = workspaceOf(t);
  // Each of these parses, so a reader that asked only whether the file could be read would take
  // it for a view; none of them is one, and answering not-yet would tell the operator to run the
  // pipeline over a directory where something is already wrong.
  for (const [id, text] of [['pkg-0001', '[]'], ['pkg-0002', '"a view"'], ['pkg-0003', '17']]) {
    writeFileSync(workspace.viewPathOf(id), text);
    assert.deepEqual(verdictsOf(workspace).get(id), { state: SEQUENCE_VERDICT_FAILED, reason: 'unreadable-view' }, `${id}: ${text}`);
  }
});

test('C004 postcondition: the three ways a directory is not-yet are told apart', (t) => {
  const workspace = workspaceOf(t);
  writePreCarriageView(workspace, 'pkg-0002', { units: ['op-0001'] });
  writeView(workspace, 'pkg-0003', { packageId: 'pkg-0003', obligationUnits: [], obligationSource: 'undeclared' });

  const verdicts = verdictsOf(workspace);
  assert.deepEqual(verdicts.get('pkg-0001'), { state: SEQUENCE_VERDICT_NOT_YET, reason: 'no-view' });
  assert.deepEqual(verdicts.get('pkg-0002'), { state: SEQUENCE_VERDICT_NOT_YET, reason: 'view-predates-the-carriage' });
  assert.deepEqual(verdicts.get('pkg-0003'), { state: SEQUENCE_VERDICT_NOT_YET, reason: 'nothing-declared' });
});

test('C004 boundary: a workspace whose views were all projected before the carriage judges none of them', (t) => {
  // ~/shyme/gaia's shape as of this ticket: every view carries owned units, none carries the
  // field, and the ledger of each accounts for what it holds — so the discharge chain is intact
  // and says nothing about whether an obligation was distributed, which is the whole point.
  const workspace = workspaceOf(t);
  for (const id of ['pkg-0001', 'pkg-0002']) writePreCarriageView(workspace, id, { units: ['op-0001'] });

  const verdicts = verdictsOf(workspace);
  assert.deepEqual(verdicts.get('pkg-0001'), { state: SEQUENCE_VERDICT_NOT_YET, reason: 'view-predates-the-carriage' });
  assert.deepEqual(verdicts.get('pkg-0002'), { state: SEQUENCE_VERDICT_NOT_YET, reason: 'view-predates-the-carriage' });
  assert.equal([...verdicts.values()].some((verdict) => verdict.state === SEQUENCE_VERDICT_COMPLETE), false);
});

test('C001 invariant: every package the manifest names receives a verdict, including one whose directory is gone', (t) => {
  const workspace = workspaceOf(t, { documents: { carried: ['pkg-0001'] } });
  rmSync(workspace.directoryOf('pkg-0002'), { recursive: true, force: true });
  mkdirSync(join(workspace.root, 'crates', 'protocol'), { recursive: true });

  const verdicts = verdictsOf(workspace);
  assert.deepEqual([...verdicts.keys()].sort(), ['pkg-0001', 'pkg-0002', 'pkg-0003']);
  assert.deepEqual(verdicts.get('pkg-0002'), { state: SEQUENCE_VERDICT_NOT_YET, reason: 'no-view' });
  for (const verdict of verdicts.values()) {
    assert.equal([SEQUENCE_VERDICT_COMPLETE, SEQUENCE_VERDICT_FAILED, SEQUENCE_VERDICT_NOT_YET].includes(verdict.state), true);
  }
});

test('C005 invariant: the packages the discharge gate names are exactly the packages the verdict fails', (t) => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002', 'pkg-0003', 'pkg-0004'],
    levels: [['pkg-0001'], ['pkg-0002'], ['pkg-0003'], ['pkg-0004']],
  });
  t.after(() => workspace.remove());
  // One directory is complete and one fails for each family the gate names apart: a ledger that
  // is absent, a ledger that omits a unit the view carries, and a ledger row citing a location
  // the document does not hold.
  writeCarriedView(workspace, 'pkg-0001', { units: ['ctr-boundary-001'] });
  writeCarriedView(workspace, 'pkg-0002', { units: ['ctr-boundary-002'] });
  rmSync(workspace.rfcPathOf('pkg-0002'), { force: true });
  writeCarriedView(workspace, 'pkg-0003', { units: ['ctr-boundary-003'] });
  writeView(workspace, 'pkg-0003', {
    packageId: 'pkg-0003',
    ownedOperationUnits: [],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [
      { unitId: 'ctr-boundary-003', relation: 'carries' },
      { unitId: 'ctr-boundary-004', relation: 'carries' },
    ],
    obligationSource: 'undeclared',
    specLines: 1,
    lineRange: { claimedLineCount: 1, multiClaimedLineCount: 0, unclaimedLineCount: 0, statement: '' },
  });
  writeCarriedView(workspace, 'pkg-0004', { units: ['ctr-boundary-005'], location: '9.9' });

  // The gate's own reading of the same root, through the same readers the reader under test uses.
  const material = readLedgers(findPackageDirectories(workspace.root));
  const discharge = measureDischarge({ views: material.views, ledgersByPackage: material.ledgers });
  const refused = new Set(material.malformed.map((entry) => entry.packageId));
  const named = new Set([
    ...discharge.withoutLedger.filter((packageId) => !refused.has(packageId)),
    ...discharge.unaccounted.map((entry) => entry.packageId),
    ...material.locations.map((entry) => entry.packageId),
  ]);

  const verdicts = verdictsOf(workspace);
  const failed = new Set([...verdicts].filter(([, verdict]) => verdict.state === SEQUENCE_VERDICT_FAILED).map(([id]) => id));
  assert.deepEqual([...failed].sort(), [...named].sort());
  assert.deepEqual([...named].sort(), ['pkg-0002', 'pkg-0003', 'pkg-0004']);
  assert.deepEqual(verdicts.get('pkg-0001'), { state: SEQUENCE_VERDICT_COMPLETE, reason: null });
});

test('C005 invariant: the reader opens only the package directory it was handed, so a stray view elsewhere is not read', (t) => {
  const workspace = workspaceOf(t, { documents: { carried: ['pkg-0002'] } });
  const parent = join(workspace.root, 'crates', 'protocol');
  // A copy at the root and at the layer directory belongs to neither package. A reader that
  // walked upward, or that took the first view it found, would judge pkg-0001 complete.
  const strayView = JSON.stringify({ packageId: 'pkg-0001', obligationUnits: [{ unitId: 'ctr-999' }], obligationSource: 'undeclared' });
  writeFileSync(join(workspace.root, VIEW_FILE_NAME), strayView);
  writeFileSync(join(parent, VIEW_FILE_NAME), strayView);

  const verdicts = verdictsOf(workspace);
  assert.deepEqual(verdicts.get('pkg-0002'), { state: SEQUENCE_VERDICT_COMPLETE, reason: null });
  assert.deepEqual(verdicts.get('pkg-0001'), { state: SEQUENCE_VERDICT_NOT_YET, reason: 'no-view' });
});
