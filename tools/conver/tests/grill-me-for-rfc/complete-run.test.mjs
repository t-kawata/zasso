// PX-309 @verifies C004
// The render is not a procedure step the model can skip: the command that declares a run
// DONE renders first, records the generation, and refuses to finish when the ledger cannot
// be regenerated. These tests pin that ordering, the refusal, the additivity case and the
// command wiring that makes the ordering unavoidable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderDistribution } from '../../.claude/scripts/grill-me-for-rfc/render-distribution.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMPLETE_RUN = join(PROJECT_ROOT, '.claude/scripts/grill-me-for-rfc/complete-run.js');
const GRILL_COMMAND = join(PROJECT_ROOT, '.claude/commands/grill-me-for-rfc.md');

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
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
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function fixtureRfc() {
  return [
    '# Package RFC',
    '',
    '## 3.1 Produce',
    '',
    'The operation is designed here.',
    '',
    '## Distribution ledger',
    '',
    'RFC.md is canonical for this package; the projection is an input, not an authority.',
    '',
    '| Unit | Kind | Owner | RFC location | Ground |',
    '|---|---|---|---|---|',
    '| op-Produce | operation | pkg-1 | §3.1 | designed here |',
    '',
  ].join('\n');
}

/**
 * A package the completion command can actually finish.
 *
 * The schema validation `update-status.js` runs before it writes requires the tree and
 * the checklist as well as the status, so the fixture carries all three: a completion test
 * that skipped them would prove only the happy half of the transition.
 */
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function writePackage(directory, { state = 'GRILLING', view = fixtureView(), rfcText = fixtureRfc() } = {}) {
  const rfcPath = join(directory, 'RFC.md');
  const statusPath = join(directory, 'Status.json');
  writeFileSync(rfcPath, rfcText);
  if (view !== null) writeFileSync(join(directory, 'SEQUENCES.json'), JSON.stringify(view));
  writeFileSync(statusPath, JSON.stringify({
    state,
    researchPath: join(directory, 'material'),
    rfcPath,
    rfcDir: directory,
    reviewLoopCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(directory, 'DesignTree.json'), JSON.stringify({ version: 1, nodes: [] }, null, 2));
  writeFileSync(join(directory, 'CheckList.md'), '# RFC 要件チェックリスト\n');
  return { rfcPath, statusPath };
}

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function runCompletion(directory) {
  return spawnSync(process.execPath, [COMPLETE_RUN, directory], { encoding: 'utf8' });
}

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function readStatus(statusPath) {
  return JSON.parse(readFileSync(statusPath, 'utf8'));
}

test('C004 completion renders the ledger, records the generation and then declares DONE', () => {
  const directory = mkdtempSync(join(tmpdir(), 'px309-complete-'));
  const { rfcPath, statusPath } = writePackage(directory);

  const result = runCompletion(directory);

  assert.equal(result.status, 0, result.stderr);
  const status = readStatus(statusPath);
  assert.equal(status.state, 'DONE');
  assert.equal(status.distributionGeneration, 1);
  assert.match(status.distributionDigest, /^[0-9a-f]{64}$/);
  assert.equal(status.completedSessions, 1);
  assert.match(readFileSync(rfcPath, 'utf8'), /<!-- unit: op-Produce -->/);
});

test('C004 a package that predates the counter advances from the generation its map already is', () => {
  const directory = mkdtempSync(join(tmpdir(), 'px309-complete-legacy-'));
  // No distributionGeneration field, but the RFC already carries a map, which the
  // display counts as generation one. Completion must record two.
  const rendered = renderDistribution(fixtureRfc(), fixtureView());
  const { statusPath } = writePackage(directory, { rfcText: rendered.rfc });

  const result = runCompletion(directory);

  assert.equal(result.status, 0, result.stderr);
  const status = readStatus(statusPath);
  assert.equal(status.state, 'DONE');
  assert.equal(status.distributionGeneration, 2);
});

test('C004 a refused render writes nothing and leaves the run unfinished', () => {
  const directory = mkdtempSync(join(tmpdir(), 'px309-complete-refuse-'));
  const { rfcPath, statusPath } = writePackage(directory);
  // The view holds a sequence the ledger does not account for, which the renderer refuses.
  writeFileSync(join(directory, 'SEQUENCES.json'), JSON.stringify({
    ...fixtureView(),
    ownedSequenceUnits: [{
      unitId: 'seq-A-1',
      sequenceId: 'A-1',
      outcome: 'direct',
      ownerPackageIds: ['pkg-1'],
      steps: [{ stepId: 's1', operationId: 'Produce', contract: { pre: [], post: [] }, line: 12, quote: 'produce' }],
    }],
  }));
  const rfcBefore = readFileSync(rfcPath, 'utf8');

  const result = runCompletion(directory);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /"ok":false/);
  assert.equal(readFileSync(rfcPath, 'utf8'), rfcBefore);
  const status = readStatus(statusPath);
  assert.equal(status.state, 'GRILLING');
  assert.equal(status.distributionGeneration, undefined);
});

test('C004 a package without a view still finishes and records no generation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'px309-complete-noview-'));
  const { rfcPath, statusPath } = writePackage(directory, { view: null });
  const rfcBefore = readFileSync(rfcPath, 'utf8');

  const result = runCompletion(directory);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(rfcPath, 'utf8'), rfcBefore);
  const status = readStatus(statusPath);
  assert.equal(status.state, 'DONE');
  assert.equal(status.distributionGeneration, undefined);
});

test('C004 every completion opens one generation and a repeated completion adds no session', () => {
  const directory = mkdtempSync(join(tmpdir(), 'px309-complete-repeat-'));
  const { statusPath } = writePackage(directory);

  runCompletion(directory);
  const afterFirst = readStatus(statusPath);
  runCompletion(directory);
  const afterSecond = readStatus(statusPath);

  assert.equal(afterSecond.distributionGeneration, afterFirst.distributionGeneration + 1);
  assert.equal(afterSecond.completedSessions, 1);
});

test('C004 a package without an RFC is not finished', () => {
  const directory = mkdtempSync(join(tmpdir(), 'px309-complete-norfc-'));
  const { rfcPath, statusPath } = writePackage(directory);
  rmSync(rfcPath);

  const result = runCompletion(directory);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /MISSING_RFC/);
  assert.equal(readStatus(statusPath).state, 'GRILLING');
});

test('C004 a package without a Status.json is refused before anything is written', () => {
  const directory = mkdtempSync(join(tmpdir(), 'px309-complete-nostatus-'));
  const { rfcPath, statusPath } = writePackage(directory);
  rmSync(statusPath);
  const rfcBefore = readFileSync(rfcPath, 'utf8');

  const result = runCompletion(directory);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /MISSING_STATUS/);
  assert.equal(readFileSync(rfcPath, 'utf8'), rfcBefore);
});

test('C004 STEP 8 finishes through complete-run and never invokes the write-mode render by hand', () => {
  const [stepEight] = readFileSync(GRILL_COMMAND, 'utf8').split('### STEP 8a: Re-entry after DONE');
  assert.match(stepEight, /complete-run\.js "\$RFC_DIR"/);
  const handwrittenWrite = stepEight.split('\n').filter((line) => /^node .*render-distribution\.mjs\s*$/.test(line.trim()));
  assert.deepEqual(handwrittenWrite, []);
});
