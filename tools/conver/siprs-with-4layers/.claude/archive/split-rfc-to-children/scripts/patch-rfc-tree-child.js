/**
 * patch-rfc-tree-child.js — draftTree の子ノードを1件ずつ追加・更新・削除
 * Usage: node patch-rfc-tree-child.js <RFC_TREE_PATH> <childId> [set|delete]
 *   stdin（set時）: 更新フィールドのJSON（部分指定可）
 *   例: echo '{"ioSchema":"pub fn parse()"}' | node patch-rfc-tree-child.js tree.json 01 set
 */
const fs = require("fs"), path = require("path"), { validateRfcTree } = require("./validate-rfc-tree");

function main() {
  const p = process.argv[2], cid = process.argv[3], action = process.argv[4] || "set";
  if (!p || !cid) { console.log(JSON.stringify({ success: false, error: "Usage: node patch-rfc-tree-child.js <PATH> <childId> [set|delete]" })); process.exit(1); }
  const fp = path.resolve(p);
  if (!fs.existsSync(fp)) { console.log(JSON.stringify({ success: false, error: `Not found: ${fp}` })); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(fp, "utf8"));
  if (!Array.isArray(data.draftTree)) data.draftTree = [];

  if (action === "delete") {
    const idx = data.draftTree.findIndex(c => c.childId === cid);
    if (idx === -1) { console.log(JSON.stringify({ success: false, error: `Child "${cid}" not found. Existing: [${data.draftTree.map(c=>c.childId).join(",")}]` })); process.exit(1); }
    const removed = data.draftTree.splice(idx, 1)[0];
    const vr = validateRfcTree(data);
    if (!vr.valid) { console.log(JSON.stringify({ success: false, error: `Delete of "${cid}" caused validation errors - probably another node still depends on it.`, errors: vr.errors })); process.exit(1); }
    fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n");
    console.log(JSON.stringify({ success: true, action: "deleted", childId: cid }));
    return;
  }

  let buf = "";
  process.stdin.on("data", c => buf += c);
  process.stdin.on("end", () => {
    let patch;
    try { patch = JSON.parse(buf); } catch (e) { console.log(JSON.stringify({ success: false, error: `stdin parse error: ${e.message}` })); process.exit(1); }
    const existing = data.draftTree.find(c => c.childId === cid);
    if (existing) {
      const saved = JSON.stringify(existing);
      Object.assign(existing, patch);
      existing.childId = cid;
      const vr = validateRfcTree(data);
      if (!vr.valid) { Object.assign(data.draftTree.find(c => c.childId === cid), JSON.parse(saved)); console.log(JSON.stringify({ success: false, error: `Validation failed after updating "${cid}". Reverted.`, errors: vr.errors })); process.exit(1); }
      fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n");
      console.log(JSON.stringify({ success: true, action: "updated", childId: cid, child: existing }));
    } else {
      const newNode = { childId: cid, ...patch };
      data.draftTree.push(newNode);
      const vr = validateRfcTree(data);
      if (!vr.valid) { data.draftTree.pop(); console.log(JSON.stringify({ success: false, error: `Validation failed after adding "${cid}". Removed.`, errors: vr.errors })); process.exit(1); }
      fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n");
      console.log(JSON.stringify({ success: true, action: "added", childId: cid, child: newNode }));
    }
  });
}

if (require.main === module) main();
