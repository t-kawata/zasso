/**
 * Malfeasance.json スキーマ検証ユーティリティ
 *
 * JSON Schema draft-07 に準拠したスキーマ定義に対する検証を、
 * 標準 Node.js のみで行う軽量バリデータ。
 * 外部依存（ajv 等）不要。
 *
 * 使用方法:
 *   const { validateRecords } = require('../lib/validate-malfeasance');
 *   const result = validateRecords(data);
 *   if (!result.valid) { console.error(result.errors); }
 */

// ISO 8601 日時形式の正規表現（ミリ秒精度対応）
// 例: 2026-06-21T12:34:56.789Z または 2026-06-21T12:34:56+09:00
const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// 許可されるステータス値
const ALLOWED_STATUSES = ['open', 'resolved', 'false_positive'];

/**
 * Malfeasance.json 全体を検証する。
 *
 * @param {any} data - パース済みの JSON データ
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRecords(data) {
  const errors = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('Root must be a non-null object');
    return { valid: false, errors };
  }

  // version の検証
  if (!('version' in data)) {
    errors.push('Missing required field: version');
  } else if (!Number.isInteger(data.version) || data.version < 1) {
    errors.push('version must be an integer >= 1');
  }

  // records の検証
  if (!('records' in data)) {
    errors.push('Missing required field: records');
    return { valid: false, errors };
  }

  if (!Array.isArray(data.records)) {
    errors.push('records must be an array');
    return { valid: false, errors };
  }

  // ID の重複チェック
  const seenIds = new Set();

  // eslint-disable-next-line prefer-const
  for (let i = 0; i < data.records.length; i++) {
    const recordErrors = validateSingleRecord(data.records[i], i);
    errors.push(...recordErrors);

    if (recordErrors.length === 0 && data.records[i] && typeof data.records[i].id === 'number') {
      if (seenIds.has(data.records[i].id)) {
        errors.push(`records[${i}]: Duplicate id ${data.records[i].id}`);
      }
      seenIds.add(data.records[i].id);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 単一の犯罪レコードを検証する。
 *
 * @param {any} record - 検証対象のレコード
 * @param {number} index - 配列内のインデックス（エラーメッセージ用）
 * @returns {string[]} エラーメッセージの配列
 */
function validateSingleRecord(record, index) {
  const prefix = `records[${index}]`;
  const errors = [];

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    errors.push(`${prefix}: Must be a non-null object`);
    return errors;
  }

  // 必須フィールドのチェック
  const requiredFields = ['id', 'file', 'line', 'description', 'detected_at', 'status'];
  for (const field of requiredFields) {
    if (!(field in record)) {
      errors.push(`${prefix}: Missing required field: ${field}`);
    }
  }

  // 以降は必須フィールドが存在した場合のみ型チェック
  if (!(record.id === undefined)) {
    if (!Number.isInteger(record.id) || record.id < 1) {
      errors.push(`${prefix}.id: Must be an integer >= 1`);
    }
  }

  if (!(record.file === undefined)) {
    if (typeof record.file !== 'string' || record.file.length < 1) {
      errors.push(`${prefix}.file: Must be a non-empty string`);
    }
  }

  if (!(record.line === undefined)) {
    if (!Number.isInteger(record.line) || record.line < 1) {
      errors.push(`${prefix}.line: Must be an integer >= 1`);
    }
  }

  if (!(record.description === undefined)) {
    if (typeof record.description !== 'string' || record.description.length < 1) {
      errors.push(`${prefix}.description: Must be a non-empty string`);
    }
  }

  if (!(record.detected_at === undefined)) {
    if (typeof record.detected_at !== 'string' || !ISO_DATE_TIME_RE.test(record.detected_at)) {
      errors.push(`${prefix}.detected_at: Must be a valid ISO 8601 date-time string`);
    }
  }

  if (!(record.status === undefined)) {
    if (!ALLOWED_STATUSES.includes(record.status)) {
      errors.push(`${prefix}.status: Must be one of: ${ALLOWED_STATUSES.join(', ')}`);
    }
  }

  // status=resolved の場合は resolved_at が必須
  if (record.status === 'resolved' && !record.resolved_at) {
    errors.push(`${prefix}: resolved_at is required when status is "resolved"`);
  }

  if (!(record.resolved_at === undefined)) {
    if (typeof record.resolved_at !== 'string' || !ISO_DATE_TIME_RE.test(record.resolved_at)) {
      errors.push(`${prefix}.resolved_at: Must be a valid ISO 8601 date-time string`);
    }
  }

  if (!(record.resolved_by_ticket === undefined && record.resolved_by_ticket !== null)) {
    if (!Number.isInteger(record.resolved_by_ticket) || record.resolved_by_ticket < 1) {
      errors.push(`${prefix}.resolved_by_ticket: Must be an integer >= 1`);
    }
  }

  if (!(record.note === undefined)) {
    if (typeof record.note !== 'string') {
      errors.push(`${prefix}.note: Must be a string`);
    }
  }

  return errors;
}

/**
 * スキーマファイルの内容を検証する（スキーマ自身の妥当性チェック）。
 *
 * @param {object} schema - パース済みのスキーマ JSON
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateSchema(schema) {
  const errors = [];

  if (!schema || typeof schema !== 'object') {
    errors.push('Schema must be a non-null object');
    return { valid: false, errors };
  }

  if (schema.$schema !== 'http://json-schema.org/draft-07/schema#') {
    errors.push('Schema must use draft-07');
  }

  if (schema.type !== 'object') {
    errors.push('Schema root type must be "object"');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateRecords, validateSingleRecord, validateSchema };
