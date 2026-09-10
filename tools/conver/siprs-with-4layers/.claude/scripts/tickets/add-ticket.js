const fs = require("fs"),
  path = require("path");
const { validateTickets } = require("../lib/validate-tickets");

/**
 * Resolve a phase from the argument (phaseArg).
 *
 * - "PX" → id=-1 (detached phase)
 * - "P{n}" → id=n
 * - otherwise → prefix match on name
 *
 * @param {Object[]} phases — phases array from Tickets.json
 * @param {string} phaseArg — phase specifier
 * @returns {Object|null} matching phase or null
 */
function resolvePhase(phases, phaseArg) {
  if (phaseArg === "PX")
    return phases.find(function (p) {
      return p.id === -1;
    });
  const matchResult = phaseArg.match(/^P(-?\d+)$/);
  if (matchResult)
    return phases.find(function (p) {
      return p.id === parseInt(matchResult[1], 10);
    });
  return phases.find(function (p) {
    return p.name.startsWith(phaseArg);
  });
}

/**
 * Add one ticket to an existing Tickets.json (non-destructive: rollback on validation failure).
 *
 * @param {string} ticketsJsonPath — path to Tickets.json
 * @param {string} phaseArg — phase specifier ("PX", "P{n}", phase name)
 * @param {Object} ticketData — ticket data to add (phaseName is stripped if present)
 * @returns {{ success: boolean, ticketKey?: string, phase?: string, path?: string, error?: string }}
 */
function addTicket(ticketsJsonPath, phaseArg, ticketData) {
  const resolvedPath = path.resolve(ticketsJsonPath);
  const data = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  let phase = resolvePhase(data.phases, phaseArg);
  if (!phase) {
    const phaseName = ticketData.phaseName || phaseArg;
    if (!phaseName) {
      return {
        success: false,
        error: 'Phase "' + phaseArg + '" not found. Specify phaseName.',
      };
    }
    // PX の場合は id=-1（独立フェーズ）に固定。それ以外は既存フェーズ id の最大値 + 1 で自動採番
    // （PX の -1 は最大値に影響しないため、配列長ではなく max+1 を使う — data.phases.length は PX を数えてしまう）
    const maxPhaseId = data.phases.reduce((max, p) => Math.max(max, p.id), 0);
    const phaseId = phaseArg === "PX" ? -1 : maxPhaseId + 1;
    phase = { id: phaseId, name: phaseName, tickets: [] };
    data.phases.push(phase);
  }
  let maxId = 0;
  for (const existingTicket of phase.tickets || []) {
    if (existingTicket.id > maxId) maxId = existingTicket.id;
  }
  const newId = maxId + 1;
  const { phaseName, ...cleanTicketData } = ticketData;
  const ticket = { id: newId, phaseId: phase.id, status: "todo", ...cleanTicketData };
  phase.tickets.push(ticket);
  const validationResult = validateTickets(data);
  if (!validationResult.valid) {
    phase.tickets.pop();
    return {
      success: false,
      error: "Validation failed",
      errors: validationResult.errors,
    };
  }
  fs.writeFileSync(resolvedPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  return {
    success: true,
    ticketKey: (phase.id === -1 ? "PX" : "P" + phase.id) + "-" + newId,
    phase: phase.name,
    path: resolvedPath,
  };
}

function main() {
  const ticketsJsonPath = process.argv[2],
    phaseArg = process.argv[3];
  if (!ticketsJsonPath || !phaseArg) {
    console.log(
      JSON.stringify({
        success: false,
        error:
          "Usage: node add-ticket.js <PATH to Tickets.json> <P{id}|phase-name>",
      }),
    );
    process.exit(1);
  }
  let ticketData;
  try {
    ticketData = JSON.parse(fs.readFileSync("/dev/stdin", "utf8"));
  } catch (e) {
    console.log(JSON.stringify({ success: false, error: "stdin parse fail" }));
    process.exit(1);
  }
  const result = addTicket(ticketsJsonPath, phaseArg, ticketData);
  if (!result.success) {
    console.log(JSON.stringify(result));
    process.exit(1);
  }
  console.log(JSON.stringify(result));
}
if (require.main === module) main();
module.exports = { main, addTicket };
