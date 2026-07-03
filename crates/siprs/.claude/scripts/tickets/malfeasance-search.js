/**
 * malfeasance-search.js — Malfeasance.json の条件検索
 *
 * 使用法:
 *   node malfeasance-search.js [key] [value]
 *
 * 引数:
 *   key (任意): 検索対象フィールド "status" | "file" | "id" | "description"
 *               省略時は全フィールドから部分一致検索
 *   value (key指定時は必須): 検索値
 *       - id: 数値（完全一致）
 *       - status: "open" | "resolved" | "false_positive"（完全一致）
 *       - file: 文字列（部分一致、大文字小文字区別なし）
 *       - description: 文字列（部分一致、大文字小文字区別なし）
 *
 * 出力:
 *   { "success": true, "count": N, "records": [...] }
 */

const { loadRecords, checkSchema, output } = require('../lib/malfeasance-utils');

function main() {
  const key = process.argv[2];
  const value = process.argv[3];

  // スキーマファイルの確認
  const schemaCheck = checkSchema();
  if (!schemaCheck.success) {
    output({ success: false, error: schemaCheck.error });
    return;
  }

  // データ読み込み
  const loaded = loadRecords();
  if (!loaded.success) {
    output({ success: false, error: loaded.error });
    return;
  }

  const records = loaded.data.records;

  // キー省略時は全フィールド部分一致検索
  if (!key) {
    if (!value) {
      // キーも値もなし → 全件返す（malfeasance-all と同様だが互換性維持）
      output({ success: true, count: records.length, records });
      return;
    }

    const lowerValue = String(value).toLowerCase();
    const matched = records.filter(r => {
      return Object.values(r).some(v =>
        v !== null && v !== undefined && String(v).toLowerCase().includes(lowerValue)
      );
    });
    output({ success: true, count: matched.length, records: matched });
    return;
  }

  // キー指定検索
  const allowedKeys = ['status', 'file', 'id', 'description'];
  if (!allowedKeys.includes(key)) {
    output({ success: false, error: `Invalid key "${key}". Allowed: ${allowedKeys.join(', ')}` });
    return;
  }

  if (value === undefined || value === '') {
    output({ success: false, error: `value is required when key is specified` });
    return;
  }

  let matched;
  if (key === 'id') {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) {
      output({ success: false, error: 'id must be a positive integer' });
      return;
    }
    matched = records.filter(r => r.id === id);
  } else if (key === 'status') {
    matched = records.filter(r => r.status === value);
  } else {
    // file または description: 部分一致（大文字小文字区別なし）
    const lowerValue = String(value).toLowerCase();
    matched = records.filter(r => {
      const fieldValue = r[key];
      return fieldValue && String(fieldValue).toLowerCase().includes(lowerValue);
    });
  }

  output({ success: true, count: matched.length, records: matched });
}

if (require.main === module) main();
