import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../okf-core/index.mjs';
import { writeDirectoryIndexes } from '../okf-core/authoring/index.mjs';
import { writeLog } from '../okf-core/authoring/log.mjs';
import { makeTree, removeTree, pageText, INDEX_TEXT, LOG_TEXT } from './helpers/tree.mjs';

const CLI = fileURLToPath(new URL('../scripts/cli.mjs', import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function buildBundle() {
  return makeTree({
    'index.md': INDEX_TEXT,
    'log.md': LOG_TEXT,
    'pages/one/index.md': '# one\n\n- [A](./a.md)\n- [B](./b.md)\n',
    'pages/one/a.md': pageText({
      title: 'A',
      body: '# A\n\nAlpha text.\n',
      extra: {
        sources: [{ resource: 'sources/doc.md', id: 'doc-1', title: 'Doc' }],
        'x-requires': ['pages/one/b'],
      },
    }),
    'pages/one/b.md': pageText({ title: 'B', body: '# B\n\nBeta text.\n' }),
  });
}

test('list prints the bundle entries', () => {
  const root = buildBundle();
  try {
    const result = run(['list', '--root', root]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /pages/);
  } finally {
    removeTree(root);
  }
});

test('show carries the one-hop payload and the traversal envelope', () => {
  const root = buildBundle();
  try {
    const result = run(['show', 'pages/one/a', '--root', root, '--format', 'json']);
    assert.equal(result.status, 0, result.stderr);
    const page = JSON.parse(result.stdout);
    for (const key of ['body', 'outgoing', 'incoming', 'sources', 'trustTier', 'freshness', 'protocol', 'coverage', 'frontier', 'guidance']) {
      assert.ok(Object.hasOwn(page, key), key);
    }
    assert.equal(page.protocol, 'okf-traversal/v1');
  } finally {
    removeTree(root);
  }
});

test('an absent id exits 2 and names candidates', () => {
  const root = buildBundle();
  try {
    const result = run(['show', 'pages/one/ghost', '--root', root]);
    assert.equal(result.status, 2);
    assert.match(`${result.stdout}${result.stderr}`, /unknown|candidate/i);
  } finally {
    removeTree(root);
  }
});

test('an unknown command exits 2 with a stable code', () => {
  const root = buildBundle();
  try {
    const result = run(['frobnicate', '--root', root]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /UNKNOWN_COMMAND/);
  } finally {
    removeTree(root);
  }
});

test('search prints deterministic rows', () => {
  const root = buildBundle();
  try {
    const first = run(['search', '--query', 'alpha', '--root', root, '--format', 'json']);
    const second = run(['search', '--query', 'alpha', '--root', root, '--format', 'json']);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout, second.stdout);
    assert.equal(JSON.parse(first.stdout).rows[0].id, 'pages/one/a');
  } finally {
    removeTree(root);
  }
});

test('over-budget context stops instead of truncating', () => {
  const root = buildBundle();
  try {
    const result = run(['context', '--entry', 'pages/one/a', '--budget', '1', '--root', root]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /BUDGET_EXCEEDED/);
    assert.equal(result.stdout, '');
  } finally {
    removeTree(root);
  }
});

test('rebuild is byte-identical until a reserved file is edited', async () => {
  const skill = mkdtempSync(join(tmpdir(), 'okf-skill-'));
  const okfRoot = join(skill, 'okf');
  mkdirSync(join(skill, 'source'), { recursive: true });
  const bundleSource = buildBundle();
  try {
    const bundle = await loadBundle(bundleSource);
    writeDirectoryIndexes({ bundle, outDir: okfRoot });
    writeLog({ outDir: okfRoot, entries: [{ date: '2026-01-01', text: 'Built.' }] });
    writeFileSync(join(skill, 'source/okf-log.json'), `${JSON.stringify({
      schema: 'okf-log/v1',
      entries: [{ date: '2026-01-01', text: 'Built.' }],
    }, null, 2)}\n`);
    const first = run(['rebuild', '--root', okfRoot]);
    assert.equal(first.status, 0, first.stderr);
    writeFileSync(join(okfRoot, 'index.md'), `${readFileSync(join(okfRoot, 'index.md'), 'utf8')}- [extra](./extra.md)\n`);
    const second = run(['rebuild', '--root', okfRoot]);
    assert.equal(second.status, 1);
    assert.match(second.stderr, /NON_DETERMINISTIC/);
  } finally {
    removeTree(bundleSource);
    rmSync(skill, { recursive: true, force: true });
  }
});
