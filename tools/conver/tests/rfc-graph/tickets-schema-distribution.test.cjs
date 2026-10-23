// PX-308 @verifies C010
// The distribution record is the ticket's promise to the split. Describing it in the schema
// makes the promise checkable by any reader, and keeps a legacy ticket without it valid.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');

const SCHEMA_PATH = path.resolve(__dirname, '../../.claude/scripts/tickets/tickets-schema.json');
const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

/** A minimal document the schema accepts. */
// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function documentWith(ticket) {
  return {
    title: 'test',
    metadata: { source: 'test', generatedAt: '2026-10-23' },
    phases: [{ id: 0, name: 'P0', tickets: [ticket] }],
  };
}

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function ticketWith(distribution) {
  const ticket = {
    id: 1,
    phaseId: 0,
    title: 'produce',
    status: 'todo',
    contracts: [{ id: 'C001', sourceEdge: 'e', precondition: 'p', postcondition: 'q', invariant: 'r' }],
  };
  if (distribution !== undefined) ticket.distribution = distribution;
  return ticket;
}

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function validDistribution() {
  return {
    sourceMapDigest: 'a'.repeat(64),
    sourceViewDigest: 'b'.repeat(64),
    digest: 'c'.repeat(64),
    units: [{
      unitId: 'op-A',
      kind: 'operation',
      role: 'implementer',
      surface: null,
      placement: { nodeIds: ['N0001'], paths: ['src/a.rs'] },
      obligation: { mode: 'implement' },
      obligationDigest: 'd'.repeat(64),
      specRefs: [{ path: 'RFC.md', line: 12, quote: 'produce' }],
    }],
  };
}

describe('tickets-schema.json distribution', () => {
  it('declares distribution and its units array', () => {
    const ticketProperties = schema.definitions.ticket.properties;
    assert.ok(ticketProperties.distribution, 'distribution property should exist');
    assert.ok(schema.definitions.distribution, 'distribution definition should exist');
    assert.equal(schema.definitions.distribution.properties.units.type, 'array');
  });

  it('does not require distribution on a ticket', () => {
    assert.ok(!schema.definitions.ticket.required.includes('distribution'));
  });

  it('validates a distribution record', () => {
    const validate = new Ajv({ strict: false, allErrors: true }).compile(schema);
    assert.equal(validate(documentWith(ticketWith(validDistribution()))), true, JSON.stringify(validate.errors));
  });

  it('rejects a units field that is not an array', () => {
    const validate = new Ajv({ strict: false, allErrors: true }).compile(schema);
    const distribution = { ...validDistribution(), units: {} };
    assert.equal(validate(documentWith(ticketWith(distribution))), false);
  });

  it('keeps a ticket without distribution valid', () => {
    const validate = new Ajv({ strict: false, allErrors: true }).compile(schema);
    assert.equal(validate(documentWith(ticketWith(undefined))), true, JSON.stringify(validate.errors));
  });
});
