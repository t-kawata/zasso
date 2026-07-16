/**
 * malfeasance-get.js — Get a record from Malfeasance.json by ID
 *
 * Usage:
 *   node malfeasance-get.js <id>
 *
 * Arguments:
 *   id (required): Numeric ID of the crime record to retrieve
 *
 * Output:
 *   { "success": true, "record": { ... } }
 *   or
 *   { "success": false, "error": "Record not found" }
 */

const { loadRecords, checkSchema, output } = require('../lib/malfeasance-utils');

function main() {
  const rawId = process.argv[2];

  if (rawId === undefined || rawId === '') {
    output({ success: false, error: 'Usage: node malfeasance-get.js <id>' });
    return;
  }

  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    output({ success: false, error: 'id must be a positive integer' });
    return;
  }

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

  const record = loaded.data.records.find(r => r.id === id);

  if (!record) {
    output({ success: false, error: 'Record not found' });
    return;
  }

  output({ success: true, record });
}

if (require.main === module) main();
