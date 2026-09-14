const fs = require("fs"),
  path = require("path");
const { parseTicketKey } = require("../lib/validate-tickets");

/**
 * Search for a ticket in Tickets.json.
 * @param {string} jsonPath - Path to Tickets.json
 * @param {string} key - Key in "P0-1" or "PX-1" format
 * @returns {{ ticket: object, phase: string, ticketKey: string }}
 * @throws {Error} File read error, key format error, or not found
 */
function findTicket(jsonPath, key) {
  var rp = path.resolve(jsonPath);
  var data = JSON.parse(fs.readFileSync(rp, "utf8"));
  var k = parseTicketKey(key);
  if (!k) throw new Error('Invalid key format. Use P{phaseId}-{ticketId} or PX-{ticketId}');
  for (var pi = 0; pi < (data.phases || []).length; pi++) {
    var p = data.phases[pi];
    for (var ti = 0; ti < (p.tickets || []).length; ti++) {
      var t = p.tickets[ti];
      if (t.phaseId === k.phaseId && t.id === k.ticketId) {
        var label = (k.phaseId === -1 ? 'PX' : 'P' + k.phaseId) + '-' + k.ticketId;
        return { ticket: t, phase: p.name, ticketKey: label };
      }
    }
  }
  throw new Error('Ticket not found: ' + key);
}

function main() {
  var jp = process.argv[2],
    key = process.argv[3];
  if (!jp || !key) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node get-ticket.js <PATH to Tickets.json> <P{phaseID}-{ticketID}>' }));
    process.exit(1);
  }
  try {
    var result = findTicket(jp, key);
    console.log(JSON.stringify({ success: true, ticket: result.ticket, phase: result.phase }));
  } catch (e) {
    console.log(JSON.stringify({ success: false, error: e.message }));
    process.exit(1);
  }
}
if (require.main === module) main();
module.exports = { main, findTicket };
