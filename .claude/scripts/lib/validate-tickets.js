// [::TICKET::] PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-107 --for-spec --no-implementation-order`.

// [::TICKET::] PX-106 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-106 --for-spec --no-implementation-order`.

const fs = require('fs'), path = require('path');
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^(?:PX|P(-?\d+))-(\d+)$/; // For CLI args: P{phaseId}-{ticketId} or PX-{ticketId}
const ALLOWED = ['todo', 'made', 'planned', 'done', 'reviewed', 'remanded'];
const isRoundStatus = (s) => /^R[1-9]\d*$/.test(s);

// [::TICKET::] PX-66, PX-67, PX-68, PX-69, PX-70, PX-71, PX-73, PX-114, P25-2, P25-3, P25-4, P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-66|PX-67|PX-68|PX-69|PX-70|PX-71|PX-73|PX-114|P25-2|P25-3|P25-4|P25-5|P25-6) --for-spec --no-implementation-order`.
function validateTickets(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) { errors.push('Root must be a non-null object'); return { valid: false, errors }; }
  if (!data.title || typeof data.title !== 'string') errors.push('title: must be a non-empty string');
  if (typeof data.round !== 'number' || !Number.isInteger(data.round) || data.round < 1) errors.push('round: must be a positive integer >= 1');
  if (!data.metadata || typeof data.metadata !== 'object' || Array.isArray(data.metadata)) {
    errors.push('metadata: must be an object');
  } else {
    if (!data.metadata.source || typeof data.metadata.source !== 'string') errors.push('metadata.source: required');
    if (!data.metadata.generatedAt || typeof data.metadata.generatedAt !== 'string' || !ISO_RE.test(data.metadata.generatedAt)) errors.push('metadata.generatedAt: must be YYYY-MM-DD');
  }
  if (!Array.isArray(data.phases)) { errors.push('phases: must be an array'); return { valid: false, errors }; }
  const seen = {}; // Dedup check: key "phaseId-id"
  for (let i = 0; i < data.phases.length; i++) {
    const phase = data.phases[i], phasePath = 'phases[' + i + ']';
    if (!phase || typeof phase !== 'object' || Array.isArray(phase)) { errors.push(phasePath + ': must be an object'); continue; }
    if (typeof phase.id !== 'number' || !Number.isInteger(phase.id) || phase.id < -1) errors.push(phasePath + '.id: must be an integer >= -1');
    if (!phase.name || typeof phase.name !== 'string') errors.push(phasePath + '.name: required');
    const phaseId = (typeof phase.id === 'number' && Number.isInteger(phase.id)) ? phase.id : -1;
    if (!Array.isArray(phase.tickets)) { errors.push(phasePath + '.tickets: must be an array'); continue; }
    for (let k = 0; k < phase.tickets.length; k++) {
      const ticket = phase.tickets[k], ticketPath = phasePath + '.tickets[' + k + ']';
      if (!ticket || typeof ticket !== 'object' || Array.isArray(ticket)) { errors.push(ticketPath + ': must be an object'); continue; }
      if (typeof ticket.id !== 'number' || !Number.isInteger(ticket.id) || ticket.id < 1) errors.push(ticketPath + '.id: must be integer >= 1');
      if (typeof ticket.phaseId !== 'number' || !Number.isInteger(ticket.phaseId) || ticket.phaseId < -1) errors.push(ticketPath + '.phaseId: must be integer >= -1');
      if (phaseId >= -1 && ticket.phaseId !== undefined && ticket.phaseId !== phaseId) errors.push(ticketPath + '.phaseId (' + ticket.phaseId + ') does not match parent phase id (' + phaseId + ')');
      if (!ticket.title || typeof ticket.title !== 'string') errors.push(ticketPath + '.title: required');
      if (!ticket.status || (!ALLOWED.includes(ticket.status) && !isRoundStatus(ticket.status))) errors.push(ticketPath + '.status: must be one of ' + ALLOWED.join(', '));
      const arrayFields = ['scope','testUnit','testIntegration','testExceptions','referenceUrls','sourcePaths','rfcDiscrepancies','acceptanceCriteria'];
      for (const field of arrayFields) {
        if (ticket[field] !== undefined) {
          if (!Array.isArray(ticket[field])) errors.push(ticketPath + '.' + field + ': must be array');
          else for (let i = 0; i < ticket[field].length; i++) { if (typeof ticket[field][i] !== 'string') errors.push(ticketPath + '.' + field + '[' + i + ']: must be string'); }
        }
      }
      if (ticket.changes !== undefined) {
        if (!Array.isArray(ticket.changes)) errors.push(ticketPath + '.changes: must be array');
        else for (let i = 0; i < ticket.changes.length; i++) { if (!ticket.changes[i] || typeof ticket.changes[i] !== 'object') errors.push(ticketPath + '.changes[' + i + ']: must be object'); }
      }
      // contracts validation — optional at schema level, enforced by Gate M at workflow level
      // [::TICKET::] PX-73: validate-tickets.js — contracts made optional for backward compatibility
      if (ticket.contracts !== undefined) {
        if (!Array.isArray(ticket.contracts)) {
          errors.push(ticketPath + '.contracts: must be array');
        } else if (ticket.contracts.length === 0) {
          errors.push(ticketPath + '.contracts: must not be empty if present');
        } else {
        for (let ci = 0; ci < ticket.contracts.length; ci++) {
          const contract = ticket.contracts[ci], contractPath = ticketPath + '.contracts[' + ci + ']';
          if (!contract || typeof contract !== 'object' || Array.isArray(contract)) errors.push(contractPath + ': must be object');
          else {
            if (typeof contract.id !== 'string' || !/^C\d{3}$/.test(contract.id)) errors.push(contractPath + '.id: must match C000 format (e.g. C001)');
            if (typeof contract.sourceEdge !== 'string' || contract.sourceEdge.length < 1) errors.push(contractPath + '.sourceEdge: must be non-empty string');
            if (typeof contract.precondition !== 'string' || contract.precondition.length < 1) errors.push(contractPath + '.precondition: must be non-empty string');
            if (typeof contract.postcondition !== 'string' || contract.postcondition.length < 1) errors.push(contractPath + '.postcondition: must be non-empty string');
            if (typeof contract.invariant !== 'string' || contract.invariant.length < 1) errors.push(contractPath + '.invariant: must be non-empty string');
          }
        }
        }
      }
      const strFields = ['referenceSection','specPath','relatedTicketIds','invariants','background','startedAt','completedAt','instrumentation','investigation','boyScoutPlan','notes','created_at','updated_at'];
      for (const field of strFields) { if (ticket[field] !== undefined && typeof ticket[field] !== 'string') errors.push(ticketPath + '.' + field + ': must be string'); }
      if (ticket.id && ticket.phaseId) {
        const key = ticket.phaseId + '-' + ticket.id;
        if (seen[key]) errors.push(ticketPath + ': duplicate (phaseId=' + ticket.phaseId + ', id=' + ticket.id + ')');
        seen[key] = true;
      }
    }
  }
  if (data.dependencyMap !== undefined && typeof data.dependencyMap !== 'string') errors.push('dependencyMap: must be string');
  if (data.checklist !== undefined) {
    if (!Array.isArray(data.checklist)) errors.push('checklist: must be array');
    else for (let i = 0; i < data.checklist.length; i++) {
      const entry = data.checklist[i], entryPath = 'checklist[' + i + ']';
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { errors.push(entryPath + ': must be object'); continue; }
      if (!entry.phase || typeof entry.phase !== 'string') errors.push(entryPath + '.phase: required');
    }
  }
  return { valid: errors.length === 0, errors };
}

