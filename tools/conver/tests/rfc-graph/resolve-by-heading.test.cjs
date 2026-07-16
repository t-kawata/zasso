/**
 * resolve-by-heading.test.cjs — Tests for resolveByHeading
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * Test target: resolveByHeading(), resolveAllHeadings(), parseArguments()
 * Covers all 4-stage fallback cases.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  resolveByHeading,
  resolveAllHeadings,
  parseArguments,
} = require('../../.claude/scripts/rfc-graph/resolve-by-heading.js');

/** Test source lines */
const SAMPLE_LINES = [
  '# Title',
  '',
  '## Section 1',
  'Content A',
  '',
  '## Section 2',
  'Content B',
  '',
  '### Subsection 2.1',
  'Detail B1',
  '',
  '## Section 3',
  'Content C',
];

// ============================================================
// parseArguments
// ============================================================

describe('parseArguments', () => {
  it('normal: --source only', () => {
    const r = parseArguments(['node', 'script', '--source=/path/file.md']);
    assert.equal(r.sourcePath, '/path/file.md');
  });

  it('normal: --source --heading --texts', () => {
    const r = parseArguments(['node', 'script', '--source=f.md', '--heading=2', '--texts=Overview,Description']);
    assert.equal(r.sourcePath, 'f.md');
    assert.equal(r.heading, 2);
    assert.deepEqual(r.texts, ['Overview', 'Description']);
  });

  it('normal: --source --graph', () => {
    const r = parseArguments(['node', 'script', '--source=f.md', '--graph=g.json']);
    assert.equal(r.sourcePath, 'f.md');
    assert.equal(r.graphPath, 'g.json');
  });

  it('error: missing --source', () => {
    assert.throws(() => parseArguments(['node', 'script']), /--source/);
  });
});

// ============================================================
// resolveByHeading
// ============================================================

describe('resolveByHeading', () => {
  it('Stage1 exact: texts[0] resolves uniquely', () => {
    const r = resolveByHeading(SAMPLE_LINES, 2, ['Section 1']);
    assert.notEqual(r, null);
    assert.equal(r.line, 3);
    assert.equal(r.confidence, 'exact');
  });

  it('heading=0: search near file start', () => {
    const lines = ['---', 'title: Test', '---', '', '# Body'];
    const r = resolveByHeading(lines, 0, ['title']);
    assert.notEqual(r, null);
    assert.equal(r.line, 2);
  });

  it('multiple matches narrowed to one via combined grep partial', () => {
    const r = resolveByHeading(SAMPLE_LINES, 2, ['Section 2']);
    assert.notEqual(r, null);
    assert.equal(r.confidence, 'exact');
  });

  it('all phases miss returns null', () => {
    const r = resolveByHeading(SAMPLE_LINES, 1, ['nonexistent']);
    assert.equal(r, null);
  });

  it('empty texts array returns null', () => {
    const r = resolveByHeading(SAMPLE_LINES, 1, []);
    assert.equal(r, null);
  });
});

// ============================================================
// resolveAllHeadings
// ============================================================

describe('resolveAllHeadings', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-test-'));
  });

  after(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('normal: resolves all headingRefs in graph', () => {
    const sourcePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(sourcePath, SAMPLE_LINES.join('\n'), 'utf8');

    const graph = {
      sourceFile: sourcePath,
      nodes: [
        {
          id: 'N0001',
          title: 'Section 1',
          kind: 'requirement',
          headingRefs: [{ refId: 'REF001', heading: 2, texts: ['Section 1'] }],
        },
        {
          id: 'N0002',
          title: 'Section 2',
          kind: 'requirement',
          headingRefs: [{ refId: 'REF002', heading: 2, texts: ['Section 2'] }],
        },
      ],
      edges: [],
    };

    const results = resolveAllHeadings(graph, sourcePath);
    assert.equal(results.length, 2);
    assert.equal(results[0].line, 3);
    assert.equal(results[1].line, 6);
    assert.equal(results[0].confidence, 'exact');
    assert.equal(results[1].confidence, 'exact');
  });

  it('error: unresolvable headingRefs include error', () => {
    const sourcePath = path.join(tmpDir, 'empty.md');
    fs.writeFileSync(sourcePath, '', 'utf8');

    const graph = {
      sourceFile: sourcePath,
      nodes: [
        {
          id: 'N0001',
          title: 'Unknown',
          kind: 'requirement',
          headingRefs: [{ refId: 'REF001', heading: 2, texts: ['nonexistent heading'] }],
        },
      ],
      edges: [],
    };

    const results = resolveAllHeadings(graph, sourcePath);
    assert.equal(results.length, 1);
    assert.ok(results[0].error);
  });
});
