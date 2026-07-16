#!/usr/bin/env node

/**
 * validate-slug.test.js — validate-slug.js の単体テスト
 *
 * テスト実行: node validate-slug.test.js
 *
 * カバレッジ目標: 95%（クリティカルパス: 検出ロジック 100%）
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
// テストランナー
// ============================================================

/** テスト結果集計 */
const stats = { passed: 0, failed: 0, total: 0 };

/**
 * テストケースを実行する
 *
 * @param {string} name — テスト名
 * @param {Function} fn — テスト関数（アサーションエラーで失敗扱い）
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
 * テスト結果を集計して終了コードを返す
 */
function report() {
  const ok = stats.failed === 0;
  console.log(`\n${ok ? '✅' : '❌'} ${stats.passed}/${stats.total} passed (${stats.failed} failed)`);
  process.exit(ok ? 0 : 1);
}

// ============================================================
// テスト: checkSlugFormat
// ============================================================

console.log('\n--- checkSlugFormat ---');

test('有効な lower_snake_case slug が valid を返す', () => {
  const r = checkSlugFormat('config');
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.reason, null);
});

test('有効な複数単語 slug が valid を返す', () => {
  const r = checkSlugFormat('db_settings');
  assert.strictEqual(r.valid, true);
});

test('数字を含む slug が valid を返す', () => {
  const r = checkSlugFormat('tls_config_2');
  assert.strictEqual(r.valid, true);
});

test('CamelCase slug が大文字違反を検出する', () => {
  const r = checkSlugFormat('CamelCaseName');
  assert.strictEqual(r.valid, false);
  assert.ok(r.reason.includes('大文字'));
});

test('スペースを含む slug を検出する', () => {
  const r = checkSlugFormat('has space');
  assert.strictEqual(r.valid, false);
  assert.ok(r.reason.includes('スペース') || r.reason.includes('ハイフン'));
});

test('UPPER_CASE slug を検出する', () => {
  const r = checkSlugFormat('UPPER_CASE');
  assert.strictEqual(r.valid, false);
  assert.ok(r.reason.includes('大文字'));
});

test('先頭アンダースコア slug を検出する', () => {
  const r = checkSlugFormat('_leading_underscore');
  assert.strictEqual(r.valid, false);
  assert.ok(r.reason.includes('先頭'));
});

test('ハイフンを含む slug を検出する', () => {
  const r = checkSlugFormat('has-hyphens');
  assert.strictEqual(r.valid, false);
  assert.ok(r.reason.includes('ハイフン') || r.reason.includes('スペース'));
});

test('先頭数字 slug を検出する', () => {
  const r = checkSlugFormat('123abc');
  assert.strictEqual(r.valid, false);
  assert.ok(r.reason.includes('先頭'));
});

test('アンダースコアのみ slug を検出する', () => {
  const r = checkSlugFormat('_');
  assert.strictEqual(r.valid, false);
});

test('数字のみ slug を検出する', () => {
  const r = checkSlugFormat('123');
  assert.strictEqual(r.valid, false);
  assert.ok(r.reason.includes('先頭'));
});

// ============================================================
// テスト: checkSlugLength
// ============================================================

console.log('\n--- checkSlugLength ---');

test('25文字ちょうどの slug が通過する', () => {
  const slug = 'a234567890123456789012345'; // 25文字
  assert.strictEqual(slug.length, MAX_SLUG_LENGTH);
  const r = checkSlugLength(slug);
  assert.strictEqual(r.valid, true);
});

test('26文字（上限+1）の slug が違反になる', () => {
  const slug = 'a2345678901234567890123456'; // 26文字
  assert.strictEqual(slug.length, MAX_SLUG_LENGTH + 1);
  const r = checkSlugLength(slug);
  assert.strictEqual(r.valid, false);
  assert.ok(r.reason.includes('超えています'));
});

test('1文字 slug が通過する', () => {
  const r = checkSlugLength('a');
  assert.strictEqual(r.valid, true);
});

test('50文字の長大 slug が違反になる', () => {
  const r = checkSlugLength('a_very_long_slug_over_twentyfive_chars');
  assert.strictEqual(r.valid, false);
});

// ============================================================
// テスト: checkWordCount
// ============================================================

console.log('\n--- checkWordCount ---');

test('1単語 slug は警告なし', () => {
  const r = checkWordCount('config');
  assert.strictEqual(r.isWarning, false);
  assert.strictEqual(r.wordCount, 1);
});

test('2単語 slug は警告なし', () => {
  const r = checkWordCount('db_settings');
  assert.strictEqual(r.isWarning, false);
  assert.strictEqual(r.wordCount, 2);
});

test('3単語 slug は警告なし', () => {
  const r = checkWordCount('tls_config_prod');
  assert.strictEqual(r.isWarning, false);
  assert.strictEqual(r.wordCount, 3);
});

test('4単語 slug は警告あり', () => {
  const r = checkWordCount('word1_word2_word3_word4');
  assert.strictEqual(r.isWarning, true);
  assert.strictEqual(r.wordCount, 4);
});

test('5単語 slug は警告あり', () => {
  const r = checkWordCount('a_b_c_d_e');
  assert.strictEqual(r.isWarning, true);
  assert.strictEqual(r.wordCount, 5);
});

test('空文字 slug は警告なし（カウント0）', () => {
  const r = checkWordCount('');
  assert.strictEqual(r.isWarning, false);
  assert.strictEqual(r.wordCount, 0);
});

// ============================================================
// テスト: buildSlugError
// ============================================================

