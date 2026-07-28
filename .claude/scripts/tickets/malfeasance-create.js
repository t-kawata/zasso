/**
 * malfeasance-create.js — Creates a new crime record in Malfeasance.json
 *
 * Usage:
 *   node malfeasance-create.js <file> <line> <description> [note]
 *
 * Arguments:
 *   file (required):      Relative path to the file containing the crime
 *   line (required):      Starting line number of the crime code (positive integer)
 *   description (required): Description of the crime
 *   note (optional):      Additional note
 *
 * Output:
 *   { "success": true, "ticketId": N, "record": { ... } }
 *   or
 *   { "success": false, "error": "..." }
 */

const { loadRecords, saveRecords, checkSchema, output, normalizePath } = require('../lib/malfeasance-utils');

// [::TICKET::] PX-86, PX-87 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-86|PX-87) --for-spec --no-implementation-order`.
function main() {
  const file = process.argv[2];
  const rawLine = process.argv[3];
  const description = process.argv[4];
  const note = process.argv[5];

  // Argument check
  if (!file || !rawLine || !description) {
    output({
      success: false,
      error: 'Usage: node malfeasance-create.js <file> <line> <description> [note]',
    });
    console.error('HINT: Provide file path, line number, and description as arguments');
    return;
  }

  // PX-92: Normalize file path to project-root-relative for cross-machine portability.
  // Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-92 --for-spec --no-implementation-order`
  const normalizedFile = normalizePath(file);

  const line = Number(rawLine);
  if (!Number.isInteger(line) || line < 1) {
    output({ success: false, error: 'line must be a positive integer' });
    console.error('HINT: line must be a positive integer (e.g. 10)');
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

  // Duplicate check: open record with the same file and line
  const duplicate = records.find(r => r.file === normalizedFile && r.line === line && r.status === 'open');
  if (duplicate) {
    output({
      success: false,
      error: `Duplicate open record exists: id=${duplicate.id}, file=${file}, line=${line}`,
    });
    console.error('HINT: Use node malfeasance-get.js ' + duplicate.id + ' to inspect the existing record');
    return;
  }

  // Auto-increment new ID
  const maxId = records.length > 0 ? Math.max(...records.map(r => r.id)) : 0;
  const newId = maxId + 1;

  const now = new Date().toISOString();

  const newRecord = {
    id: newId,
    file: normalizedFile,
    line,
    description,
    detected_at: now,
    status: 'open',
  };

  // Add note if specified
  if (note !== undefined && note !== '') {
    newRecord.note = note;
  }

  records.push(newRecord);

  // Save + schema validation
  const saved = saveRecords(records);
  if (!saved.success) {
    output({ success: false, error: saved.error });
    return;
  }

  output({ success: true, ticketId: newId, record: newRecord });
}

if (require.main === module) main();
