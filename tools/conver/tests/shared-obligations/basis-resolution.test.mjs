// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  recordQuoteUse,
  resolveArtifactBasis,
  resolveClauseBasis,
  resolveRfcBasis,
  validateBasisEntry,
} from '../../.claude/scripts/shared-obligations/judgment.mjs';
import { riskFieldForClass } from '../../.claude/scripts/shared-obligations/risk-fields.mjs';

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const artifact = {
  operations: [{
    id: 'CreateForum',
    disposition: 'active',
    idempotency_scope: 'operation_id plus canonical payload',
    allowed_status_transitions: { submitted: ['accepted'] },
  }],
};

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const registry = [{
  boundary_id: 'boundary-005',
  clauses: {
    preconditions: ['a valid signed object'],
    postconditions: ['the object is accepted'],
    input: ['signed object'],
    output: ['accepted object'],
    invariants: ['the old authority epoch is revoked'],
    errors: ['InvalidSig'],
    tests: ['rejects a bad signature'],
  },
}];

// @verifies C001
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C001 an artifact basis resolves a real field and quote', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = resolveArtifactBasis({
    source: 'artifact',
    id: 'CreateForum',
    field: 'idempotency_scope',
    quote: 'operation_id plus canonical payload',
  }, artifact);
  assert.equal(result.ok, true);
});

// @verifies C001
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C001 an artifact basis rejects a missing field, an empty field and a quote outside the value', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const missingField = resolveArtifactBasis({
    source: 'artifact', id: 'CreateForum', field: 'idempotency', quote: 'operation_id',
  }, artifact);
  assert.equal(missingField.code, 'BASIS_FIELD_UNRESOLVED');

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const emptyField = resolveArtifactBasis({
    source: 'artifact', id: 'CreateForum', field: 'idempotency_scope', quote: '',
  }, { operations: [{ id: 'CreateForum', idempotency_scope: '' }] });
  assert.equal(emptyField.code, 'BASIS_EMPTY');

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const outsideQuote = resolveArtifactBasis({
    source: 'artifact', id: 'CreateForum', field: 'idempotency_scope', quote: 'not present',
  }, artifact);
  assert.equal(outsideQuote.code, 'BASIS_QUOTE_NOT_FOUND');
});

// @verifies C002
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C002 a contract-registry basis resolves a real clause path and quote', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const invariant = resolveClauseBasis({
    source: 'contract_registry', boundaryId: 'boundary-005', field: 'invariant',
    quote: 'the old authority epoch is revoked',
  }, registry);
  assert.equal(invariant.ok, true);

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const entailment = resolveClauseBasis({
    source: 'contract_registry', boundaryId: 'boundary-005', field: 'entailment',
    quote: 'a valid signed object',
  }, registry);
  assert.equal(entailment.ok, true);
});

// @verifies C002
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C002 a contract-registry basis rejects an unknown clause path and a missing quote', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const unknown = resolveClauseBasis({
    source: 'contract_registry', boundaryId: 'boundary-005', field: 'unknown', quote: 'x',
  }, registry);
  assert.equal(unknown.code, 'CLAUSE_PATH_UNRESOLVED');

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const missingQuote = resolveClauseBasis({
    source: 'contract_registry', boundaryId: 'boundary-005', field: 'errors', quote: 'OtherError',
  }, registry);
  assert.equal(missingQuote.code, 'BASIS_QUOTE_NOT_FOUND');
});

// @verifies C003
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C003 risk classes map to the real artifact fields and a class-name basis is rejected', () => {
  assert.equal(riskFieldForClass('idempotency'), 'idempotency_scope');
  assert.equal(riskFieldForClass('replay'), 'idempotency_scope');
  assert.equal(riskFieldForClass('partial-failure'), 'reversal_or_recovery_rule');
  assert.equal(riskFieldForClass('concurrency'), 'allowed_status_transitions');
  assert.equal(riskFieldForClass('liveness'), 'cancellation_rule');
  assert.equal(riskFieldForClass('finality'), 'finality_predicate');
  assert.equal(riskFieldForClass('external-dependency'), 'external_dependency_class');

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const rejected = resolveArtifactBasis({
    source: 'artifact', id: 'CreateForum', field: 'concurrency', quote: 'submitted',
  }, artifact);
  assert.equal(rejected.code, 'BASIS_FIELD_UNRESOLVED');
});

// @verifies C004
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C004 an RFC basis resolves a section line that contains the unit', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const rfc = {
    'pkg-0002': {
      path: 'crates/protocol/gaia-soul/RFC.md',
      lines: ['| op-@object:AuthorityForkEvidence | §3.13.3 | derived from conflicting signed objects |'],
    },
  };
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const accepted = resolveRfcBasis({
    source: 'rfc',
    path: 'crates/protocol/gaia-soul/RFC.md',
    line: 1,
    quote: 'op-@object:AuthorityForkEvidence',
    unitId: 'op-@object:AuthorityForkEvidence',
  }, rfc);
  assert.equal(accepted.ok, true);
});

// @verifies C004
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C004 an RFC basis rejects a missing section and a view-only basis', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const rfc = {
    'pkg-0002': {
      path: 'crates/protocol/gaia-soul/RFC.md',
      lines: ['| op-@object:AuthorityForkEvidence | §3.13.3 |'],
    },
  };
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const missing = resolveRfcBasis({
    source: 'rfc',
    path: 'crates/protocol/gaia-soul/RFC.md',
    line: 9,
    quote: 'op-@object:AuthorityForkEvidence',
    unitId: 'op-@object:AuthorityForkEvidence',
  }, rfc);
  assert.equal(missing.code, 'S7.rfc-prose-unit-missing');

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const viewOnly = validateBasisEntry({
    source: 'view', packageId: 'pkg-0002', unitId: 'op-@object:AuthorityForkEvidence',
  }, { view: [{ packageId: 'pkg-0002', unitId: 'op-@object:AuthorityForkEvidence' }] });
  assert.equal(viewOnly.code, 'BASIS_QUOTE_MISSING');
});

// @verifies C005
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C005 a quote cannot close two obligations', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const seen = new Map();
  assert.equal(recordQuoteUse(seen, 'quote-a', 'OBL-1').ok, true);
  assert.equal(recordQuoteUse(seen, 'quote-a', 'OBL-2').code, 'QUOTE_REUSED');
});

// @verifies C005
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C005 a self-referential or generic quote is rejected', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const selfReferential = resolveArtifactBasis({
    source: 'artifact', id: 'CreateForum', field: 'idempotency_scope', quote: 'CreateForum',
  }, { operations: [{ id: 'CreateForum', idempotency_scope: 'CreateForum' }] });
  assert.equal(selfReferential.code, 'BASIS_SELF_REFERENTIAL');

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const generic = validateBasisEntry(
    { source: 'spec', path: 'spec.md', line: 1, quote: 'CreateForum' },
    { spec: [{ path: 'spec.md', line: 1 }] },
    { linesByPath: { 'spec.md': ['CreateForum is created'] }, subject: 'CreateForum' },
  );
  assert.equal(generic.code, 'BASIS_GENERIC');
});
