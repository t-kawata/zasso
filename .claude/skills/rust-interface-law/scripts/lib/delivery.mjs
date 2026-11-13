const MUST_TYPES = new Set([
  'Rule', 'CodeBlock', 'ContractType', 'InterfaceBinding', 'Operation',
  'Documentation', 'Conformance',
]);
const FACT_HEADERS = new Set([
  'ID', 'Rule', 'Verification', 'Gate', 'Contract', 'Operation', 'Error',
  'Required', 'Field', 'Stage', 'Level', 'Status', 'Meaning', 'Effect',
  'Value', 'Type', 'Name', 'Scope', 'Phase', 'Input', 'Output',
]);
const GENERIC_REASONS = new Set(['n/a', 'na', 'none', 'not needed', 'reference', 'no reason', 'not applicable']);

export function isFactBearing(atom) {
  if (atom.type === 'Rule') return true;
  if (atom.classification === 'normative') return true;
  if (atom.type === 'CodeBlock') return String(atom.text ?? '').trim() !== '';
  if (atom.type === 'Table') {
    const headers = String(atom.text ?? '').split('\n')[0].split('|').map((cell) => cell.trim());
    return headers.some((header) => FACT_HEADERS.has(header));
  }
  return false;
}

export function buildDelivery({ atoms }) {
  const rules = atoms.filter((atom) => atom.type === 'Rule');
  const rulesBySource = new Map();
  for (const rule of rules) {
    if (!rulesBySource.has(rule.source)) rulesBySource.set(rule.source, []);
    rulesBySource.get(rule.source).push(rule);
  }
  const defaults = { Rule: 'must', CodeBlock: 'must' };
  const entries = [];
  for (const atom of atoms) {
    if (!isFactBearing(atom)) continue;
    if (defaults[atom.type]) continue;
    entries.push({
      id: atom.id,
      type: atom.type,
      decision: 'reference',
      reason: referenceReason(atom),
      delivered_by: deliveredBy(atom, rules, rulesBySource),
    });
  }
  return { schema: 'law-delivery/v1', defaults, atoms: entries };
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function referenceReason(atom) {
  if (atom.type === 'Table') {
    const headers = String(atom.text ?? '').split('\n')[0];
    return /Rule|Verification|Gate/.test(headers)
      ? 'rule table mirrored by the Rule atoms delivered in this document'
      : 'reference table; carries no rule-level fact';
  }
  return 'explanatory prose subordinate to the listed Rule atoms';
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function deliveredBy(atom, rules, rulesBySource) {
  const sourceRules = rulesBySource.get(atom.source) ?? [];
  let previous = null;
  let next = null;
  for (const rule of sourceRules) {
    if (rule.span.start_line <= atom.span.start_line) previous = rule;
    else if (!next) next = rule;
  }
  const nearby = [previous?.id, next?.id].filter(Boolean);
  if (nearby.length > 0) return [...new Set(nearby)];
  if (sourceRules.length > 0) return [sourceRules[0].id];
  return rules.length > 0 ? [rules[0].id] : [];
}

export function verifyDelivery({ atoms, delivery }) {
  const problems = [];
  if (delivery.schema !== 'law-delivery/v1' || !Array.isArray(delivery.atoms)) {
    return ['delivery schema is invalid'];
  }
  const rules = new Set(atoms.filter((atom) => atom.type === 'Rule').map((atom) => atom.id));
  const atomsById = new Map(atoms.map((atom) => [atom.id, atom]));
  const entries = new Map();
  for (const entry of delivery.atoms) {
    if (entries.has(entry.id)) problems.push('duplicate delivery entry: ' + entry.id);
    if (!atomsById.has(entry.id)) problems.push('delivery entry names a missing atom: ' + entry.id);
    if (!['must', 'reference'].includes(entry.decision)) problems.push('bad delivery decision: ' + entry.id);
    entries.set(entry.id, entry);
  }
  const defaults = delivery.defaults ?? {};
  for (const atom of atoms.filter(isFactBearing)) {
    const entry = entries.get(atom.id);
    const decision = entry?.decision ?? defaults[atom.type];
    if (!decision) problems.push('fact-bearing atom has no decision: ' + atom.id);
    if (decision === 'must' && !MUST_TYPES.has(atom.type)) problems.push('must is not allowed: ' + atom.id);
    if (decision === 'reference' && entry) {
      const reason = String(entry.reason ?? '').trim();
      if (reason.length < 20 || GENERIC_REASONS.has(reason.toLowerCase())) {
        problems.push('reference needs a specific reason: ' + atom.id);
      }
      if (['Table', 'Paragraph', 'List'].includes(atom.type)) {
        if (!Array.isArray(entry.delivered_by) || entry.delivered_by.length === 0) {
          problems.push('reference lacks delivered_by: ' + atom.id);
        } else {
          for (const ruleId of entry.delivered_by) {
            if (!rules.has(ruleId)) problems.push('delivered_by names a missing rule: ' + atom.id);
          }
        }
      }
    }
  }
  return [...new Set(problems)];
}
