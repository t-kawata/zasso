/**
 * step5-phase-nodes.test.cjs — Unit tests for show-phase-nodes.js
 *
 * Test framework: Node.js standard node:test + node:assert/strict
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
// Test data
// ============================================================

const SAMPLE_NODE_IDS = ['N0001', 'N0002'];

const SAMPLE_PHASE = {
  id: 0,
  name: 'Test Phase',
  summary: 'This is a test phase.',
  nodeIds: SAMPLE_NODE_IDS,
  tickets: [],
};

const SAMPLE_NODE_MARKDOWN = [
  '## N0001: Test Node 1\n\n**Type**: api_contract\n\nTest node 1.\n\n### Implementation file path\n\n```\nsrc/test/mod.rs\n```\n',
  '## N0002: Test Node 2\n\n**Type**: architecture\n\nTest node 2.\n\n### Implementation file path\n\n```\nsrc/test/core.rs\n```\n',
];

// ============================================================
// parseCliArguments
// ============================================================

describe('parseCliArguments', () => {
  it('parses all arguments correctly', () => {
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

  it('returns null on insufficient arguments', () => {
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
    { id: -1, name: 'Independent Phase', tickets: [] },
    { id: 0, name: 'Phase 0', tickets: [] },
    { id: 1, name: 'Phase 1', tickets: [] },
  ];

  it('resolves PX to independent phase (id=-1)', () => {
    const { phase, error } = resolvePhase(phases, 'PX');
    assert.notEqual(phase, null);
    assert.equal(phase.id, -1);
    assert.equal(error, null);
  });

  it('resolves phase with P{n} format', () => {
    const { phase, error } = resolvePhase(phases, 'P0');
    assert.notEqual(phase, null);
    assert.equal(phase.id, 0);
    assert.equal(error, null);
  });

  it('returns null for non-existent phase', () => {
    const { phase, error } = resolvePhase(phases, 'P999');
    assert.equal(phase, null);
    assert.notEqual(error, null);
  });

  it('returns error for invalid format', () => {
    const { phase, error } = resolvePhase(phases, 'invalid');
    assert.equal(phase, null);
    assert.ok(error.includes('Invalid phase format'));
  });
});

// ============================================================
// formatOutput
// ============================================================

describe('formatOutput', () => {
  it('outputs Markdown with phase name and summary', () => {
    const output = formatOutput(SAMPLE_PHASE, SAMPLE_NODE_IDS, SAMPLE_NODE_MARKDOWN, [null, null]);
    assert.ok(output.includes('# Phase P0: Test Phase'));
    assert.ok(output.includes('This is a test phase.'));
  });

  it('includes --- between nodes', () => {
    const output = formatOutput(SAMPLE_PHASE, SAMPLE_NODE_IDS, SAMPLE_NODE_MARKDOWN, [null, null]);
    assert.ok(output.includes('---'));
  });

  it('includes I/O boundary annotations', () => {
    const output = formatOutput(SAMPLE_PHASE, SAMPLE_NODE_IDS, SAMPLE_NODE_MARKDOWN, [null, null]);
    assert.ok(output.includes('安全な I/O 境界'));
    assert.ok(output.includes('チケットとは、1回の実装で安全に行えるノードの組み合わせです'));
  });

  it('includes details for each node', () => {
    const output = formatOutput(SAMPLE_PHASE, SAMPLE_NODE_IDS, SAMPLE_NODE_MARKDOWN, [null, null]);
    assert.ok(output.includes('N0001: Test Node 1'));
    assert.ok(output.includes('N0002: Test Node 2'));
    assert.ok(output.includes('src/test/mod.rs'));
    assert.ok(output.includes('src/test/core.rs'));
  });

  it('includes error messages when error nodes exist', () => {
    const errors = ['query.js execution failed', null];
    const output = formatOutput(SAMPLE_PHASE, SAMPLE_NODE_IDS, [null, SAMPLE_NODE_MARKDOWN[1]], errors);
    assert.ok(output.includes('エラーのためノード詳細を取得できませんでした'));
    assert.ok(output.includes('query.js execution failed'));
  });
});
