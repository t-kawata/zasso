const RULE_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/;

export function buildNormativeInventory({ atoms }) {
  const rules = atoms.filter((atom) => atom.type === 'Rule');
  const rulesBySource = new Map();
  for (const atom of rules) {
    if (!rulesBySource.has(atom.source)) rulesBySource.set(atom.source, []);
    rulesBySource.get(atom.source).push(atom);
  }
  const entries = [];
  for (const atom of atoms) {
    if (atom.type === 'Rule') {
      entries.push({ id: atom.id, kind: 'rule', rule_id: atom.id });
      continue;
    }
    if (atom.classification !== 'normative') continue;
    const nearest = nearestRule(atom, rules, rulesBySource);
    entries.push({
      id: atom.id,
      kind: 'non-rule',
      rule_id: nearest.id,
      reason: 'explanatory normative prose; normative force delivered by ' + nearest.id,
    });
  }
  return { schema: 'law-normative-inventory/v1', entries };
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function nearestRule(atom, rules, rulesBySource) {
  const sourceRules = rulesBySource.get(atom.source) ?? [];
  let previous = null;
  let next = null;
  for (const rule of sourceRules) {
    if (rule.span.start_line <= atom.span.start_line) previous = rule;
    else if (!next) next = rule;
  }
  return previous ?? next ?? sourceRules[0] ?? rules[0];
}

export function verifyNormativeInventory({ atoms, inventory }) {
  const problems = [];
  if (inventory.schema !== 'law-normative-inventory/v1' || !Array.isArray(inventory.entries)) {
    return ['inventory schema is invalid'];
  }
  const rules = new Set(atoms.filter((atom) => atom.type === 'Rule').map((atom) => atom.id));
  const byId = new Map();
  for (const entry of inventory.entries) {
    if (byId.has(entry.id)) problems.push('duplicate inventory id: ' + entry.id);
    byId.set(entry.id, entry);
  }
  for (const atom of atoms.filter((entry) => entry.classification === 'normative')) {
    const entry = byId.get(atom.id);
    if (!entry) {
      problems.push('normative atom has no decision: ' + atom.id);
      continue;
    }
    if (atom.type === 'Rule') {
      if (entry.kind !== 'rule' || entry.rule_id !== atom.id) problems.push('rule entry is not self-identified: ' + atom.id);
      if (!RULE_ID.test(entry.rule_id ?? '')) problems.push('bad rule id: ' + atom.id);
    } else {
      if (entry.kind !== 'non-rule') problems.push('non-rule entry has the wrong kind: ' + atom.id);
      if (!entry.reason || entry.reason.trim().length < 20) problems.push('non-rule entry lacks a reason: ' + atom.id);
      if (entry.rule_id && !rules.has(entry.rule_id)) problems.push('non-rule entry names a missing rule: ' + atom.id);
    }
  }
  return [...new Set(problems)];
}
