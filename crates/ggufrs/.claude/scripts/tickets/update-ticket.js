const fs = require("fs"),
  path = require("path");
const { validateTickets, parseTicketKey } = require("../lib/validate-tickets");
function main() {
  const jp = process.argv[2],
    key = process.argv[3];
  if (!jp || !key) {
    console.log(JSON.stringify({ success: false, error: "Usage: ..." }));
    process.exit(1);
  }
  const k = parseTicketKey(key);
  if (!k) {
    console.log(
      JSON.stringify({
        success: false,
        error: "Invalid key. Use P{phaseID}-{ticketID}",
      }),
    );
    process.exit(1);
  }
  const rp = path.resolve(jp);
  const data = JSON.parse(fs.readFileSync(rp, "utf8"));
  let updates;
  try {
    updates = JSON.parse(fs.readFileSync("/dev/stdin", "utf8"));
  } catch (e) {
    console.log(JSON.stringify({ success: false, error: "stdin fail" }));
    process.exit(1);
  }
  let found = null;
  for (const p of data.phases || []) {
    for (let i = 0; i < (p.tickets || []).length; i++) {
      if (
        p.tickets[i].phaseId === k.phaseId &&
        p.tickets[i].id === k.ticketId
      ) {
        const { id, phaseId, ...safe } = updates;
        p.tickets[i] = { ...p.tickets[i], ...safe };
        found = p.tickets[i];
        break;
      }
    }
    if (found) break;
  }
  if (!found) {
    console.log(JSON.stringify({ success: false, error: "Not found: " + key }));
    process.exit(1);
  }
  const vr = validateTickets(data);
  if (!vr.valid) {
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
  console.log(
    JSON.stringify({ success: true, ticketKey: key, updated: found }),
  );
}
if (require.main === module) main();
module.exports = { main };