console.log('\n--- buildSlugError ---');

test('エラーオブジェクトに nodeId が含まれる', () => {
  const e = buildSlugError('N0001', 'BadSlug', '大文字違反');
  assert.strictEqual(e.nodeId, 'N0001');
});

test('エラーオブジェクトに元の slug が含まれる', () => {
  const e = buildSlugError('N0001', 'BadSlug', '大文字違反');
  assert.strictEqual(e.slug, 'BadSlug');
});

test('エラーオブジェクトに reason が含まれる', () => {
  const e = buildSlugError('N0001', 'BadSlug', '大文字違反');
  assert.strictEqual(e.reason, '大文字違反');
});

test('エラーオブジェクトに crud.js 形式の remedy が含まれる', () => {
  const e = buildSlugError('N0001', 'BadSlug', '大文字違反');
  assert.ok(e.remedy.includes('crud.js'));
  assert.ok(e.remedy.includes('update-node'));
  assert.ok(e.remedy.includes('--id=N0001'));
  assert.ok(e.remedy.includes('--field=slug'));
});

test('remedy の slug 値が提案修正値である', () => {
  const e = buildSlugError('N0001', 'CamelCaseName', '大文字違反');
  assert.ok(e.remedy.includes('--value="camelcasename"'));
});

// ============================================================
// テスト: suggestFixedSlug
// ============================================================

console.log('\n--- suggestFixedSlug ---');

test('大文字 slug が小文字化される', () => {
  assert.strictEqual(suggestFixedSlug('CamelCaseName'), 'camelcasename');
});

test('ハイフン slug がアンダースコア化される', () => {
  assert.strictEqual(suggestFixedSlug('has-hyphens'), 'has_hyphens');
});

test('先頭数字に s が前置される', () => {
  assert.strictEqual(suggestFixedSlug('123abc'), 's123abc');
});

test('先頭アンダースコアが除去される', () => {
  assert.strictEqual(suggestFixedSlug('_leading'), 'leading');
});

test('アンダースコアのみが unnamed になる', () => {
  assert.strictEqual(suggestFixedSlug('_'), 'unnamed');
});

test('30文字 slug が25文字に切り詰められる', () => {
  const long = 'config_manager_for_database_connect';
  assert.ok(long.length > MAX_SLUG_LENGTH);
  const fixed = suggestFixedSlug(long);
  assert.ok(fixed.length <= MAX_SLUG_LENGTH, `${fixed} は ${MAX_SLUG_LENGTH} 文字を超えています`);
});

// ============================================================
// テスト: validateSlugs（統合）
// ============================================================

console.log('\n--- validateSlugs ---');

test('有効な slug のみのグラフが ok:true を返す', () => {
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

test('slug 未設定ノードがスキップされる', () => {
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

test('空文字 slug ノードがスキップされる', () => {
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

test('CamelCase slug が検出される', () => {
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

test('スペース slug が検出される', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'has space' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
});

test('UPPER_CASE slug が検出される', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'UPPER_CASE' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
});

test('26文字超過 slug が検出される', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'a_very_long_slug_over_twentyfive_chars' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
  assert.ok(r.errors[0].reason.includes('超えています'));
});

test('ハイフン slug が検出される', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'has-hyphens' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
});

test('複数ノードに違反がある場合、全件が errors に列挙される', () => {
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

test('4単語 slug が warning に報告される（errors なし）', () => {
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

test('5単語 slug が warning に報告される', () => {
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

test('違反のみで警告なしの場合、warnings が空配列である', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'CamelCase' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.errors.length, 1);
  assert.strictEqual(r.warnings.length, 0);
});

test('25文字ちょうどの slug が通過する（統合）', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'a234567890123456789012345' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.errors.length, 0);
});

test('1文字 slug "a" が通過する', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'a' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, true);
});

test('数字のみ slug "123" が errors に報告される', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: '123' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
});

test('アンダースコアのみ "_" が errors に報告される', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: '_' }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
});

test('エラー0件の場合 {ok:true, errors:[], warnings:[]} が返る', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'config' }
    ]
  };
  const r = validateSlugs(graph);
  assert.deepStrictEqual(r, { ok: true, errors: [], warnings: [] });
});

test('全エラーに remedy（crud.js コマンド）が含まれる', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 'BadSlug' },
      { id: 'N0002', slug: 'also_bad_slug_here_too_long' }
    ]
  };
  const r = validateSlugs(graph);
  assert.ok(r.errors.length > 0);
  for (const err of r.errors) {
    assert.ok(err.remedy, `nodeId=${err.nodeId} に remedy がありません`);
    assert.ok(err.remedy.includes('crud.js'), `nodeId=${err.nodeId} の remedy に crud.js が含まれていません`);
    assert.ok(err.remedy.includes('update-node'), `nodeId=${err.nodeId} の remedy に update-node が含まれていません`);
  }
});

test('nodes が存在しないグラフが ok:true を返す', () => {
  const r = validateSlugs({ edges: [] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.errors.length, 0);
  assert.strictEqual(r.warnings.length, 0);
});

test('null グラフが ok:true を返す', () => {
  const r = validateSlugs(null);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.errors.length, 0);
});

test('slug が文字列でない場合、errors に報告される', () => {
  const graph = {
    nodes: [
      { id: 'N0001', slug: 12345 }
    ]
  };
  const r = validateSlugs(graph);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
  assert.ok(r.errors[0].reason.includes('文字列ではありません'));
});

// ============================================================
// 定数定義の確認
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
// 結果報告
// ============================================================

report();
