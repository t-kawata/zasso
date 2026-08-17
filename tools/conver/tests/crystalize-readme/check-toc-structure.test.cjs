/**
 * check-toc-structure.test.cjs — Tests for check-toc-structure.js (Contract C003)
 *
 * C003-Pre: input shape is { toc: [{level,title}], expectedSections?: [...] }.
 * C003-Post: { ok, violations:[{type,heading,detail}] } — violations non-empty iff ok=false.
 * C003-Inv: any accepted TOC ends with 'examples (implementation samples) spec and design'.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const SCRIPT = require.resolve('../../.claude/scripts/crystalize-readme/check-toc-structure.js');
const { checkTocStructure, TRAILING_SECTION_TITLE } = require(SCRIPT);

const VALID_TOC = [
  { level: 1, title: 'Overview' },
  { level: 2, title: 'Usage' },
  { level: 2, title: 'Examples (implementation samples) spec and design' },
];

describe('checkTocStructure — C003', () => {
  it('passes a valid TOC with a trailing examples section (C003-Post)', () => {
    const result = checkTocStructure({ toc: VALID_TOC, expectedSections: ['Overview', 'Usage'] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.violations, []);
  });

  it('flags duplicate headings', () => {
    const toc = [
      { level: 1, title: 'Overview' },
      { level: 1, title: 'Overview' },
      { level: 2, title: 'Examples (implementation samples) spec and design' },
    ];
    const result = checkTocStructure({ toc, expectedSections: ['Overview'] });
    assert.equal(result.ok, false);
    const dup = result.violations.find((v) => v.type === 'duplicate');
    assert.ok(dup);
    assert.equal(dup.heading, 'Overview');
  });

  it('flags skipped heading levels (H2 -> H4)', () => {
    const toc = [
      { level: 2, title: 'A' },
      { level: 4, title: 'B' },
      { level: 2, title: 'Examples (implementation samples) spec and design' },
    ];
    const result = checkTocStructure({ toc, expectedSections: ['A'] });
    assert.equal(result.ok, false);
    const skip = result.violations.find((v) => v.type === 'skippedLevel');
    assert.ok(skip);
    assert.equal(skip.heading, 'B');
  });

  it('flags missing coverage of expected top-level sections', () => {
    const toc = [
      { level: 1, title: 'Overview' },
      { level: 2, title: 'Examples (implementation samples) spec and design' },
    ];
    const result = checkTocStructure({ toc, expectedSections: ['Overview', 'Missing'] });
    assert.equal(result.ok, false);
    const miss = result.violations.find((v) => v.type === 'missingCoverage');
    assert.ok(miss);
    assert.equal(miss.heading, 'Missing');
  });

  it('flags a missing trailing examples section (C003-Inv)', () => {
    const toc = [
      { level: 1, title: 'Overview' },
      { level: 2, title: 'Usage' },
    ];
    const result = checkTocStructure({ toc, expectedSections: ['Overview'] });
    assert.equal(result.ok, false);
    const trail = result.violations.find((v) => v.type === 'missingTrailingSection');
    assert.ok(trail);
  });

  it('matches the trailing examples section case-insensitively (C003-Inv)', () => {
    const toc = [
      { level: 1, title: 'Overview' },
      { level: 2, title: 'EXAMPLES (IMPLEMENTATION SAMPLES) SPEC AND DESIGN' },
    ];
    const result = checkTocStructure({ toc, expectedSections: ['Overview'] });
    assert.equal(result.ok, true);
  });

  it('skips the coverage check when expectedSections is omitted', () => {
    const toc = [{ level: 1, title: 'Only' }, { level: 2, title: 'Examples (implementation samples) spec and design' }];
    const result = checkTocStructure({ toc });
    assert.equal(result.ok, true);
  });

  it('exports the trailing section title constant', () => {
    assert.equal(TRAILING_SECTION_TITLE, 'examples (implementation samples) spec and design');
  });
});
