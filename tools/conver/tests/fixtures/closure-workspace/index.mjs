// [::TICKET::] PX-292 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-292 --for-spec --no-implementation-order`.
/**
 * A second workspace with one defect for each inquest lens.
 *
 * The omission and contradiction are answered Yes; the missing postcondition is an empty
 * boundary contract; the unmitigated risk is an active operation that mutates protocol
 * state. Every other inquest pair is exempt so the fixture stays small enough to reason
 * about and each assertion names exactly one lens.
 */
export const ARTIFACT_DIGEST = 'artifact-1';

const READER = 'educe-sequences/generation-1';

/** The inquest pair exemption that leaves only the two findings. */
export const EXEMPTIONS = Object.freeze([
  { subject: 'S1', lens: 'omission' },
  { subject: 'S1', lens: 'contradiction' },
  { subject: 'S1', lens: 'deficiency' },
  { subject: 'S1', lens: 'risk' },
  { subject: 's1', lens: 'deficiency' },
  { subject: 's1', lens: 'risk' },
]);

/** One inquest row for a finding, optionally resolved against the current artifact. */
// [::TICKET::] PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function inquestRow(lens, { fixed = false } = {}) {
  const row = {
    subject: 's1',
    lens,
    question: lens === 'omission'
      ? 'is a required act absent from this subject'
      : 'does this subject contradict another line of the specification',
    answer: 'Yes',
    line: lens === 'omission' ? 2 : 3,
    quote: lens === 'omission' ? 'the act is absent' : 'the clauses disagree',
    reader: READER,
    artifactDigest: ARTIFACT_DIGEST,
  };
  if (!fixed) return row;
  return {
    ...row,
    resolution: {
      kind: 'artifact-change',
      artifactDigest: ARTIFACT_DIGEST,
      evidence: { source: 'spec', path: 'spec.md', line: row.line, quote: row.quote },
    },
  };
}

/** The artifact and readings the closure pipeline reads. */
export function buildClosureWorkspace({ fixed = false } = {}) {
  const artifact = {
    schema_version: 3,
    spec: { path: 'spec.md', sha256: 'spec-sha', lines: 20 },
    pins: {
      columns: [{ name: 'purpose' }],
      sourceEnumerations: [
        { role: 'operations', members: ['OpA'] },
        { role: 'entries', members: ['S1'] },
      ],
    },
    operations: [{
      id: 'OpA',
      disposition: 'active',
      position: 'singleStep',
      mutates_protocol_state: true,
      purpose: '',
    }],
    sequences: [{ id: 'S1', outcome: 'direct' }],
    steps: [],
    sections: [{ id: 's1' }],
  };
  const treeManifest = {
    workspace: { packages: [] },
    dependencies: { boundaries: [{ id: 'boundary-001' }] },
  };
  const allocateManifest = {
    contract_registry: [{
      boundary_id: 'boundary-001',
      preconditions: [],
      postconditions: [],
    }],
  };
  const declaration = {
    entries: [{ id: 'S1' }],
    sections: [{ id: 's1' }],
    exemptions: [...EXEMPTIONS],
  };
  const readings = {
    span: [{ subject: 'S1', steps: [{ operation: 'OpA' }], operations: ['OpA'] }],
    uncovered: [],
    inquest: [inquestRow('omission', { fixed }), inquestRow('contradiction', { fixed })],
    adversarial: [],
    attack: [],
    judgment: [],
  };
  return {
    census: { operations: ['OpA'], entries: ['S1'], sections: ['s1'] },
    artifact,
    treeManifest,
    allocateManifest,
    declaration,
    readings,
  };
}
