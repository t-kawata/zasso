// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
'use strict';

/**
 * CRUD tests for the candidate ledger.
 *
 * Covers C007 (fingerprint identity), create/list/show/update/delete,
 * and C011 (every failure is a repair finding with an action).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { REPO_ROOT, initRepoWithUpstream, baseCandidate } = require('./fixtures.cjs');

const cli = require(path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'scripts',
  'pickup-conver-update-candidates',
  'cli.js'
));
const store = require(path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'scripts',
  'pickup-conver-update-candidates',
  'store.js'
));

const CLI_PATH = path.join(REPO_ROOT, '.claude', 'scripts', 'pickup-conver-update-candidates', 'cli.js');

test('create assigns CUC-0001 then CUC-0002 and writes JSON and Markdown', () => {
  const { workspace } = initRepoWithUpstream();
  const first = cli.createCandidate({ workspace, candidate: baseCandidate() });
  assert.equal(first.ok, true);
  assert.equal(first.status, 'created');
  assert.equal(first.id, 'CUC-0001');

  const second = cli.createCandidate({
    workspace,
    candidate: baseCandidate({
      evidence: { ...baseCandidate().evidence, patch: '@@ -2 +2 @@\n-old\n+new' },
    }),
  });
  assert.equal(second.id, 'CUC-0002');

  const loaded = store.loadLedger(workspace);
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.ledger.candidates.map((candidate) => candidate.id), ['CUC-0001', 'CUC-0002']);
  assert.equal(fs.existsSync(store.ledgerPath(workspace)), true);
  assert.equal(fs.existsSync(store.markdownPath(workspace)), true);
  assert.ok(fs.readFileSync(store.markdownPath(workspace), 'utf8').includes('CUC-0001'));
});

test('C007 duplicate fingerprint returns skipped:duplicate and leaves the ledger unchanged', () => {
  const { workspace } = initRepoWithUpstream();
  assert.equal(cli.createCandidate({ workspace, candidate: baseCandidate() }).status, 'created');
  const before = fs.readFileSync(store.ledgerPath(workspace), 'utf8');

  const duplicate = cli.createCandidate({ workspace, candidate: baseCandidate() });

  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.status, 'skipped:duplicate');
  assert.equal(duplicate.id, 'CUC-0001');
  assert.equal(fs.readFileSync(store.ledgerPath(workspace), 'utf8'), before);
});

test('C007 a caller-supplied fingerprint is recomputed, never trusted', () => {
  const { workspace } = initRepoWithUpstream();
  const spoofed = baseCandidate({
    evidence: { ...baseCandidate().evidence, contentFingerprint: 'sha256:deadbeef' },
  });
  const created = cli.createCandidate({ workspace, candidate: spoofed });
  assert.equal(created.status, 'created');
  const stored = store.loadLedger(workspace).ledger.candidates[0];
  assert.notEqual(stored.evidence.contentFingerprint, 'sha256:deadbeef');
  assert.equal(stored.evidence.contentFingerprint.startsWith('sha256:'), true);
  assert.equal(stored.evidence.contentFingerprint.length, 71);
});

test('list filters by criterion, status, and impact, and sorts by impact then id', () => {
  const { workspace } = initRepoWithUpstream();
  const ledger = store.emptyLedger({
    workspace,
    claudeDir: path.join(workspace, '.claude'),
    upstreamRef: 'origin/main',
  });
  ledger.candidates = [
    { ...baseCandidate(), id: 'CUC-0001', primaryCriterion: 'safety', impact: 'low' },
    { ...baseCandidate(), id: 'CUC-0002', primaryCriterion: 'safety', impact: 'high' },
    { ...baseCandidate(), id: 'CUC-0003', primaryCriterion: 'correctness', impact: 'high' },
  ];
  assert.equal(store.saveLedger(workspace, ledger).ok, true);

  const all = cli.listCandidates({ workspace });
  assert.deepEqual(all.map((candidate) => candidate.id), ['CUC-0002', 'CUC-0003', 'CUC-0001']);
  assert.deepEqual(
    cli.listCandidates({ workspace, criterion: 'safety' }).map((candidate) => candidate.id),
    ['CUC-0002', 'CUC-0001']
  );
  assert.deepEqual(
    cli.listCandidates({ workspace, impact: 'high' }).map((candidate) => candidate.id),
    ['CUC-0002', 'CUC-0003']
  );
});

test('update accepts whitelisted fields, revalidates, and re-renders', () => {
  const { workspace } = initRepoWithUpstream();
  cli.createCandidate({ workspace, candidate: baseCandidate() });
  const updated = cli.updateCandidate({ workspace, id: 'CUC-0001', patch: { note: 'reviewed by upstream' } });
  assert.equal(updated.ok, true);
  assert.equal(updated.candidate.note, 'reviewed by upstream');
  assert.ok(fs.readFileSync(store.markdownPath(workspace), 'utf8').includes('reviewed by upstream'));
});

test('update rejects an unknown field and leaves the ledger unchanged', () => {
  const { workspace } = initRepoWithUpstream();
  cli.createCandidate({ workspace, candidate: baseCandidate() });
  const before = fs.readFileSync(store.ledgerPath(workspace), 'utf8');
  const result = cli.updateCandidate({ workspace, id: 'CUC-0001', patch: { contentFingerprint: 'sha256:bad' } });
  assert.equal(result.ok, false);
  assert.equal(fs.readFileSync(store.ledgerPath(workspace), 'utf8'), before);
});

test('update rejects an enum violation and leaves the ledger unchanged', () => {
  const { workspace } = initRepoWithUpstream();
  cli.createCandidate({ workspace, candidate: baseCandidate() });
  const before = fs.readFileSync(store.ledgerPath(workspace), 'utf8');
  const result = cli.updateCandidate({ workspace, id: 'CUC-0001', patch: { primaryCriterion: 'speed' } });
  assert.equal(result.ok, false);
  assert.equal(fs.readFileSync(store.ledgerPath(workspace), 'utf8'), before);
});

test('delete removes exactly the named id and re-renders the Markdown', () => {
  const { workspace } = initRepoWithUpstream();
  cli.createCandidate({ workspace, candidate: baseCandidate() });
  cli.createCandidate({
    workspace,
    candidate: baseCandidate({ evidence: { ...baseCandidate().evidence, patch: '@@ -3 +3 @@\n-old\n+new' } }),
  });
  assert.equal(cli.deleteCandidate({ workspace, id: 'CUC-0001' }).ok, true);
  const remaining = store.loadLedger(workspace).ledger.candidates;
  assert.deepEqual(remaining.map((candidate) => candidate.id), ['CUC-0002']);
  const markdown = fs.readFileSync(store.markdownPath(workspace), 'utf8');
  assert.equal(markdown.includes('### CUC-0001'), false);
  assert.ok(markdown.includes('### CUC-0002'));
});

test('show returns one candidate and rejects an unknown id', () => {
  const { workspace } = initRepoWithUpstream();
  cli.createCandidate({ workspace, candidate: baseCandidate() });
  assert.equal(cli.showCandidate({ workspace, id: 'CUC-0001' }).candidate.id, 'CUC-0001');
  assert.equal(cli.showCandidate({ workspace, id: 'CUC-9999' }).ok, false);
});

test('C011 a failed create prints a repair finding and no stack trace', () => {
  const { workspace } = initRepoWithUpstream();
  const bad = baseCandidate();
  delete bad.symptom;
  const badPath = path.join(workspace, 'bad-candidate.json');
  fs.writeFileSync(badPath, JSON.stringify(bad), 'utf8');

  const run = spawnSync(
    process.execPath,
    [CLI_PATH, 'create', '--workspace', workspace, '--candidate', badPath],
    { cwd: workspace, encoding: 'utf8' }
  );

  assert.equal(run.status, 1);
  for (const label of ['[ERROR]', 'Cause:', 'Artifact:', 'Field:', 'Action:', 'Verify:']) {
    assert.ok(run.stderr.includes(label), label);
  }
  assert.equal(run.stderr.includes('    at '), false);
  assert.equal(fs.existsSync(store.ledgerPath(workspace)), false);
});

test('C011 the CLI emits one JSON line when --json is passed', () => {
  const { workspace } = initRepoWithUpstream();
  const candidatePath = path.join(workspace, 'candidate.json');
  fs.writeFileSync(candidatePath, JSON.stringify(baseCandidate()), 'utf8');
  const run = spawnSync(
    process.execPath,
    [CLI_PATH, 'create', '--workspace', workspace, '--candidate', candidatePath, '--json'],
    { cwd: workspace, encoding: 'utf8' }
  );
  assert.equal(run.status, 0);
  const parsed = JSON.parse(run.stdout.trim());
  assert.equal(parsed.status, 'created');
  assert.equal(parsed.id, 'CUC-0001');
});
