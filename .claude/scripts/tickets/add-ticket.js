const fs = require("fs"),
  path = require("path");
const { validateTickets } = require("../lib/validate-tickets");

/**
 * 引数（phaseArg）からフェーズを解決する。
 *
 * - "PX" → id=-1（独立フェーズ）
 * - "P{n}" → id=n
 * - その他 → name の前方一致で検索
 *
 * @param {Object[]} phases — Tickets.json の phases 配列
 * @param {string} phaseArg — フェーズ指定子
 * @returns {Object|null} 該当するフェーズオブジェクト、なければ null
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
 * 既存Tickets.jsonにチケットを1件追加する（非破壊的：検証失敗時はロールバック）。
 *
 * @param {string} ticketsJsonPath — Tickets.json のファイルパス
 * @param {string} phaseArg — フェーズ指定子（"PX", "P{n}", phase name）
 * @param {Object} ticketData — 追加するチケットデータ（phaseName を含む場合は除去される）
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
    phase = { id: data.phases.length, name: phaseName, tickets: [] };
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
