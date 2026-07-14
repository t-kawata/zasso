const fs = require('fs'), path = require('path');
function main() {
  const jp = process.argv[2], q = (process.argv[3] || '').toLowerCase();
  if (!jp || !q) { console.log(JSON.stringify({ success: false, error: 'Usage: ...' })); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(path.resolve(jp), 'utf8'));
  const results = [];
  for (const p of (data.phases || [])) {
    for (const t of (p.tickets || [])) {
      const s = [t.title || '', t.background || '', t.referenceSection || '', ...(t.scope || []), ...(t.testUnit || [])].join('\n').toLowerCase();
      if (s.includes(q)) results.push({ ticketKey: (p.id === -1 ? 'PX' : 'P' + p.id) + '-' + t.id, title: t.title, status: t.status, phase: p.name });
    }
  }
  console.log(JSON.stringify({ success: true, query: process.argv[3], count: results.length, results }));
}
if (require.main === module) main();
module.exports = { main };
