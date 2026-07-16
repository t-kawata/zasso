/**
 * deduplicate-headings.test.cjs — deduplicateHeadings unit tests
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * Target: full behavior of deduplicateHeadings(), readLines()
 * Policy: Pure functions (line array I/O only) are tested by passing
 *         line arrays directly. File I/O uses a temporary directory.
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
  it('normal: no duplicates — modified=false', () => {
    const lines = ['# A', '## B', '### C'];
    const result = deduplicateHeadings(lines);
    assert.equal(result.modified, false);
    assert.deepEqual(result.changes, []);
    assert.deepEqual(result.result, lines);
  });

  it('normal: one duplicate at same level appends A', () => {
    const lines = ['# A', '# A'];
    const result = deduplicateHeadings(lines);
    assert.equal(result.modified, true);
    assert.equal(result.changes.length, 1);
    assert.equal(result.result[1], '# A A');
  });

  it('normal: multiple duplicates at same level append A, B, C', () => {
    const lines = ['# X', '# X', '# X'];
    const result = deduplicateHeadings(lines);
    assert.equal(result.modified, true);
    assert.equal(result.changes.length, 2);
    assert.equal(result.result[1], '# X A');
    assert.equal(result.result[2], '# X B');
  });

  it('boundary: same text at different levels is counted separately', () => {
    const lines = ['# A', '## A', '### A'];
    const result = deduplicateHeadings(lines);
    // All lines are at different levels — no duplicates
    assert.equal(result.modified, false);
    assert.deepEqual(result.changes, []);
  });

  it('normal: non-heading lines are unaffected', () => {
    const lines = ['Normal text', '', '# Heading', '# Heading', '---'];
    const result = deduplicateHeadings(lines);
    assert.equal(result.modified, true);
    assert.equal(result.result[0], 'Normal text');
    assert.equal(result.result[4], '---');
  });

  it('error: throws on 27 duplicates', () => {
    const lines = ['# X'];
    for (let i = 0; i < 27; i++) lines.push('# X');
    assert.throws(() => deduplicateHeadings(lines), /27件/);
  });
});
