/**
 * get-before-rfc-tree-understanding.js — RFC-TREE.json から前回の rfcUnderstanding を取得する
 *
 * find-omissions の get-before-rfc-understanding.js と論理は同一だが、
 * 読み取り元が OMISSIONS-XXX.json ではなく RFC-TREE.json である点が異なる。
 *
 * Usage: node get-before-rfc-tree-understanding.js <RFC_TREE_PATH> [field_name]
 */
const fs = require("fs");
const path = require("path");

function getPrevious(treePath, fieldName) {
  const resolved = path.resolve(treePath);
  if (!fs.existsSync(resolved)) return { success: true, hasPrevious: false };
  let data;
  try { data = JSON.parse(fs.readFileSync(resolved, "utf8")); }
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
  const treePath = process.argv[2], fieldName = process.argv[3];
  if (!treePath) { console.log(JSON.stringify({ success: false, error: "Usage: node get-before-rfc-tree-understanding.js <RFC_TREE_PATH> [field_name]" })); process.exit(1); }
  const result = getPrevious(treePath, fieldName);
  console.log(JSON.stringify(result));
  if (!result.success) process.exit(1);
}

if (require.main === module) main();
module.exports = { getPrevious };
