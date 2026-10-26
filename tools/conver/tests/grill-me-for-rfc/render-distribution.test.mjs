// PX-307 @verifies C002
// The renderer is the only writer of the ledger, the map block and the managed anchors.
// These tests pin the bootstrap, the regeneration, the anchor placement and the
// no-write-on-failure rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { renderDistribution } from '../../.claude/scripts/grill-me-for-rfc/render-distribution.mjs';

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureView() {
  return {
    packageId: 'pkg-1',
    ownedOperationUnits: [{
      unitId: 'op-Produce',
      operationId: 'Produce',
      resultObjectClasses: ['Thing'],
      ownerPackageIds: ['pkg-1'],
      roleCandidate: 'implementer',
      obligation: { purpose: 'produce', specLines: [12] },
    }],
    ownedSequenceUnits: [{
      unitId: 'seq-A-1',
      sequenceId: 'A-1',
      outcome: 'direct',
      ownerPackageIds: ['pkg-1'],
      steps: [{ stepId: 's1', operationId: 'Produce', contract: { pre: [], post: [] }, line: 12, quote: 'produce' }],
    }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureRfc(rows) {
  return [
    '# Package RFC',
    '',
    'This prose must survive the render.',
    '',
    '## 3.1 Produce',
    '',
    'The operation is designed here.',
    '',
    '## 3.2 Consume',
    '',
    'The consumer side.',
    '',
    '## Distribution ledger',
    '',
    'RFC.md is canonical for this package; the projection is an input, not an authority.',
    '',
    '| Unit | Kind | Owner | RFC location | Ground |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

const ROWS = [
  '| op-Produce | operation | pkg-1 | §3.1 | designed here |',
  '| seq-A-1 | sequence | pkg-1 | §3.2 | flow designed here |',
];

test('C002 the renderer bootstraps a map from the ledger and regenerates the ledger', () => {
  const result = renderDistribution(fixtureRfc(ROWS), fixtureView());
  assert.equal(result.ok, true, result.code);
  assert.equal(result.map.units.length, 2);
  assert.deepEqual(result.map.units.map((unit) => unit.unitId), ['op-Produce', 'seq-A-1']);
  assert.equal(result.map.units[0].ground, 'designed here');
  assert.match(result.rfc, /\| Unit \| Kind \| Owner \| RFC location \| Ground \|/);
  assert.match(result.rfc, /```json distribution-map/);
  assert.match(result.rfc, /<!-- unit: op-Produce -->/);
  assert.match(result.rfc, /<!-- unit: seq-A-1 -->/);
});

test('C002 the renderer is idempotent over the same view and RFC', () => {
  const first = renderDistribution(fixtureRfc(ROWS), fixtureView());
  const second = renderDistribution(first.rfc, fixtureView());
  assert.equal(second.ok, true, second.code);
  assert.equal(second.rfc, first.rfc);
});

test('C002 the renderer preserves prose outside the generated appendix', () => {
  const result = renderDistribution(fixtureRfc(ROWS), fixtureView());
  assert.match(result.rfc, /This prose must survive the render\./);
  assert.match(result.rfc, /The operation is designed here\./);
});

test('C002 a view unit with no ledger row fails without guessing', () => {
  const result = renderDistribution(fixtureRfc([ROWS[0]]), fixtureView());
  assert.equal(result.ok, false);
  assert.equal(result.code, 'DISTRIBUTION_MAPPING_MISSING');
  assert.deepEqual(result.missing, ['seq-A-1']);
});

test('C002 a duplicated ledger row is refused', () => {
  const result = renderDistribution(fixtureRfc([...ROWS, ROWS[0]]), fixtureView());
  assert.equal(result.ok, false);
  assert.equal(result.code, 'DUPLICATE_LEDGER_ROW');
  assert.deepEqual(result.units, ['op-Produce']);
});

test('C002 a ledger location that resolves to no heading is refused', () => {
  const rows = [ROWS[0].replace('§3.1', '§9.9'), ROWS[1]];
  const result = renderDistribution(fixtureRfc(rows), fixtureView());
  assert.equal(result.ok, false);
  assert.equal(result.code, 'MISSING_RFC_SECTION');
  assert.deepEqual(result.missing, ['§9.9']);
});

test('C002 a ledger row whose kind does not match its prefix is refused', () => {
  const rows = [ROWS[0].replace('| operation |', '| sequence |'), ROWS[1]];
  const result = renderDistribution(fixtureRfc(rows), fixtureView());
  assert.equal(result.ok, false);
  assert.equal(result.code, 'KIND_MISMATCH');
});

test('C002 an empty view writes nothing and is not a failure', () => {
  const empty = { ...fixtureView(), ownedOperationUnits: [], ownedSequenceUnits: [] };
  const result = renderDistribution('# x\n', empty);
  assert.equal(result.ok, true);
  assert.equal(result.wrote, false);
  assert.equal(result.rfc, '# x\n');
});

test('C002 a second render removes the old managed anchor before reinserting it', () => {
  const first = renderDistribution(fixtureRfc(ROWS), fixtureView());
  const once = first.rfc.split('<!-- unit: op-Produce -->').length - 1;
  const second = renderDistribution(first.rfc, fixtureView());
  const twice = second.rfc.split('<!-- unit: op-Produce -->').length - 1;
  assert.equal(once, 1);
  assert.equal(twice, 1);
});

test('C002 the CLI --check writes nothing and exits 0', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px307-check-'));
  const rfcPath = path.join(directory, 'RFC.md');
  const viewPath = path.join(directory, 'SEQUENCES.json');
  fs.writeFileSync(rfcPath, fixtureRfc(ROWS));
  fs.writeFileSync(viewPath, JSON.stringify(fixtureView()));
  const before = fs.readFileSync(rfcPath, 'utf8');
  const output = execFileSync(process.execPath, [
    path.resolve('.claude/scripts/grill-me-for-rfc/render-distribution.mjs'),
    '--check',
    `--rfc=${rfcPath}`,
    `--view=${viewPath}`,
  ], { encoding: 'utf8' });
  assert.match(output, /"ok":true/);
  assert.equal(fs.readFileSync(rfcPath, 'utf8'), before);
});

test('C002 the CLI exits 1 and writes nothing when a gate fails', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px307-fail-'));
  const rfcPath = path.join(directory, 'RFC.md');
  const viewPath = path.join(directory, 'SEQUENCES.json');
  fs.writeFileSync(rfcPath, fixtureRfc([ROWS[0]]));
  fs.writeFileSync(viewPath, JSON.stringify(fixtureView()));
  const before = fs.readFileSync(rfcPath, 'utf8');
  assert.throws(() => execFileSync(process.execPath, [
    path.resolve('.claude/scripts/grill-me-for-rfc/render-distribution.mjs'),
    `--rfc=${rfcPath}`,
    `--view=${viewPath}`,
  ], { encoding: 'utf8', stdio: 'pipe' }));
  assert.equal(fs.readFileSync(rfcPath, 'utf8'), before);
});

// [::TICKET::] PX-317 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-317 --for-spec --no-implementation-order`.
test('C002 an undecided operation is rendered without a consumer role', () => {
  const view = fixtureView();
  view.ownedOperationUnits[0] = {
    ...view.ownedOperationUnits[0],
    ownerPackageIds: ['pkg-1', 'pkg-2'],
    roleCandidate: 'undecided',
  };
  const rows = [ROWS[0].replace('pkg-1', '`pkg-1` + `pkg-2`'), ROWS[1]];
  const result = renderDistribution(fixtureRfc(rows), view);
  assert.equal(result.ok, true, result.code);
  const operation = result.map.units.find((unit) => unit.unitId === 'op-Produce');
  assert.equal(operation.role, undefined);
});
