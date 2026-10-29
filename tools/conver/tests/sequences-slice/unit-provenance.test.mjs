// PX-258 @verifies C002
// PX-258 @verifies C003
// PX-258 @verifies C004
// PX-258 @verifies C005
// The provenance check is the one that makes "every necessary sequence and operation is
// implemented" a predicate over unit ids rather than a proxy. Its additivity property is
// the first thing asserted: with no unit ids anywhere it returns nothing, so a package that
// predates the feature keeps the verdict it had.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkUnitProvenance,
  unitsVisibleToShip,
} from '../../.claude/scripts/sequences-slice/lib/unit-provenance.mjs';

const nodeWithUnits = (id, unitIds) => ({ id, title: id, kind: 'requirement', summary: 's', slug: 'n' + id, headingRefs: [], unitIds });
const headerOf = (nodeId, unitIds) => `<!-- Initial Design Artifact — RFC-driven Implementation\n  node: ${nodeId}\n  units: ${unitIds.join(', ')}\n  file: src/x.rs\n-->`;
const ticketsOf = (entries) => ({ phases: [{ id: 0, name: 'p', tickets: entries.map((nodeIds, index) => ({ id: index + 1, phaseId: 0, nodeIds })) }] });
const findingsFor = (graph, ledger, headers, tickets) => checkUnitProvenance(graph, ledger, headers, tickets);

// [::TICKET::] PX-258 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C005 no unit ids anywhere yields no finding, which is the additivity property', () => {
  assert.deepEqual(findingsFor({ nodes: [] }, new Set(), [], { phases: [] }), []);
  assert.deepEqual(findingsFor({ nodes: [] }, null, [], null), []);
  assert.deepEqual(findingsFor({ nodes: [] }, new Set(), [], null), []);
  assert.deepEqual(findingsFor({ nodes: [] }, undefined, undefined, undefined), []);
  assert.deepEqual(findingsFor(null, null, [], null), []);
});

// [::TICKET::] PX-258 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C002 a graph carrying a unit the ledger does not assign is an invented unit at high severity', () => {
  const graph = { nodes: [nodeWithUnits('N0001', ['op-A', 'op-Invented'])] };
  const findings = findingsFor(graph, new Set(['op-A']), [], { phases: [] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'high');
  assert.match(findings[0].message, /op-Invented/);
});

// [::TICKET::] PX-258 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C003 a header naming a unit its own node does not carry is reported', () => {
  const graph = { nodes: [nodeWithUnits('N0007', ['op-A'])] };
  const findings = findingsFor(graph, new Set(['op-A']), [headerOf('N0007', ['op-A', 'op-Ghost'])], { phases: [] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'high');
  assert.match(findings[0].message, /op-Ghost/);
  assert.match(findings[0].message, /N0007/);
});

// [::TICKET::] PX-258 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C003 a header and its node agree, and a header for an unknown node is reported', () => {
  const graph = { nodes: [nodeWithUnits('N0007', ['op-A'])] };
  assert.deepEqual(findingsFor(graph, new Set(['op-A']), [headerOf('N0007', ['op-A'])], { phases: [] }), []);
  const unknown = findingsFor(graph, new Set(['op-A']), [headerOf('N0999', ['op-A'])], { phases: [] });
  assert.equal(unknown.length, 1);
  assert.match(unknown[0].message, /N0999/);
});

// [::TICKET::] PX-258 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C004 a ticket naming a unit the graph does not carry is a dangling reference naming the ticket', () => {
  const graph = { nodes: [nodeWithUnits('N0001', ['op-A'])] };
  const dangling = ticketsOf([['op-Ghost']]);
  const findings = findingsFor(graph, new Set(['op-A']), [], dangling);
  // Two findings, and both are real: the ticket invents a unit the graph does not carry,
  // and in doing so it leaves the graph's own unit undeclared. Reporting only the first
  // would hide the omission the invention caused.
  assert.equal(findings.length, 2);
  for (const entry of findings) assert.equal(entry.severity, 'high');
  const invented = findings.find((entry) => entry.message.includes('op-Ghost'));
  assert.match(invented.message, /ticket 1/, 'the ticket id is named');
  const omitted = findings.find((entry) => entry.message.includes('op-A'));
  assert.match(omitted.message, /no ticket declares it/);
});

// [::TICKET::] PX-258 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C004 a unit the graph carries and no ticket claims is an omission at high severity', () => {
  const graph = { nodes: [nodeWithUnits('N0001', ['op-A', 'seq-B'])] };
  const findings = findingsFor(graph, new Set(['op-A', 'seq-B']), [], ticketsOf([['op-A']]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'high');
  assert.match(findings[0].message, /seq-B/);
});

// [::TICKET::] PX-258 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C004 the two downstream carriers agreeing produces no finding', () => {
  const graph = { nodes: [nodeWithUnits('N0001', ['op-A', 'seq-B'])] };
  assert.deepEqual(findingsFor(graph, new Set(['op-A', 'seq-B']), [], ticketsOf([['op-A', 'seq-B']])), []);
});

// [::TICKET::] PX-258 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C004 a graph node id in a ticket is not mistaken for a unit id', () => {
  const graph = { nodes: [nodeWithUnits('N0001', ['op-A'])] };
  assert.deepEqual(findingsFor(graph, new Set(['op-A']), [], ticketsOf([['N0001', 'op-A']])), []);
});

// [::TICKET::] PX-258 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C005 the ship layer sees every unit the graph carries, and nothing when it carries none', () => {
  const graph = { nodes: [nodeWithUnits('N0001', ['op-A']), nodeWithUnits('N0002', ['seq-B'])] };
  assert.deepEqual(unitsVisibleToShip(graph).sort(), ['op-A', 'seq-B']);
  assert.deepEqual(unitsVisibleToShip({ nodes: [] }), []);
  assert.deepEqual(unitsVisibleToShip(null), []);
});

// [::TICKET::] PX-258 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C005 the ship layer and the ledger agree when the ledger assigns exactly what the graph carries', () => {
  const ledgerUnitIds = new Set(['op-A', 'seq-B']);
  const graph = { nodes: [nodeWithUnits('N0001', ['op-A']), nodeWithUnits('N0002', ['seq-B'])] };
  assert.deepEqual(unitsVisibleToShip(graph).sort(), [...ledgerUnitIds].sort());
  assert.deepEqual(findingsFor(graph, ledgerUnitIds, [], ticketsOf([['op-A', 'seq-B']])), []);
});

// [::TICKET::] PX-258 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-258 --for-spec --no-implementation-order`.
test('C005 a unit that belongs to no package is a declared residual and needs no graph node', () => {
  const graph = { nodes: [nodeWithUnits('N0001', ['op-A'])] };
  assert.deepEqual(findingsFor(graph, new Set(['op-A']), [], ticketsOf([['op-A']])), []);
  assert.equal(unitsVisibleToShip(graph).includes('CommunityCertificate'), false, 'a residual is not a unit id and needs no node');
});
