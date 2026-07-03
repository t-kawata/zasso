/**
 * add-phase.js — Tickets.json にフェーズを追加（id 自動採番）
 *
 * 使用法:
 *   echo '{"name":"Phase 0: ...","externalDependencies":"..."}' | \
 *     node add-phase.js <PATH to Tickets.json>
 *
 * id は既存の最大 id + 1 で自動採番される。
 */
const fs = require("fs"),
  path = require("path");
const { validateTickets } = require("../lib/validate-tickets");

function main() {
  const jp = process.argv[2];
  if (!jp) {
    console.log(
      JSON.stringify({
        success: false,
        error: "Usage: node add-phase.js <PATH to Tickets.json>",
      }),
    );
    process.exit(1);
  }
  const rp = path.resolve(jp);
  const data = JSON.parse(fs.readFileSync(rp, "utf8"));
  let pd;
  try {
    pd = JSON.parse(fs.readFileSync("/dev/stdin", "utf8"));
  } catch (e) {
    console.log(JSON.stringify({ success: false, error: "stdin parse fail" }));
    process.exit(1);
  }
  if (!pd.name) {
    console.log(JSON.stringify({ success: false, error: "name required" }));
    process.exit(1);
  }
  let maxId = -1;
  for (const p of data.phases || []) {
    if (p.id > maxId) maxId = p.id;
  }
  const ph = {
    id: maxId + 1,
    name: pd.name,
    externalDependencies: pd.externalDependencies || "",
    tickets: [],
  };
  data.phases.push(ph);
  const vr = validateTickets(data);
  if (!vr.valid) {
    data.phases.pop();
    console.log(
      JSON.stringify({
        success: false,
        error: "Validation failed",
        errors: vr.errors,
      }),
    );
    process.exit(1);
  }
  fs.writeFileSync(rp, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ success: true, phaseId: ph.id, name: ph.name }));
}
if (require.main === module) main();
module.exports = { main };
