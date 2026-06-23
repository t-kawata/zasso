/**
 * malfeasance-update.js — Malfeasance.json のレコードを更新
 *
 * 使用法:
 *   node malfeasance-update.js <id> <field> <value>
 *
 * 引数:
 *   id (必須):    更新対象のレコード ID
 *   field (必須): 更新するフィールド名
 *                  許可: "status" | "resolved_at" | "resolved_by_ticket" | "note"
 *   value (必須): 設定する値
 *                  - status: "open" | "resolved" | "false_positive"
 *
 * 出力:
 *   { "success": true, "record": { ... } }
 *   または
 *   { "success": false, "error": "..." }
 */

const { loadRecords, saveRecords, checkSchema, output } = require('../lib/malfeasance-utils');

// 更新可能なフィールド（ホワイトリスト）
const ALLOWED_FIELDS = ['status', 'resolved_at', 'resolved_by_ticket', 'note'];

// status の enum 値
const ALLOWED_STATUSES = ['open', 'resolved', 'false_positive'];

function main() {
  const rawId = process.argv[2];
  const field = process.argv[3];
  const value = process.argv[4];

  if (!rawId || !field || value === undefined) {
    output({
      success: false,
      error: 'Usage: node malfeasance-update.js <id> <field> <value>',
    });
    return;
  }

  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    output({ success: false, error: 'id must be a positive integer' });
    return;
  }

  // フィールドホワイトリストチェック
  if (!ALLOWED_FIELDS.includes(field)) {
    output({
      success: false,
      error: `Field "${field}" is not allowed for update. Allowed: ${ALLOWED_FIELDS.join(', ')}`,
    });
    return;
  }

  // resolved_at 単独設定の禁止
  if (field === 'resolved_at') {
    output({
      success: false,
      error: 'resolved_at cannot be set directly. It is auto-set when status changes to "resolved".',
    });
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
  const record = records.find(r => r.id === id);

  if (!record) {
    output({ success: false, error: 'Record not found' });
    return;
  }

  // 値の検証と更新
  if (field === 'status') {
    if (!ALLOWED_STATUSES.includes(value)) {
      output({
        success: false,
        error: `Invalid status "${value}". Allowed: ${ALLOWED_STATUSES.join(', ')}`,
      });
      return;
    }

    record.status = value;

    // resolved への変更時に resolved_at を自動設定
    if (value === 'resolved') {
      record.resolved_at = new Date().toISOString();
    }
  } else if (field === 'resolved_by_ticket') {
    const ticketId = Number(value);
    if (!Number.isInteger(ticketId) || ticketId < 1) {
      output({ success: false, error: 'resolved_by_ticket must be a positive integer' });
      return;
    }
    record.resolved_by_ticket = ticketId;
  } else if (field === 'note') {
    record.note = String(value);
  }

  // 保存 + スキーマ検証
  const saved = saveRecords(records);
  if (!saved.success) {
    output({ success: false, error: saved.error });
    return;
  }

  output({ success: true, record });
}

if (require.main === module) main();
