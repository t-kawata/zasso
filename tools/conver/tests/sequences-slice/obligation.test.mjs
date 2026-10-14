// PX-259 @verifies C001
// PX-259 @verifies C002
// PX-259 @verifies C005
// The obligation set is the union of every relation that assigns work. Ownership cannot reach a
// package whose duty is structural, so the contract relation and the surface relation are the two
// that do: a contract names a provider and a consumer, and a surface names the column an interface
// answers on. Both are read from artifacts the workspace already carries, so neither is inferred.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CARRIES_UNIT_PREFIX,
  OBLIGATION_SOURCES,
  SERVES_UNIT_PREFIX,
  buildObligationUnits,
  classifyCarries,
  classifyServes,
  collectCandidateColumns,
  readDeclaredInterfaces,
  spellMember,
} from '../../.claude/scripts/sequences-slice/lib/obligation.mjs';

/** One boundary between two packages, in the shape the allocate manifest carries. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function contractBetween(provider, consumer, boundaryId) {
  return {
    contract_id: `contract-${boundaryId}`,
    boundary_id: boundaryId,
    provider_package: provider,
    consumer_package: consumer,
    connection_kind: 'value_only',
    owners: { port: 'not_applicable' },
    clauses: { canonicalization: 'one encoding', tests: 'a round trip test' },
  };
}

// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function artifactWith(operations, enumerations) {
  return {
    pins: { enumerations: enumerations.map((entry) => ({ ...entry, closedness: `closed: ${entry.name}` })) },
    operations,
    sequences: [],
    steps: [],
  };
}

const MANIFEST = { contract_registry: [contractBetween('pkg-a', 'pkg-b', 'boundary-001')] };

test('C001 a contract gives its provider and its consumer one unit each, direction and counterpart named', () => {
  const providerUnits = classifyCarries(MANIFEST, 'pkg-a');
  const consumerUnits = classifyCarries(MANIFEST, 'pkg-b');

  assert.deepEqual(providerUnits.map((unit) => unit.unitId), [`${CARRIES_UNIT_PREFIX}boundary-001`]);
  assert.equal(providerUnits[0].direction, 'provides');
  assert.equal(providerUnits[0].counterpart, 'pkg-b');
  assert.equal(consumerUnits[0].direction, 'consumes');
  assert.equal(consumerUnits[0].counterpart, 'pkg-a');
});

test('C001 a package holding neither side receives nothing, and gains the unit when given a side', () => {
  assert.deepEqual(classifyCarries(MANIFEST, 'pkg-c'), []);

  const extended = { contract_registry: [...MANIFEST.contract_registry, contractBetween('pkg-c', 'pkg-d', 'boundary-002')] };
  assert.deepEqual(classifyCarries(extended, 'pkg-c').map((unit) => unit.unitId), [`${CARRIES_UNIT_PREFIX}boundary-002`]);
});

test('C001 a package on both sides of two boundaries carries one unit per boundary', () => {
  const manifest = { contract_registry: [contractBetween('pkg-a', 'pkg-b', 'boundary-001'), contractBetween('pkg-c', 'pkg-a', 'boundary-002')] };
  const units = classifyCarries(manifest, 'pkg-a');

  assert.deepEqual(units.map((unit) => `${unit.unitId}:${unit.direction}`), [
    `${CARRIES_UNIT_PREFIX}boundary-001:provides`,
    `${CARRIES_UNIT_PREFIX}boundary-002:consumes`,
  ]);
});

test('C001 the union holds every contract once per side and invents none for a stranger', () => {
  const manifest = { contract_registry: [contractBetween('pkg-a', 'pkg-b', 'boundary-001'), contractBetween('pkg-b', 'pkg-c', 'boundary-002')] };
  const units = ['pkg-a', 'pkg-b', 'pkg-c'].flatMap((id) => buildObligationUnits({ artifact: artifactWith([], []), allocateManifest: manifest }, id, []));

  assert.equal(new Set(units.map((unit) => unit.unitId)).size, 2);
  assert.equal(units.filter((unit) => unit.relation === 'carries').length, 4);
  assert.deepEqual(buildObligationUnits({ artifact: artifactWith([], []), allocateManifest: manifest }, 'pkg-z', []), []);
});

test('C002 the candidate rule over-approximates: one coinciding value makes a column a candidate', () => {
  const artifact = artifactWith([
    { id: 'R-0001', verb: 'object.get' },
    { id: 'R-0002', verb: 'something-else' },
  ], [{ name: 'VerbMethod', members: ['object.get', 'object.put'] }]);

  assert.deepEqual(collectCandidateColumns(artifact), ['verb']);
});

test('C002 a column whose values instantiate no member is not a candidate, so a legacy artifact demands nothing', () => {
  const artifact = artifactWith([
    { id: 'Admit', reader: 'span' },
    { id: 'Settle', reader: 'span' },
  ], [{ name: 'LedgerStatus', members: ['Pending', 'Settled'] }]);

  assert.deepEqual(collectCandidateColumns(artifact), []);
});

test('C002 an object-valued column is a candidate when its string sub-values spell a member', () => {
  const artifact = artifactWith([
    { id: 'R-0001', route: { method: 'GET', path: '/v1/capabilities' } },
  ], [{ name: 'RouteEndpoint', members: ['GET /v1/capabilities'] }]);

  assert.deepEqual(collectCandidateColumns(artifact), ['route']);
});

test('C002 a member spells a set: placeholder tokens drop and pipe alternatives expand', () => {
  assert.deepEqual(spellMember('gaia operation get|watch|cancel <operation-id>'), [
    'gaia operation get',
    'gaia operation watch',
    'gaia operation cancel',
  ]);
  assert.deepEqual(spellMember('object.get'), ['object.get']);
});

test('C002 a declared interface carries the measured counts and names the spelling no operation carries', () => {
  const artifact = artifactWith([
    { id: 'R-0001', verb: 'object.get' },
    { id: 'R-0002', verb: 'object.get' },
  ], [{ name: 'VerbMethod', members: ['object.get', 'object.unsubscribe'] }]);
  const declared = [{ interfaceId: 'surface-one', column: 'verb', operationSet: 'VerbMethod' }];

  const units = classifyServes(artifact, declared, 'pkg-a');

  assert.deepEqual(units.map((unit) => unit.unitId), [`${SERVES_UNIT_PREFIX}surface-one`]);
  assert.equal(units[0].coverage.carried, 2);
  assert.equal(units[0].coverage.total, 2);
  assert.deepEqual(units[0].coverage.uncoveredSpellings, ['object.unsubscribe']);
  assert.equal(units[0].coverage.crossChecked, true);
});

test('C002 a declared column the artifact does not carry is rendered as not cross-checked, never dropped', () => {
  const artifact = artifactWith([{ id: 'R-0001', verb: 'object.get' }], [{ name: 'VerbMethod', members: ['object.get'] }]);
  const units = classifyServes(artifact, [{ interfaceId: 'surface-two', column: 'socket', operationSet: 'VerbMethod' }], 'pkg-a');

  assert.equal(units.length, 1);
  assert.equal(units[0].coverage.crossChecked, false);
  assert.equal(units[0].coverage.carried, 0);
});

test('C005 the relations read two vocabularies with no shared spelling, and the module spells neither', () => {
  const first = artifactWith([{ id: 'R-0001', alpha: 'a.one' }], [{ name: 'AlphaSet', members: ['a.one'] }]);
  const second = artifactWith([{ id: 'R-0002', gamma: 'x.one' }, { id: 'R-0003', gamma: 'y.two' }], [{ name: 'GammaSet', members: ['x.one', 'y.two', 'z.three'] }]);

  assert.deepEqual(collectCandidateColumns(first), ['alpha']);
  assert.deepEqual(collectCandidateColumns(second), ['gamma']);
  assert.deepEqual(classifyServes(first, [{ interfaceId: 'one', column: 'alpha', operationSet: 'AlphaSet' }], 'pkg-a')[0].coverage.uncoveredSpellings, []);
  assert.deepEqual(classifyServes(second, [{ interfaceId: 'two', column: 'gamma', operationSet: 'GammaSet' }], 'pkg-a')[0].coverage.uncoveredSpellings, ['z.three']);

  const directory = path.join(process.cwd(), '.claude/scripts/sequences-slice/lib');
  const sources = fs.readdirSync(directory).map((name) => fs.readFileSync(path.join(directory, name), 'utf8')).join('\n');
  for (const vocabulary of ['alpha', 'gamma', 'AlphaSet', 'GammaSet', 'a.one', 'x.one', 'z.three']) {
    assert.equal(sources.includes(vocabulary), false, `${vocabulary} must not be spelled in the module`);
  }
});

test('C002 the declared record is read from a seed document fence, and an absent one declares nothing', () => {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px259-seed-'));
  try {
    const packages = path.join(root, 'crates', 'pkg-a');
    fs.mkdirSync(packages, { recursive: true });
    fs.writeFileSync(path.join(packages, 'RFC-SEED.md'), [
      '# Seed', '', '```json', JSON.stringify({ serves: [{ interfaceId: 'one', column: 'verb', operationSet: 'VerbMethod' }] }), '```', '',
    ].join('\n'));
    const declared = readDeclaredInterfaces(path.join(root, 'crates'), { contract_registry: [] });

    assert.deepEqual(declared.get('pkg-a'), [{ interfaceId: 'one', column: 'verb', operationSet: 'VerbMethod', valueJoin: [] }]);
    assert.deepEqual(readDeclaredInterfaces(path.join(root, 'crates'), { declared_interfaces: { 'pkg-b': [{ interfaceId: 'two', column: 'route', operationSet: 'RouteSet' }] } }).get('pkg-b'), [
      { interfaceId: 'two', column: 'route', operationSet: 'RouteSet', valueJoin: [] },
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C002 the obligation source is one of three named states', () => {
  assert.deepEqual([...OBLIGATION_SOURCES], ['declared', 'undeclared', 'absent']);
});
