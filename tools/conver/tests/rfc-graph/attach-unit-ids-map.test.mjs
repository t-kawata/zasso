// PX-307 @verifies C003
// Graphify reads only RFC.md. The map inside the RFC is the placement authority; the
// tests pin the exact-heading match and the two refusal directions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  assignUnitIdsFromMap,
  readDistributionMap,
} from '../../.claude/scripts/rfc-graph/lib/unit-ids.mjs';
import {
  mapDigest,
  renderDistributionMap,
} from '../../.claude/scripts/sequences-slice/lib/distribution-map.mjs';

const RFC = [
  '# Package RFC',
  '',
  '## 3.1 Produce',
  '',
  'body',
  '',
  '## 3.2 Consume',
  '',
  'body',
  '',
].join('\n');

// [::TICKET::] PX-307 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureMap() {
  const body = {
    schemaVersion: 1,
    packageId: 'pkg-1',
    sourceViewDigest: 'a'.repeat(64),
    units: [
      { unitId: 'op-Produce', kind: 'operation', role: 'implementer', sections: ['3.1 Produce'], ground: 'designed here' },
      { unitId: 'seq-A-1', kind: 'sequence', sections: ['3.2 Consume'], ground: 'flow designed here' },
    ],
    residuals: [],
  };
  return { ...body, digest: mapDigest(body) };
}

// [::TICKET::] PX-307 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureGraph() {
  return {
    sourceFile: 'RFC.md',
    mainLanguage: 'rust',
    nodes: [
      { id: 'N0001', title: 'Produce', kind: 'architecture', summary: 'x', slug: 'produce', headingRefs: [{ refId: 'REF001', heading: 2, texts: ['3.1 Produce'] }] },
      { id: 'N0002', title: 'Consume', kind: 'architecture', summary: 'x', slug: 'consume', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['3.2 Consume'] }] },
    ],
    edges: [],
  };
}

test('C003 readDistributionMap parses the block from the RFC', () => {
  const rfc = `${RFC}\n${renderDistributionMap(fixtureMap())}\n`;
  const map = readDistributionMap(rfc);
  assert.deepEqual(map, fixtureMap());
  assert.equal(readDistributionMap(RFC), null);
});

test('C003 assignUnitIdsFromMap attaches each unit to its exact heading node', () => {
  const map = fixtureMap();
  const result = assignUnitIdsFromMap(fixtureGraph(), map, RFC);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.invented, []);
  assert.deepEqual(result.graph.nodes[0].unitIds, ['op-Produce']);
  assert.deepEqual(result.graph.nodes[1].unitIds, ['seq-A-1']);
  assert.equal(result.graph.distributionDigest, map.digest);
});

test('C003 a map unit with no node is missing at the layer', () => {
  const map = fixtureMap();
  const graph = fixtureGraph();
  graph.nodes = graph.nodes.filter((node) => node.id !== 'N0002');
  const result = assignUnitIdsFromMap(graph, map, RFC);
  assert.deepEqual(result.missing, ['seq-A-1']);
});

test('C003 a node carrying a unit outside the map is an invention', () => {
  const map = fixtureMap();
  const graph = fixtureGraph();
  graph.nodes[0].unitIds = ['op-Invented'];
  const result = assignUnitIdsFromMap(graph, map, RFC);
  assert.deepEqual(result.invented, ['op-Invented']);
});

test('C003 the map digest travels into the graph document', () => {
  const map = fixtureMap();
  const result = assignUnitIdsFromMap(fixtureGraph(), map, RFC);
  assert.equal(result.graph.distributionDigest, mapDigest(map));
});

test('C003 the graph schema accepts the optional distributionDigest', () => {
  const schema = JSON.parse(fs.readFileSync(new URL('../../.claude/scripts/rfc-graph/schema/graph.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.properties.distributionDigest.pattern, '^[0-9a-f]{64}$');
  assert.equal(schema.required.includes('distributionDigest'), false);
});
