const fs = require('fs'), path = require('path');
const CB = { todo: '[ ]', done: '[/]', reviewed: '[x]' };
function main() {
  const jp = process.argv[2];
  if (!jp) { console.log(JSON.stringify({ success: false, error: 'Usage: ...' })); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(path.resolve(jp), 'utf8'));
  const lines = [];
  for (const p of (data.phases || [])) {
    const phaseLabel = p.id === -1 ? 'PX' : 'P' + p.id;
    lines.push('- ' + CB.todo + ' ' + phaseLabel + ': ' + (p.name || ''));
    for (const t of (p.tickets || [])) {
      lines.push('    - ' + (CB[t.status] || CB.todo) + ' ' + phaseLabel + '-' + t.id + ': ' + (t.title || ''));
    }
  }
  console.log(lines.join('\n'));
}
if (require.main === module) main();
module.exports = { main };
