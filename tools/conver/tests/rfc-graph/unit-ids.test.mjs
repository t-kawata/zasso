// PX-258 @verifies C001
// PX-258 @verifies C002
// PX-258 @verifies C003
// PX-258 @verifies C004
// PX-258 @verifies C005
// The unit id is the only name a sequence or an operation has past the specification, so
// every vessel that carries it is asserted here rather than trusted. The schema tests come
// first because the whole propagation rests on one property: an optional property added to
// a closed schema leaves every graph already on disk valid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The repository already validates these schemas with the draft-2020 build of Ajv and the
// schema directory the files live in. Reusing that validator rather than a second Ajv setup
// is what keeps this test asserting the same thing the commands do.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateAgainstSchema } = require('../../.claude/scripts/rfc-graph/schema/validate.js');

import {
  carryUnitIdsToNode,
  readGraphUnitIds,
  readHeaderNodeId,
  readHeaderUnitIds,
  readUnitAnchors,
  readUnitIds,
  resolveUnitIdsFromTickets,
  writeUnitIdsToTicket,
} from '../../.claude/scripts/rfc-graph/lib/unit-ids.mjs';
import { UNIT_ID_PATTERN } from '../../.claude/scripts/rfc-graph/lib/unit-ids.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NODE_SCHEMA_PATH = path.join(PROJECT_ROOT, '.claude/scripts/rfc-graph/schema/node.schema.json');
const EDGE_SCHEMA_PATH = path.join(PROJECT_ROOT, '.claude/scripts/rfc-graph/schema/edge.schema.json');

const nodeSchema = () => JSON.parse(readFileSync(NODE_SCHEMA_PATH, 'utf8'));
const SCHEMA_DIR = path.dirname(NODE_SCHEMA_PATH);
const validateNode = (node) => validateAgainstSchema(node, 'node.schema.json', SCHEMA_DIR).valid;

const PRE_CHANGE_NODE = Object.freeze({
  id: 'N0001',
  title: 'Issuance',
  kind: 'requirement',
  summary: 'Issues a certificate.',
  slug: 'issuance',
  headingRefs: [{ refId: 'REF001', heading: 2, texts: ['Issuance'] }],
});

const nodeWithUnits = (id, unitIds) => ({ ...PRE_CHANGE_NODE, id, title: id, slug: 'node_' + id.toLowerCase(), unitIds });

// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C001 a graph written before the change still validates, and unitIds is not required', () => {
  assert.equal(validateNode(PRE_CHANGE_NODE), true, JSON.stringify(validateNode(PRE_CHANGE_NODE)));
  assert.equal(Object.hasOwn(PRE_CHANGE_NODE, 'unitIds'), false);

  const schema = nodeSchema();
  assert.deepEqual(schema.required, ['id', 'title', 'kind', 'summary', 'headingRefs', 'slug']);
  assert.equal(schema.required.includes('unitIds'), false);
  assert.equal(schema.additionalProperties, false);
});

// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C001 a graph carrying unitIds validates too, and an empty array is a node with no units', () => {
  assert.equal(validateNode({ ...PRE_CHANGE_NODE, unitIds: ['op-IssueCertificate', 'seq-S-application-and-payment', 'xdir-S-crossing'] }), true, JSON.stringify(validateNode(PRE_CHANGE_NODE)));
  assert.equal(validateNode({ ...PRE_CHANGE_NODE, unitIds: [] }), true, JSON.stringify(validateNode(PRE_CHANGE_NODE)));
  assert.equal(validateNode({ ...PRE_CHANGE_NODE, unitIds: 'op-IssueCertificate' }), false, 'a bare string is not a list');
});

// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C001 a graph carrying an undeclared property is still rejected, so the schema did not open', () => {
  const bare = validateAgainstSchema({ ...PRE_CHANGE_NODE, inventedProperty: 'x' }, 'node.schema.json', SCHEMA_DIR);
  assert.equal(bare.valid, false);
  assert.match(bare.errors.join('\n'), /additional propert/i);

  const withUnits = validateAgainstSchema({ ...PRE_CHANGE_NODE, unitIds: ['op-A'], inventedProperty: 'x' }, 'node.schema.json', SCHEMA_DIR);
  assert.equal(withUnits.valid, false, 'listing unitIds did not open the schema to anything else');
});

// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C001 the frozen baseline names the schema only inside a recorded command heading, so the edit is a schema change alone', () => {
  const baseline = JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'tests/workspacify-tree/baselines/manifest-hashes.json'), 'utf8'));
  // MEASURED: manifestHashes records no schema key at all. The only occurrence of
  // node.schema.json is text inside commandFileDigests['graphify-rfc'].headings, which is a
  // digest of the command file rather than of the schema.
  assert.equal(Object.keys(baseline.manifestHashes).some((key) => key.includes('schema')), false);
  assert.equal(JSON.stringify(baseline.commandFileDigests['graphify-rfc'].headings).includes('node.schema.json'), true);
  assert.equal(JSON.stringify(baseline).includes('"node.schema.json":'), false, 'no digest is recorded under the schema path');
});

// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C002 an RFC section carrying a unit anchor yields the id and carries it to the node', () => {
  const section = ['## 3.2 Issuance', '', '<!-- unit: op-IssueCertificate -->', 'Issues a certificate.', ''].join('\n');
  assert.deepEqual(readUnitAnchors(section), ['op-IssueCertificate']);
  assert.deepEqual(readUnitAnchors('## 3.3 Nothing\n\nNo anchor here.\n'), []);

  const carried = carryUnitIdsToNode({ ...PRE_CHANGE_NODE }, ['op-IssueCertificate', 'op-IssueCertificate']);
  assert.deepEqual(readUnitIds(carried), ['op-IssueCertificate'], 'a repeated anchor contributes once');
});

// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C002 a node without the property yields an empty list rather than throwing', () => {
  assert.deepEqual(readUnitIds(PRE_CHANGE_NODE), []);
  assert.deepEqual(readUnitIds({}), []);
  assert.deepEqual(readUnitIds(null), []);
  assert.deepEqual(readGraphUnitIds({ nodes: [] }), []);
  assert.deepEqual(readGraphUnitIds({ nodes: [nodeWithUnits('N0001', ['op-A']), nodeWithUnits('N0002', ['seq-B'])] }).sort(), ['op-A', 'seq-B']);
});

// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C003 a boundify header yields its node and its unit ids, and a headerless file yields nothing', () => {
  const header = [
    '<!-- Initial Design Artifact — RFC-driven Implementation',
    '  node: N0007 Issuance',
    '  units: op-IssueCertificate, seq-S-issuance',
    '  file: src/issuance.rs',
    '-->',
  ].join('\n');
  assert.deepEqual(readHeaderUnitIds(header), ['op-IssueCertificate', 'seq-S-issuance']);
  assert.equal(readHeaderNodeId(header), 'N0007');
  assert.deepEqual(readHeaderUnitIds('# no header here'), []);
  assert.equal(readHeaderNodeId('# no header here'), null);
  assert.deepEqual(readHeaderUnitIds('<!-- Initial Design Artifact — RFC-driven Implementation\n  node: N0007\n-->'), []);
});

// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C004 the ticket level is the level the consumers read, and the id round-trips through the accessor', () => {
  const tickets = {
    phases: [{ id: 0, name: 'phase', nodeIds: ['N0001'], tickets: [{ id: 1, phaseId: 0, nodeIds: ['op-A', 'N0001'] }] }],
  };
  // MEASURED: collectTicketNodeIds reads phases[].tickets[].nodeIds, so the ticketed level
  // is the one a consumer sees and the schema's phase-level declaration is unused.
  assert.deepEqual(resolveUnitIdsFromTickets(tickets), ['op-A'], 'a phase-level array contributes no unit id');

  const written = writeUnitIdsToTicket({ id: 1, phaseId: 0, nodeIds: ['N0001'] }, ['op-A', 'seq-B']);
  assert.deepEqual(written.nodeIds, ['N0001', 'op-A', 'seq-B'], 'graph node ids stay, unit ids are added');
  assert.deepEqual(resolveUnitIdsFromTickets({ phases: [{ id: 0, name: 'p', tickets: [written] }] }), ['op-A', 'seq-B']);

  const again = writeUnitIdsToTicket(written, ['op-A']);
  assert.deepEqual(again.nodeIds, written.nodeIds, 'writing an id twice changes nothing');
});

// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C004 a ticket carrying no nodeIds at all gains only the unit ids', () => {
  const written = writeUnitIdsToTicket({ id: 2, phaseId: 0, title: 't', status: 'todo', contracts: [] }, ['op-A']);
  assert.deepEqual(written.nodeIds, ['op-A']);
  assert.deepEqual(resolveUnitIdsFromTickets({ phases: [{ id: 0, name: 'p', tickets: [written] }] }), ['op-A']);
});

// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C005 the edge type precedes is accepted by edge.schema.json, so a cross-boundary order has a schema-legal carrier', () => {
  const edgeSchema = JSON.parse(readFileSync(EDGE_SCHEMA_PATH, 'utf8'));
  assert.ok(edgeSchema.properties.type.enum.includes('precedes'));
  // The edge must satisfy every field the schema requires, or the test would be asserting
  // that a malformed edge is accepted rather than that precedes is a legal type.
  const edge = {
    from: 'N0001',
    to: 'N0002',
    type: 'precedes',
    attributes: { strength: 'hard', bidirectional: false },
    contracts: [{ id: 'C001', precondition: 'p', postcondition: 'q', invariant: 'r' }],
  };
  const result = validateAgainstSchema(edge, 'edge.schema.json', SCHEMA_DIR);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C002 the unit id pattern accepts the three prefixes and rejects anything else', () => {
  const pattern = new RegExp(UNIT_ID_PATTERN);
  assert.equal(pattern.test('op-IssueCertificate'), true);
  assert.equal(pattern.test('seq-S-application-and-payment'), true);
  assert.equal(pattern.test('xdir-S-crossing'), true);
  assert.equal(pattern.test('N0001'), false);
  assert.equal(pattern.test('IssueCertificate'), false);
  assert.equal(pattern.test(''), false);
});
