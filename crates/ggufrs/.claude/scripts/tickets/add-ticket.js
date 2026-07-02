const fs = require("fs"),
  path = require("path");
const { validateTickets } = require("../lib/validate-tickets");

function resolvePhase(phases, arg) {
  if (arg === "PX")
    return phases.find(function (p) {
      return p.id === -1;
    });
  const m = arg.match(/^P(-?\d+)$/);
  if (m)
    return phases.find(function (p) {
      return p.id === parseInt(m[1], 10);
    });
  return phases.find(function (p) {
    return p.name.startsWith(arg);
  });
}

function main() {
  const jp = process.argv[2],
    pa = process.argv[3];
  if (!jp || !pa) {
    console.log(
      JSON.stringify({
        success: false,
        error:
          "Usage: node add-ticket.js <PATH to Tickets.json> <P{id}|phase-name>",
      }),
    );
    process.exit(1);
  }
  const rp = path.resolve(jp);
  const data = JSON.parse(fs.readFileSync(rp, "utf8"));
  let td;
  try {
    td = JSON.parse(fs.readFileSync("/dev/stdin", "utf8"));
  } catch (e) {
    console.log(JSON.stringify({ success: false, error: "stdin parse fail" }));
    process.exit(1);
  }
  let ph = resolvePhase(data.phases, pa);
  if (!ph) {
    const pn = td.phaseName || pa;
    if (!pn) {
      console.log(
        JSON.stringify({
          success: false,
          error: 'Phase "' + pa + '" not found. Specify phaseName.',
        }),
      );
      process.exit(1);
    }
    ph = { id: data.phases.length, name: pn, tickets: [] };
    data.phases.push(ph);
  }
  let maxId = 0;
  for (const t of ph.tickets || []) {
    if (t.id > maxId) maxId = t.id;
  }
  const newId = maxId + 1;
  const { phaseName, ...clean } = td;
  const ticket = { id: newId, phaseId: ph.id, status: "todo", ...clean };
  ph.tickets.push(ticket);
  const vr = validateTickets(data);
  if (!vr.valid) {
    ph.tickets.pop();
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
    JSON.stringify({
      success: true,
      ticketKey: (ph.id === -1 ? "PX" : "P" + ph.id) + "-" + newId,
      phase: ph.name,
      path: rp,
    }),
  );
}
if (require.main === module) main();
module.exports = { main };
