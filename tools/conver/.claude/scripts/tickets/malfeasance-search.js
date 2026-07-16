/**
 * malfeasance-search.js — Search Malfeasance.json with conditions
 *
 * Usage:
 *   node malfeasance-search.js [key] [value]
 *
 * Arguments:
 *   key (optional): Search target field "status" | "file" | "id" | "description"
 *                   When omitted, performs partial match search across all fields
 *   value (required when key specified): Search value
 *       - id: numeric (exact match)
 *       - status: "open" | "resolved" | "false_positive" (exact match)
 *       - file: string (partial match, case-insensitive)
 *       - description: string (partial match, case-insensitive)
 *
 * Output:
 *   { "success": true, "count": N, "records": [...] }
 */

const { loadRecords, checkSchema, output } = require('../lib/malfeasance-utils');

function main() {
  const key = process.argv[2];
  const value = process.argv[3];

  // Verify schema file
  const schemaCheck = checkSchema();
  if (!schemaCheck.success) {
    output({ success: false, error: schemaCheck.error });
    return;
  }

  // Load data
  const loaded = loadRecords();
  if (!loaded.success) {
    output({ success: false, error: loaded.error });
    return;
  }

  const records = loaded.data.records;

  // Full-field partial match search when key is omitted
  if (!key) {
    if (!value) {
      // No key or value -- return all records (same as malfeasance-all, kept for compatibility)
      output({ success: true, count: records.length, records });
      return;
    }

    const lowerValue = String(value).toLowerCase();
    const matched = records.filter(r => {
      return Object.values(r).some(v =>
        v !== null && v !== undefined && String(v).toLowerCase().includes(lowerValue)
      );
    });
    output({ success: true, count: matched.length, records: matched });
    return;
  }

  // Key-specified search
  const allowedKeys = ['status', 'file', 'id', 'description'];
  if (!allowedKeys.includes(key)) {
    output({ success: false, error: `Invalid key "${key}". Allowed: ${allowedKeys.join(', ')}` });
    return;
  }

  if (value === undefined || value === '') {
    output({ success: false, error: `value is required when key is specified` });
    return;
  }

  let matched;
  if (key === 'id') {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) {
      output({ success: false, error: 'id must be a positive integer' });
      return;
    }
    matched = records.filter(r => r.id === id);
  } else if (key === 'status') {
    matched = records.filter(r => r.status === value);
  } else {
    // file or description: partial match (case-insensitive)
    const lowerValue = String(value).toLowerCase();
    matched = records.filter(r => {
      const fieldValue = r[key];
      return fieldValue && String(fieldValue).toLowerCase().includes(lowerValue);
    });
  }

  output({ success: true, count: matched.length, records: matched });
}

if (require.main === module) main();
