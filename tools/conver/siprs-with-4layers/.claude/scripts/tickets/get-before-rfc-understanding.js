const fs = require("fs"), path = require("path");
const OMISSION_RE = /^OMISSIONS-(\d{3})\.json$/;

function getPrevious(rfcDir, fieldName) {
  const resolved = path.resolve(rfcDir);
  if (!fs.existsSync(resolved)) return { success: true, hasPrevious: false };
  if (!fs.statSync(resolved).isDirectory()) return { success: true, hasPrevious: false };

  let maxNum = 0, secondMaxNum = 0, prevFile = null;
  for (const f of fs.readdirSync(resolved)) {
    const m = f.match(OMISSION_RE);
    if (m) {
      const n = parseInt(m[1],10);
      if (n > maxNum) { secondMaxNum = maxNum; maxNum = n; }
      else if (n > secondMaxNum) { secondMaxNum = n; }
    }
  }
  if (!secondMaxNum) return { success: true, hasPrevious: false };
  const padded = String(secondMaxNum).padStart(3, "0");
  prevFile = "OMISSIONS-" + padded + ".json";

  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(resolved, prevFile),"utf8")); }
  catch (e) { return { success: true, hasPrevious: false }; }

  const ru = data.rfcUnderstanding;
  if (!ru || typeof ru !== "object") return { success: true, hasPrevious: false };

  if (fieldName) {
    if (!ru[fieldName] || typeof ru[fieldName] !== "string" || !ru[fieldName].trim())
      return { success: true, hasPrevious: false };
    return { success: true, hasPrevious: true, fields: { [fieldName]: ru[fieldName] } };
  }

  const fields = {};
  let hasAny = false;
  for (const [k, v] of Object.entries(ru)) {
    if (v && typeof v === "string" && v.trim()) { fields[k] = v; hasAny = true; }
  }
  if (!hasAny) return { success: true, hasPrevious: false };
  return { success: true, hasPrevious: true, fields };
}

function main() {
  const rfcDir = process.argv[2], fieldName = process.argv[3];
  if (!rfcDir) { console.log(JSON.stringify({success:false,error:"Usage: node get-before-rfc-understanding.js <RFC_DIR> [field_name]"})); process.exit(1); }
  const result = getPrevious(rfcDir, fieldName);
  console.log(JSON.stringify(result));
  if (!result.success) process.exit(1);
}

if (require.main === module) main();
module.exports = { getPrevious };
