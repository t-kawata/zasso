const fs = require("fs"),
  path = require("path");
const { validateTickets, parseTicketKey } = require("../lib/validate-tickets");
const { normalizePath } = require("../lib/malfeasance-utils");
// [::TICKET::] PX-85, PX-86, PX-87 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-85|PX-86|PX-87) --for-spec --no-implementation-order`.
// [::TICKET::] PX-91: Fields that must never use --append (idempotent overwrite only).
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-91 --for-spec --no-implementation-order`
const IDEMPOTENT_FIELDS = new Set(['targetStubs', 'targetCrimes']);
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
  // PX-92: Normalize file path fields in update data for cross-machine portability.
  // Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-92 --for-spec --no-implementation-order`
  if (updates.file && typeof updates.file === 'string') {
    updates.file = normalizePath(updates.file);
  }
  // Normalize file paths inside targetStubs/targetCrimes arrays
  for (const arrField of ['targetStubs', 'targetCrimes']) {
    const arr = updates[arrField];
    if (Array.isArray(arr)) {
      for (const entry of arr) {
        if (entry.file && typeof entry.file === 'string') {
          entry.file = normalizePath(entry.file);
        }
      }
    }
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
          // PX-91: Reject --append for idempotent fields (targetStubs, targetCrimes).
          // These must always be replaced (not appended) to prevent unbounded accumulation.
          for (const f of Object.keys(safe)) {
            if (IDEMPOTENT_FIELDS.has(f)) {
              console.log(JSON.stringify({
                success: false,
                error: '--append is not allowed for field "' + f + '". Use direct assignment (omit --append) instead.'
              }));
              process.exit(1);
            }
          }
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
          // Check for non-empty string field overwrite without --append (PX-85)
          for (const f of Object.keys(safe)) {
            const existing = p.tickets[i][f];
            if (typeof existing === 'string' && existing.length > 0 && typeof safe[f] === 'string') {
              console.error('[WARNING] Field "' + f + '" already has content (' + existing.length + ' chars). Use --append to concatenate.');
            }
          }
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
