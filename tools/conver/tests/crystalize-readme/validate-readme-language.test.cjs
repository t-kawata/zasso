// [::TICKET::] PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-452 --for-spec --no-implementation-order`.
// [::TICKET::] PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-451 --for-spec --no-implementation-order`.
/**
 * validate-readme-language.test.cjs — generated READMEs are English-only.
 * @verifies C008
 * @verifies C008/precondition
 * @verifies C008/postcondition
 * @verifies C008/invariant
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  validateReadmeLanguage,
  assertReadmeLanguage,
} = require('../../.claude/scripts/crystalize-readme/validate-readme-language.js');

describe('C008 — English-only generated README', () => {
  it('accepts English prose and code', () => {
    const text = '# Quick start\n\nCall `add_account()` and then `register()`.\n';
    const result = validateReadmeLanguage(text);
    assert.equal(result.ok, true, JSON.stringify(result.findings));
  });

  it('rejects hiragana, katakana, and CJK ideographs in headings and bodies', () => {
    for (const text of ['# クイックスタート\n', '本文です。\n', '# 利用方法\n']) {
      const result = validateReadmeLanguage(text);
      assert.equal(result.ok, false, text);
      assert.ok(result.findings.length > 0);
    }
  });

  it('reports the line and script class', () => {
    const result = validateReadmeLanguage('# Quick start\n\nこれは日本語です。\n');
    assert.equal(result.ok, false);
    assert.equal(result.findings[0].line, 3);
    assert.match(result.findings[0].script, /hiragana|katakana|cjk/);
  });

  it('assertReadmeLanguage throws with the first offending line', () => {
    assert.throws(
      () => assertReadmeLanguage('# Quick start\n\n本文\n'),
      /line 3/,
    );
  });
});

describe('C006 — every non-ASCII letter is rejected', () => {
  it('rejects Cyrillic, Hangul, accented Latin, and CJK letters', () => {
    for (const sample of ['Привет\n', '안녕하세요\n', 'café\n', '漢字\n']) {
      const result = validateReadmeLanguage(sample);
      assert.equal(result.ok, false, sample);
      assert.ok(result.findings[0].script.length > 0, sample);
    }
  });

  it('keeps ASCII letters, digits, punctuation, arrows, and symbols', () => {
    const text = '# Quick start\n\nUse `add()` -> done (v1.2.3) © §.\n';
    const result = validateReadmeLanguage(text);
    assert.equal(result.ok, true, JSON.stringify(result.findings));
  });

  it('still names the Japanese script class for Japanese input', () => {
    const result = validateReadmeLanguage('## クイックスタート\n');
    assert.equal(result.ok, false);
    assert.match(result.findings[0].script, /hiragana|katakana|cjk/);
  });
});
