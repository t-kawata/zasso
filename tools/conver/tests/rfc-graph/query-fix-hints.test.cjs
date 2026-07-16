/**
 * query-fix-hints.test.cjs — Tests for query-fix-hints.js
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * Test target: filterEntries, formatAsMarkdown, parseArguments
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  parseArguments,
  loadHintsFile,
  filterEntries,
  formatAsMarkdown,
} = require('../../.claude/scripts/rfc-graph/query-fix-hints.js');

/** Test _fix_graph_hints.json data */
const SAMPLE_HINTS = {
  generatedAt: '2026-07-08T12:00:00.000Z',
  totalBroken: 4,
  uniqueBroken: 4,
  nodes: [
    {
      nodeId: 'N0001',
      nodeTitle: 'Overview Node',
      refId: 'REF001',
      diagnosis: 'M1',
      score: 0,
      heading: 2,
      texts: ['Non-existent heading'],
      details: {
        tokenMatches: [
          { token: 'Non-existent heading', matched: false, matchCount: 0 },
        ],
        candidateLines: [
          { line: 3, text: '## Section 1', score: 0 },
        ],
      },
      summary: 'No tokens matched.',
      remedyHint: 'headingRefs are completely different. The source headings may have been renamed.',
      remedyCommand: 'crud.js update --graph=<g> --source=<s> --id=N0001 --updateHeadingRefs',
    },
    {
      nodeId: 'N0002',
      nodeTitle: 'Detail Node',
      refId: 'REF002',
      diagnosis: 'M5',
      score: 75,
      heading: 2,
      texts: ['Section', '1', 'Title'],
      details: {
        tokenMatches: [
          { token: 'Section', matched: true, matchCount: 3 },
          { token: '1', matched: true, matchCount: 1 },
          { token: 'Title', matched: false, matchCount: 0 },
        ],
        candidateLines: [
          { line: 3, text: '## Section 1', score: 67 },
          { line: 7, text: '## Section 2', score: 33 },
        ],
      },
      summary: 'Almost matched (1 token missing).',
      remedyHint: 'Possible minor notation inconsistency.',
      remedyCommand: 'crud.js update --graph=<g> --source=<s> --id=N0002 --updateHeadingRefs',
    },
    {
      nodeId: 'N0100',
      nodeTitle: 'Another Node',
      refId: 'REF101',
      diagnosis: 'M8',
      score: 50,
      heading: 1,
      texts: ['Subsection 2.1'],
      details: {
        tokenMatches: [
          { token: 'Subsection 2.1', matched: false, matchCount: 0 },
        ],
        candidateLines: [
          { line: 9, text: '### Subsection 2.1', score: 100 },
        ],
      },
      summary: 'A different heading level is more appropriate.',
      remedyHint: 'Heading level is incorrect. h3 may be correct.',
      remedyCommand: 'crud.js update --graph=<g> --source=<s> --id=N0100 --heading=3',
    },
    {
      nodeId: 'N0101',
      nodeTitle: 'Coexistence Impossible Node',
      refId: 'REF102',
      diagnosis: 'M9',
      score: 0,
      heading: 2,
      texts: ['Section 1', 'Section 3'],
      details: {
        tokenMatches: [
          { token: 'Section 1', matched: false, matchCount: 1 },
          { token: 'Section 3', matched: false, matchCount: 1 },
        ],
        candidateLines: [
          { line: 3, text: '## Section 1', score: 50 },
          { line: 12, text: '## Section 3', score: 50 },
        ],
      },
      summary: 'Tokens cannot coexist.',
      remedyHint: 'Tokens from multiple sections are mixed in one headingRef.',
      remedyCommand: 'crud.js update --graph=<g> --source=<s> --id=N0101 --splitHeadingRefs',
    },
  ],
};

/** Empty hints data */
const EMPTY_HINTS = {
  generatedAt: '2026-07-08T12:00:00.000Z',
  totalBroken: 0,
  uniqueBroken: 0,
  nodes: [],
};

// ============================================================
// parseArguments
// ============================================================

describe('parseArguments', () => {
  it('should parse --hints only', () => {
    const r = parseArguments(['node', 'script', '--hints=hints.json']);
    assert.equal(r.hintsPath, 'hints.json');
    assert.equal(r.idFilter, null);
    assert.equal(r.diagnosisFilter, null);
    assert.equal(r.refIdFilter, null);
  });

  it('should parse all filter options', () => {
    const r = parseArguments(['node', 'script', '--hints=h.json', '--id=N0100', '--diagnosis=M1', '--refId=REF101']);
    assert.equal(r.hintsPath, 'h.json');
    assert.equal(r.idFilter, 'N0100');
    assert.equal(r.diagnosisFilter, 'M1');
    assert.equal(r.refIdFilter, 'REF101');
  });

  it('should recognize --help', () => {
    const r = parseArguments(['node', 'script', '--help']);
    assert.equal(r.help, true);
  });

  it('should throw when --hints is missing', () => {
    assert.throws(() => parseArguments(['node', 'script', '--id=N0100']), /--hints/);
  });
});

// ============================================================
// filterEntries
// ============================================================

