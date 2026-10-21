// PX-262 @verifies C001
// A demand set is only total against something. Until this module existed the four axes were
// derived from the artifact or the manifests and compared with nothing, so an artifact that named
// no operations read as a workspace with no work rather than as a workspace whose census was never
// supplied. This is the one place that answers what each axis is measured against, and the answer
// `unstated` is what the gate withholds a verdict on.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DENOMINATOR_AXES,
  DENOMINATOR_SOURCES,
  denominatorOf,
  gapsIn,
} from '../../.claude/scripts/sequences-slice/lib/obligation-denominator.mjs';

const OPERATIONS = [{ id: 'R-0001', verb: 'object.get' }, { id: 'R-0002', verb: 'object.get' }];
const SEQUENCES = [{ id: 'S-0001', outcome: 'direct' }];

/** An artifact with no census borrowed, which is the state the live workspace is in. */
// [::TICKET::] PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-262|PX-263) --for-spec --no-implementation-order`.
function artifactWithoutCensus() {
  return { spec: { lines: 40 }, sections: [], sequences: SEQUENCES, operations: OPERATIONS, pins: { sourceEnumerations: [] } };
}

/** The same artifact with both roles borrowed, in the shape the rail's pin carries. */
// [::TICKET::] PX-262, PX-263, PX-288 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-262|PX-263|PX-288) --for-spec --no-implementation-order`.
function artifactWithCensus() {
  return {
    ...artifactWithoutCensus(),
    pins: {
      sourceEnumerations: [
        { role: 'operations', name: 'census-operations', members: ['R-0001', 'R-0002'] },
        { role: 'sequences', name: 'census-sequences', members: ['S-0001'] },
      ],
    },
  };
}

/** A tree manifest declaring boundaries, and a registry that may or may not carry them. */
// [::TICKET::] PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-262|PX-263) --for-spec --no-implementation-order`.
function manifests({ declared = 2, registered = 2, declaredInterfaces = null } = {}) {
  return {
    treeManifest: declared === null ? null : { stage2_handoff: { contract_boundaries: Array.from({ length: declared }, (unused, index) => ({ id: `B-${index + 1}` })) } },
    allocateManifest: {
      contract_registry: Array.from({ length: registered }, (unused, index) => ({ boundary_id: `B-${index + 1}`, contract_id: `C-${index + 1}` })),
      ...(declaredInterfaces === null ? {} : { declared_interfaces: declaredInterfaces }),
    },
  };
}

// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
test('C001 an artifact borrowing no census reports the operations and entries roles as unstated', () => {
  const denominator = denominatorOf({ artifact: artifactWithoutCensus(), ...manifests(), views: [] });

  assert.deepEqual(denominator.operations, { axis: 'operations', source: 'unstated', members: 0, borrowed: false });
  assert.deepEqual(denominator.sequences, { axis: 'sequences', source: 'unstated', members: 0, borrowed: false });
});

// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
test('C001 a borrowed census states the axis with the member count the pin lists', () => {
  const denominator = denominatorOf({ artifact: artifactWithCensus(), ...manifests(), views: [] });

  assert.equal(denominator.operations.source, 'census');
  assert.equal(denominator.operations.borrowed, true);
  assert.equal(denominator.operations.members, 2);
  assert.equal(denominator.sequences.source, 'census');
  assert.equal(denominator.sequences.members, 1);
});

// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
test('C001 the boundaries axis is stated when the registry accounts for every declared boundary', () => {
  const stated = denominatorOf({ artifact: artifactWithoutCensus(), ...manifests({ declared: 84, registered: 84 }), views: [] });
  assert.deepEqual(stated.boundaries, { axis: 'boundaries', source: 'registry', members: 84, borrowed: true });

  const short = denominatorOf({ artifact: artifactWithoutCensus(), ...manifests({ declared: 84, registered: 82 }), views: [] });
  assert.equal(short.boundaries.source, 'unstated');

  const noTree = denominatorOf({ artifact: artifactWithoutCensus(), ...manifests({ declared: null, registered: 84 }), views: [] });
  assert.equal(noTree.boundaries.source, 'registry', 'the registry is the statement the workspace holds when the tree manifest is not offered');

  const emptyRegistry = denominatorOf({ artifact: artifactWithoutCensus(), ...manifests({ declared: null, registered: 0 }), views: [] });
  assert.equal(emptyRegistry.boundaries.source, 'registry', 'a registry that declares nothing states that there are no boundaries');
});

// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
test('C001 the surfaces axis is stated by a declaration and unstated without one', () => {
  const declared = denominatorOf({
    artifact: artifactWithoutCensus(),
    ...manifests({ declaredInterfaces: { 'pkg-a': [{ column: 'verb' }] } }),
    views: [],
  });
  assert.equal(declared.surfaces.source, 'declaration');
  assert.equal(declared.surfaces.borrowed, true);

  const served = denominatorOf({
    artifact: artifactWithoutCensus(),
    ...manifests(),
    views: [{ packageId: 'pkg-a', obligationUnits: [{ unitId: 'obl-verb', relation: 'serves', coverage: { column: 'verb' } }] }],
  });
  assert.equal(served.surfaces.source, 'declaration');

  const none = denominatorOf({ artifact: artifactWithoutCensus(), ...manifests(), views: [] });
  assert.equal(none.surfaces.source, 'unstated');
  assert.equal(none.surfaces.members, 0);
});

// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
test('C001 the function is total: every input yields exactly the four axes with a source in the vocabulary', () => {
  const inputs = [
    { artifact: null, allocateManifest: null, treeManifest: null, views: [] },
    { artifact: artifactWithoutCensus(), allocateManifest: null, treeManifest: null, views: null },
    { artifact: { operations: OPERATIONS }, allocateManifest: {}, treeManifest: {}, views: [{}] },
    { artifact: { pins: { sourceEnumerations: [{ role: 'operations' }] } }, ...manifests(), views: [] },
    { artifact: artifactWithCensus(), ...manifests({ declaredInterfaces: {} }), views: [{ obligationUnits: 'not-an-array' }] },
  ];

  for (const input of inputs) {
    const denominator = denominatorOf(input);
    assert.deepEqual(Object.keys(denominator).sort(), [...DENOMINATOR_AXES].sort());
    for (const axis of DENOMINATOR_AXES) {
      assert.equal(denominator[axis].axis, axis);
      assert.ok(DENOMINATOR_SOURCES.includes(denominator[axis].source), `${axis} carries a known source`);
      assert.equal(typeof denominator[axis].members, 'number');
      assert.equal(typeof denominator[axis].borrowed, 'boolean');
    }
  }
});

// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
test('C001 a pin whose members are absent is borrowed and empty rather than unstated', () => {
  const denominator = denominatorOf({
    artifact: { ...artifactWithoutCensus(), pins: { sourceEnumerations: [{ role: 'operations', name: 'census-operations' }] } },
    ...manifests(),
    views: [],
  });

  assert.equal(denominator.operations.source, 'census', 'the census was supplied, and it says the specification names nothing');
  assert.equal(denominator.operations.borrowed, true);
  assert.equal(denominator.operations.members, 0);
});

// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
test('gapsIn names every unstated axis and nothing else', () => {
  const allStated = denominatorOf({ artifact: artifactWithCensus(), ...manifests({ declaredInterfaces: { 'pkg-a': [{ column: 'verb' }] } }), views: [] });
  assert.deepEqual(gapsIn(allStated, {}), []);

  const noneStated = denominatorOf({ artifact: artifactWithoutCensus(), allocateManifest: null, treeManifest: null, views: [] });
  const counts = { operations: 2, sequences: 1, boundaries: 0, surfaces: 1 };
  assert.deepEqual(gapsIn(noneStated, counts).map((gap) => gap.axis), ['operations', 'sequences', 'boundaries', 'surfaces']);
});

// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
test('gapsIn skips a surfaces axis that asks about nothing, and never skips the two census axes', () => {
  const unstated = denominatorOf({ artifact: artifactWithoutCensus(), allocateManifest: null, treeManifest: null, views: [] });

  assert.deepEqual(gapsIn(unstated, { operations: 0, sequences: 0, boundaries: 0, surfaces: 0 }).map((gap) => gap.axis), ['operations', 'sequences', 'boundaries'], 'the two census axes report their absence whether or not the artifact names any');
  assert.deepEqual(gapsIn(unstated, { operations: 0, sequences: 0, boundaries: 0, surfaces: 1 }).map((gap) => gap.axis), ['operations', 'sequences', 'boundaries', 'surfaces']);
});

// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
test('gapsIn names the missing structure and how to supply it, and never leaves either empty', () => {
  for (const gap of gapsIn(denominatorOf({ artifact: artifactWithoutCensus(), ...manifests({ declared: 84, registered: 82 }), views: [] }), { surfaces: 1 })) {
    assert.ok(gap.why.trim().length > 0, `${gap.axis} says why`);
    assert.ok(gap.repair.trim().length > 0, `${gap.axis} says how to repair it`);
  }
});


// ---------------------------------------------------------------------------
// PX-263 — a pinned vocabulary states the surfaces axis
// ---------------------------------------------------------------------------

/** An artifact whose pins carry a closed vocabulary, and whose one operation instantiates it. */
// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
function artifactWithPinnedVocabulary() {
  return {
    spec: { lines: 40 },
    sections: [],
    sequences: [],
    operations: [{ id: 'R-0001', verb: 'object.get' }],
    pins: {
      sourceEnumerations: [],
      enumerations: [{ name: 'VerbMethod', members: ['object.get', 'object.unsubscribe'] }],
      columns: [{ name: 'verb', decidedBy: 'borrowedVocabulary', vocabulary: 'VerbMethod' }],
    },
  };
}

test('C003 a pinned vocabulary the operation rows instantiate states the surfaces axis', () => {
  const pinned = denominatorOf({ artifact: artifactWithPinnedVocabulary() });
  const unpinned = denominatorOf({ artifact: { ...artifactWithPinnedVocabulary(), pins: { sourceEnumerations: [], enumerations: [], columns: [] } } });

  assert.equal(pinned.surfaces.source, 'declaration');
  assert.equal(pinned.surfaces.members, 1);
  assert.equal(unpinned.surfaces.source, 'unstated');
});

test('C003 a vocabulary of unrelated names does not state the axis, because no column instantiates it', () => {
  const artifact = artifactWithPinnedVocabulary();
  artifact.pins.enumerations = [{ name: 'ExecutionMode', members: ['serial', 'parallel'] }];

  assert.equal(denominatorOf({ artifact }).surfaces.source, 'unstated');
});

test('C003 invariant: widening the surfaces denominator never narrows it', () => {
  const served = { packageId: 'pkg-a', obligationUnits: [{ unitId: 'obl-verb', relation: 'serves', coverage: { column: 'verb' } }] };
  const declared = { declared_interfaces: { 'pkg-a': [{ column: 'verb' }] } };
  const fixtures = [
    { artifact: artifactWithPinnedVocabulary(), views: [served] },
    { artifact: artifactWithPinnedVocabulary(), allocateManifest: declared },
    { artifact: artifactWithPinnedVocabulary() },
  ];

  for (const input of fixtures) assert.notEqual(denominatorOf(input).surfaces.source, 'unstated', 'every route that stated the axis still states it');
});
