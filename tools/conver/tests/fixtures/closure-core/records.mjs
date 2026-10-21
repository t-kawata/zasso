// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
// [::TICKET::] PX-292 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-292 --for-spec --no-implementation-order`.
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
/**
 * The deterministic closure fixture.
 *
 * One open judgment obligation, one valid record and one independent attack. A test
 * overrides one field to exercise one rejection code, so the difference between a held
 * and a rejected decision is always the field under test.
 */
export const OBLIGATION_ID = 'JUDGE:TRANSLATION:bd-1';

/** One worklist item, obligation, record and attack for the closure-core fixture. */
export function fixture(overrides = {}) {
  const item = {
    id: OBLIGATION_ID,
    obligationId: OBLIGATION_ID,
    kind: 'judgment',
    subject: 'bd-1',
    claim: 'the translation judgment holds for bd-1',
    contextDigest: 'ctx-1',
    worklistDigest: 'worklist-1',
    artifactDigest: 'artifact-1',
    schemaVersion: 2,
    anchorSet: { contract: [{ boundaryId: 'bd-1', field: 'translation' }] },
    answerVocabulary: ['consistent', 'conflicting'],
    attackTier: 'tier1',
    ...overrides.item,
  };
  const obligation = {
    id: OBLIGATION_ID,
    class: 'semantic',
    kind: 'judgment',
    state: 'open',
    required: true,
    ...overrides.obligation,
  };
  const record = overrides.record === null ? null : {
    schemaVersion: 2,
    obligationId: OBLIGATION_ID,
    contextDigest: 'ctx-1',
    worklistDigest: 'worklist-1',
    artifactDigest: 'artifact-1',
    verdict: 'consistent',
    basis: [{ source: 'contract_registry', boundaryId: 'bd-1', field: 'translation', value: 'the boundary' }],
    reader: 'judge/generation-1',
    ...(overrides.record ?? {}),
  };
  const attack = overrides.attack === null ? null : {
    obligationId: OBLIGATION_ID,
    contextDigest: 'ctx-1',
    worklistDigest: 'worklist-1',
    outcome: 'held',
    reader: 'attack/generation-1',
    searched: { source: 'contract_registry', boundaryId: 'bd-1', from: 1, to: 1, quote: 'the boundary' },
    ...(overrides.attack ?? {}),
  };
  return { item, obligation, record, attack };
}
