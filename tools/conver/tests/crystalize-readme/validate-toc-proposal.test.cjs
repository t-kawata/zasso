/**
 * validate-toc-proposal.test.cjs — Tests for validate-toc-proposal.js (Contract C001)
 *
 * C001-Pre: {id, heading, contentOptions[], recommendation, reason, seenIds?}
 * C001-Post: {valid:boolean, errors:string[]}; valid=true only when:
 *   id matches /^H[1-6](-[1-9][0-9]*)?$/, id is not in seenIds, heading is a
 *   non-empty string, contentOptions length is 2-4, recommendation is exactly
 *   one element of contentOptions, and reason is a non-empty string.
 * C001-Inv: validation is deterministic; a valid proposal always has a
 *   hierarchical-unique id and a non-empty recommendation reason.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('path');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/validate-toc-proposal.js');
const { validateProposal } = require(SCRIPT);

const VALID_CHOICE = {
  id: 'H1',
  heading: 'Overview',
  contentOptions: ['英語で Overview を書く', '日本語で概要を書く', '両言語併記'],
  recommendation: '英語で Overview を書く',
  reason: 'README の本文言語は対象 RFC に追随する（デフォルト英語）ため',
  seenIds: [],
};

const VALID_YESNO = {
  id: 'H2-1',
  heading: 'Usage',
  contentOptions: ['はい', 'いいえ'],
  recommendation: 'はい',
  reason: '使い方 README に Usage 節は必須のため',
  seenIds: ['H1'],
};

describe('validateProposal — C001', () => {
  it('accepts a valid choice-form proposal (C001-Pre/Post)', () => {
    const result = validateProposal(VALID_CHOICE);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('accepts a valid Yes/No-form proposal (C001-Post)', () => {
    const result = validateProposal(VALID_YESNO);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('rejects a duplicate id within the batch', () => {
    const result = validateProposal({ ...VALID_CHOICE, seenIds: ['H1'] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('[DUPLICATE_ID]')));
  });

  it('rejects an id violating the hierarchical pattern', () => {
    for (const badId of ['H0', 'H2-0', 'free text', 42, '', null]) {
      const result = validateProposal({ ...VALID_CHOICE, id: badId });
      assert.equal(result.valid, false, `id=${badId} should be rejected`);
      assert.ok(result.errors.some((e) => e.includes('[INVALID_ID]')), `id=${badId}`);
    }
  });

  it('rejects contentOptions outside 2-4 options', () => {
    const one = validateProposal({ ...VALID_CHOICE, contentOptions: ['only one'] });
    assert.equal(one.valid, false);
    assert.ok(one.errors.some((e) => e.includes('[INVALID_OPTIONS]')));
    const five = validateProposal({ ...VALID_CHOICE, contentOptions: ['a', 'b', 'c', 'd', 'e'] });
    assert.equal(five.valid, false);
  });

  it('rejects contentOptions containing an empty string', () => {
    const result = validateProposal({ ...VALID_CHOICE, contentOptions: ['a', ''] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('[INVALID_OPTIONS]')));
  });

  it('rejects a recommendation not in contentOptions', () => {
    const result = validateProposal({ ...VALID_CHOICE, recommendation: 'Z案' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('[INVALID_RECOMMENDATION]')));
  });

  it('rejects an empty recommendation reason', () => {
    for (const badReason of ['', '   ']) {
      const result = validateProposal({ ...VALID_CHOICE, reason: badReason });
      assert.equal(result.valid, false, `reason=${JSON.stringify(badReason)}`);
      assert.ok(result.errors.some((e) => e.includes('[EMPTY_REASON]')));
    }
  });

  it('rejects a missing or empty heading', () => {
    const empty = validateProposal({ ...VALID_CHOICE, heading: '' });
    assert.equal(empty.valid, false);
    assert.ok(empty.errors.some((e) => e.includes('[EMPTY_HEADING]')));
    const missing = validateProposal({ ...VALID_CHOICE, heading: undefined });
    assert.equal(missing.valid, false);
  });

  it('is deterministic — identical input yields identical output (C001-Inv)', () => {
    assert.deepEqual(validateProposal(VALID_CHOICE), validateProposal(VALID_CHOICE));
  });

  it('a valid proposal always has a hierarchical-unique id and a non-empty reason (C001-Inv)', () => {
    const result = validateProposal(VALID_CHOICE);
    if (result.valid) {
      assert.match(VALID_CHOICE.id, /^H[1-6](-[1-9][0-9]*)?$/);
      assert.ok(VALID_CHOICE.contentOptions.includes(VALID_CHOICE.recommendation));
      assert.ok(VALID_CHOICE.reason.trim().length > 0);
    }
  });
});

describe('main — CLI gate', () => {
  it('exits 0 and prints {valid:true} for a valid proposal', () => {
    const result = spawnSync('node', [SCRIPT], { input: JSON.stringify(VALID_CHOICE), encoding: 'utf8' });
    assert.equal(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.equal(out.valid, true);
  });

  it('exits 1 and prints structured errors for an invalid proposal', () => {
    const result = spawnSync('node', [SCRIPT], { input: JSON.stringify({ ...VALID_CHOICE, reason: '' }), encoding: 'utf8' });
    assert.equal(result.status, 1);
    const out = JSON.parse(result.stdout.trim());
    assert.equal(out.valid, false);
    assert.ok(Array.isArray(out.errors));
    assert.ok(out.errors.some((e) => e.includes('[EMPTY_REASON]')));
  });
});
