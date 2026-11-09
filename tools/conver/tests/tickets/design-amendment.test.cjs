'use strict';

/**
 * PX-400 — amendment transaction and owner hash rebuild.
 *
 * The transaction is all-or-nothing: it promotes only when the fixed gate
 * manifest reports no new finding, and otherwise restores every snapshot byte
 * for byte. Derived artifacts are never written by the transaction itself.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { runAmendment } = require('../../.claude/scripts/tickets/design-amendment.js');
const {
  rebuildStageReceipts,
  rebuildTreeManifestHashes,
  rebuildDesignHashes,
} = require('../../.claude/scripts/tickets/rebuild-design-hashes.js');

// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function tempPackage(files = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px400-transaction-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, name), content);
  }
  return directory;
}

// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function digestFile(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const CLEAN_RUNNER = () => ({ findings: [], unverifiable: [] });
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function failedGate() {
  return { findings: [{ code: 'GATE_FAILED', asset: 'fixture', problem: 'forced failure', fixes: [], rerun: 'rerun' }], unverifiable: [] };
}

// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function passingThenFailingRunner() {
  let calls = 0;
  return () => {
    calls += 1;
    return calls === 1 ? { findings: [], unverifiable: [] } : failedGate();
  };
}

const BASE_CLAIM = {
  target: { kind: 'clause', id: '§1.1' },
  predicate: 'the clause exists in the design',
  requiredTest: 'UT: clause exists',
  title: 'Missing clause',
  text: 'The clause states the missing constraint.',
};

test('C001: an absent artifact is skipped with no finding and no write', async () => {
  const directory = tempPackage();

  const result = await runAmendment({
    cwd: directory,
    ticketKey: 'PX-400',
    artifact: 'rfc',
    operation: 'append',
    claim: BASE_CLAIM,
    dryRun: false,
    gateRunner: CLEAN_RUNNER,
  });

  assert.equal(result.outcome, 'skipped');
  assert.deepEqual(result.findings, []);
  assert.equal(result.writes.length, 0);
  assert.equal(fs.existsSync(path.join(directory, 'RFC.md')), false);
});

test('C010: an unreadable artifact is refused with a named finding and no write', async () => {
  const directory = tempPackage({ 'RFC-GRAPH.json': '{not json' });

  const result = await runAmendment({
    cwd: directory,
    ticketKey: 'PX-400',
    artifact: 'graph',
    operation: 'mutate',
    claim: BASE_CLAIM,
    dryRun: false,
    gateRunner: CLEAN_RUNNER,
  });

  assert.equal(result.outcome, 'refused');
  assert.equal(result.findings[0].code, 'UNREADABLE_ARTIFACT');
  assert.equal(result.writes.length, 0);
});

test('C004: a clean run promotes and records one ledger entry', async () => {
  const directory = tempPackage({ 'RFC.md': '# RFC\n' });

  const result = await runAmendment({
    cwd: directory,
    ticketKey: 'PX-400',
    artifact: 'rfc',
    operation: 'append',
    claim: BASE_CLAIM,
    dryRun: false,
    gateRunner: CLEAN_RUNNER,
  });

  assert.equal(result.outcome, 'promoted');
  assert.equal(result.noChange, false);
  assert.ok(fs.readFileSync(path.join(directory, 'RFC.md'), 'utf8').includes('### Amendment PX-400-1'));
  const ledgers = fs.readdirSync(path.join(directory, 'amendments'));
  assert.equal(ledgers.length, 1);
});

test('C003: a failed gate restores every snapshot byte for byte', async () => {
  const directory = tempPackage({ 'RFC.md': '# RFC\n', 'Tickets.json': '{"phases":[]}\n' });
  const rfcBefore = fs.readFileSync(path.join(directory, 'RFC.md'));
  const ticketsBefore = fs.readFileSync(path.join(directory, 'Tickets.json'));

  const result = await runAmendment({
    cwd: directory,
    ticketKey: 'PX-400',
    artifact: 'rfc',
    operation: 'append',
    claim: BASE_CLAIM,
    dryRun: false,
    gateRunner: passingThenFailingRunner(),
  });

  assert.equal(result.outcome, 'rolled-back');
  assert.ok(fs.readFileSync(path.join(directory, 'RFC.md')).equals(rfcBefore));
  assert.ok(fs.readFileSync(path.join(directory, 'Tickets.json')).equals(ticketsBefore));
  assert.equal(fs.existsSync(path.join(directory, 'amendments')), false);
});

test('C009: a second identical amendment is a no-op with one ledger', async () => {
  const directory = tempPackage({ 'RFC.md': '# RFC\n' });
  const input = {
    cwd: directory,
    ticketKey: 'PX-400',
    artifact: 'rfc',
    operation: 'append',
    claim: BASE_CLAIM,
    dryRun: false,
    gateRunner: CLEAN_RUNNER,
  };

  const first = await runAmendment(input);
  const second = await runAmendment(input);

  assert.equal(first.outcome, 'promoted');
  assert.equal(second.noChange, true);
  assert.equal(fs.readdirSync(path.join(directory, 'amendments')).length, 1);
});

test('C001: a dry run writes nothing and reports the would-be outcome', async () => {
  const directory = tempPackage({ 'RFC.md': '# RFC\n' });
  const before = fs.readFileSync(path.join(directory, 'RFC.md'));

  const result = await runAmendment({
    cwd: directory,
    ticketKey: 'PX-400',
    artifact: 'rfc',
    operation: 'append',
    claim: BASE_CLAIM,
    gateRunner: CLEAN_RUNNER,
  });

  assert.equal(result.outcome, 'dry-run');
  assert.equal(result.wouldPromote, true);
  assert.equal(result.writes.length, 0);
  assert.ok(fs.readFileSync(path.join(directory, 'RFC.md')).equals(before));
});

test('C007: derived artifacts call the owner and perform no direct write', async () => {
  const directory = tempPackage({
    'RFC.md': '# RFC\n',
    'RFC-GRAPH.json': '{"nodes":[]}',
  });
  const calls = [];

  const result = await runAmendment({
    cwd: directory,
    ticketKey: 'PX-400',
    artifact: 'graph',
    operation: 'mutate',
    claim: BASE_CLAIM,
    dryRun: false,
    gateRunner: CLEAN_RUNNER,
    owners: { graphify: () => calls.push('graphify') },
  });

  assert.equal(result.outcome, 'promoted');
  assert.deepEqual(calls, ['graphify']);
  assert.deepEqual(result.directWrites, []);
});

test('C005: stage receipts are rebuilt from the owner RFC digest', async () => {
  const directory = tempPackage({
    'RFC.md': '# RFC\n',
    'RFC-GRAPH.json': '{"nodes":[]}',
    'RFC-Dirs-Tree.json': '{"trees":[]}',
    'Tickets.json': '{"phases":[]}',
    'RFC-GRAPHIFY-Status.json': '{"stage":"graphify"}',
    'RFC-BOUNDIFY-Status.json': '{"stage":"boundify"}',
    'RFC-SPLIT-Status.json': '{"stage":"split"}',
  });

  const result = rebuildStageReceipts({
    directory,
    rfcPath: path.join(directory, 'RFC.md'),
    graphPath: path.join(directory, 'RFC-GRAPH.json'),
    dirsTreePath: path.join(directory, 'RFC-Dirs-Tree.json'),
    ticketsPath: path.join(directory, 'Tickets.json'),
  });

  assert.equal(result.written, 3);
  const rfcDigest = digestFile(path.join(directory, 'RFC.md'));
  const graphify = JSON.parse(fs.readFileSync(path.join(directory, 'RFC-GRAPHIFY-Status.json'), 'utf8'));
  assert.equal(graphify.receipt.sourceDigest, rfcDigest);
  assert.equal(graphify.receipt.outputDigest, digestFile(path.join(directory, 'RFC-GRAPH.json')));
});

test('C005: the tree manifest source hash and self hash are rebuilt and reload-validated', async () => {
  const spec = '# Design\n\nClause.\n';
  const directory = tempPackage({
    'DESIGN.md': spec,
    'WORKSPACIFY-TREE-MANIFEST.json': JSON.stringify({
      artifact_kind: 'workspacify-tree-manifest',
      input: { spec_path: 'DESIGN.md' },
      integrity: {},
    }),
  });

  const manifest = await rebuildTreeManifestHashes({
    manifestPath: path.join(directory, 'WORKSPACIFY-TREE-MANIFEST.json'),
    specPath: path.join(directory, 'DESIGN.md'),
  });

  assert.equal(manifest.input.source_hash, createHash('sha256').update(spec).digest('hex'));
  assert.equal(manifest.integrity.reload_validation, 'PASS');
  assert.equal(typeof manifest.integrity.manifest_hash, 'string');
  assert.equal(manifest.integrity.manifest_hash.length, 64);
});

test('C005: rebuilding hashes twice over the same input yields the same digest', async () => {
  const directory = tempPackage({
    'DESIGN.md': '# Design\n',
    'WORKSPACIFY-TREE-MANIFEST.json': '{"input":{"spec_path":"DESIGN.md"},"integrity":{}}',
  });

  const first = await rebuildDesignHashes({ cwd: directory });
  const second = await rebuildDesignHashes({ cwd: directory });

  assert.equal(first.digest, second.digest);
});
