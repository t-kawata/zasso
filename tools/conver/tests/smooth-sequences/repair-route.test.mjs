import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { finding } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { REPAIR_ROUTE_BY_CHECK_ID, repairRouteFor } from '../../.claude/scripts/smooth-sequences/lib/repair-route.mjs';

// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.

const DETECTOR_LIBRARY = '.claude/scripts/smooth-sequences/lib';

/** The checkId literals every check emits, directly or through the addFinding helper. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function emittedCheckIds() {
  const emitted = new Set();
  const patterns = [
    /finding\(\s*'([^']+)'/g,
    /addFinding\([^,]+,\s*'([^']+)'/g,
  ];
  for (const name of readdirSync(DETECTOR_LIBRARY).filter((entry) => entry.endsWith('.mjs'))) {
    const source = readFileSync(join(DETECTOR_LIBRARY, name), 'utf8');
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) emitted.add(match[1]);
    }
  }
  return emitted;
}

/** One finding payload every test can reuse. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function repairDetails() {
  return {
    where: 'spec.md#L12',
    why: 'transition open -> gone names an undeclared status',
    fix: 'declare gone in allowed_status_transitions',
    producer: '/educe-sequences spec.md',
  };
}

// @verifies C001
test('a finding carries where, why, fix and producer and no legacy field', () => {
  const details = repairDetails();
  const result = finding('S3.transition-target-unknown', 'deficiency', 'Op', details);
  assert.equal(result.where, details.where);
  assert.equal(result.why, details.why);
  assert.equal(result.fix, details.fix);
  assert.equal(result.producer, details.producer);
  assert.equal('reason' in result, false);
  assert.equal('repair' in result, false);
});

// @verifies C001
test('a finding missing any repair field is rejected before rendering', () => {
  const details = repairDetails();
  for (const field of ['where', 'why', 'fix', 'producer']) {
    const incomplete = { ...details };
    delete incomplete[field];
    assert.throws(
      () => finding('S1.duplicate-id', 'contradiction', 'operations:x', incomplete),
      new RegExp(field),
      field,
    );
  }
});

// @verifies C002
test('every emitted checkId has a route and no route is stale', () => {
  const emitted = [...emittedCheckIds()].sort();
  assert.ok(emitted.length > 0);
  assert.deepEqual(emitted, Object.keys(REPAIR_ROUTE_BY_CHECK_ID).sort());
});

// @verifies C002
test('a specification check resolves to the spec path and the educe producer', () => {
  const route = repairRouteFor('S1.duplicate-id', {
    artifact: { spec: { path: 'spec.md' } },
    artifactPath: '/w/example-sequences.json',
    locator: 'L4',
  });
  assert.deepEqual(route, { where: 'spec.md#L4', producer: '/educe-sequences spec.md' });
});

// @verifies C002
test('an allocate clause resolves to the decisions document and the finalize producer', () => {
  const route = repairRouteFor('S4.boundary-clause-missing', {
    artifact: { spec: { path: 'spec.md' } },
    locator: 'boundary-001/authority',
  });
  assert.equal(route.where, 'workspacify/allocate/DECISIONS.json#boundary-001/authority');
  assert.match(route.producer, /workspacify-allocate\/run\.mjs finalize/);
});

// @verifies C002
test('a package RFC check resolves to the RFC and the grill producer', () => {
  const route = repairRouteFor('S7.rfc-boundary-missing', {
    packagesById: new Map([['pkg-0001', { id: 'pkg-0001', path: 'crates/alpha' }]]),
    packageId: 'pkg-0001',
    locator: 'boundaries/boundary-001',
  });
  assert.deepEqual(route, { where: 'crates/alpha/RFC.md#boundaries/boundary-001', producer: '/grill-me-for-rfc' });
});

// @verifies C002
test('a view check resolves to the generated view and the slice producer', () => {
  const route = repairRouteFor('S7.view-missing', {
    artifactPath: '/w/example-sequences.json',
    packagesById: new Map([['pkg-0001', { id: 'pkg-0001', path: 'crates/alpha' }]]),
    packageId: 'pkg-0001',
  });
  assert.equal(route.where, 'crates/alpha/SEQUENCES.json');
  assert.equal(route.producer, 'node .claude/scripts/sequences-slice/run.mjs /w/example-sequences.json crates/alpha');
});

// @verifies C002
test('an unknown checkId throws UNROUTED_FINDING', () => {
  assert.throws(
    () => repairRouteFor('S9.unknown', {}),
    (error) => error.code === 'UNROUTED_FINDING',
  );
});

// @verifies C002
test('no check fix string instructs editing a generated file', () => {
  for (const name of readdirSync(DETECTOR_LIBRARY).filter((entry) => entry.endsWith('.mjs'))) {
    const source = readFileSync(join(DETECTOR_LIBRARY, name), 'utf8');
    assert.doesNotMatch(
      source,
      /fix:\s*`[^`]*(edit|add)[^`]*(SEQUENCES\.json|-sequences\.json|WORKSPACIFY-)/i,
      name,
    );
  }
});
