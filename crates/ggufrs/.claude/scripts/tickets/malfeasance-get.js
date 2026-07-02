/**
 * malfeasance-get.js — Malfeasance.json から ID 指定でレコード取得
 *
 * 使用法:
 *   node malfeasance-get.js <id>
 *
 * 引数:
 *   id (必須): 取得する犯罪レコードの数値 ID
 *
 * 出力:
 *   { "success": true, "record": { ... } }
 *   または
 *   { "success": false, "error": "Record not found" }
 */

const { loadRecords, checkSchema, output } = require('../lib/malfeasance-utils');

function main() {
  const rawId = process.argv[2];

  if (rawId === undefined || rawId === '') {
    output({ success: false, error: 'Usage: node malfeasance-get.js <id>' });
    return;
  }

  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    output({ success: false, error: 'id must be a positive integer' });
    return;
  }

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

  const record = loaded.data.records.find(r => r.id === id);

  if (!record) {
    output({ success: false, error: 'Record not found' });
    return;
  }

  output({ success: true, record });
}

if (require.main === module) main();
