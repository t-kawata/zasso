/**
 * ensure-malfeasance.js — Malfeasance.json の初期化
 *
 * Malfeasance.json が存在しなければ空のレコード配列を持つ初期 JSON を作成する。
 * 既に存在する場合は何も変更しない。
 *
 * 使用法:
 *   node ensure-malfeasance.js
 *
 * 出力:
 *   作成時: { "success": true, "action": "created", "path": "..." }
 *   スキップ: { "success": true, "action": "skipped", "path": "..." }
 *   エラー: { "success": false, "error": "..." }
 */

const fs = require('fs');
const path = require('path');

const { validateRecords } = require('../lib/validate-malfeasance');

const CLAUDE_DIR = path.resolve(__dirname, '..', '..');
const MALFEASANCE_PATH = path.join(CLAUDE_DIR, 'commands', 'Malfeasance.json');
const SCHEMA_PATH = path.join(CLAUDE_DIR, 'scripts', 'tickets', 'malfeasance-schema.json');

/**
 * JSON を stdout に出力する。
 * @param {object} result
 */
function output(result) {
  console.log(JSON.stringify(result));
}

/**
 * Malfeasance.json の初期化を実行する。
 */
function main() {
  // スキーマファイルの存在確認
  if (!fs.existsSync(SCHEMA_PATH)) {
    output({ success: false, error: `Schema file not found at ${SCHEMA_PATH}` });
    return;
  }

  // スキーマファイルのパース確認
  try {
    const schemaRaw = fs.readFileSync(SCHEMA_PATH, 'utf8');
    JSON.parse(schemaRaw);
  } catch (e) {
    output({ success: false, error: `Failed to parse schema file: ${e.message}` });
    return;
  }

  // 既存の Malfeasance.json があればスキップ
  if (fs.existsSync(MALFEASANCE_PATH)) {
    output({ success: true, action: 'skipped', path: MALFEASANCE_PATH });
    return;
  }

  // 初期データの作成
  const initialData = { version: 1, records: [] };

  // スキーマ検証
  const validation = validateRecords(initialData);
  if (!validation.valid) {
    output({ success: false, error: `Schema validation failed: ${validation.errors.join('; ')}` });
    return;
  }

  // commands/ ディレクトリの存在確認
  const commandsDir = path.dirname(MALFEASANCE_PATH);
  if (!fs.existsSync(commandsDir)) {
    fs.mkdirSync(commandsDir, { recursive: true });
  }

  // ファイル書き出し
  try {
    fs.writeFileSync(MALFEASANCE_PATH, JSON.stringify(initialData, null, 2) + '\n', 'utf8');
  } catch (e) {
    output({ success: false, error: `Failed to write Malfeasance.json: ${e.message}` });
    return;
  }

  output({ success: true, action: 'created', path: MALFEASANCE_PATH });
}

if (require.main === module) main();
