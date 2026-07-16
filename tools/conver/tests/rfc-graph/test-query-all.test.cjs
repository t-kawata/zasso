/**
 * test-query-all.test.cjs — Tests for test-query-all.js
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * Test targets: validateAllHeadingRefs, diagnoseBrokenRef, auxiliary diagnosis functions
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  parseArguments,
  loadGraphAndSource,
  validateAllHeadingRefs,
  diagnoseBrokenRef,
  collectHeadingLines,
  computeTokenMatchScore,
  isMutuallyExclusive,
  checkOtherHeadingLevels,
  buildHintsJson,
  formatSuccessMessage,
  formatErrorMessage,
  MAX_DETAIL_ENTRIES,
  SCORE_THRESHOLDS,
  DIAGNOSIS_LABELS,
  HINTS_OUTPUT_FILENAME,
} = require('../../.claude/scripts/rfc-graph/test-query-all.js');

/** Test source line array (same format as resolve-by-heading.test.cjs) */
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

/** Fully resolvable test graph */
const VALID_GRAPH = {
  nodes: [
    {
      id: 'N0001',
      title: 'Title Node',
      kind: 'overview',
      summary: 'Overview',
      slug: 'overview',
      headingRefs: [
        { refId: 'REF001', heading: 1, texts: ['Title'] },
        { refId: 'REF002', heading: 2, texts: ['Section 1'] },
      ],
    },
    {
      id: 'N0002',
      title: 'Subsection',
      kind: 'detail',
      summary: 'Details',
      slug: 'detail',
      headingRefs: [
        { refId: 'REF003', heading: 3, texts: ['Subsection 2.1'] },
      ],
    },
  ],
};

/** Partially unresolvable test graph */
const BROKEN_GRAPH = {
  nodes: [
    {
      id: 'N0001',
      title: 'Normal Node',
      kind: 'overview',
      summary: 'Overview',
      slug: 'overview',
      headingRefs: [
        { refId: 'REF001', heading: 2, texts: ['Section 1'] },
      ],
    },
    {
      id: 'N0002',
      title: 'Broken Node',
      kind: 'detail',
      summary: 'Details',
      slug: 'detail',
      headingRefs: [
        { refId: 'REF002', heading: 2, texts: ['Non-existent Heading'] },
      ],
    },
  ],
};

/** Fully unresolvable test graph (26 broken entries) */
function buildAllBrokenGraph(count) {
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const nodeId = `N${String(i + 1).padStart(4, '0')}`;
    nodes.push({
      id: nodeId,
      title: `Node ${i + 1}`,
      kind: 'detail',
      summary: 'Details',
      slug: `node${i + 1}`,
      headingRefs: [
        { refId: `REF${String(i * 3 + 1).padStart(3, '0')}`, heading: 5, texts: [`Non-existent ${i + 1}`] },
      ],
    });
  }
  return { nodes };
}

/** Deduplication test graph */
const DUPLICATE_GRAPH = {
  nodes: [
    {
      id: 'N0001',
      title: 'Duplicate Test',
      kind: 'detail',
      summary: 'Details',
      slug: 'duplicate',
      headingRefs: [
        { refId: 'REF001', heading: 2, texts: ['Non-existent'] },
        { refId: 'REF001', heading: 2, texts: ['Non-existent'] }, // Same refId duplicate
        { refId: 'REF002', heading: 2, texts: ['Another Missing'] },
      ],
    },
  ],
};

// ============================================================
// parseArguments
// ============================================================

describe('parseArguments', () => {
  it('parses --graph + --source correctly', () => {
    const r = parseArguments(['node', 'script', '--graph=g.json', '--source=s.md']);
    assert.equal(r.graphPath, 'g.json');
    assert.equal(r.sourcePath, 's.md');
  });

  it('throws with --graph only', () => {
    assert.throws(() => parseArguments(['node', 'script', '--graph=g.json']), /--source/);
  });

  it('throws with --source only', () => {
    assert.throws(() => parseArguments(['node', 'script', '--source=s.md']), /--graph/);
  });

  it('parses --help correctly', () => {
    const r = parseArguments(['node', 'script', '--help']);
    assert.equal(r.help, true);
  });

  it('throws with no arguments', () => {
    assert.throws(() => parseArguments(['node', 'script']), /--graph/);
  });
});

// ============================================================
// collectHeadingLines
// ============================================================

describe('collectHeadingLines', () => {
  it('collects 3 h2 heading lines', () => {
    const lines = collectHeadingLines(SAMPLE_LINES, 2);
    assert.equal(lines.length, 3);
    assert.equal(lines[0].text, '## Section 1');
  });

  it('collects 1 h1 heading line', () => {
    const lines = collectHeadingLines(SAMPLE_LINES, 1);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].text, '# Title');
  });

  it('returns 0 lines for non-existent heading level h5', () => {
    const lines = collectHeadingLines(SAMPLE_LINES, 5);
    assert.equal(lines.length, 0);
  });
});

