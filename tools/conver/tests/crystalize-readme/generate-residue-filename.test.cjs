/**
 * generate-residue-filename.test.cjs — Tests for generate-residue-filename.js (Contract C004)
 *
 * C004-Pre: a valid 14-digit timestamp string is injected as an argument.
 * C004-Post: output matches /^RESIDUE-\d{14}\.md$/.
 * C004-Inv: identical timestamp input yields the identical filename.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const SCRIPT = require.resolve('../../.claude/scripts/crystalize-readme/generate-residue-filename.js');
const { generateResidueFilename, parseArguments, RESIDUE_FILENAME_RE } = require(SCRIPT);

describe('generateResidueFilename — C004', () => {
  it('produces RESIDUE-<YYYYMMDDhhmmss>.md from a 14-digit timestamp (C004-Post)', () => {
    assert.equal(generateResidueFilename('20260817120000'), 'RESIDUE-20260817120000.md');
  });

  it('handles the lower boundary timestamp', () => {
    const name = generateResidueFilename('00000000000000');
    assert.match(name, RESIDUE_FILENAME_RE);
  });

  it('handles the upper boundary timestamp', () => {
    const name = generateResidueFilename('99999999999999');
    assert.match(name, RESIDUE_FILENAME_RE);
  });

  it('is collision-safe per second — identical input yields identical filename (C004-Inv)', () => {
    assert.equal(generateResidueFilename('20260817120000'), generateResidueFilename('20260817120000'));
  });

  it('rejects a non-14-digit timestamp (C004-Pre)', () => {
    assert.throws(() => generateResidueFilename('20260817'));
    assert.throws(() => generateResidueFilename('202608171200001'));
    assert.throws(() => generateResidueFilename('abcdefghijklmn'));
  });

  it('rejects a missing timestamp', () => {
    assert.throws(() => generateResidueFilename(undefined));
  });
});

describe('parseArguments', () => {
  it('parses --timestamp=', () => {
    assert.deepEqual(parseArguments(['--timestamp=20260817120000']), { timestamp: '20260817120000' });
  });

  it('rejects missing --timestamp', () => {
    assert.throws(() => parseArguments([]));
  });
});
