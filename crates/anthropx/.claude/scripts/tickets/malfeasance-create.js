/**
 * malfeasance-create.js — Malfeasance.json に新規犯罪レコードを作成
 *
 * 使用法:
 *   node malfeasance-create.js <file> <line> <description> [note]
 *
 * 引数:
 *   file (必須):        犯罪が存在するファイルの相対パス
 *   line (必須):        犯罪コードの開始行番号（正の整数）
 *   description (必須): 犯罪の内容説明
 *   note (任意):        備考
 *
 * 出力:
 *   { "success": true, "ticketId": N, "record": { ... } }
 *   または
 *   { "success": false, "error": "..." }
 */

const { loadRecords, saveRecords, checkSchema, output } = require('../lib/malfeasance-utils');

function main() {
  const file = process.argv[2];
  const rawLine = process.argv[3];
  const description = process.argv[4];
  const note = process.argv[5];

  // 引数チェック
  if (!file || !rawLine || !description) {
    output({
      success: false,
      error: 'Usage: node malfeasance-create.js <file> <line> <description> [note]',
    });
    return;
  }

  const line = Number(rawLine);
  if (!Number.isInteger(line) || line < 1) {
    output({ success: false, error: 'line must be a positive integer' });
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

  // 重複チェック: 同一ファイル+同一行の open レコード
  const duplicate = records.find(r => r.file === file && r.line === line && r.status === 'open');
  if (duplicate) {
    output({
      success: false,
      error: `Duplicate open record exists: id=${duplicate.id}, file=${file}, line=${line}`,
    });
    return;
  }

  // 新 ID の自動採番
  const maxId = records.length > 0 ? Math.max(...records.map(r => r.id)) : 0;
  const newId = maxId + 1;

  const now = new Date().toISOString();

  const newRecord = {
    id: newId,
    file,
    line,
    description,
    detected_at: now,
    status: 'open',
  };

  // note が指定されていれば追加
  if (note !== undefined && note !== '') {
    newRecord.note = note;
  }

  records.push(newRecord);

  // 保存 + スキーマ検証
  const saved = saveRecords(records);
  if (!saved.success) {
    output({ success: false, error: saved.error });
    return;
  }

  output({ success: true, ticketId: newId, record: newRecord });
}

if (require.main === module) main();
