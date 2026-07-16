#!/usr/bin/env node

/**
 * validate-slug.test.js — Unit tests for validate-slug.js
 *
 * Run: node validate-slug.test.js
 *
 * Coverage target: 95% (critical path: detection logic 100%)
 */

const assert = require('assert');
const {
  validateSlugs,
  checkSlugFormat,
  checkSlugLength,
  checkWordCount,
  buildSlugError,
  suggestFixedSlug,
  MAX_SLUG_LENGTH,
  WARNING_WORD_COUNT,
  SLUG_FORMAT_PATTERN
} = require('./validate-slug.js');

// ============================================================
// Test runner
// ============================================================

/** Test result accumulator */
const stats = { passed: 0, failed: 0, total: 0 };

/**
 * Executes a test case
 *
 * @param {string} name — Test name
 * @param {Function} fn — Test function (assertion error = failure)
 */
function test(name, fn) {
  stats.total++;
  try {
    fn();
    stats.passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    stats.failed++;
    console.log(`  ❌ ${name}`);
    console.log(`      ${e.message}`);
  }
}

/**
 * Aggregates test results and returns exit code
 */
function report() {
  const ok = stats.failed === 0;
  console.log(`\n${ok ? '✅' : '❌'} ${stats.passed}/${stats.total} passed (${stats.failed} failed)`);
  process.exit(ok ? 0 : 1);
}

// ============================================================
// Tests: checkSlugFormat
// ============================================================

console.log('\n--- checkSlugFormat ---');

test('valid lower_snake_case slug returns valid', () => {
  const r = checkSlugFormat('config');
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.reason, null);
});

test('valid multi-word slug returns valid', () => {
  const r = checkSlugFormat('db_settings');
  assert.strictEqual(r.valid, true);
});

test('slug with digits returns valid', () => {
  const r = checkSlugFormat('tls_config_2');
  assert.strictEqual(r.valid, true);
});

test('CamelCase slug detects uppercase violation', () => {
  const r = checkSlugFormat('CamelCaseName');
  assert.strictEqual(r.valid, false);
  assert.ok(r.reason.includes('uppercase'));
});

test('detects slug with spaces', () => {
  const r = checkSlugFormat('has space');
  assert.strictEqual(r.valid, false);
  assert.ok(r.reason.includes('space') || r.reason.includes('hyphen'));
});

test('detects UPPER_CASE slug', () => {
  const r = checkSlugFormat('UPPER_CASE');
  assert.strictEqual(r.valid, false);
  assert.ok(r.reason.includes('uppercase'));
});

test('detects leading underscore slug', () => {
  const r = checkSlugFormat('_leading_underscore');
  assert.strictEqual(r.valid, false);
  assert.ok(r.reason.includes('start'));
});

test('detects slug with hyphens', () => {
  const r = checkSlugFormat('has-hyphens');
  assert.strictEqual(r.valid, false);
  assert.ok(r.reason.includes('hyphen') || r.reason.includes('space'));
});

test('detects leading digit slug', () => {
  const r = checkSlugFormat('123abc');
  assert.strictEqual(r.valid, false);
  assert.ok(r.reason.includes('start'));
});

test('detects underscore-only slug', () => {
  const r = checkSlugFormat('_');
  assert.strictEqual(r.valid, false);
});

test('detects digit-only slug', () => {
  const r = checkSlugFormat('123');
  assert.strictEqual(r.valid, false);
  assert.ok(r.reason.includes('start'));
});

// ============================================================
// Tests: checkSlugLength
// ============================================================

console.log('\n--- checkSlugLength ---');

test('25-char slug passes', () => {
  const slug = 'a234567890123456789012345'; // 25 chars
  assert.strictEqual(slug.length, MAX_SLUG_LENGTH);
  const r = checkSlugLength(slug);
  assert.strictEqual(r.valid, true);
});

test('26-char slug (max+1) triggers violation', () => {
  const slug = 'a2345678901234567890123456'; // 26 chars
  assert.strictEqual(slug.length, MAX_SLUG_LENGTH + 1);
  const r = checkSlugLength(slug);
  assert.strictEqual(r.valid, false);
  assert.ok(r.reason.includes('exceeds'));
});

