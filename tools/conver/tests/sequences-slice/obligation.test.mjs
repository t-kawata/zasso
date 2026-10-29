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
  OBLIGATION_RECORD_BASENAME,
  OBLIGATION_RECORD_SUPPORTED_VERSIONS,
  OBLIGATION_RECORD_VERSION,
  OBLIGATION_SOURCES,
  SERVES_UNIT_PREFIX,
  buildObligationUnits,
  classifyAdjudications,
  classifyAssignments,
  classifyCarries,
  classifyServes,
  collectCandidateColumns,
  readDeclaredInterfaces,
  readPackageObligations,
  spellMember,
} from '../../.claude/scripts/sequences-slice/lib/obligation.mjs';

/** One boundary between two packages, in the shape the allocate manifest carries. */
// [::TICKET::] PX-259 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-259 --for-spec --no-implementation-order`.
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

// [::TICKET::] PX-259 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-259 --for-spec --no-implementation-order`.
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

// ---------------------------------------------------------------------------
// PX-260 — the package obligation record, the writable third source
// ---------------------------------------------------------------------------

/** A package root on disk holding one package directory or more. */
// [::TICKET::] PX-260, PX-261, PX-262 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-260|PX-261|PX-262) --for-spec --no-implementation-order`.
function packageRootWith(entries) {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px260-obligation-'));
  for (const [relativeDirectory, files] of Object.entries(entries)) {
    const directory = path.join(root, relativeDirectory);
    fs.mkdirSync(directory, { recursive: true });
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), text);
  }
  return root;
}

/** A record as a run writes it, with the ground every judgment carries. */
// [::TICKET::] PX-260, PX-261, PX-262 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-260|PX-261|PX-262) --for-spec --no-implementation-order`.
function recordFor({ serves = [], assignments = [], version = 1 } = {}) {
  return JSON.stringify({ version, serves, assignments });
}

/** The artifact two operations and one sequence, with a verb vocabulary. */
// [::TICKET::] PX-260, PX-261, PX-262 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-260|PX-261|PX-262) --for-spec --no-implementation-order`.
function artifactWithSequence() {
  return {
    ...artifactWith([{ id: 'R-0001', verb: 'object.get' }, { id: 'R-0002', verb: 'object.get' }], [{ name: 'VerbMethod', members: ['object.get'] }]),
    sequences: [{ id: 'S-0001', outcome: 'direct' }],
  };
}