// ============================================================
// computeTokenMatchScore
// ============================================================

describe('computeTokenMatchScore', () => {
  it('all tokens match: 100%', () => {
    const score = computeTokenMatchScore(['Section', '1'], '## Section 1');
    assert.equal(score, 100);
  });

  it('half match: 50%', () => {
    const score = computeTokenMatchScore(['Section', 'Non-existent'], '## Section 1');
    assert.equal(score, 50);
  });

  it('no match: 0%', () => {
    const score = computeTokenMatchScore(['Non-existent', 'Something Else'], '## Section 1');
    assert.equal(score, 0);
  });

  it('empty array: 0%', () => {
    const score = computeTokenMatchScore([], '## Section 1');
    assert.equal(score, 0);
  });
});

// ============================================================
// isMutuallyExclusive
// ============================================================

describe('isMutuallyExclusive', () => {
  it('tokens on same line: false', () => {
    const lines = collectHeadingLines(SAMPLE_LINES, 2);
    const result = isMutuallyExclusive(['Section', '1'], lines);
    assert.equal(result, false);
  });

  it('tokens on different lines: true (M9)', () => {
    const lines = collectHeadingLines(SAMPLE_LINES, 2);
    // 'Section 1' and 'Section 3' are on different lines
    const result = isMutuallyExclusive(['Section 1', 'Section 3'], lines);
    assert.equal(result, true);
  });

  it('single token: false', () => {
    const lines = collectHeadingLines(SAMPLE_LINES, 2);
    const result = isMutuallyExclusive(['Section 1'], lines);
    assert.equal(result, false);
  });

  it('includes non-matching tokens: false', () => {
    const lines = collectHeadingLines(SAMPLE_LINES, 2);
    const result = isMutuallyExclusive(['Non-existent', 'Something Else'], lines);
    assert.equal(result, false);
  });
});

// ============================================================
// checkOtherHeadingLevels
// ============================================================

describe('checkOtherHeadingLevels', () => {
  it('returns alternative level when it has a higher score', () => {
    // Searching for 'Subsection 2.1' at h1 → h3 has 100% match
    const result = checkOtherHeadingLevels(SAMPLE_LINES, 1, ['Subsection 2.1']);
    assert.notEqual(result, null);
    assert.equal(result.level, 3);
    assert.equal(result.score, 100);
  });

  it('returns null when no other level has a higher score', () => {
    const result = checkOtherHeadingLevels(SAMPLE_LINES, 2, ['Section 1']);
    // h2 is the most appropriate
    assert.equal(result, null);
  });
});

// ============================================================
// diagnoseBrokenRef
// ============================================================

describe('diagnoseBrokenRef', () => {
  it('M1: no tokens match (0%)', () => {
    const result = diagnoseBrokenRef(SAMPLE_LINES, { heading: 2, texts: ['Non-existent Heading'] });
    assert.equal(result.diagnosis, DIAGNOSIS_LABELS.M1);
    assert.equal(result.score, 0);
  });

  it('M2: only 1 token matches (1-25%)', () => {
    // 4 tokens, only 1 matches = 25%
    const result = diagnoseBrokenRef(SAMPLE_LINES, { heading: 2, texts: ['Section', 'X', 'Y', 'Z'] });
    assert.equal(result.diagnosis, DIAGNOSIS_LABELS.M2);
    assert.ok(result.score <= 25);
    assert.ok(result.score > 0);
  });

  it('M8: different heading level has higher score', () => {
    // Searching for 'Subsection 2.1' at h1 → h3 is more appropriate
    const result = diagnoseBrokenRef(SAMPLE_LINES, { heading: 1, texts: ['Subsection 2.1'] });
    assert.equal(result.diagnosis, DIAGNOSIS_LABELS.M8);
  });

  it('M9: tokens cannot coexist', () => {
    const result = diagnoseBrokenRef(SAMPLE_LINES, { heading: 2, texts: ['Section 1', 'Section 3'] });
    assert.equal(result.diagnosis, DIAGNOSIS_LABELS.M9);
  });

  it('M0: 0 lines for specified heading level', () => {
    const result = diagnoseBrokenRef(SAMPLE_LINES, { heading: 7, texts: ['Something'] });
    assert.equal(result.diagnosis, DIAGNOSIS_LABELS.M0);
  });
});

// ============================================================
// validateAllHeadingRefs
// ============================================================

