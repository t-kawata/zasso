// PX-270 @verifies C003
// PX-270 @verifies C006
//
// One directory read once, as the material a judgement is made from and the judgement itself.
//
// The extraction this file pins is the reason the module exists: the plan, the discharge gate and
// the per-directory report all have to hold the same opinion about one workspace, and they hold it
// only if they read the directory once. What is asserted here is therefore the correspondence --
// every limb of the verdict is a value the returned material carries -- rather than the verdict
// alone, because a reader that returned the right answer from the wrong material would still let
// the report name a repair the gate does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readPackageObligationState } from '../../.claude/scripts/grill-me-for-rfc/obligation-state.js';
import { collectUnitIds } from '../../.claude/scripts/sequences-slice/lib/material.mjs';
import {
  SEQUENCE_VERDICT_COMPLETE,
  SEQUENCE_VERDICT_FAILED,
  SEQUENCE_VERDICT_NOT_YET,
} from '../../.claude/scripts/sequences-slice/lib/package-verdict.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGE = 'pkg-0001';

/** The five columns the ledger parser accepts, in the order it accepts them. */
const LEDGER_COLUMNS = '| Unit | Kind | Owner | RFC location | Ground |';
/** A heading whose number a ledger row can cite, so a location resolves inside the document. */
const CITED_SECTION = '1.1';

/** A directory with the two documents a verdict is made of, and nothing else. */
// [::TICKET::] PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
function packageDirectory(t, { units = [], ledgerUnits = null, location = CITED_SECTION, ledger = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'px270-obligation-state-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, 'crates', 'protocol', PACKAGE);
  mkdirSync(directory, { recursive: true });

  writeFileSync(join(directory, 'SEQUENCES.json'), JSON.stringify({
    packageId: PACKAGE,
    ownedOperationUnits: [],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: units.map((unitId) => ({ unitId, relation: 'carries', subject: unitId.slice(4) })),
    obligationSource: 'undeclared',
  }));

  if (!ledger) return directory;
  const named = ledgerUnits ?? units;
  writeFileSync(join(directory, 'RFC.md'), [
    `# ${PACKAGE} design`,
    '',
    `## ${CITED_SECTION} What this package carries`,
    '',
    '## Distribution ledger',
    '',
    'This document is canonical for the units below.',
    '',
    LEDGER_COLUMNS,
    '| --- | --- | --- | --- | --- |',
    ...named.map((unitId) => `| ${unitId} | contract | \`${PACKAGE}\` | ${location} | the boundary this unit travels along |`),
    '',
  ].join('\n'));
  return directory;
}

test('C003 the material a directory produces carries every limb the judgement was made from', (t) => {
  const directory = packageDirectory(t, { units: ['ctr-boundary-001'] });

  const { material, verdict } = readPackageObligationState(directory);

  assert.deepEqual(verdict, { state: SEQUENCE_VERDICT_COMPLETE, reason: null });
  assert.deepEqual(material.unitIds, ['ctr-boundary-001']);
  assert.deepEqual(material.unitIds, collectUnitIds(material.view));
  assert.deepEqual(material.unaccountedUnitIds, []);
  assert.deepEqual(material.unresolvedLocations, []);
  assert.equal(material.withoutLedger, false);
  assert.equal(material.ledgerRefusedReason, null);
  assert.equal(material.readError, null);
  assert.equal(material.declarationDidNotBind, false);
});

test('C003 the units the ledger omits are named in the material, unit for unit', (t) => {
  const directory = packageDirectory(t, { units: ['ctr-boundary-001', 'ctr-boundary-002'], ledgerUnits: ['ctr-boundary-001'] });

  const { material, verdict } = readPackageObligationState(directory);

  assert.deepEqual(verdict, { state: SEQUENCE_VERDICT_FAILED, reason: 'unaccounted-unit' });
  assert.deepEqual(material.unaccountedUnitIds, ['ctr-boundary-002']);
});

test('C003 a directory that holds nothing is answered rather than raised', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'px270-obligation-state-empty-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const { material, verdict } = readPackageObligationState(join(root, 'never-created'));

  assert.deepEqual(verdict, { state: SEQUENCE_VERDICT_NOT_YET, reason: 'no-view' });
  assert.equal(material.view, null);
  assert.deepEqual(material.unitIds, []);
});

test('C003 an unreadable view is failed, and the material says why rather than the judgement guessing', (t) => {
  const directory = packageDirectory(t, { units: ['ctr-boundary-001'] });
  writeFileSync(join(directory, 'SEQUENCES.json'), '{ not json');

  const { material, verdict } = readPackageObligationState(directory);

  assert.deepEqual(verdict, { state: SEQUENCE_VERDICT_FAILED, reason: 'unreadable-view' });
  assert.equal(material.view, null);
  assert.match(material.readError, /SEQUENCES\.json/);
});

test('C006 the reader names no project, package or column of its own', () => {
  const source = readFileSync(join(PROJECT_ROOT, '.claude', 'scripts', 'grill-me-for-rfc', 'obligation-state.js'), 'utf8');

  assert.equal(/gaia|pkg-\d{4}|websocket|Distribution ledger/.test(source), false);
});
