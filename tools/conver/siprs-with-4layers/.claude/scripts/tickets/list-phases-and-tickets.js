const fs = require('fs'), path = require('path');
const CB = {
  todo: '[ ]',
  made: '[_]',
  planned: '[|]',
  done: '[/]',
  reviewed: '[x]',
  remanded: '[!]'
};

// Sentinel phase id for the independent PX phase, which always renders first.
const PX_PHASE_ID = -1;

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
// [::TICKET::] PX-114, PX-144, PX-145, PX-146 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-114|PX-144|PX-145|PX-146) --for-spec --no-implementation-order`.
function renderTicketLines(data) {
  const lines = [];
  for (const p of (data.phases || [])) {
    const phaseLabel = p.id === PX_PHASE_ID ? 'PX' : 'P' + p.id;
    const allReviewed = (p.tickets || []).length > 0 && (p.tickets || []).every(function(t) {
      // PX-144: forNextRound tickets are deferred to the next round and do not
      // count as pending work for the phase completion display.
      return t.forNextRound === true || t.status === 'reviewed' || /^R[1-9]\d*$/.test(t.status);
    });
    lines.push('- ' + (allReviewed ? CB.reviewed : CB.todo) + ' ' + phaseLabel + ': ' + (p.name || ''));
    for (const t of (p.tickets || [])) {
      // PX-144: forNextRound tickets render with a distinct marker ([→] = next round).
      const checkbox = t.forNextRound === true ? '[→]' : resolveCheckbox(t.status);
      lines.push('    - ' + checkbox + ' ' + phaseLabel + '-' + t.id + ': ' + (t.title || ''));
    }
  }
  return lines;
}

/**
 * Order phases so the PX phase (id === -1) is always first.
 * Pure function — returns the input array unchanged when no reorder is needed,
 * and a new array (PX first, others in original relative order) otherwise.
 * Returning the same reference lets callers detect "nothing changed" cheaply.
 *
 * @param {Array<object>|undefined} phases — Phases from Tickets.json
 * @returns {Array<object>|undefined} — Reordered array, or the same reference when unchanged
 */
function orderPhasesPxFirst(phases) {
  if (!phases) return phases;
  const pxIndex = phases.findIndex(function (p) { return p.id === PX_PHASE_ID; });
  if (pxIndex <= 0) return phases; // PX absent or already first
  const pxPhase = phases[pxIndex];
  return [pxPhase].concat(phases.slice(0, pxIndex), phases.slice(pxIndex + 1));
}

/**
 * Persist the PX-first phase order to disk when the order changed.
 * Rewrites the file with 2-space indentation and a trailing newline, matching the
 * repository's Tickets.json convention. Skips the write when PX is already first
 * or absent, so an already-correct file keeps its mtime untouched.
 *
 * @param {string} filePath — Path to Tickets.json
 * @param {object} data — Parsed Tickets.json (phases is reordered in place)
 * @returns {boolean} — true when the file was rewritten, false when skipped
 */
function persistPxFirstOrder(filePath, data) {
  const reordered = orderPhasesPxFirst(data.phases);
  if (reordered === data.phases) return false;
  data.phases = reordered;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return true;
}

// [::TICKET::] PX-99, PX-100, PX-101, PX-114 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-99|PX-100|PX-101|PX-114) --for-spec --no-implementation-order`.
/**
 * Load Tickets.json, ensure the PX phase (id === -1) is first — persisting the
 * reorder to the file only when needed — then print the phase/ticket markdown listing.
 */
function main() {
  const jp = process.argv[2];
  if (!jp) { console.log(JSON.stringify({ success: false, error: 'Usage: ...' })); process.exit(1); }
  const rp = path.resolve(jp);
  const data = JSON.parse(fs.readFileSync(rp, 'utf8'));
  persistPxFirstOrder(rp, data);
  console.log(renderTicketLines(data).join('\n'));
}
if (require.main === module) main();
module.exports = { main, CB, resolveCheckbox, renderTicketLines, orderPhasesPxFirst, persistPxFirstOrder };
