// [::TICKET::] PX-193 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-193 --for-spec --no-implementation-order`.
// PX-193 @verifies C006
// The decisions payload is the AI's only writing surface. The shared schema
// validator supports enum/pattern/required but not propertyNames, so the payload
// declares its intent in the schema AND enforces the authoring surface in code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { validateAgainstSchema } from '../../../.claude/scripts/workspacify-tree/lib/manifest-schema.mjs';
import { validateDecisionsAuthoringSurface, SEED_AUTHORING_SECTION_INDEXES } from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';
import { validateContractEdge } from '../../../.claude/scripts/workspacify-allocate/lib/contract-model.mjs';
import { baseAiSections, buildValidManifest, makeDecisions } from '../helpers/build-valid-manifest.mjs';

const SCHEMA_PATH = fileURLToPath(new URL('../../../.claude/scripts/workspacify-allocate/schemas/workspacify-allocate-decisions.schema.json', import.meta.url));

function schema() {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
}

function contractEdge(overrides = {}) {
  return {
    contract_id: 'contract-boundary-001',
    direction: 'consumer_to_provider',
    connection_kind: 'value_only',
    clauses: { input: 'i', output: 'o', preconditions: ['p'], postconditions: ['q'], invariants: ['r'], canonicalization: 'c', tests: ['t'] },
    owners: { semantic: 'pkg-a', state: 'not_applicable', side_effect: 'not_applicable', port: 'not_applicable', adapter: 'not_applicable' },
    source_refs: ['s-000001'],
    ...overrides,
  };
}

test('C006 the schema declares the authoring range and requires the contract edges', () => {
  const spec = schema();
  const aiSections = spec.properties.seeds.items.properties.aiSections;
  assert.deepEqual(aiSections.propertyNames.enum, SEED_AUTHORING_SECTION_INDEXES.map(String));
  assert.ok(spec.properties.seeds.items.properties.contractEdges, 'contract edges are part of the payload');
  assert.deepEqual(spec.properties.seeds.items.required, ['packageId', 'aiSections']);
});

test('C006 a well-formed payload validates and the semantic anchor stays enforced', () => {
  const spec = schema();
  const { manifest } = buildValidManifest();

  const valid = validateAgainstSchema(makeDecisions(manifest), spec);
  assert.equal(valid.valid, true, JSON.stringify(valid.errors));

  assert.equal(validateAgainstSchema(makeDecisions(manifest, { approved: false }), spec).valid, true);
  assert.equal(validateAgainstSchema({ ...makeDecisions(manifest), semantic_review: { status: 'MAYBE' } }, spec).valid, false);
});

test('C006 the authoring surface rejects machine keys, unknown keys and missing keys', () => {
  const { manifest } = buildValidManifest();
  const decisions = makeDecisions(manifest);

  const clean = validateDecisionsAuthoringSurface(decisions);
  assert.equal(clean.ok, true, JSON.stringify(clean.errors));

  const machineKey = validateDecisionsAuthoringSurface({
    ...decisions,
    seeds: [{ packageId: 'pkg-a', aiSections: { ...baseAiSections(), 1: 'AI wrote the machine block' } }],
  });
  assert.equal(machineKey.ok, false);
  assert.ok(machineKey.errors.some((message) => message.includes('"1"')), JSON.stringify(machineKey.errors));

  const unknownKey = validateDecisionsAuthoringSurface({
    ...decisions,
    seeds: [{ packageId: 'pkg-a', aiSections: { ...baseAiSections(), 99: 'extra' } }],
  });
  assert.equal(unknownKey.ok, false);

  const missingKey = baseAiSections();
  delete missingKey[9];
  const incomplete = validateDecisionsAuthoringSurface({ ...decisions, seeds: [{ packageId: 'pkg-a', aiSections: missingKey }] });
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.errors.some((message) => message.includes('"9"')), JSON.stringify(incomplete.errors));
});

test('C006 a contract edge in the payload is checked against the boundary scope', () => {
  const { manifest } = buildValidManifest();
  const boundary = manifest.dependencies.boundaries[0];

  assert.equal(validateContractEdge(contractEdge(), boundary).ok, true);
  assert.equal(validateContractEdge(contractEdge({ contract_id: '' }), boundary).ok, false);

  const unknownClause = validateContractEdge(
    contractEdge({ clauses: { ...contractEdge().clauses, telepathy: 'x' } }),
    boundary,
  );
  assert.equal(unknownClause.ok, false);
  assert.deepEqual(unknownClause.unknownClauses, ['telepathy']);
});