describe('validateAllHeadingRefs', () => {
  it('all headingRefs resolvable: 0 broken', () => {
    const { broken, totalRefs } = validateAllHeadingRefs(VALID_GRAPH, SAMPLE_LINES);
    assert.equal(broken.length, 0);
    assert.equal(totalRefs, 3);
  });

  it('partial resolution failure: 1 broken', () => {
    const { broken, totalRefs } = validateAllHeadingRefs(BROKEN_GRAPH, SAMPLE_LINES);
    assert.equal(broken.length, 1);
    assert.equal(totalRefs, 2);
    assert.equal(broken[0].nodeId, 'N0002');
  });

  it('all headingRefs unresolvable: all broken', () => {
    const graph = buildAllBrokenGraph(3);
    const { broken, totalRefs } = validateAllHeadingRefs(graph, SAMPLE_LINES);
    assert.equal(broken.length, 3);
    assert.equal(totalRefs, 3);
  });

  it('deduplication: same nodeId + same refId merges into 1 entry', () => {
    const { broken } = validateAllHeadingRefs(DUPLICATE_GRAPH, SAMPLE_LINES);
    // REF001 is duplicated so it merges into 1, REF002 is separate
    assert.equal(broken.length, 2);
  });
});

// ============================================================
// buildHintsJson / formatSuccessMessage / formatErrorMessage
// ============================================================

describe('buildHintsJson', () => {
  it('hints JSON has correct structure', () => {
    const { broken } = validateAllHeadingRefs(BROKEN_GRAPH, SAMPLE_LINES);
    const hints = buildHintsJson(broken);
    assert.ok(hints.generatedAt);
    assert.equal(hints.totalBroken, 1);
    assert.equal(hints.uniqueBroken, 1);
    assert.equal(hints.nodes.length, 1);
    assert.ok(hints.nodes[0].nodeId);
    assert.ok(hints.nodes[0].diagnosis);
    assert.ok(hints.nodes[0].details);
  });

  it('works correctly with 0 broken entries', () => {
    const hints = buildHintsJson([]);
    assert.equal(hints.totalBroken, 0);
    assert.equal(hints.nodes.length, 0);
  });
});

describe('formatSuccessMessage', () => {
  it('generates success message', () => {
    const msg = formatSuccessMessage(5);
    assert.ok(msg.includes('5'));
    assert.ok(msg.includes('正常解決'));
  });
});

describe('formatErrorMessage', () => {
  it('generates error message for 1 broken entry', () => {
    const { broken } = validateAllHeadingRefs(BROKEN_GRAPH, SAMPLE_LINES);
    const msg = formatErrorMessage(broken);
    assert.ok(msg.includes('N0002'));
    assert.ok(msg.includes(DIAGNOSIS_LABELS.M1));
  });

  it('shows all details for 25 or fewer entries', () => {
    const graph = buildAllBrokenGraph(5);
    const { broken } = validateAllHeadingRefs(graph, SAMPLE_LINES);
    const msg = formatErrorMessage(broken);
    assert.ok(!msg.includes('その他'));
  });

  it('shows 25 details + remaining count for 26+ entries', () => {
    const graph = buildAllBrokenGraph(26);
    const { broken } = validateAllHeadingRefs(graph, SAMPLE_LINES);
    const msg = formatErrorMessage(broken);
    assert.ok(msg.includes('その他 1 件'));
  });
});

// ============================================================
// MAX_DETAIL_ENTRIES — constant check
// ============================================================

describe('Constants', () => {
  it('MAX_DETAIL_ENTRIES is 25', () => {
    assert.equal(MAX_DETAIL_ENTRIES, 25);
  });

  it('HINTS_OUTPUT_FILENAME is _fix_graph_hints.json', () => {
    assert.equal(HINTS_OUTPUT_FILENAME, '_fix_graph_hints.json');
  });
});

// ============================================================
// loadGraphAndSource — actual file I/O
// ============================================================

describe('loadGraphAndSource', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tqa-test-'));
    fs.writeFileSync(path.join(tmpDir, 'test.json'), JSON.stringify(VALID_GRAPH));
    fs.writeFileSync(path.join(tmpDir, 'test.md'), SAMPLE_LINES.join('\n'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads files successfully', () => {
    const { graph, sourceLines } = loadGraphAndSource(
      path.join(tmpDir, 'test.json'),
      path.join(tmpDir, 'test.md')
    );
    assert.equal(graph.nodes.length, 2);
    assert.equal(sourceLines.length, SAMPLE_LINES.length);
  });

  it('throws on non-existent file path', () => {
    assert.throws(() => loadGraphAndSource('/nonexistent/file.json', '/nonexistent/file.md'));
  });
});
