/**
 * malfeasance-update.js — Update a record in Malfeasance.json
 *
 * Usage:
 *   node malfeasance-update.js <id> <field> <value>
 *
 * Arguments:
 *   id (required):    Record ID to update
 *   field (required): Field name to update
 *                    Allowed: "status" | "resolved_at" | "resolved_by_ticket" | "note"
 *   value (required): Value to set
 *                     - status: "open" | "resolved" | "false_positive"
 *
 * Output:
 *   { "success": true, "record": { ... } }
 *   or
 *   { "success": false, "error": "..." }
 */

const { loadRecords, saveRecords, checkSchema, output } = require('../lib/malfeasance-utils');

// Updateable fields (whitelist)
const ALLOWED_FIELDS = ['status', 'resolved_at', 'resolved_by_ticket', 'note'];

// Allowed status values
const ALLOWED_STATUSES = ['open', 'resolved', 'false_positive'];

// [::TICKET::] PX-86, PX-87 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-86|PX-87) --for-spec --no-implementation-order`.
function main() {
  const rawId = process.argv[2];
  const field = process.argv[3];
  const value = process.argv[4];

  if (!rawId || !field || value === undefined) {
    output({
      success: false,
      error: 'Usage: node malfeasance-update.js <id> <field> <value>',
    });
    console.error('HINT: Provide record ID, field name, and value as arguments');
    return;
  }

  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    output({ success: false, error: 'id must be a positive integer' });
    console.error('HINT: id must be a positive integer — use node malfeasance-all.js to find valid IDs');
    return;
  }

  // Field whitelist check
  if (!ALLOWED_FIELDS.includes(field)) {
    output({
      success: false,
      error: `Field "${field}" is not allowed for update. Allowed: ${ALLOWED_FIELDS.join(', ')}`,
    });
    console.error('HINT: Allowed fields: ' + ALLOWED_FIELDS.join(', '));
    return;
  }

  // Prevent setting resolved_at directly
  if (field === 'resolved_at') {
    output({
      success: false,
      error: 'resolved_at cannot be set directly. It is auto-set when status changes to "resolved".',
    });
    console.error('HINT: Set status="resolved" instead — resolved_at is auto-populated');
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
  const record = records.find(r => r.id === id);

  if (!record) {
    output({ success: false, error: 'Record not found' });
    console.error('HINT: Use node malfeasance-all.js open to list open records and find valid IDs');
    return;
  }

  // Validate and update value
  if (field === 'status') {
    if (!ALLOWED_STATUSES.includes(value)) {
      output({
        success: false,
        error: `Invalid status "${value}". Allowed: ${ALLOWED_STATUSES.join(', ')}`,
      });
      console.error('HINT: Allowed statuses: ' + ALLOWED_STATUSES.join(', '));
      return;
    }

    record.status = value;

    // Auto-set resolved_at when status changes to "resolved"
    if (value === 'resolved') {
      record.resolved_at = new Date().toISOString();
    }
  } else if (field === 'resolved_by_ticket') {
    const ticketId = Number(value);
    if (!Number.isInteger(ticketId) || ticketId < 1) {
      output({ success: false, error: 'resolved_by_ticket must be a positive integer' });
      return;
    }
    record.resolved_by_ticket = ticketId;
  } else if (field === 'note') {
    record.note = String(value);
  }

  // Save + schema validation
  const saved = saveRecords(records);
  if (!saved.success) {
    output({ success: false, error: saved.error });
    return;
  }

  output({ success: true, record });
}

if (require.main === module) main();
