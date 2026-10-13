// PX-255 @verifies C002
// PX-255 @verifies C003
// The ownership join is the whole feature's load-bearing step. An earlier probe of it
// read o.name and o.id and reported 0 of 210 resolutions, because inventory.objects
// carries its name in canonical_name. The regression guard for that misreading is the
// fixture whose canonical_name differs from both its id and its name.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  collectReachedPackageIds,
  collectUnmatchedClassNames,
  classifyOperationOwnership,
  countOperationOwnershipBuckets,
  inspectObjectRecords,
  resolveOperationOwners,
  resolveOwningPackages,
} from '../../.claude/scripts/sequences-slice/lib/ownership.mjs';
import {
  RECORDED_OPERATION_BUCKETS,
  liveShapedObjects,
  liveShapedOperations,
  objectsWhoseNameIsNeitherIdNorAlias,
} from './fixtures/synthetic-workspace.mjs';
import { DECLARED_RESIDUAL_CLASS_NAMES } from '../../.claude/scripts/sequences-slice/lib/residuals.mjs';

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C002 an objects array resolves to a map keyed by canonical_name', () => {
  const map = resolveOwningPackages([
    { canonical_name: 'Q', owner_package: 'pkg-0005' },
    { canonical_name: 'depth', owner_package: 'pkg-0005' },
  ]);
  assert.equal(map.size, 2);
  assert.equal(map.get('Q'), 'pkg-0005');
  assert.equal(map.get('depth'), 'pkg-0005');
});

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C002 the map is total over canonical_name and every value is one package id', () => {
  const objects = liveShapedObjects();
  const map = resolveOwningPackages(objects);
  assert.equal(map.size, new Set(objects.map((object) => object.canonical_name)).size);
  assert.equal(map.size, 1294);
  assert.ok([...map.values()].every((owner) => typeof owner === 'string' && owner.length > 0));
  assert.equal(new Set(map.values()).size, 15);
  assert.ok(objects.every((object) => map.get(object.canonical_name) === object.owner_package));
});

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C002 a name carried only in canonical_name resolves, which is the 0-of-210 regression guard', () => {
  const objects = objectsWhoseNameIsNeitherIdNorAlias();
  const map = resolveOwningPackages(objects);
  assert.equal(map.get('Q'), 'pkg-0005');
  assert.equal(map.get('obj-000001'), undefined);
  assert.equal(map.get('WRONG'), undefined);
  assert.ok(objects.every((object) => map.get(object.canonical_name) === object.owner_package));
});

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C002 an object record with no canonical_name is reported rather than silently skipped', () => {
  const inspected = inspectObjectRecords([{ owner_package: 'pkg-0005' }, { canonical_name: 'Q', owner_package: 'pkg-0005' }]);
  assert.deepEqual(inspected.defects, ['object at index 0 has no canonical_name']);
  assert.equal(inspected.ownershipByCanonicalName.size, 1);
});

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C002 a name owned by two packages is reported as a conflict rather than resolved by last writer', () => {
  const inspected = inspectObjectRecords([
    { canonical_name: 'Q', owner_package: 'pkg-0005' },
    { canonical_name: 'Q', owner_package: 'pkg-0006' },
  ]);
  assert.deepEqual(inspected.defects, ['canonical_name Q is owned by both pkg-0005 and pkg-0006']);
});

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C003 an operation naming one object returns that one owning package', () => {
  const ownership = new Map([['PaymentReceipt', 'pkg-0011'], ['ServiceOrder', 'pkg-0011']]);
  assert.deepEqual(resolveOperationOwners({ id: 'Op', result_object_classes: ['PaymentReceipt'] }, ownership), new Set(['pkg-0011']));
});

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C003 an operation naming two packages returns both ids in a stable order', () => {
  const ownership = new Map([['RoyaltyPolicy', 'pkg-0011'], ['OriginLineage', 'pkg-0006']]);
  const classified = classifyOperationOwnership({ id: 'Op', result_object_classes: ['RoyaltyPolicy', 'OriginLineage'] }, ownership);
  assert.deepEqual(classified.ownerPackageIds, ['pkg-0006', 'pkg-0011']);
  assert.deepEqual(classified.unmatchedClassNames, []);
});

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C003 an empty result_object_classes yields no owner and is counted in its own bucket', () => {
  const ownership = new Map([['PaymentReceipt', 'pkg-0011']]);
  assert.deepEqual(classifyOperationOwnership({ id: 'Op', result_object_classes: [] }, ownership).ownerPackageIds, []);
});

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C003 a result_object_classes that is absent or null yields no owner without throwing', () => {
  const ownership = new Map([['PaymentReceipt', 'pkg-0011']]);
  assert.deepEqual(classifyOperationOwnership({ id: 'Op' }, ownership).ownerPackageIds, []);
  assert.deepEqual(classifyOperationOwnership({ id: 'Op', result_object_classes: null }, ownership).ownerPackageIds, []);
  assert.deepEqual(classifyOperationOwnership({ id: 'Op', result_object_classes: 'PaymentReceipt' }, ownership).ownerPackageIds, []);
});

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C003 a class name absent from the map is reported as unmatched rather than dropped', () => {
  const ownership = new Map([['PaymentReceipt', 'pkg-0011']]);
  const classified = classifyOperationOwnership({ id: 'Op', result_object_classes: ['PaymentReceipt', 'NoSuchObject'] }, ownership);
  assert.deepEqual(classified.ownerPackageIds, ['pkg-0011']);
  assert.deepEqual(classified.unmatchedClassNames, ['NoSuchObject']);
});

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C003 the four buckets are the measured ones and they partition the operations', () => {
  const operations = liveShapedOperations();
  const buckets = countOperationOwnershipBuckets(operations, resolveOwningPackages(liveShapedObjects()));
  assert.deepEqual(buckets, RECORDED_OPERATION_BUCKETS);
  assert.equal(
    buckets.emptyResultClasses + buckets.exactlyOnePackage + buckets.severalPackages + buckets.noKnownPackage,
    operations.length,
  );
  assert.equal(buckets.total, 257);
});

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C003 thirteen packages are reached and ten class names are unmatched', () => {
  const operations = liveShapedOperations();
  const ownership = resolveOwningPackages(liveShapedObjects());
  assert.equal(collectReachedPackageIds(operations, ownership).length, 13);
  assert.deepEqual(collectReachedPackageIds(operations, ownership), [
    'pkg-0002', 'pkg-0003', 'pkg-0004', 'pkg-0005', 'pkg-0006', 'pkg-0007', 'pkg-0008',
    'pkg-0009', 'pkg-0010', 'pkg-0011', 'pkg-0012', 'pkg-0013', 'pkg-0014',
  ]);
  assert.equal(collectUnmatchedClassNames(operations, ownership).length, 10);
  assert.deepEqual(collectUnmatchedClassNames(operations, ownership), [...DECLARED_RESIDUAL_CLASS_NAMES].sort());
});