// [::TICKET::] PX-114, P25-2, P25-3, P25-4, P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-114|P25-2|P25-3|P25-4|P25-5|P25-6) --for-spec --no-implementation-order`.
function validateTicketRecord(ticket, prefix) {
  const errors = [];
  if (!ticket || typeof ticket !== 'object' || Array.isArray(ticket)) { errors.push(prefix + ': must be object'); return errors; }
  if (typeof ticket.id !== 'number' || !Number.isInteger(ticket.id) || ticket.id < 1) errors.push(prefix + '.id: must be integer >= 1');
  if (typeof ticket.phaseId !== 'number' || !Number.isInteger(ticket.phaseId) || ticket.phaseId < -1) errors.push(prefix + '.phaseId: must be integer >= -1');
  if (!ticket.title || typeof ticket.title !== 'string') errors.push(prefix + '.title: required');
  if (!ticket.status || (!ALLOWED.includes(ticket.status) && !isRoundStatus(ticket.status))) errors.push(prefix + '.status: must be one of ' + ALLOWED.join(', '));
  return errors;
}

// Statuses at which a ticket has been implemented, and therefore owes the record
// of what it changed. Below them the record is not yet due: `add-ticket.js` does
// not create the `changes` key at all, so a rule that keyed on the field rather
// than the status would fire on every ticket that has not been implemented and
// miss the ones that have.
const CHANGE_RECORD_STATUSES = Object.freeze(['done', 'reviewed']);
const CHANGE_RECORD_FIELD = 'changes';