test('1-char slug passes', () => {
  const r = checkSlugLength('a');
  assert.strictEqual(r.valid, true);
});

test('50-char long slug triggers violation', () => {
  const r = checkSlugLength('a_very_long_slug_over_twentyfive_chars');
  assert.strictEqual(r.valid, false);
});

// ============================================================
// Tests: checkWordCount
// ============================================================

console.log('\n--- checkWordCount ---');

test('1-word slug has no warning', () => {
  const r = checkWordCount('config');
  assert.strictEqual(r.isWarning, false);
  assert.strictEqual(r.wordCount, 1);
});

test('2-word slug has no warning', () => {
  const r = checkWordCount('db_settings');
  assert.strictEqual(r.isWarning, false);
  assert.strictEqual(r.wordCount, 2);
});

test('3-word slug has no warning', () => {
  const r = checkWordCount('tls_config_prod');
  assert.strictEqual(r.isWarning, false);
  assert.strictEqual(r.wordCount, 3);
});

test('4-word slug has warning', () => {
  const r = checkWordCount('word1_word2_word3_word4');
  assert.strictEqual(r.isWarning, true);
  assert.strictEqual(r.wordCount, 4);
});

test('5-word slug has warning', () => {
  const r = checkWordCount('a_b_c_d_e');
  assert.strictEqual(r.isWarning, true);
  assert.strictEqual(r.wordCount, 5);
});

test('empty slug has no warning (count 0)', () => {
  const r = checkWordCount('');
  assert.strictEqual(r.isWarning, false);
  assert.strictEqual(r.wordCount, 0);
});

// ============================================================
// Tests: buildSlugError
// ============================================================

console.log('\n--- buildSlugError ---');

test('error object contains nodeId', () => {
  const e = buildSlugError('N0001', 'BadSlug', 'uppercase violation');
  assert.strictEqual(e.nodeId, 'N0001');
});

test('error object contains original slug', () => {
  const e = buildSlugError('N0001', 'BadSlug', 'uppercase violation');
  assert.strictEqual(e.slug, 'BadSlug');
});

test('error object contains reason', () => {
  const e = buildSlugError('N0001', 'BadSlug', 'uppercase violation');
  assert.strictEqual(e.reason, 'uppercase violation');
});

test('error object contains crud.js-style remedy', () => {
  const e = buildSlugError('N0001', 'BadSlug', 'uppercase violation');
  assert.ok(e.remedy.includes('crud.js'));
  assert.ok(e.remedy.includes('update-node'));
  assert.ok(e.remedy.includes('--id=N0001'));
  assert.ok(e.remedy.includes('--field=slug'));
});

test('remedy slug value is the suggested fix', () => {
  const e = buildSlugError('N0001', 'CamelCaseName', 'uppercase violation');
  assert.ok(e.remedy.includes('--value="camelcasename"'));
});

// ============================================================
// Tests: suggestFixedSlug
// ============================================================

console.log('\n--- suggestFixedSlug ---');

test('uppercase slug is lowercased', () => {
  assert.strictEqual(suggestFixedSlug('CamelCaseName'), 'camelcasename');
});

test('hyphen slug is converted to underscore', () => {
  assert.strictEqual(suggestFixedSlug('has-hyphens'), 'has_hyphens');
});

test('leading digit gets s prefix', () => {
  assert.strictEqual(suggestFixedSlug('123abc'), 's123abc');
});

test('leading underscore is removed', () => {
  assert.strictEqual(suggestFixedSlug('_leading'), 'leading');
});

test('underscore-only becomes unnamed', () => {
  assert.strictEqual(suggestFixedSlug('_'), 'unnamed');
});

test('30-char slug is truncated to 25', () => {
  const long = 'config_manager_for_database_connect';
  assert.ok(long.length > MAX_SLUG_LENGTH);
  const fixed = suggestFixedSlug(long);
  assert.ok(fixed.length <= MAX_SLUG_LENGTH, `${fixed} exceeds ${MAX_SLUG_LENGTH} chars`);
});

// ============================================================
// Tests: validateSlugs (integration)
// ============================================================

console.log('\n--- validateSlugs ---');

