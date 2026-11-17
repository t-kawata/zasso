import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBundle } from '../okf-core/index.mjs';
import { writeDirectoryIndexes } from '../okf-core/authoring/index.mjs';
import { writeLog } from '../okf-core/authoring/log.mjs';
import { makeTree, removeTree, pageText, INDEX_TEXT, LOG_TEXT } from './helpers/tree.mjs';

function buildFixture() {
  return makeTree({
    'index.md': INDEX_TEXT,
    'log.md': LOG_TEXT,
    'pages/one/a.md': pageText({ title: 'A', body: '# A\n' }),
    'pages/one/b.md': pageText({ title: 'B', body: '# B\n' }),
  });
}

test('directory indexes list child directories before concepts', async () => {
  const root = buildFixture();
  const out = mkdtempSync(join(tmpdir(), 'okf-out-'));
  try {
    const bundle = await loadBundle(root);
    writeDirectoryIndexes({ bundle, outDir: out });
    const index = readFileSync(join(out, 'index.md'), 'utf8');
    assert.equal(index, '# Knowledge\n\n- [pages](./pages/index.md)\n');
    const pageIndex = readFileSync(join(out, 'pages/one/index.md'), 'utf8');
    assert.equal(pageIndex, '# one\n\n- [A](./a.md)\n- [B](./b.md)\n');
  } finally {
    removeTree(root);
    rmSync(out, { recursive: true, force: true });
  }
});

test('writing the same model twice is byte-identical', async () => {
  const root = buildFixture();
  const first = mkdtempSync(join(tmpdir(), 'okf-out-'));
  const second = mkdtempSync(join(tmpdir(), 'okf-out-'));
  try {
    const bundle = await loadBundle(root);
    writeDirectoryIndexes({ bundle, outDir: first });
    writeDirectoryIndexes({ bundle, outDir: second });
    for (const relativePath of ['index.md', 'pages/one/index.md']) {
      assert.equal(
        readFileSync(join(first, relativePath), 'utf8'),
        readFileSync(join(second, relativePath), 'utf8'),
      );
    }
  } finally {
    removeTree(root);
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});

test('the log is newest first and rejects a malformed date', () => {
  const out = mkdtempSync(join(tmpdir(), 'okf-log-'));
  try {
    writeLog({ outDir: out, entries: [
      { date: '2026-01-01', text: 'First.' },
      { date: '2026-02-01', text: 'Second.' },
    ] });
    assert.equal(readFileSync(join(out, 'log.md'), 'utf8'), '# Knowledge Log\n\n## 2026-02-01\n- Second.\n\n## 2026-01-01\n- First.\n');
    assert.throws(() => writeLog({ outDir: out, entries: [{ date: 'January', text: 'Bad.' }] }), /invalid log date/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
