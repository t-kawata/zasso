/**
 * malfeasance-delete.js — Delete a record from Malfeasance.json
 *
 * Usage:
 *   node malfeasance-delete.js <id>
 *
 * Arguments:
 *   id (required): Numeric ID of the crime record to delete
 *
 * Note:
 *   A confirmation prompt is displayed before deletion (y/N).
 *   Deletion is irreversible.
 *
 * Output:
 *   { "success": true, "deleted": { "id": N, "file": "...", "line": N } }
 *   or
 *   { "success": false, "error": "..." }
 */

const readline = require('readline');
const { loadRecords, saveRecords, checkSchema, output } = require('../lib/malfeasance-utils');

function main() {
  const rawId = process.argv[2];

  if (rawId === undefined || rawId === '') {
    output({ success: false, error: 'Usage: node malfeasance-delete.js <id>' });
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

  const records = loaded.data.records;
  const recordIndex = records.findIndex(r => r.id === id);

  if (recordIndex === -1) {
    output({ success: false, error: 'Record not found' });
    return;
  }

  const targetRecord = records[recordIndex];

  // Confirmation prompt (output to stderr to avoid polluting stdout JSON)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  rl.question(`Delete record #${id} (file: ${targetRecord.file}, line: ${targetRecord.line})? [y/N] `, (answer) => {
    rl.close();

    const normalized = answer.trim().toLowerCase();
    if (normalized !== 'y' && normalized !== 'yes') {
      output({ success: false, error: 'Deletion cancelled by user' });
      return;
    }

    records.splice(recordIndex, 1);

    // Save + schema validation
    const saved = saveRecords(records);
    if (!saved.success) {
      output({ success: false, error: saved.error });
      return;
    }

    output({
      success: true,
      deleted: { id: targetRecord.id, file: targetRecord.file, line: targetRecord.line },
    });
  });
}

if (require.main === module) main();
