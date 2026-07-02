const fs = require('fs'), path = require('path');
const { validateTickets } = require('../lib/validate-tickets');

function main() {
  const jp = process.argv[2];
  if (!jp) { console.log(JSON.stringify({ success: false, error: 'Usage: ...' })); process.exit(1); }
  const rp = path.resolve(jp);
  const data = JSON.parse(fs.readFileSync(rp, 'utf8'));
  let batches;
  try { batches = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8')); } catch (e) { console.log(JSON.stringify({ success: false, error: 'stdin parse fail' })); process.exit(1); }
  if (!Array.isArray(batches)) { console.log(JSON.stringify({ success: false, error: 'Must be array' })); process.exit(1); }
  const added = [];
  for (const b of batches) {
    const idSpecified = typeof b.phaseId === 'number' && Number.isInteger(b.phaseId);
    const nameSpecified = b.phaseName;
    if (!idSpecified && !nameSpecified) { console.log(JSON.stringify({ success: false, error: 'Batch must specify phaseId or phaseName' })); process.exit(1); }
    if (!Array.isArray(b.tickets) || b.tickets.length === 0) { console.log(JSON.stringify({ success: false, error: 'No tickets' })); process.exit(1); }
    let ph = idSpecified ? data.phases.find(function(p) { return p.id === b.phaseId; }) : null;
    if (!ph && nameSpecified) ph = data.phases.find(function(p) { return p.name === b.phaseName; });
    if (!ph) {
      ph = { id: data.phases.length, name: b.phaseName, tickets: [] };
      data.phases.push(ph);
    }
    let maxId = 0;
    for (const t of (ph.tickets || [])) { if (t.id > maxId) maxId = t.id; }
    for (let i = 0; i < b.tickets.length; i++) {
      const tid = maxId + 1 + i;
      const ticket = { id: tid, phaseId: ph.id, status: 'todo', ...b.tickets[i] };
      ph.tickets.push(ticket);
      added.push({ ticketKey: (ph.id === -1 ? 'PX' : 'P' + ph.id) + '-' + tid });
    }
  }
  const vr = validateTickets(data);
  if (!vr.valid) { console.log(JSON.stringify({ success: false, error: 'Validation failed', errors: vr.errors })); process.exit(1); }
  fs.writeFileSync(rp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ success: true, added: added.length, tickets: added }));
}
if (require.main === module) main();
module.exports = { main };