/**
 * The tickets that reached a status owing a change record and do not carry one.
 *
 * A reporter and not a validation error. `update-ticket.js` and `add-ticket.js`
 * reject the whole write when `validateTickets` returns invalid, so a completeness
 * rule wired into that gate would block every later write against the tickets it
 * names — including the writes of the ticket that adds the rule. The two are kept
 * apart deliberately, and `tests/change-record.test.cjs` holds them apart.
 *
 * An absent key and an empty array are the same defect here: at a status that owes
 * the record, both mean the chain from ticket to change is broken. Each finding
 * names the ticket, its status and the field, so a reader can act without searching.
 *
 * @param {object} data — a parsed Tickets.json
 * @returns {string[]} findings, ordered by phase then ticket id
 */
// [::TICKET::] P25-1, P25-2, P25-3, P25-4, P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-1|P25-2|P25-3|P25-4|P25-5|P25-6) --for-spec --no-implementation-order`.
function reportEmptyChangeSets(data) {
  if (!data || !Array.isArray(data.phases)) return [];

  const owing = [];
  for (const phase of data.phases) {
    if (!phase || !Array.isArray(phase.tickets)) continue;
    for (const ticket of phase.tickets) {
      if (!ticket || !CHANGE_RECORD_STATUSES.includes(ticket.status)) continue;
      if (Array.isArray(ticket[CHANGE_RECORD_FIELD]) && ticket[CHANGE_RECORD_FIELD].length > 0) continue;
      owing.push(ticket);
    }
  }

  return owing
    .sort((left, right) => (left.phaseId - right.phaseId) || (left.id - right.id))
    .map((ticket) =>
      'P' + ticket.phaseId + '-' + ticket.id + ' (' + ticket.status + '): ' +
      CHANGE_RECORD_FIELD + ' must be a non-empty array');
}

// [::TICKET::] P25-1, P25-2, P25-3, P25-4, P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-1|P25-2|P25-3|P25-4|P25-5|P25-6) --for-spec --no-implementation-order`.
function parseTicketKey(key) {
  const match = key.match(KEY_RE);
  if (!match) return null;
  return { phaseId: match[1] !== undefined ? parseInt(match[1], 10) : -1, ticketId: parseInt(match[2], 10) };
}

/**
 * Write the one machine-readable verdict line this tool produces.
 *
 * `process.stdout.write` rather than `console.log`: the caller parses this line as
 * JSON, and naming the emit says so. A console call is indistinguishable from
 * leftover debug output to a reader and to `run-quality-checks.js`, which is the
 * check that flags exactly that.
 *
 * @param {object} verdict
 */
// [::TICKET::] P25-2, P25-3, P25-4, P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-2|P25-3|P25-4|P25-5|P25-6) --for-spec --no-implementation-order`.
function emitVerdict(verdict) {
  process.stdout.write(JSON.stringify(verdict) + '\n');
}

// [::TICKET::] P25-2, P25-3, P25-4, P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-2|P25-3|P25-4|P25-5|P25-6) --for-spec --no-implementation-order`.
function main() {
  const ticketsPath = process.argv[2];
  if (!ticketsPath) { emitVerdict({ success: false, error: 'Usage: ...' }); process.exit(1); }
  const resolvedPath = path.resolve(ticketsPath);
  if (!fs.existsSync(resolvedPath)) { emitVerdict({ success: false, error: 'Not found' }); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  const validation = validateTickets(data);
  if (!validation.valid) { emitVerdict({ success: false, error: 'Validation failed', errors: validation.errors }); process.exit(1); }
  emitVerdict({ success: true, valid: true }); process.exit(0);
}

if (require.main === module) main();
module.exports = { validateTickets, validateTicketRecord, reportEmptyChangeSets, parseTicketKey };
