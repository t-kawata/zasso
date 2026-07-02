const fs = require("fs"), path = require("path");
const TYPES = ["missing_implementation","incomplete_implementation","design_deviation","bug","stub_remaining","test_missing","inconsistency"];

function addOmission(omPath, o) {
  const resolved = path.resolve(omPath);
  if (!fs.existsSync(resolved)) return { success:false, error:"File not found" };
  let data;
  try { data = JSON.parse(fs.readFileSync(resolved,"utf8")); } catch(e) { return { success:false, error:"Invalid JSON: "+e.message }; }
  if (!data.omissions) data.omissions = [];
  if (!o.type||!TYPES.includes(o.type)) return { success:false, error:"type: must be one of "+TYPES.join(", ") };
  if (!o.description||typeof o.description!=="string") return { success:false, error:"description: required" };
  let max = 0;
  for (const x of data.omissions) { const m = x.id&&x.id.match(/^O-(\d{3})$/); if (m) { const n=parseInt(m[1],10); if (n>max) max=n; } }
  const id = "O-"+String(max+1).padStart(3,"0");
  const entry = { id, type:o.type, description:o.description };
  for (const f of ["severity","rfcSection","details","suggestedResolution","resolvedInNextRfc"]) { if (o[f]!==undefined) entry[f]=o[f]; }
  if (o.affectedFiles!==undefined) entry.affectedFiles=o.affectedFiles;
  data.omissions.push(entry);
  fs.writeFileSync(resolved, JSON.stringify(data,null,2)+"\n");
  return { success:true, omissionId:id };
}

function main() {
  const p = process.argv[2];
  if (!p) { console.log(JSON.stringify({success:false,error:"Usage: echo '{...}' | node add-omission.js <OMISSIONS_FILE_PATH>"})); process.exit(1); }
  const chunks = [];
  process.stdin.on("data",c=>chunks.push(c));
  process.stdin.on("end",()=>{
    let input;
    try { input=JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch(e) { console.log(JSON.stringify({success:false,error:"Invalid JSON: "+e.message})); process.exit(1); }
    const r=addOmission(p,input);
    if (!r.success) { console.log(JSON.stringify(r)); process.exit(1); }
    console.log(JSON.stringify(r)); process.exit(0);
  });
}
if (require.main === module) main();
module.exports = { addOmission };
