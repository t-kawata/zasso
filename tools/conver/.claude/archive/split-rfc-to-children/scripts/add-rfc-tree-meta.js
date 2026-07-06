/**
 * add-rfc-tree-meta.js — RFC-TREE.json にメタデータを書き込む
 * Usage: echo '{"summary":"..."}' | node add-rfc-tree-meta.js <RFC_TREE_PATH>
 */
const fs = require("fs");
const path = require("path");
const { validateRfcTree } = require("./validate-rfc-tree");

function main() {
  const p = process.argv[2];
  if (!p) { console.log(JSON.stringify({ success: false, error: "Usage: node add-rfc-tree-meta.js <RFC_TREE_PATH> (stdin: JSON)" })); process.exit(1); }
  const fp = path.resolve(p);
  const data = JSON.parse(fs.readFileSync(fp, "utf8"));
  let buf = "";
  process.stdin.on("data", c => buf += c);
  process.stdin.on("end", () => {
    const u = JSON.parse(buf);
    if (u.canonicalRfcPath !== undefined) data.canonicalRfcPath = u.canonicalRfcPath;
    if (u.canonicalRfcTitle !== undefined) data.canonicalRfcTitle = u.canonicalRfcTitle;
    if (u.summary !== undefined) data.summary = u.summary;
    if (u.generatedAt !== undefined) data.generatedAt = u.generatedAt;
    if (u.language !== undefined) data.language = u.language;
    const vr = validateRfcTree(data);
    if (!vr.valid) { console.log(JSON.stringify({ success: false, error: "Validation failed", errors: vr.errors })); process.exit(1); }
    fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n");
    console.log(JSON.stringify({ success: true }));
  });
}
if (require.main === module) main();
