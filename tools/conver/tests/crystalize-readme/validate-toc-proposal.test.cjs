/**
 * validate-toc-proposal.test.cjs — Tests for validate-toc-proposal.js (Contract C001)
 * @verifies C001
 *
 * C001-Pre: {id, heading, contentOptions[], recommendation, reason, existingIds?}
 *   id is a hierarchical path (H1, H1-1, H1-2-1, H2, H2-1, ...), existingIds are
 *   all current node ids in the TOC.
 * C001-Post: {valid:boolean, errors:string[]}; valid=true only when:
 *   id matches /^H[1-9][0-9]*(-[1-9][0-9]*)*$/ (1-6 segments), id not in
 *   existingIds, parent(id) in existingIds (top-level has no parent),
 *   heading non-empty, contentOptions length 2-4, recommendation ∈ contentOptions,
 *   reason non-empty.
 * C001-Inv: validation is deterministic; parent(id) is derived by dropping the
 *   last -<n> segment (never stored).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('path');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/validate-toc-proposal.js');
const { validateProposal, parentIdOf } = require(SCRIPT);

const VALID_TOP = {
  id: 'H1',
  heading: 'クイックスタート',
  contentOptions: ['コードA', 'コードB', 'コードC'],
  recommendation: 'コードA',
  reason: 'README の使い方に即しているため',
  existingIds: [],
};

const VALID_CHILD = {
  id: 'H1-1',
  heading: 'アカウントの追加',
  contentOptions: ['コードA', 'コードB'],
  recommendation: 'コードA',
  reason: 'アカウント追加は基本操作のため',
  existingIds: ['H1'],
};

const VALID_GRANDCHILD = {
  id: 'H1-2-1',
  heading: '保留',
  contentOptions: ['はい', 'いいえ'],
  recommendation: 'はい',
  reason: '保留操作の説明が必要なため',
  existingIds: ['H1', 'H1-2'],
};

describe('validateProposal — C001', () => {
  it('accepts a top-level hierarchical-path id (C001-Pre/Post)', () => {
    const result = validateProposal(VALID_TOP);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('accepts a child whose parent is in existingIds (C001-Post)', () => {
    const result = validateProposal(VALID_CHILD);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('accepts a grandchild whose parent exists (C001-Post)', () => {
    const result = validateProposal(VALID_GRANDCHILD);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('rejects a child whose parent is absent (C001: 親存在)', () => {
    const result = validateProposal({ ...VALID_CHILD, id: 'H2-1' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('[PARENT_NOT_FOUND]')));
    assert.ok(result.errors.some((e) => e.includes('Fix:')), 'should guide how to fix');
  });

  it('rejects an id violating the hierarchical path pattern (C001-Pre)', () => {
    for (const badId of ['H0', 'H1-0', 'free text', 42, '', null, 'H1-2-3-4-5-6-7']) {
      const result = validateProposal({ ...VALID_TOP, id: badId });
      assert.equal(result.valid, false, `id=${badId} should be rejected`);
      assert.ok(result.errors.some((e) => e.includes('[INVALID_ID]')), `id=${badId}`);
      assert.ok(result.errors.some((e) => e.includes('Fix:')), `id=${badId} should guide how to fix`);
    }
  });

  it('rejects a duplicate id against existingIds (C001: 一意性)', () => {
    const result = validateProposal({ ...VALID_TOP, existingIds: ['H1'] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('[DUPLICATE_ID]')));
    assert.ok(result.errors.some((e) => e.includes('Fix:')), 'should guide how to fix');
  });

  it('rejects contentOptions outside 2-4 options', () => {
    const one = validateProposal({ ...VALID_TOP, contentOptions: ['only one'] });
    assert.equal(one.valid, false);
    assert.ok(one.errors.some((e) => e.includes('[INVALID_OPTIONS]')));
    assert.ok(one.errors.some((e) => e.includes('Fix:')), 'should guide how to fix');
    const five = validateProposal({ ...VALID_TOP, contentOptions: ['a', 'b', 'c', 'd', 'e'] });
    assert.equal(five.valid, false);
  });

  it('rejects contentOptions containing an empty string', () => {
    const result = validateProposal({ ...VALID_TOP, contentOptions: ['a', ''] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('[INVALID_OPTIONS]')));
  });

  it('rejects a recommendation not in contentOptions', () => {
    const result = validateProposal({ ...VALID_TOP, recommendation: 'Z案' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('[INVALID_RECOMMENDATION]')));
    assert.ok(result.errors.some((e) => e.includes('Fix:')), 'should guide how to fix');
  });

  it('rejects an empty recommendation reason', () => {
    for (const badReason of ['', '   ']) {
      const result = validateProposal({ ...VALID_TOP, reason: badReason });
      assert.equal(result.valid, false, `reason=${JSON.stringify(badReason)}`);
      assert.ok(result.errors.some((e) => e.includes('[EMPTY_REASON]')));
      assert.ok(result.errors.some((e) => e.includes('Fix:')), 'should guide how to fix');
    }
  });

  it('rejects a missing or empty heading', () => {
    const empty = validateProposal({ ...VALID_TOP, heading: '' });
    assert.equal(empty.valid, false);
    assert.ok(empty.errors.some((e) => e.includes('[EMPTY_HEADING]')));
    assert.ok(empty.errors.some((e) => e.includes('Fix:')), 'should guide how to fix');
    const missing = validateProposal({ ...VALID_TOP, heading: undefined });
    assert.equal(missing.valid, false);
  });

  it('is deterministic — identical input yields identical output (C001-Inv)', () => {
    assert.deepEqual(validateProposal(VALID_CHILD), validateProposal(VALID_CHILD));
  });

  it('a valid proposal always has a hierarchical-path id whose parent is in existingIds (C001-Inv)', () => {
    const result = validateProposal(VALID_GRANDCHILD);
    if (result.valid) {
      assert.match(VALID_GRANDCHILD.id, /^H[1-9][0-9]*(-[1-9][0-9]*)*$/);
      const parent = parentIdOf(VALID_GRANDCHILD.id);
      assert.ok(VALID_GRANDCHILD.existingIds.includes(parent));
      assert.ok(VALID_GRANDCHILD.reason.trim().length > 0);
    }
  });
});

describe('parentIdOf — hierarchy derivation (C001-Inv)', () => {
  it('drops the last -<n> segment to find the parent', () => {
    assert.equal(parentIdOf('H1-2-1'), 'H1-2');
    assert.equal(parentIdOf('H1-1'), 'H1');
    assert.equal(parentIdOf('H2-3'), 'H2');
  });

  it('returns null for a top-level heading', () => {
    assert.equal(parentIdOf('H1'), null);
    assert.equal(parentIdOf('H12'), null);
  });
});

describe('main — CLI gate', () => {
  it('exits 0 and prints {valid:true} for a valid proposal', () => {
    const result = spawnSync('node', [SCRIPT], { input: JSON.stringify(VALID_CHILD), encoding: 'utf8' });
    assert.equal(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.equal(out.valid, true);
  });

  it('exits 1 and prints structured errors for a parent-absent proposal', () => {
    const result = spawnSync('node', [SCRIPT], { input: JSON.stringify({ ...VALID_CHILD, id: 'H2-1' }), encoding: 'utf8' });
    assert.equal(result.status, 1);
    const out = JSON.parse(result.stdout.trim());
    assert.equal(out.valid, false);
    assert.ok(out.errors.some((e) => e.includes('[PARENT_NOT_FOUND]')));
  });
});
