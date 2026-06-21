/**
 * Malfeasance.json 操作の共通ユーティリティ
 *
 * 全 malfeasance 操作スクリプトから利用されるファイル読み書き・
 * パス解決・スキーマ検証の共通処理を提供する。
 */

const fs = require('fs');
const path = require('path');

const { validateRecords, validateSchema } = require('./validate-malfeasance');

// .claude/ ディレクトリはこのファイルの場所（.claude/scripts/lib/）から 2 階層上
const CLAUDE_DIR = path.resolve(__dirname, '..', '..');
const MALFEASANCE_PATH = path.join(CLAUDE_DIR, 'commands', 'Malfeasance.json');
const SCHEMA_PATH = path.join(CLAUDE_DIR, 'scripts', 'tickets', 'malfeasance-schema.json');

/**
 * Malfeasance.json のパスを取得する。
 * @returns {string}
 */
function getMalfeasancePath() {
  return MALFEASANCE_PATH;
}

/**
 * スキーマファイルのパスを取得する。
 * @returns {string}
 */
function getSchemaPath() {
  return SCHEMA_PATH;
}

/**
 * Malfeasance.json を読み込み、パースして返す。
 * 読み取り後にスキーマ検証を実施する。
 *
 * @returns {{ success: boolean, data?: object, error?: string, warning?: string }}
 */
function loadRecords() {
  if (!fs.existsSync(MALFEASANCE_PATH)) {
    return { success: false, error: `Malfeasance.json not found at ${MALFEASANCE_PATH}` };
  }

  let data;
  try {
    const raw = fs.readFileSync(MALFEASANCE_PATH, 'utf8');
    data = JSON.parse(raw);
  } catch (e) {
    return { success: false, error: `Failed to parse Malfeasance.json: ${e.message}` };
  }

  // スキーマ検証
  const validation = validateRecords(data);
  if (!validation.valid) {
    return {
      success: false,
      error: `Schema validation failed: ${validation.errors.join('; ')}`,
    };
  }

  return { success: true, data };
}

/**
 * レコード配列を Malfeasance.json に書き込む。
 * 書き込み前にスキーマ検証を実施する。
 *
 * @param {object[]} records - 書き込むレコード配列
 * @returns {{ success: boolean, error?: string }}
 */
function saveRecords(records) {
  const fullData = { version: 1, records };

  // スキーマ検証
  const validation = validateRecords(fullData);
  if (!validation.valid) {
    return { success: false, error: `Schema validation failed: ${validation.errors.join('; ')}` };
  }

  try {
    fs.writeFileSync(MALFEASANCE_PATH, JSON.stringify(fullData, null, 2) + '\n', 'utf8');
  } catch (e) {
    return { success: false, error: `Failed to write Malfeasance.json: ${e.message}` };
  }

  return { success: true };
}

/**
 * スキーマファイルの存在と妥当性を確認する。
 *
 * @returns {{ success: boolean, error?: string }}
 */
function checkSchema() {
  if (!fs.existsSync(SCHEMA_PATH)) {
    return { success: false, error: `Schema file not found at ${SCHEMA_PATH}` };
  }

  try {
    const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(raw);
    const validation = validateSchema(schema);
    if (!validation.valid) {
      return { success: false, error: `Schema file validation failed: ${validation.errors.join('; ')}` };
    }
  } catch (e) {
    return { success: false, error: `Failed to parse schema file: ${e.message}` };
  }

  return { success: true };
}

/**
 * JSON を stdout に出力する（全スクリプト共通の出力形式）。
 *
 * @param {object} result
 */
function output(result) {
  console.log(JSON.stringify(result));
}

module.exports = {
  getMalfeasancePath,
  getSchemaPath,
  loadRecords,
  saveRecords,
  checkSchema,
  output,
};
