// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
export function buildAttestation(manifest, phase) {
  const rules = (manifest.nodes ?? [])
    .filter((node) => node.phase === phase && node.delivery === 'must')
    .map((node) => ({ rule: node.id, concept_id: node.concept_id ?? null }));

  return {
    phase,
    rows: rules.map((entry) => ({ rule: entry.rule, concept_id: entry.concept_id, status: 'unset', evidence: '' })),
  };
}

export function checkAttestation(manifest, phase, rows) {
  const expected = (manifest.nodes ?? [])
    .filter((node) => node.phase === phase && node.delivery === 'must')
    .map((node) => node.id);
  const declared = rows.map((row) => row.rule);

  for (const rule of expected) {
    if (!declared.includes(rule)) throw new Error('missing rule: ' + rule);
  }
  for (const rule of declared) {
    if (!expected.includes(rule)) throw new Error('extra rule: ' + rule);
  }

  for (const row of rows) {
    if (row.status === 'unset') throw new Error('unset rule: ' + row.rule);
    if (row.status === 'applied' && !row.evidence) throw new Error('applied requires evidence: ' + row.rule);
    if (row.status === 'human_attested' && !row.approval_ref) {
      throw new Error('human_attested requires approval_ref: ' + row.rule);
    }
    if (row.status === 'exception' && !row.exception_ref) {
      throw new Error('exception requires exception_ref: ' + row.rule);
    }
  }

  return true;
}
