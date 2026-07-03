/**
 * get-rfc-tree-draft.js — RFC-TREE.json の draftTree を出力（AI確認用）
 * Usage: node get-rfc-tree-draft.js <RFC_TREE_PATH> [childId]
 */
const fs = require("fs"), path = require("path");
function main() {
  const p = process.argv[2], filter = process.argv[3];
  if (!p) { console.log(JSON.stringify({ success: false, error: "Usage: node get-rfc-tree-draft.js <RFC_TREE_PATH> [childId]" })); process.exit(1); }
  const fp = path.resolve(p);
  if (!fs.existsSync(fp)) { console.log(JSON.stringify({ success: false, error: `Not found: ${fp}` })); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(fp, "utf8"));
  const tree = data.draftTree;
  if (!Array.isArray(tree)) { console.log(JSON.stringify({ success: true, tree: [], count: 0 })); return; }
  if (filter) {
    const node = tree.find(c => c.childId === filter);
    if (!node) { console.log(JSON.stringify({ success: true, found: false, childId: filter })); return; }
    console.log(JSON.stringify({ success: true, found: true, child: node }));
  } else {
    console.log(JSON.stringify({ success: true, count: tree.length, tree }));
  }
}
if (require.main === module) main();
