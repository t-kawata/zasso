const fs = require('fs'), path = require('path');
const { validateTickets, parseTicketKey } = require('../lib/validate-tickets');
function main() {
  const jp = process.argv[2];
  if (!jp) { console.log(JSON.stringify({ success: false, error: 'Usage: ...' })); process.exit(1); }
  const rp = path.resolve(jp);
  const data = JSON.parse(fs.readFileSync(rp, 'utf8'));
  let list;
  try { list = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8')); } catch (e) { console.log(JSON.stringify({ success: false, error: 'stdin fail' })); process.exit(1); }
  if (!Array.isArray(list)) { console.log(JSON.stringify({ success: false, error: 'Must be array' })); process.exit(1); }
  const updated = [], nf = [];
  for (const e of list) {
    const k = parseTicketKey(e.id);
    if (!k) { nf.push({ id: e.id, error: 'Invalid key format' }); continue; }
    if (!e.updates) { nf.push({ id: e.id, error: 'Missing updates' }); continue; }
    let found = false;
    for (const p of (data.phases || [])) {
      for (let i = 0; i < (p.tickets || []).length; i++) {
        if (p.tickets[i].phaseId === k.phaseId && p.tickets[i].id === k.ticketId) {
          const { id, phaseId, ...safe } = e.updates;
          p.tickets[i] = { ...p.tickets[i], ...safe };
          updated.push(e.id); found = true; break;
        }
      }
      if (found) break;
    }
    if (!found) nf.push({ id: e.id, error: 'Not found' });
  }
  const vr = validateTickets(data);
  if (!vr.valid) { console.log(JSON.stringify({ success: false, error: 'Validation failed', errors: vr.errors })); process.exit(1); }
  fs.writeFileSync(rp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ success: true, updated: updated.length, updatedIds: updated, notFound: nf }));
}
if (require.main === module) main(); module.exports = { main };
