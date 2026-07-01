/**
 * malfeasance-delete.js — Malfeasance.json からレコードを削除
 *
 * 使用法:
 *   node malfeasance-delete.js <id>
 *
 * 引数:
 *   id (必須): 削除する犯罪レコードの数値 ID
 *
 * 注意:
 *   削除前に確認プロンプトが表示される（y/N）。
 *   削除は復元不可能。
 *
 * 出力:
 *   { "success": true, "deleted": { "id": N, "file": "...", "line": N } }
 *   または
 *   { "success": false, "error": "..." }
 */

const readline = require('readline');
const { loadRecords, saveRecords, checkSchema, output } = require('../lib/malfeasance-utils');

function main() {
  const rawId = process.argv[2];

  if (rawId === undefined || rawId === '') {
    output({ success: false, error: 'Usage: node malfeasance-delete.js <id>' });
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

  const records = loaded.data.records;
  const recordIndex = records.findIndex(r => r.id === id);

  if (recordIndex === -1) {
    output({ success: false, error: 'Record not found' });
    return;
  }

  const targetRecord = records[recordIndex];

  // 確認プロンプト（プロンプト文字列は stderr に出力し、stdout の JSON を汚染しない）
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  rl.question(`Delete record #${id} (file: ${targetRecord.file}, line: ${targetRecord.line})? [y/N] `, (answer) => {
    rl.close();

    const normalized = answer.trim().toLowerCase();
    if (normalized !== 'y' && normalized !== 'yes') {
      output({ success: false, error: 'Deletion cancelled by user' });
      return;
    }

    records.splice(recordIndex, 1);

    // 保存 + スキーマ検証
    const saved = saveRecords(records);
    if (!saved.success) {
      output({ success: false, error: saved.error });
      return;
    }

    output({
      success: true,
      deleted: { id: targetRecord.id, file: targetRecord.file, line: targetRecord.line },
    });
  });
}

if (require.main === module) main();
