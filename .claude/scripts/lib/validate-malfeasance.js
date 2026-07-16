/**
 * Malfeasance.json schema validation utility
 *
 * A lightweight validator for JSON Schema draft-07 definitions,
 * using only standard Node.js (no external dependencies like ajv).
 * No external dependencies required.
 *
 * Usage:
 *   const { validateRecords } = require('../lib/validate-malfeasance');
 *   const result = validateRecords(data);
 *   if (!result.valid) { console.error(result.errors); }
 */

// ISO 8601 datetime regex (with millisecond precision)
// e.g. 2026-06-21T12:34:56.789Z or 2026-06-21T12:34:56+09:00
const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// Allowed status values
const ALLOWED_STATUSES = ['open', 'resolved', 'false_positive'];

/**
 * Validate the entire Malfeasance.json.
 *
 * @param {any} data - Parsed JSON data
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRecords(data) {
  const errors = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('Root must be a non-null object');
    return { valid: false, errors };
  }

  // Validate version
  if (!('version' in data)) {
    errors.push('Missing required field: version');
  } else if (!Number.isInteger(data.version) || data.version < 1) {
    errors.push('version must be an integer >= 1');
  }

  // Validate records
  if (!('records' in data)) {
    errors.push('Missing required field: records');
    return { valid: false, errors };
  }

  if (!Array.isArray(data.records)) {
    errors.push('records must be an array');
    return { valid: false, errors };
  }

  // Check for duplicate IDs
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
 * Validate a single crime record.
 *
 * @param {any} record - Record to validate
 * @param {number} index - Index in the array (for error messaging)
 * @returns {string[]} Array of error messages
 */
function validateSingleRecord(record, index) {
  const prefix = `records[${index}]`;
  const errors = [];

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    errors.push(`${prefix}: Must be a non-null object`);
    return errors;
  }

  // Check required fields
  const requiredFields = ['id', 'file', 'line', 'description', 'detected_at', 'status'];
  for (const field of requiredFields) {
    if (!(field in record)) {
      errors.push(`${prefix}: Missing required field: ${field}`);
    }
  }

  // Subsequent checks only when required fields exist
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

  // resolved_at required when status=resolved
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
 * Validate the schema file content (schema self-validation).
 *
 * @param {object} schema - Parsed schema JSON
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
