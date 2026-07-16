const fs = require('fs'), path = require('path');
const { validateTickets } = require('../lib/validate-tickets');

/**
 * Bulk-add multiple batches of tickets to an existing Tickets.json (non-destructive: discards changes on validation failure).
 *
 * @param {Object} data — parsed Tickets.json data (mutations are applied to this object)
 * @param {Array} batches — array of batches to add. Each batch is { phaseId?, phaseName?, tickets: [...] }
 * @returns {{ success: boolean, added: number, tickets?: Array, error?: string, errors?: Array }}
 */
function bulkAddTickets(data, batches) {
  const added = [];
  for (const batch of batches) {
    const idSpecified = typeof batch.phaseId === 'number' && Number.isInteger(batch.phaseId);
    const nameSpecified = batch.phaseName;
    if (!idSpecified && !nameSpecified) {
      return { success: false, error: 'Batch must specify phaseId or phaseName' };
    }
    if (!Array.isArray(batch.tickets) || batch.tickets.length === 0) {
      return { success: false, error: 'No tickets in batch' };
    }
    let phase = idSpecified
      ? data.phases.find(function(p) { return p.id === batch.phaseId; })
      : null;
    if (!phase && nameSpecified) {
      phase = data.phases.find(function(p) { return p.name === batch.phaseName; });
    }
    if (!phase) {
      phase = { id: data.phases.length, name: batch.phaseName, tickets: [] };
      data.phases.push(phase);
    }
    let maxId = 0;
    for (const existingTicket of (phase.tickets || [])) {
      if (existingTicket.id > maxId) maxId = existingTicket.id;
    }
    for (let i = 0; i < batch.tickets.length; i++) {
      const ticketId = maxId + 1 + i;
      const ticket = { ...batch.tickets[i], id: ticketId, phaseId: phase.id, status: 'todo' };
      phase.tickets.push(ticket);
      added.push({ ticketKey: (phase.id === -1 ? 'PX' : 'P' + phase.id) + '-' + ticketId });
    }
  }
  const validationResult = validateTickets(data);
  if (!validationResult.valid) {
    return { success: false, error: 'Validation failed', errors: validationResult.errors };
  }
  return { success: true, added: added.length, tickets: added };
}

function main() {
  const ticketsJsonPath = process.argv[2];
  if (!ticketsJsonPath) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node bulk-add-tickets.js <PATH to Tickets.json>' }));
    process.exit(1);
  }
  const resolvedPath = path.resolve(ticketsJsonPath);
  const data = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  let batches;
  try {
    batches = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
  } catch (e) {
    console.log(JSON.stringify({ success: false, error: 'stdin parse fail' }));
    process.exit(1);
  }
  if (!Array.isArray(batches)) {
    console.log(JSON.stringify({ success: false, error: 'Must be array' }));
    process.exit(1);
  }
  const result = bulkAddTickets(data, batches);
  if (!result.success) {
    console.log(JSON.stringify(result));
    process.exit(1);
  }
  fs.writeFileSync(resolvedPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(result));
}
if (require.main === module) main();
module.exports = { main, bulkAddTickets };
