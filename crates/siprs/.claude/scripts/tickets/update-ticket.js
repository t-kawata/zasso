const fs = require("fs"),
  path = require("path");
const { validateTickets, parseTicketKey } = require("../lib/validate-tickets");
function main() {
  const args = process.argv.slice(2);
  const jp = args[0],
    key = args[1],
    appendFlag = args[2] === '--append';
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
        if (appendFlag) {
          // --append mode: merge string/array fields, replace others
          for (const f of Object.keys(safe)) {
            const existing = p.tickets[i][f];
            const incoming = safe[f];
            if (typeof existing === 'string' && typeof incoming === 'string') {
              p.tickets[i][f] = existing + '\n' + incoming;
            } else if (Array.isArray(existing) && Array.isArray(incoming)) {
              p.tickets[i][f] = existing.concat(incoming);
            } else {
              p.tickets[i][f] = incoming;
            }
          }
        } else {
          p.tickets[i] = { ...p.tickets[i], ...safe };
        }
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
