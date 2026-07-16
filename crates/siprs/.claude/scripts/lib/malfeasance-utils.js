/**
 * Common utilities for Malfeasance.json operations
 *
 * Provides file read/write, path resolution, and schema validation
 * shared across all malfeasance operation scripts.
 */

const fs = require('fs');
const path = require('path');

const { validateRecords, validateSchema } = require('./validate-malfeasance');

// .claude/ directory is 2 levels up from this file location (.claude/scripts/lib/)
const CLAUDE_DIR = path.resolve(__dirname, '..', '..');
const SCHEMA_PATH = path.join(CLAUDE_DIR, 'scripts', 'tickets', 'malfeasance-schema.json');

/**
 * Get the path to Malfeasance.json.
 * If a directory is specified, looks inside it; otherwise uses CWD.
 * @param {string} [dir] - Base directory (default: process.cwd())
 * @returns {string}
 */
function getMalfeasancePath(dir) {
  return path.resolve(dir || process.cwd(), 'Malfeasance.json');
}

/**
 * Get the path to the schema file.
 * @returns {string}
 */
function getSchemaPath() {
  return SCHEMA_PATH;
}

/**
 * Read and parse Malfeasance.json.
 * Runs schema validation after reading.
 *
 * @param {string} [dir] - Directory containing Malfeasance.json (default: process.cwd())
 * @returns {{ success: boolean, data?: object, error?: string, warning?: string }}
 */
function loadRecords(dir) {
  const malfPath = getMalfeasancePath(dir);
  if (!fs.existsSync(malfPath)) {
    return { success: false, error: `Malfeasance.json not found at ${malfPath}` };
  }

  let data;
  try {
    const raw = fs.readFileSync(malfPath, 'utf8');
    data = JSON.parse(raw);
  } catch (e) {
    return { success: false, error: `Failed to parse Malfeasance.json: ${e.message}` };
  }

  // Schema validation
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
 * Write a record array to Malfeasance.json.
 * Runs schema validation before writing.
 *
 * @param {object[]} records - Record array to write
 * @param {string} [dir] - Directory to place Malfeasance.json (default: process.cwd())
 * @returns {{ success: boolean, error?: string }}
 */
function saveRecords(records, dir) {
  const fullData = { version: 1, records };
  const malfPath = getMalfeasancePath(dir);

  // Schema validation
  const validation = validateRecords(fullData);
  if (!validation.valid) {
    return { success: false, error: `Schema validation failed: ${validation.errors.join('; ')}` };
  }

  try {
    const malfDir = path.dirname(malfPath);
    if (!fs.existsSync(malfDir)) {
      fs.mkdirSync(malfDir, { recursive: true });
    }
    fs.writeFileSync(malfPath, JSON.stringify(fullData, null, 2) + '\n', 'utf8');
  } catch (e) {
    return { success: false, error: `Failed to write Malfeasance.json: ${e.message}` };
  }

  return { success: true };
}

/**
 * Verify the schema file exists and is valid.
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
 * Output JSON to stdout (common output format for all scripts).
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
