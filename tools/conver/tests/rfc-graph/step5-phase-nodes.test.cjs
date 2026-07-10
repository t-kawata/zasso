/**
 * step5-phase-nodes.test.cjs — show-phase-nodes.js のユニットテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  parseCliArguments,
  resolvePhase,
  formatOutput,
} = require('../../.claude/scripts/rfc-graph/show-phase-nodes.js');

// ============================================================
// テスト用データ
// ============================================================

const SAMPLE_NODE_IDS = ['N0001', 'N0002'];

const SAMPLE_PHASE = {
  id: 0,
  name: 'テストフェーズ',
  summary: 'テスト用のフェーズです。',
  nodeIds: SAMPLE_NODE_IDS,
  tickets: [],
};

const SAMPLE_NODE_MARKDOWN = [
  '## N0001: テストノード1\n\n**種別**: api_contract\n\nテスト用ノード1です。\n\n### 実装先となるファイルパス\n\n```\nsrc/test/mod.rs\n```\n',
  '## N0002: テストノード2\n\n**種別**: architecture\n\nテスト用ノード2です。\n\n### 実装先となるファイルパス\n\n```\nsrc/test/core.rs\n```\n',
];

// ============================================================
// parseCliArguments
// ============================================================

describe('parseCliArguments', () => {
  it('すべての引数を正しくパースする', () => {
    const args = [
      '--tickets=/path/to/tickets.json',
      '--graph=/path/to/graph.json',
      '--dirs-tree=/path/to/dirs-tree.json',
      '--phase=P0',
    ];
    const result = parseCliArguments(args);
    assert.equal(result.ticketsPath, '/path/to/tickets.json');
    assert.equal(result.graphPath, '/path/to/graph.json');
    assert.equal(result.dirsTreePath, '/path/to/dirs-tree.json');
    assert.equal(result.phaseArg, 'P0');
  });

  it('引数が足りない場合は null を返す', () => {
    const result = parseCliArguments(['--tickets=/path/to/tickets.json']);
    assert.equal(result.graphPath, null);
    assert.equal(result.dirsTreePath, null);
    assert.equal(result.phaseArg, null);
  });
});

// ============================================================
// resolvePhase
// ============================================================

describe('resolvePhase', () => {
  const phases = [
    { id: -1, name: '独立フェーズ', tickets: [] },
    { id: 0, name: 'フェーズ0', tickets: [] },
    { id: 1, name: 'フェーズ1', tickets: [] },
  ];

  it('PX で独立フェーズ（id=-1）を解決する', () => {
    const { phase, error } = resolvePhase(phases, 'PX');
    assert.notEqual(phase, null);
    assert.equal(phase.id, -1);
    assert.equal(error, null);
  });

  it('P{n} 形式でフェーズを解決する', () => {
    const { phase, error } = resolvePhase(phases, 'P0');
    assert.notEqual(phase, null);
    assert.equal(phase.id, 0);
    assert.equal(error, null);
  });

  it('存在しないフェーズは null を返す', () => {
    const { phase, error } = resolvePhase(phases, 'P999');
    assert.equal(phase, null);
    assert.notEqual(error, null);
  });

  it('不正なフォーマットはエラーを返す', () => {
    const { phase, error } = resolvePhase(phases, 'invalid');
    assert.equal(phase, null);
    assert.ok(error.includes('Invalid phase format'));
  });
});

// ============================================================
// formatOutput
// ============================================================

describe('formatOutput', () => {
  it('フェーズ名とサマリーを含むMarkdownを出力する', () => {
    const output = formatOutput(SAMPLE_PHASE, SAMPLE_NODE_IDS, SAMPLE_NODE_MARKDOWN, [null, null]);
    assert.ok(output.includes('# Phase P0: テストフェーズ'));
    assert.ok(output.includes('テスト用のフェーズです。'));
  });

  it('ノード区切りに --- を含む', () => {
    const output = formatOutput(SAMPLE_PHASE, SAMPLE_NODE_IDS, SAMPLE_NODE_MARKDOWN, [null, null]);
    assert.ok(output.includes('---'));
  });

  it('I/O 境界の注釈を含む', () => {
    const output = formatOutput(SAMPLE_PHASE, SAMPLE_NODE_IDS, SAMPLE_NODE_MARKDOWN, [null, null]);
    assert.ok(output.includes('安全な I/O 境界'));
    assert.ok(output.includes('チケットとは、1回の実装で安全に行えるノードの組み合わせです'));
  });

  it('各ノードの詳細を含む', () => {
    const output = formatOutput(SAMPLE_PHASE, SAMPLE_NODE_IDS, SAMPLE_NODE_MARKDOWN, [null, null]);
    assert.ok(output.includes('N0001: テストノード1'));
    assert.ok(output.includes('N0002: テストノード2'));
    assert.ok(output.includes('src/test/mod.rs'));
    assert.ok(output.includes('src/test/core.rs'));
  });

  it('エラーノードがある場合もエラーメッセージを含む', () => {
    const errors = ['query.js execution failed', null];
    const output = formatOutput(SAMPLE_PHASE, SAMPLE_NODE_IDS, [null, SAMPLE_NODE_MARKDOWN[1]], errors);
    assert.ok(output.includes('エラーのためノード詳細を取得できませんでした'));
    assert.ok(output.includes('query.js execution failed'));
  });
});
