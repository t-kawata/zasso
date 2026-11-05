// PX-376 @verifies C005
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { LEGACY_CACHE_SCHEMA } from '../../.claude/scripts/conver/progress-gif/usage-cache.js';
import { recoverUsageLedger } from '../../.claude/scripts/conver/progress-gif/usage-recovery.js';

const CACHE_PATH = 'progress-gif/snapshots/usage-cache.json';

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function git(root, args) {
  return execFileSync('git', ['-C', root, '-c', 'user.name=PX-376', '-c', 'user.email=px376@example.test', ...args], { encoding: 'utf8' });
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function legacyPayload({ configDir, records }) {
  const file = path.join(configDir, 'projects', '-legacy-project', 'session.jsonl');
  return {
    schema: LEGACY_CACHE_SCHEMA,
    configDir,
    projectKey: '-legacy-project',
    updatedAt: '2026-10-05T00:00:00.000Z',
    models: ['deepseek-flash'],
    files: {
      [file]: {
        path: file,
        size: 100,
        mtimeMs: 100,
        ino: null,
        records: records.map(([key, output]) => [key, Date.parse('2026-10-05T12:00:00Z'), 0, 0, 0, output]),
      },
    },
  };
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function makeRepository(payloads) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-recovery-'));
  git(root, ['init', '--quiet']);
  for (const [index, payload] of payloads.entries()) {
    const file = path.join(root, CACHE_PATH);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof payload === 'string' ? payload : JSON.stringify(payload));
    git(root, ['add', CACHE_PATH]);
    git(root, ['commit', '--quiet', '-m', `revision ${index}`]);
  }
  return root;
}

test('C005 recovery unions every revision by identity and is idempotent', async () => {
  const repo = makeRepository([
    legacyPayload({ configDir: '/machine/a/.claude', records: [['a-1', 100]] }),
    legacyPayload({ configDir: '/machine/b/.claude', records: [['b-1', 200]] }),
    legacyPayload({ configDir: '/machine/a/.claude', records: [['a-1', 250]] }),
  ]);
  const outputPath = path.join(repo, 'recovered', 'usage-cache.json');

  const first = await recoverUsageLedger({ repoRoot: repo, filePath: CACHE_PATH, outputPath, write: true });

  assert.equal(first.records, 2);
  assert.equal(first.outputTokens, 450);
  assert.equal(first.revisions.length, 3);
  assert.equal(first.warnings.length, 0);

  const bytes = fs.readFileSync(outputPath, 'utf8');
  const second = await recoverUsageLedger({ repoRoot: repo, filePath: CACHE_PATH, outputPath, write: true });
  assert.equal(second.records, 2);
  assert.equal(fs.readFileSync(outputPath, 'utf8'), bytes);
});

test('C005 a corrupt revision is skipped with a warning and does not abort', async () => {
  const repo = makeRepository([
    legacyPayload({ configDir: '/machine/a/.claude', records: [['a-1', 100]] }),
    '{not json',
    legacyPayload({ configDir: '/machine/b/.claude', records: [['b-1', 200]] }),
  ]);
  const outputPath = path.join(repo, 'recovered', 'usage-cache.json');

  const result = await recoverUsageLedger({ repoRoot: repo, filePath: CACHE_PATH, outputPath, write: true });

  assert.equal(result.records, 2);
  assert.equal(result.outputTokens, 300);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /^\[recovery\]/);
});

test('C005 a repository with no cache history writes an empty ledger', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-recovery-empty-'));
  git(root, ['init', '--quiet']);
  fs.writeFileSync(path.join(root, 'README.md'), 'empty\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '--quiet', '-m', 'empty']);
  const outputPath = path.join(root, 'recovered', 'usage-cache.json');

  const result = await recoverUsageLedger({ repoRoot: root, filePath: CACHE_PATH, outputPath, write: true });

  assert.equal(result.records, 0);
  assert.equal(result.revisions.length, 0);
  assert.equal(fs.existsSync(outputPath), true);
});
