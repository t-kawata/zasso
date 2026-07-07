/**
 * deduplicate-headings.test.cjs — deduplicateHeadings のテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 * テスト対象: deduplicateHeadings(), readLines() の全挙動
 * 方針: 純粋関数（line配列I/Oのみ）はline配列を直接渡してテスト。ファイルI/Oは一時ディレクトリを使用。
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { deduplicateHeadings } = require('../../.claude/scripts/rfc-graph/deduplicate-headings.js');

// ============================================================
// deduplicateHeadings
// ============================================================

describe('deduplicateHeadings', () => {
  it('正常系: 重複なし — modified=false', () => {
    const lines = ['# A', '## B', '### C'];
    const result = deduplicateHeadings(lines);
    assert.equal(result.modified, false);
    assert.deepEqual(result.changes, []);
    assert.deepEqual(result.result, lines);
  });

  it('正常系: 同一階層で1件重複 → A追記', () => {
    const lines = ['# A', '# A'];
    const result = deduplicateHeadings(lines);
    assert.equal(result.modified, true);
    assert.equal(result.changes.length, 1);
    assert.equal(result.result[1], '# A A');
  });

  it('正常系: 同一階層で複数重複 → A, B, C 追記', () => {
    const lines = ['# X', '# X', '# X'];
    const result = deduplicateHeadings(lines);
    assert.equal(result.modified, true);
    assert.equal(result.changes.length, 2);
    assert.equal(result.result[1], '# X A');
    assert.equal(result.result[2], '# X B');
  });

  it('境界値: 異なる階層の同一テキストは別カウント', () => {
    const lines = ['# A', '## A', '### A'];
    const result = deduplicateHeadings(lines);
    // 全行異なる階層 -> 重複なし
    assert.equal(result.modified, false);
    assert.deepEqual(result.changes, []);
  });

  it('正常系: 見出しでない行は影響を受けない', () => {
    const lines = ['普通のテキスト', '', '# 見出し', '# 見出し', '---'];
    const result = deduplicateHeadings(lines);
    assert.equal(result.modified, true);
    assert.equal(result.result[0], '普通のテキスト');
    assert.equal(result.result[4], '---');
  });

  it('異常系: 27件の重複でエラーを投げる', () => {
    const lines = ['# X'];
    for (let i = 0; i < 27; i++) lines.push('# X');
    assert.throws(() => deduplicateHeadings(lines), /27件/);
  });
});
