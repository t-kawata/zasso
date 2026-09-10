/**
 * malfeasance-all.js — Fetches all records from Malfeasance.json
 *
 * Usage:
 *   node malfeasance-all.js [filter]
 *
 * Arguments:
 *   filter (optional): "open" | "resolved" | "false_positive" | omitted=all items
 *
 * Output:
 *   { "success": true, "count": N, "records": [...] }
 */

const { loadRecords, checkSchema, output } = require('../lib/malfeasance-utils');

function main() {
  // Verify schema file (pre-check)
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

  const filter = process.argv[2];
  const allowedFilters = ['open', 'resolved', 'false_positive'];

  let filtered = loaded.data.records;
  if (filter) {
    if (!allowedFilters.includes(filter)) {
      output({ success: false, error: `Invalid filter "${filter}". Allowed: ${allowedFilters.join(', ')}` });
      return;
    }
    filtered = loaded.data.records.filter(r => r.status === filter);
  }

  output({ success: true, count: filtered.length, records: filtered });
}

if (require.main === module) main();
