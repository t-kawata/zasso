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
  let found = false;
  for (const p of data.phases || []) {
    const idx = (p.tickets || []).findIndex(function (t) {
      return t.phaseId === k.phaseId && t.id === k.ticketId;
    });
    if (idx !== -1) {
      p.tickets.splice(idx, 1);
      found = true;
      break;
    }
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
  console.log(JSON.stringify({ success: true, ticketKey: key, deleted: true }));
}
if (require.main === module) main();
module.exports = { main };