describe('filterEntries', () => {
  it('should return all entries without filters', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: null, diagnosisFilter: null, refIdFilter: null });
    assert.equal(entries.length, 4);
  });

  it('should filter by --id=N0100', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: 'N0100', diagnosisFilter: null, refIdFilter: null });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].nodeId, 'N0100');
  });

  it('should filter by --diagnosis=M1', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: null, diagnosisFilter: 'M1', refIdFilter: null });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].diagnosis, 'M1');
  });

  it('should filter by --refId=REF101', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: null, diagnosisFilter: null, refIdFilter: 'REF101' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].refId, 'REF101');
  });

  it('should return 0 entries for non-existent ID', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: 'N9999', diagnosisFilter: null, refIdFilter: null });
    assert.equal(entries.length, 0);
  });

  it('should combine multiple filters (AND)', () => {
    // M9 + N0101 → 1 entry
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: 'N0101', diagnosisFilter: 'M9', refIdFilter: null });
    assert.equal(entries.length, 1);
  });
});

// ============================================================
// formatAsMarkdown
// ============================================================

describe('formatAsMarkdown', () => {
  it('should format all entries as Markdown', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: null, diagnosisFilter: null, refIdFilter: null });
    const md = formatAsMarkdown(entries, SAMPLE_HINTS);
    assert.ok(md.includes('# Fix Graph Hints'));
    assert.ok(md.includes('N0001'));
    assert.ok(md.includes('N0002'));
    assert.ok(md.includes('N0100'));
    assert.ok(md.includes('N0101'));
    // Each entry's diagnosis info should be included
    assert.ok(md.includes(DIAGNOSIS_MARKERS.M1));
    assert.ok(md.includes(DIAGNOSIS_MARKERS.M5));
    assert.ok(md.includes(DIAGNOSIS_MARKERS.M8));
    assert.ok(md.includes(DIAGNOSIS_MARKERS.M9));
  });

  it('should format filtered entries (--id=N0100)', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: 'N0100', diagnosisFilter: null, refIdFilter: null });
    const md = formatAsMarkdown(entries, SAMPLE_HINTS);
    assert.ok(md.includes('N0100'));
    assert.ok(!md.includes('N0001'));
  });

  it('should format filtered entries (--diagnosis=M1)', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: null, diagnosisFilter: 'M1', refIdFilter: null });
    const md = formatAsMarkdown(entries, SAMPLE_HINTS);
    assert.ok(md.includes('REF001'));
    assert.ok(!md.includes('REF002'));
  });

  it('should format filtered entries (--refId=REF101)', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: null, diagnosisFilter: null, refIdFilter: 'REF101' });
    const md = formatAsMarkdown(entries, SAMPLE_HINTS);
    assert.ok(md.includes('REF101'));
    assert.ok(!md.includes('REF001'));
  });

  it('should show empty-message for empty hints', () => {
    const entries = filterEntries(EMPTY_HINTS, { idFilter: null, diagnosisFilter: null, refIdFilter: null });
    const md = formatAsMarkdown(entries, EMPTY_HINTS);
    assert.equal(md, '該当するエントリがありません。');
  });

  it('should include token match status table in Markdown', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: 'N0001', diagnosisFilter: null, refIdFilter: null });
    const md = formatAsMarkdown(entries, SAMPLE_HINTS);
    assert.ok(md.includes('### トークン別一致状況'));
    assert.ok(md.includes('Non-existent heading'));
  });

  it('should include candidate heading lines table in Markdown', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: 'N0001', diagnosisFilter: null, refIdFilter: null });
    const md = formatAsMarkdown(entries, SAMPLE_HINTS);
    assert.ok(md.includes('### 候補見出し行'));
    assert.ok(md.includes('Section 1'));
  });

  it('should include fix command in Markdown', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: 'N0100', diagnosisFilter: null, refIdFilter: null });
    const md = formatAsMarkdown(entries, SAMPLE_HINTS);
    assert.ok(md.includes('```bash'));
    assert.ok(md.includes('--heading=3'));
  });
});

/** Diagnosis label markers (for checking presence in MD output) */
const DIAGNOSIS_MARKERS = {
  M1: 'M1:',
  M5: 'M5:',
  M8: 'M8:',
  M9: 'M9:',
};

// ============================================================
// loadHintsFile — actual file I/O
// ============================================================

describe('loadHintsFile', () => {
  let tmpDir;
  let hintsPath;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qfh-test-'));
    hintsPath = path.join(tmpDir, 'hints.json');
    fs.writeFileSync(hintsPath, JSON.stringify(SAMPLE_HINTS));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should load JSON file successfully', () => {
    const data = loadHintsFile(hintsPath);
    assert.equal(data.totalBroken, 4);
    assert.equal(data.nodes.length, 4);
  });

  it('should throw ENOENT for non-existent file', () => {
    assert.throws(() => loadHintsFile('/nonexistent/hints.json'));
  });

  it('should throw SyntaxError for invalid JSON', () => {
    const badPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(badPath, '{broken json');
    assert.throws(() => loadHintsFile(badPath));
  });
});