test('graph with only valid slugs returns ok:true', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'config' },
      { id: 'N0002', slug: 'db_settings' },
      { id: 'N0003', slug: 'tls_config' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.errors.length, 0);
  assert.strictEqual(r.warnings.length, 0);
});

test('nodes with unset slug are skipped', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: undefined },
      { id: 'N0002' },
      { id: 'N0003', slug: 'valid' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.errors.length, 0);
});

test('nodes with empty slug are skipped', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: '' },
      { id: 'N0002', slug: 'valid' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.errors.length, 0);
});

test('CamelCase slug is detected', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'CamelCaseName' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
  assert.strictEqual(r.errors[0].nodeId, 'N0001');
});

test('space-containing slug is detected', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'has space' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
});

test('UPPER_CASE slug is detected', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'UPPER_CASE' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
});

test('slug exceeding 26 chars is detected', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'a_very_long_slug_over_twentyfive_chars' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
  assert.ok(r.errors[0].reason.includes('exceeds'));
});

test('hyphen slug is detected', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'has-hyphens' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
});

test('multiple violation nodes are all listed in errors', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'CamelCase' },
      { id: 'N0002', slug: 'UPPER_CASE' },
      { id: 'N0003', slug: 'valid_slug' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 2);
});

test('4-word slug is reported as warning (no errors)', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'word1_word2_word3_word4' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.errors.length, 0);
  assert.strictEqual(r.warnings.length, 1);
  assert.strictEqual(r.warnings[0].nodeId, 'N0001');
});

test('5-word slug is reported as warning', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'a_b_c_d_e' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.errors.length, 0);
  assert.strictEqual(r.warnings.length, 1);
});

test('violations without warnings have empty warnings array', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'CamelCase' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.errors.length, 1);
  assert.strictEqual(r.warnings.length, 0);
});

test('25-char slug passes (integration)', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'a234567890123456789012345' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.errors.length, 0);
});

test('1-char slug "a" passes', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'a' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, true);
});

test('digit-only slug "123" is reported in errors', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: '123' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
});

test('underscore-only "_" is reported in errors', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: '_' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
});

test('zero errors returns {ok:true, errors:[], warnings:[]}', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'config' }
    ]
  };
  const r = validateSlugs(graph);
  assert.deepStrictEqual(r, { ok: true, errors: [], warnings: [] });
});

test('all errors include remedy (crud.js command)', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'BadSlug' },
      { id: 'N0002', slug: 'also_bad_slug_here_too_long' }
    ]
  };
  const r = validateSlugs(graph);
  assert.ok(r.errors.length > 0);
  for (const err of r.errors) {
    assert.ok(err.remedy, `nodeId=${err.nodeId} missing remedy`);
    assert.ok(err.remedy.includes('crud.js'), `nodeId=${err.nodeId} remedy missing crud.js`);
    assert.ok(err.remedy.includes('update-node'), `nodeId=${err.nodeId} remedy missing update-node`);
  }
});

test('graph without nodes returns ok:true', () => {
  const r = validateSlugs({ edges: [] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.errors.length, 0);
  assert.strictEqual(r.warnings.length, 0);
});

test('null graph returns ok:true', () => {
  const r = validateSlugs(null);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.errors.length, 0);
});

test('non-string slug is reported in errors', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 12345 }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
  assert.ok(r.errors[0].reason.includes('not a string'));
});

// ============================================================
// Constants verification
// ============================================================

console.log('\n--- Constants ---');

test('MAX_SLUG_LENGTH が 25 である', () => {
  assert.strictEqual(MAX_SLUG_LENGTH, 25);
});

test('WARNING_WORD_COUNT が 4 である', () => {
  assert.strictEqual(WARNING_WORD_COUNT, 4);
});

test('SLUG_FORMAT_PATTERN が lower_snake_case に一致する', () => {
  assert.ok(SLUG_FORMAT_PATTERN.test('config'));
  assert.ok(SLUG_FORMAT_PATTERN.test('db_settings'));
  assert.ok(!SLUG_FORMAT_PATTERN.test('CamelCase'));
  assert.ok(!SLUG_FORMAT_PATTERN.test('has space'));
  assert.ok(!SLUG_FORMAT_PATTERN.test('has-hyphens'));
});

// ============================================================
// Results
// ============================================================

report();
