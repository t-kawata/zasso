const fs = require('fs'), path = require('path');
const { validateTickets, parseTicketKey } = require('../lib/validate-tickets');
function main() {
  const jp = process.argv[2];
  if (!jp) { console.log(JSON.stringify({ success: false, error: 'Usage: ...' })); process.exit(1); }
  const rp = path.resolve(jp);
  const data = JSON.parse(fs.readFileSync(rp, 'utf8'));
  let keys;
  try { keys = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8')); } catch (e) { console.log(JSON.stringify({ success: false, error: 'stdin fail' })); process.exit(1); }
  if (!Array.isArray(keys)) { console.log(JSON.stringify({ success: false, error: 'Must be array' })); process.exit(1); }
  const deleted = [], nf = [];
  for (const raw of keys) {
    const k = parseTicketKey(raw);
    if (!k) { nf.push(raw); continue; }
    let found = false;
    for (const p of (data.phases || [])) {
      const idx = (p.tickets || []).findIndex(function(t) { return t.phaseId === k.phaseId && t.id === k.ticketId; });
      if (idx !== -1) { p.tickets.splice(idx, 1); deleted.push(raw); found = true; break; }
    }
    if (!found) nf.push(raw);
  }
  const vr = validateTickets(data);
  if (!vr.valid) { console.log(JSON.stringify({ success: false, error: 'Validation failed', errors: vr.errors })); process.exit(1); }
  fs.writeFileSync(rp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ success: true, deleted: deleted.length, deletedIds: deleted, notFound: nf }));
}
if (require.main === module) main(); module.exports = { main };
