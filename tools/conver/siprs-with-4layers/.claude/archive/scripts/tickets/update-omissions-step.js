const fs = require("fs"), path = require("path");
const ALLOWED = ["todo","in_progress","done"];
function findAndUpdate(steps, id, status) {
  for (const s of (steps||[])) {
    if (s.id === id) { s.status = status; return true; }
    if (s.children && findAndUpdate(s.children, id, status)) return true;
  }
  return false;
}
function main() {
  const fp = process.argv[2], stepId = process.argv[3], status = process.argv[4];
  if (!fp||!stepId||!status) { console.log(JSON.stringify({success:false,error:"Usage: node update-omissions-step.js <PATH> <STEP_ID> <STATUS>"})); process.exit(1); }
  if (!ALLOWED.includes(status)) { console.log(JSON.stringify({success:false,error:"Invalid status. Allowed: "+ALLOWED.join(", ")})); process.exit(1); }
  const resolved = path.resolve(fp);
  if (!fs.existsSync(resolved)) { console.log(JSON.stringify({success:false,error:"Not found: "+fp})); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(resolved,"utf8"));
  if (!findAndUpdate(data.steps, stepId, status)) { console.log(JSON.stringify({success:false,error:"Step not found: "+stepId})); process.exit(1); }
  fs.writeFileSync(resolved, JSON.stringify(data,null,2)+"\n");
  console.log(JSON.stringify({success:true, step:stepId, status:status}));
}
if (require.main === module) main();
module.exports = { findAndUpdate };
