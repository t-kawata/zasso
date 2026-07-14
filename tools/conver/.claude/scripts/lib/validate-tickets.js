const fs = require('fs'), path = require('path');
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^(?:PX|P(-?\d+))-(\d+)$/; // CLI 引数用: P{phaseId}-{ticketId} または PX-{ticketId}
const ALLOWED = ['todo', 'made', 'planned', 'done', 'reviewed'];

function validateTickets(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) { errors.push('Root must be a non-null object'); return { valid: false, errors }; }
  if (!data.title || typeof data.title !== 'string') errors.push('title: must be a non-empty string');
  if (!data.metadata || typeof data.metadata !== 'object' || Array.isArray(data.metadata)) {
    errors.push('metadata: must be an object');
  } else {
    if (!data.metadata.source || typeof data.metadata.source !== 'string') errors.push('metadata.source: required');
    if (!data.metadata.generatedAt || typeof data.metadata.generatedAt !== 'string' || !ISO_RE.test(data.metadata.generatedAt)) errors.push('metadata.generatedAt: must be YYYY-MM-DD');
  }
  if (!Array.isArray(data.phases)) { errors.push('phases: must be an array'); return { valid: false, errors }; }
  const seen = {}; // 重複チェック: key "phaseId-id"
  for (let i = 0; i < data.phases.length; i++) {
    const p = data.phases[i], pp = 'phases[' + i + ']';
    if (!p || typeof p !== 'object' || Array.isArray(p)) { errors.push(pp + ': must be an object'); continue; }
    if (typeof p.id !== 'number' || !Number.isInteger(p.id) || p.id < -1) errors.push(pp + '.id: must be an integer >= -1');
    if (!p.name || typeof p.name !== 'string') errors.push(pp + '.name: required');
    const pId = (typeof p.id === 'number' && Number.isInteger(p.id)) ? p.id : -1;
    if (!Array.isArray(p.tickets)) { errors.push(pp + '.tickets: must be an array'); continue; }
    for (let k = 0; k < p.tickets.length; k++) {
      const t = p.tickets[k], tp = pp + '.tickets[' + k + ']';
      if (!t || typeof t !== 'object' || Array.isArray(t)) { errors.push(tp + ': must be an object'); continue; }
      if (typeof t.id !== 'number' || !Number.isInteger(t.id) || t.id < 1) errors.push(tp + '.id: must be integer >= 1');
      if (typeof t.phaseId !== 'number' || !Number.isInteger(t.phaseId) || t.phaseId < -1) errors.push(tp + '.phaseId: must be integer >= -1');
      if (pId >= -1 && t.phaseId !== undefined && t.phaseId !== pId) errors.push(tp + '.phaseId (' + t.phaseId + ') does not match parent phase id (' + pId + ')');
      if (!t.title || typeof t.title !== 'string') errors.push(tp + '.title: required');
      if (!t.status || !ALLOWED.includes(t.status)) errors.push(tp + '.status: must be one of ' + ALLOWED.join(', '));
      const arrayFields = ['scope','testUnit','testIntegration','testExceptions','referenceUrls','sourcePaths','rfcDiscrepancies'];
      for (const f of arrayFields) {
        if (t[f] !== undefined) {
          if (!Array.isArray(t[f])) errors.push(tp + '.' + f + ': must be array');
          else for (let i = 0; i < t[f].length; i++) { if (typeof t[f][i] !== 'string') errors.push(tp + '.' + f + '[' + i + ']: must be string'); }
        }
      }
      if (t.changes !== undefined) {
        if (!Array.isArray(t.changes)) errors.push(tp + '.changes: must be array');
        else for (let i = 0; i < t.changes.length; i++) { if (!t.changes[i] || typeof t.changes[i] !== 'object') errors.push(tp + '.changes[' + i + ']: must be object'); }
      }
      const strFields = ['referenceSection','specPath','relatedTicketIds','invariants','background','startedAt','completedAt','instrumentation','investigation','boyScoutPlan','notes'];
      for (const f of strFields) { if (t[f] !== undefined && typeof t[f] !== 'string') errors.push(tp + '.' + f + ': must be string'); }
      if (t.id && t.phaseId) {
        const key = t.phaseId + '-' + t.id;
        if (seen[key]) errors.push(tp + ': duplicate (phaseId=' + t.phaseId + ', id=' + t.id + ')');
        seen[key] = true;
      }
    }
  }
  if (data.dependencyMap !== undefined && typeof data.dependencyMap !== 'string') errors.push('dependencyMap: must be string');
  if (data.checklist !== undefined) {
    if (!Array.isArray(data.checklist)) errors.push('checklist: must be array');
    else for (let i = 0; i < data.checklist.length; i++) {
      const e = data.checklist[i], ep = 'checklist[' + i + ']';
      if (!e || typeof e !== 'object' || Array.isArray(e)) { errors.push(ep + ': must be object'); continue; }
      if (!e.phase || typeof e.phase !== 'string') errors.push(ep + '.phase: required');
    }
  }
  return { valid: errors.length === 0, errors };
}

function validateTicketRecord(t, prefix) {
  const errors = [];
  if (!t || typeof t !== 'object' || Array.isArray(t)) { errors.push(prefix + ': must be object'); return errors; }
  if (typeof t.id !== 'number' || !Number.isInteger(t.id) || t.id < 1) errors.push(prefix + '.id: must be integer >= 1');
  if (typeof t.phaseId !== 'number' || !Number.isInteger(t.phaseId) || t.phaseId < -1) errors.push(prefix + '.phaseId: must be integer >= -1');
  if (!t.title || typeof t.title !== 'string') errors.push(prefix + '.title: required');
  if (!t.status || !ALLOWED.includes(t.status)) errors.push(prefix + '.status: must be one of ' + ALLOWED.join(', '));
  return errors;
}

function parseTicketKey(key) {
  const m = key.match(KEY_RE);
  if (!m) return null;
  return { phaseId: m[1] !== undefined ? parseInt(m[1], 10) : -1, ticketId: parseInt(m[2], 10) };
}

function main() {
  const fp = process.argv[2];
  if (!fp) { console.log(JSON.stringify({ success: false, error: 'Usage: ...' })); process.exit(1); }
  const rp = path.resolve(fp);
  if (!fs.existsSync(rp)) { console.log(JSON.stringify({ success: false, error: 'Not found' })); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(rp, 'utf8'));
  const r = validateTickets(data);
  if (!r.valid) { console.log(JSON.stringify({ success: false, error: 'Validation failed', errors: r.errors })); process.exit(1); }
  console.log(JSON.stringify({ success: true, valid: true })); process.exit(0);
}

if (require.main === module) main();
module.exports = { validateTickets, validateTicketRecord, parseTicketKey };
