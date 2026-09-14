const fs = require("fs"), path = require("path");
const { computeEffectiveStatus } = require("../lib/omissions-update");
const CB = { todo:"[ ]", in_progress:"[/]", done:"[x]" };
function render(steps, indent) {
  const lines = [];
  for (const s of (steps||[])) {
    const st = computeEffectiveStatus(s);
    lines.push(indent+(CB[st]||CB.todo)+" "+s.id+": "+(s.label||""));
    if (s.children) lines.push(render(s.children, indent+"    "));
  }
  return lines.join("\n");
}
function main() {
  const fp = process.argv[2];
  if (!fp) { console.log(JSON.stringify({success:false,error:"Usage: node show-omissions-steps.js <PATH>"})); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(path.resolve(fp),"utf8"));
  console.log(render(data.steps||[],""));
  console.error(JSON.stringify({success:true}));
}
if (require.main === module) main();
module.exports = { render };
