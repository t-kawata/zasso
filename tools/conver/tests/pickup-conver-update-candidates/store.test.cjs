'use strict';

/**
 * Unit tests for the atomic ledger store.
 *
 * Covers C010 (atomic write), C012 (canonical JSON), unparseable-ledger handling,
 * and CUC id allocation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { initRepoWithUpstream, makeCandidates } = require('./fixtures.cjs');

const store = require(path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'scripts',
  'pickup-conver-update-candidates',
  'store.js'
));

const LEDGER_KEYS = ['schemaVersion', 'criteriaVersion', 'workspace', 'claudeDir', 'upstreamRef', 'generatedAt', 'candidates'];

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function makeLedger() {
  const { workspace } = initRepoWithUpstream();
  const claudeDir = path.join(workspace, '.claude');
  const ledger = store.emptyLedger({ workspace, claudeDir, upstreamRef: 'origin/main' });
  ledger.candidates = makeCandidates(2).map((candidate, index) => ({
    ...candidate,
    id: 'CUC-000' + (index + 1),
  }));
  return { workspace, claudeDir, ledger };
}

test('emptyLedger carries the canonical keys, versions, and no candidates', () => {
  const { workspace } = initRepoWithUpstream();
  const claudeDir = path.join(workspace, '.claude');
  const ledger = store.emptyLedger({ workspace, claudeDir, upstreamRef: 'origin/main' });
  assert.deepEqual(Object.keys(ledger), LEDGER_KEYS);
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.criteriaVersion, '1.0.0');
  assert.equal(ledger.workspace, path.resolve(workspace));
  assert.equal(ledger.claudeDir, path.resolve(claudeDir));
  assert.deepEqual(ledger.candidates, []);
});

test('allocateId starts at CUC-0001 and advances past the maximum id', () => {
  const ledger = store.emptyLedger({ workspace: '/tmp/x', claudeDir: '/tmp/x/.claude', upstreamRef: 'origin/main' });
  assert.equal(store.allocateId(ledger), 'CUC-0001');
  ledger.candidates = [{ id: 'CUC-0001' }, { id: 'CUC-0007' }, { id: 'CUC-0003' }];
  assert.equal(store.allocateId(ledger), 'CUC-0008');
});

test('loadLedger reports a missing ledger without creating one', () => {
  const { workspace } = makeLedger();
  const result = store.loadLedger(workspace);
  assert.equal(result.ok, true);
  assert.equal(result.exists, false);
  assert.equal(result.ledger, null);
  assert.equal(fs.existsSync(store.ledgerPath(workspace)), false);
});

test('C012 save then load then save keeps the bytes identical', () => {
  const { workspace, ledger } = makeLedger();
  assert.equal(store.saveLedger(workspace, ledger).ok, true);
  const before = fs.readFileSync(store.ledgerPath(workspace), 'utf8');
  const loaded = store.loadLedger(workspace);
  assert.equal(loaded.ok, true);
  assert.equal(store.saveLedger(workspace, loaded.ledger).ok, true);
  const after = fs.readFileSync(store.ledgerPath(workspace), 'utf8');
  assert.equal(after, before);
  assert.equal(after.endsWith('\n'), true);
  assert.deepEqual(Object.keys(JSON.parse(after)), LEDGER_KEYS);
});

test('saveLedger validates the shape before writing', () => {
  const { workspace, ledger } = makeLedger();
  const broken = { ...ledger, candidates: 'not-an-array' };
  const result = store.saveLedger(workspace, broken);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERROR:ledger-invalid');
  assert.equal(fs.existsSync(store.ledgerPath(workspace)), false);
});

test('C010 a failed rename leaves the original ledger parseable and unchanged', () => {
  const { workspace, ledger } = makeLedger();
  assert.equal(store.saveLedger(workspace, ledger).ok, true);
  const before = fs.readFileSync(store.ledgerPath(workspace), 'utf8');

  const crashed = store.saveLedger(workspace, ledger, {
    renameImpl: () => {
      throw new Error('crash before rename');
    },
  });

  assert.equal(crashed.ok, false);
  assert.equal(crashed.code, 'ERROR:ledger-write-failed');
  assert.equal(fs.readFileSync(store.ledgerPath(workspace), 'utf8'), before);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(store.ledgerPath(workspace), 'utf8')));
});

test('an unparseable ledger is reported and left untouched', () => {
  const { workspace } = makeLedger();
  fs.writeFileSync(store.ledgerPath(workspace), '{ not json', 'utf8');
  const result = store.loadLedger(workspace);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERROR:ledger-unparseable');
  assert.equal(fs.readFileSync(store.ledgerPath(workspace), 'utf8'), '{ not json');
});

test('saveLedger writes the Markdown sibling only when render is supplied', () => {
  const { workspace, ledger } = makeLedger();
  assert.equal(store.saveLedger(workspace, ledger).ok, true);
  assert.equal(fs.existsSync(store.markdownPath(workspace)), false);
  assert.equal(store.saveMarkdown(workspace, '# candidates\n').ok, true);
  assert.equal(fs.readFileSync(store.markdownPath(workspace), 'utf8'), '# candidates\n');
});

test('loadLedger rejects an unsupported schemaVersion', () => {
  const { workspace, ledger } = makeLedger();
  assert.equal(store.saveLedger(workspace, ledger).ok, true);
  const raw = JSON.parse(fs.readFileSync(store.ledgerPath(workspace), 'utf8'));
  raw.schemaVersion = 99;
  fs.writeFileSync(store.ledgerPath(workspace), JSON.stringify(raw, null, 2) + '\n', 'utf8');
  const result = store.loadLedger(workspace);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERROR:ledger-unsupported-schema');
});