test('C001 the record declares a surface, and the unit is measured against the artifact the record names', () => {
  const root = packageRootWith({
    'pkg-a': { [OBLIGATION_RECORD_BASENAME]: recordFor({ serves: [{ interfaceId: 'surface-one', column: 'verb', operationSet: 'VerbMethod' }] }) },
  });
  try {
    const read = readPackageObligations(root, { contract_registry: [] });

    assert.deepEqual(read.get('pkg-a').serves, [{ interfaceId: 'surface-one', column: 'verb', operationSet: 'VerbMethod', valueJoin: [] }]);
    assert.equal(read.get('pkg-a').source, 'declared');
    assert.deepEqual(read.get('pkg-a').refused, []);

    const units = classifyServes(artifactWithSequence(), read.get('pkg-a').serves, 'pkg-a');
    assert.equal(units[0].coverage.carried, 2);
    assert.equal(units[0].coverage.total, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C001 the assignments are read from the record alone, whatever source declared the surfaces', () => {
  const assignment = { unit: 'op-R-0002', ground: 'the specification states it on the cited line' };
  const root = packageRootWith({
    'pkg-a': {
      [OBLIGATION_RECORD_BASENAME]: recordFor({ assignments: [assignment] }),
      'RFC-SEED.md': ['# Seed', '', '```json', JSON.stringify({ serves: [{ interfaceId: 'from-seed', column: 'verb', operationSet: 'VerbMethod' }] }), '```', ''].join('\n'),
    },
  });
  try {
    const read = readPackageObligations(root, { contract_registry: [] });

    assert.deepEqual(read.get('pkg-a').assignments, [assignment]);
    assert.deepEqual(read.get('pkg-a').serves.map((entry) => entry.interfaceId), ['from-seed'], 'the seed keeps the precedence it had');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C001 the manifest field still wins for the surfaces, and the record still supplies the judgments', () => {
  const root = packageRootWith({ 'pkg-a': { [OBLIGATION_RECORD_BASENAME]: recordFor({ serves: [{ interfaceId: 'from-record', column: 'verb', operationSet: 'VerbMethod' }], assignments: [{ unit: 'op-R-0002', ground: 'stated' }] }) } });
  try {
    const read = readPackageObligations(root, {
      declared_interfaces: { 'pkg-a': [{ interfaceId: 'from-manifest', column: 'verb', operationSet: 'VerbMethod' }] },
      contract_registry: [],
    });

    assert.deepEqual(read.get('pkg-a').serves.map((entry) => entry.interfaceId), ['from-manifest']);
    assert.deepEqual(read.get('pkg-a').assignments.map((entry) => entry.unit), ['op-R-0002']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C001 an unreadable record is refused by name and the package is not read as declaring nothing', () => {
  const root = packageRootWith({ 'pkg-a': { [OBLIGATION_RECORD_BASENAME]: '{ not json' } });
  try {
    const entry = readPackageObligations(root, { contract_registry: [] }).get('pkg-a');

    assert.deepEqual(entry.serves, []);
    assert.deepEqual(entry.assignments, []);
    assert.equal(entry.source, 'undeclared');
    assert.equal(entry.refused.length, 1);
    assert.match(entry.refused[0], /OBLIGATION\.json/, 'the path is named rather than swallowed');
    assert.match(entry.refused[0], /could not be read as a record/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C001 a record written under a version this reader does not know is refused by name', () => {
  const root = packageRootWith({ 'pkg-a': { [OBLIGATION_RECORD_BASENAME]: recordFor({ version: 99, assignments: [{ unit: 'op-R-0002', ground: 'stated' }] }) } });
  try {
    const entry = readPackageObligations(root, { contract_registry: [] }).get('pkg-a');

    assert.deepEqual(entry.assignments, [], 'a record of an unknown version is not half-read');
    assert.equal(entry.refused.length, 1);
    assert.match(entry.refused[0], /version 99/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C001 a package the record does not name is absent from the read, so no unit is invented for it', () => {
  const root = packageRootWith({ 'pkg-a': { [OBLIGATION_RECORD_BASENAME]: recordFor() } });
  try {
    const read = readPackageObligations(root, { contract_registry: [] });

    assert.equal(read.has('pkg-z'), false);
    assert.deepEqual(buildObligationUnits({ artifact: artifactWithSequence(), allocateManifest: { contract_registry: [] } }, 'pkg-z', []), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C001 an assignment names its demand, carries its ground, and gains the kind the id spells', () => {
  const artifact = artifactWithSequence();
  const { units, unbound } = classifyAssignments(artifact, [
    { unit: 'op-R-0001', ground: 'the specification states it at section 4.2' },
    { unit: 'seq-S-0001', ground: 'the specification states it at section 5.1' },
  ]);

  assert.deepEqual(units.map((unit) => `${unit.unitId}:${unit.relation}:${unit.kind}`), ['op-R-0001:assigns:operation', 'seq-S-0001:assigns:sequence']);
  assert.equal(units[0].ground, 'the specification states it at section 4.2');
  assert.equal(units[0].subject, 'R-0001');
  assert.deepEqual(unbound, []);
});

test('PX-310 an assigned operation names its assignee as the implementer', () => {
  const { units } = classifyAssignments(artifactWithSequence(), [
    { unit: 'op-R-0001', ground: 'the specification states it at section 4.2' },
    { unit: 'seq-S-0001', ground: 'the specification states it at section 5.1' },
  ]);

  const operation = units.find((unit) => unit.kind === 'operation');
  const sequence = units.find((unit) => unit.kind === 'sequence');
  assert.equal(operation.roleCandidate, 'implementer');
  assert.equal(sequence.roleCandidate, undefined);
});

test('C001 an assignment naming nothing the artifact holds is reported and invents no unit', () => {
  const { units, unbound } = classifyAssignments(artifactWithSequence(), [
    { unit: 'op-R-0001', ground: 'stated' },
    { unit: 'op-R-9999', ground: 'stated' },
    { unit: 'seq-S-9999', ground: 'stated' },
  ]);

  assert.deepEqual(units.map((unit) => unit.unitId), ['op-R-0001']);
  assert.deepEqual(unbound, ['op-R-9999', 'seq-S-9999']);
});

test('C001 an assignment with no ground is still a unit, and the unit says the ground is missing', () => {
  const { units } = classifyAssignments(artifactWithSequence(), [{ unit: 'op-R-0001', ground: '   ' }]);

  assert.equal(units.length, 1);
  assert.equal(units[0].ground, '');
  assert.equal(units[0].unitId, 'op-R-0001');
});

test('C001 the union holds the surfaces, the assignments and the boundaries, sorted with stable ids', () => {
  const record = {
    serves: [{ interfaceId: 'surface-one', column: 'verb', operationSet: 'VerbMethod' }],
    assignments: [{ unit: 'op-R-0002', ground: 'the specification states it on the cited line' }, { unit: 'seq-S-0001', ground: 'stated' }],
  };
  const manifest = { contract_registry: [contractBetween('pkg-a', 'pkg-b', 'boundary-001')] };
  const units = buildObligationUnits({ artifact: artifactWithSequence(), allocateManifest: manifest, record }, 'pkg-a', record.serves);

  assert.deepEqual(units.map((unit) => `${unit.unitId}:${unit.relation}`), [
    'ctr-boundary-001:carries', 'obl-surface-one:serves', 'op-R-0002:assigns', 'seq-S-0001:assigns',
  ]);
  assert.deepEqual(buildObligationUnits({ artifact: artifactWithSequence(), allocateManifest: manifest, record: { serves: [], assignments: [] } }, 'pkg-a', []).map((unit) => unit.unitId), ['ctr-boundary-001']);
  assert.deepEqual(buildObligationUnits({ artifact: artifactWithSequence(), allocateManifest: manifest }, 'pkg-a', []).map((unit) => unit.unitId), ['ctr-boundary-001']);
});

// ---------------------------------------------------------------------------
// PX-261 — the adjudication route, and the count that catches a false declaration
// ---------------------------------------------------------------------------

test('PX-261 the record carries the columns a package adjudicated away, with the ground of each', () => {
  const root = packageRootWith({
    'pkg-a': { [OBLIGATION_RECORD_BASENAME]: JSON.stringify({ version: 1, serves: [], assignments: [], adjudications: [{ column: 'id', ground: 'the specification states it on line 412' }] }) },
  });
  try {
    const entry = readPackageObligations(root, { contract_registry: [] }).get('pkg-a');

    assert.deepEqual(entry.adjudications, [{ column: 'id', ground: 'the specification states it on line 412', carriedBy: 'pkg-a' }], 'version 1 has no carrier field, and its writer meant this package');
    assert.deepEqual(entry.serves, []);
    assert.deepEqual(entry.assignments, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-261 a record written before this ticket reads exactly as it did, with an empty adjudication list', () => {
  const root = packageRootWith({ 'pkg-a': { [OBLIGATION_RECORD_BASENAME]: recordFor({ serves: [{ interfaceId: 'one', column: 'verb', operationSet: 'VerbMethod' }] }) } });
  try {
    const entry = readPackageObligations(root, { contract_registry: [] }).get('pkg-a');

    assert.deepEqual(entry.adjudications, []);
    assert.deepEqual(entry.serves.map((declaration) => declaration.interfaceId), ['one']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-261 an adjudication naming no column is dropped, because it names nothing to adjudicate', () => {
  assert.deepEqual(classifyAdjudications({ adjudications: [{ column: '', ground: 'stated' }, { column: '   ', ground: 'stated' }, { column: 'id', ground: 'stated' }] }), [
    { column: 'id', ground: 'stated', carriedBy: '' },
  ], 'a record declaring no version is read under the current rules, which require a carrier');
  assert.deepEqual(classifyAdjudications({}), []);
});

test('PX-261 a declaration reports the values of its column its vocabulary does not cover', () => {
  const artifact = artifactWith(
    [{ id: 'R-0001', verb: 'object.get' }, { id: 'R-0002', verb: 'not.a.member' }],
    [{ name: 'VerbMethod', members: ['object.get', 'object.unsubscribe'] }],
  );
  const [unit] = classifyServes(artifact, [{ interfaceId: 'surface-one', column: 'verb', operationSet: 'VerbMethod' }], 'pkg-a');

  assert.deepEqual(unit.coverage.foreignValues, ['not.a.member']);
  assert.equal(unit.coverage.carried, 2);
  assert.equal(unit.coverage.total, 2);
  assert.deepEqual(unit.coverage.uncoveredSpellings, ['object.unsubscribe']);
});

test('PX-261 a declaration whose every value instantiates its vocabulary reports no foreign value', () => {
  const artifact = artifactWith(
    [{ id: 'R-0001', verb: 'object.get' }, { id: 'R-0002', verb: 'object.get' }],
    [{ name: 'VerbMethod', members: ['object.get', 'object.unsubscribe'] }],
  );
  const [unit] = classifyServes(artifact, [{ interfaceId: 'surface-one', column: 'verb', operationSet: 'VerbMethod' }], 'pkg-a');

  assert.deepEqual(unit.coverage.foreignValues, []);
  assert.equal(unit.coverage.crossChecked, true);
});

test('C001 no unit id an earlier run carried is renamed or retired by the record', () => {
  const record = { serves: [], assignments: [{ unit: 'op-R-0002', ground: 'stated' }] };
  const manifest = { contract_registry: [contractBetween('pkg-a', 'pkg-b', 'boundary-001')] };
  const before = buildObligationUnits({ artifact: artifactWithSequence(), allocateManifest: manifest }, 'pkg-a', []);
  const after = buildObligationUnits({ artifact: artifactWithSequence(), allocateManifest: manifest, record }, 'pkg-a', []);

  for (const unit of before) assert.equal(after.some((candidate) => candidate.unitId === unit.unitId), true, `${unit.unitId} survives`);
});

// ---------------------------------------------------------------------------
// PX-262 — the record version selects the rule set, so a record written before the carrier
// existed is read under the rules it was written under
// ---------------------------------------------------------------------------

test('C005 a version-1 adjudication is completed with the package that wrote it rather than refused', () => {
  const root = packageRootWith({
    'pkg-a': { [OBLIGATION_RECORD_BASENAME]: JSON.stringify({ version: 1, serves: [], assignments: [], adjudications: [{ column: 'id', ground: 'the specification states it on line 412' }] }) },
  });
  try {
    const entry = readPackageObligations(root, { contract_registry: [] }).get('pkg-a');

    assert.deepEqual(entry.refused, []);
    assert.deepEqual(entry.adjudications.map((row) => row.carriedBy), ['pkg-a']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C005 a version-2 adjudication carries only the carrier it declares, so an absent one stays absent', () => {
  const declared = packageRootWith({
    'pkg-a': { [OBLIGATION_RECORD_BASENAME]: JSON.stringify({ version: 2, serves: [], assignments: [], adjudications: [{ column: 'id', ground: 'stated at line 412', carriedBy: 'pkg-b' }] }) },
  });
  const absent = packageRootWith({
    'pkg-a': { [OBLIGATION_RECORD_BASENAME]: JSON.stringify({ version: 2, serves: [], assignments: [], adjudications: [{ column: 'id', ground: 'stated at line 412' }] }) },
  });
  try {
    assert.deepEqual(readPackageObligations(declared, { contract_registry: [] }).get('pkg-a').adjudications.map((row) => row.carriedBy), ['pkg-b']);
    assert.deepEqual(readPackageObligations(absent, { contract_registry: [] }).get('pkg-a').adjudications.map((row) => row.carriedBy), [''], 'the reader does not invent a carrier for the version that requires one');
  } finally {
    fs.rmSync(declared, { recursive: true, force: true });
    fs.rmSync(absent, { recursive: true, force: true });
  }
});

test('C005 a version this reader does not know is refused, and the refusal names every version it does', () => {
  const root = packageRootWith({
    'pkg-a': { [OBLIGATION_RECORD_BASENAME]: JSON.stringify({ version: 9, serves: [], assignments: [], adjudications: [] }) },
  });
  try {
    const [refusal] = readPackageObligations(root, { contract_registry: [] }).get('pkg-a').refused;

    assert.match(refusal, /records version 9/);
    for (const version of OBLIGATION_RECORD_SUPPORTED_VERSIONS) assert.match(refusal, new RegExp(String(version)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C005 the version written is the newest one known, and the version every existing record carries stays readable', () => {
  assert.equal(OBLIGATION_RECORD_VERSION, Math.max(...OBLIGATION_RECORD_SUPPORTED_VERSIONS));
  assert.ok(OBLIGATION_RECORD_SUPPORTED_VERSIONS.includes(1));
});
