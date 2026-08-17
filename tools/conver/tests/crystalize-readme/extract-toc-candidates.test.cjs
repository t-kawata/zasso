/**
 * extract-toc-candidates.test.cjs — Tests for extract-toc-candidates.js
 *
 * Extracts heading candidates [{level, title}] from graph nodes in document
 * order. Level comes from headingRefs[0].heading, defaulting to 2.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const SCRIPT = require.resolve('../../.claude/scripts/crystalize-readme/extract-toc-candidates.js');
const { extractTocCandidates } = require(SCRIPT);

describe('extractTocCandidates', () => {
  it('extracts candidates in document order with level from headingRefs', () => {
    const graph = {
      sourceFile: '/tmp/rfc/RFC-ROOT.md',
      mainLanguage: 'rust',
      nodes: [
        { id: 'N0001', title: 'Overview', kind: 'requirement', summary: 's', headingRefs: [{ refId: 'REF001', heading: 2, texts: ['Overview'] }], slug: 'n0001' },
        { id: 'N0002', title: 'Usage', kind: 'api_contract', summary: 's', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['Usage'] }], slug: 'n0002' },
      ],
      edges: [],
    };
    const candidates = extractTocCandidates(graph);
    assert.deepEqual(candidates, [
      { level: 2, title: 'Overview' },
      { level: 2, title: 'Usage' },
    ]);
  });

  it('defaults the level to 2 when headingRefs is empty', () => {
    const graph = {
      sourceFile: '/tmp/rfc/RFC-ROOT.md',
      mainLanguage: 'rust',
      nodes: [{ id: 'N0001', title: 'Overview', kind: 'requirement', summary: 's', headingRefs: [], slug: 'n0001' }],
      edges: [],
    };
    const candidates = extractTocCandidates(graph);
    assert.equal(candidates[0].level, 2);
  });

  it('returns [] for an empty graph', () => {
    const graph = { sourceFile: '/tmp/rfc/RFC-ROOT.md', mainLanguage: 'rust', nodes: [], edges: [] };
    assert.deepEqual(extractTocCandidates(graph), []);
  });

  it('returns exactly one candidate for a single-node graph', () => {
    const graph = {
      sourceFile: '/tmp/rfc/RFC-ROOT.md',
      mainLanguage: 'rust',
      nodes: [{ id: 'N0001', title: 'Only', kind: 'glossary', summary: 's', headingRefs: [{ refId: 'REF001', heading: 3, texts: ['Only'] }], slug: 'n0001' }],
      edges: [],
    };
    const candidates = extractTocCandidates(graph);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].level, 3);
  });

  it('skips nodes with an empty title', () => {
    const graph = {
      sourceFile: '/tmp/rfc/RFC-ROOT.md',
      mainLanguage: 'rust',
      nodes: [
        { id: 'N0001', title: '', kind: 'requirement', summary: 's', headingRefs: [], slug: 'n0001' },
        { id: 'N0002', title: 'Kept', kind: 'requirement', summary: 's', headingRefs: [], slug: 'n0002' },
      ],
      edges: [],
    };
    const candidates = extractTocCandidates(graph);
    assert.deepEqual(candidates, [{ level: 2, title: 'Kept' }]);
  });
});
