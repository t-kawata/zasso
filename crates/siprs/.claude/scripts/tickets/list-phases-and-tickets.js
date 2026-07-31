const fs = require('fs'), path = require('path');
const CB = {
  todo: '[ ]',
  made: '[_]',
  planned: '[|]',
  done: '[/]',
  reviewed: '[x]',
  remanded: '[!]'
};

/**
 * Resolve the markdown checkbox for a ticket status.
 * Round-aware statuses (R1, R2, ...) render as '[R<N>]'; all other statuses use
 * the CB lookup with '[ ]' as the fallback for unknown values.
 *
 * @param {string} status — Ticket status
 * @returns {string} — Markdown checkbox string
 */
// [::TICKET::] PX-114 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-114 --for-spec --no-implementation-order`.
function resolveCheckbox(status) {
  return /^R[1-9]\d*$/.test(status) ? '[' + status + ']' : (CB[status] || CB.todo);
}

/**
 * Build the markdown lines for a Tickets.json structure.
 * Pure function — no side effects, returns the lines array.
 *
 * @param {object} data — Parsed Tickets.json with phases[{id, name, tickets}]
 * @returns {string[]} — Markdown lines
 */
// [::TICKET::] PX-114 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-114 --for-spec --no-implementation-order`.
function renderTicketLines(data) {
  const lines = [];
  for (const p of (data.phases || [])) {
    const phaseLabel = p.id === -1 ? 'PX' : 'P' + p.id;
    const allReviewed = (p.tickets || []).length > 0 && (p.tickets || []).every(function(t) {
      return t.status === 'reviewed' || /^R[1-9]\d*$/.test(t.status);
    });
    lines.push('- ' + (allReviewed ? CB.reviewed : CB.todo) + ' ' + phaseLabel + ': ' + (p.name || ''));
    for (const t of (p.tickets || [])) {
      lines.push('    - ' + resolveCheckbox(t.status) + ' ' + phaseLabel + '-' + t.id + ': ' + (t.title || ''));
    }
  }
  return lines;
}

// [::TICKET::] PX-99, PX-100, PX-101, PX-114 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-99|PX-100|PX-101|PX-114) --for-spec --no-implementation-order`.
function main() {
  const jp = process.argv[2];
  if (!jp) { console.log(JSON.stringify({ success: false, error: 'Usage: ...' })); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(path.resolve(jp), 'utf8'));
  console.log(renderTicketLines(data).join('\n'));
}
if (require.main === module) main();
module.exports = { main, CB, resolveCheckbox, renderTicketLines };
