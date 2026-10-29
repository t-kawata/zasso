// PX-326 @verifies C001 C005 C006
// The contract-id grammar and the operation-field classification are declared once.
// The validator, the Gate S/R scanner and the JSON schema must accept the same ids, and
// every operation field must belong to exactly one delivery class.
// [::TICKET::] PX-326 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-326 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { CONTRACT_ID_PATTERN, isContractId } = require('../../.claude/scripts/tickets/lib/contract-id.js');
const {
  CONTRACT_AXES,
  CONTRACT_BEARING_OPERATION_FIELDS,
  DESCRIPTIVE_OPERATION_FIELDS,
  OPERATION_OBLIGATION_FIELDS,
  SURFACE_OPERATION_FIELDS,
} = require('../../.claude/scripts/tickets/lib/contract-facts.js');
const schema = require('../../.claude/scripts/tickets/tickets-schema.json');

const ACCEPTED = ['C001', 'C500', 'C999', 'contract-boundary-001', 'contract-a.b_c-d'];
const REJECTED = ['X001', 'contract-', 'boundary-001', 'C1', 'C0000', '', null];

test('C001 the contract-id predicate accepts C-format and registry ids', () => {
  for (const id of ACCEPTED) assert.equal(isContractId(id), true, `${id} must be accepted`);
});

test('C001 the contract-id predicate rejects every other shape', () => {
  for (const id of REJECTED) assert.equal(isContractId(id), false, `${String(id)} must be rejected`);
});

test('C001 the JSON schema pattern agrees with the shared predicate', () => {
  const pattern = schema.definitions.ticket.properties.contracts.items.properties.id.pattern;
  assert.equal(pattern, CONTRACT_ID_PATTERN);
  const schemaRegex = new RegExp(pattern);
  for (const id of ACCEPTED) assert.equal(schemaRegex.test(id), true, `${id} must be accepted by the schema`);
  for (const id of REJECTED.filter((value) => typeof value === 'string')) {
    assert.equal(schemaRegex.test(id), false, `${id} must be rejected by the schema`);
  }
});

test('C005 the typed axes are declared once', () => {
  assert.deepEqual([...CONTRACT_AXES], ['consumes', 'produces', 'errors', 'crosses']);
});

test('C006 every operation field belongs to exactly one delivery class', () => {
  const classes = [CONTRACT_BEARING_OPERATION_FIELDS, SURFACE_OPERATION_FIELDS, DESCRIPTIVE_OPERATION_FIELDS];
  const seen = new Map();
  for (const [index, fields] of classes.entries()) {
    for (const field of fields) {
      assert.equal(seen.has(field), false, `${field} is declared in more than one class`);
      seen.set(field, index);
    }
  }
  assert.deepEqual(
    [...OPERATION_OBLIGATION_FIELDS].sort(),
    [...seen.keys()].sort(),
    'the render list and the classification lists must cover the same fields',
  );
});
