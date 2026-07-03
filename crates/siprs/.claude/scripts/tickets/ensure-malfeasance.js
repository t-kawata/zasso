/**
 * ensure-malfeasance.js — Malfeasance.json の初期化
 *
 * Malfeasance.json が存在しなければ空のレコード配列を持つ初期 JSON を作成する。
 * 既に存在する場合は何も変更しない。
 *
 * 使用法:
 *   node ensure-malfeasance.js               # CWD に作成
 *   node ensure-malfeasance.js <directory>    # 指定ディレクトリに作成
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
const SCHEMA_PATH = path.join(CLAUDE_DIR, 'scripts', 'tickets', 'malfeasance-schema.json');

/**
 * Malfeasance.json のパスを返す。
 * @param {string} [dir] - 基準ディレクトリ
 * @returns {string}
 */
function getMalfeasancePath(dir) {
  return path.resolve(dir || process.cwd(), 'Malfeasance.json');
}

/**
 * JSON を stdout に出力する。
 * @param {object} result
 */
function output(result) {
  console.log(JSON.stringify(result));
}

/**
 * Malfeasance.json の初期化を実行する。
 * @param {string} [targetDir] - 作成先ディレクトリ
 */
function main(targetDir) {
  const MALFEASANCE_PATH = getMalfeasancePath(targetDir);

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

  // ディレクトリの存在確認
  const malfDir = path.dirname(MALFEASANCE_PATH);
  if (!fs.existsSync(malfDir)) {
    fs.mkdirSync(malfDir, { recursive: true });
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

if (require.main === module) {
  const targetDir = process.argv[2] || undefined;
  main(targetDir);
}
