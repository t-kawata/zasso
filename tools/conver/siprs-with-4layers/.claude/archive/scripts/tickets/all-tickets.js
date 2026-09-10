const fs = require('fs'), path = require('path');
function main() {
  const jp = process.argv[2], sf = process.argv[3];
  if (!jp) { console.log(JSON.stringify({ success: false, error: 'Usage: ...' })); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(path.resolve(jp), 'utf8'));
  const tickets = [];
  for (const p of (data.phases || [])) {
    for (const t of (p.tickets || [])) {
      if (sf && t.status !== sf) continue;
      tickets.push({ ticketKey: (p.id === -1 ? 'PX' : 'P' + p.id) + '-' + t.id, title: t.title, status: t.status, phase: p.name });
    }
  }
  console.log(JSON.stringify({ success: true, count: tickets.length, tickets }));
}
if (require.main === module) main();
module.exports = { main };
