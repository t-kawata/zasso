// [::TICKET::] PX-202 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-202 --for-spec --no-implementation-order`.
// PX-202 @verifies C001
// A package catalogue and the ownership table are two statements about the same
// fact. When they disagree, the machine must say so: an item a package declares in
// `owns` that the ownership table cannot show used to publish with a clean audit.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runOwnershipChecks } from '../../../.claude/scripts/workspacify-tree/lib/ownership.mjs';

const owns = (overrides = {}) => ({ objects: [], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [], ...overrides });
const packageRecord = (id, overrides = {}) => ({ id, name: id, layer: 'protocol', owns: owns(), ...overrides });
const object = (id, owner) => ({ id, canonical_name: id, owner_package: owner });

test('C001 an item a package declares in owns but the ownership table cannot show is a disagreement', () => {
  const report = runOwnershipChecks({
    objects: [object('obj-000001', null)],
    claims: [],
    packages: [packageRecord('pkg-a', { owns: owns({ objects: ['obj-000001'] }) })],
  });
  assert.equal(report.ownership_disagreement_count, 1, JSON.stringify(report.details));
  assert.ok(
    report.details.some((line) => line.includes('obj-000001') && line.includes('pkg-a')),
    JSON.stringify(report.details),
  );
});

test('C001 both sides declared is clean, and a claim disagrees the same way', () => {
  const agreed = runOwnershipChecks({
    objects: [object('obj-000001', 'pkg-a')],
    claims: [],
    packages: [packageRecord('pkg-a', { owns: owns({ objects: ['obj-000001'] }) })],
  });
  assert.equal(agreed.ownership_disagreement_count, 0, JSON.stringify(agreed.details));

  const claimed = runOwnershipChecks({
    objects: [],
    claims: [{ id: 'req-000001', canonical_name: 'req-000001', primary_owner: null }],
    packages: [packageRecord('pkg-a', { owns: owns({ claims: ['req-000001'] }) })],
  });
  assert.equal(claimed.ownership_disagreement_count, 1, JSON.stringify(claimed.details));
  assert.ok(claimed.details.some((line) => line.includes('req-000001') && line.includes('primary_owner')), JSON.stringify(claimed.details));
});

test('C001 the count equals the number of one-sided declarations and is stable', () => {
  const twoSided = runOwnershipChecks({
    objects: [object('obj-000001', null), object('obj-000002', null), object('obj-000003', 'pkg-a')],
    claims: [],
    packages: [packageRecord('pkg-a', { owns: owns({ objects: ['obj-000001', 'obj-000002', 'obj-000003'] }) })],
  });
  assert.equal(twoSided.ownership_disagreement_count, 2);
  const again = runOwnershipChecks({
    objects: [object('obj-000001', null), object('obj-000002', null), object('obj-000003', 'pkg-a')],
    claims: [],
    packages: [packageRecord('pkg-a', { owns: owns({ objects: ['obj-000001', 'obj-000002', 'obj-000003'] }) })],
  });
  assert.deepEqual(again.details, twoSided.details);

  const empty = runOwnershipChecks({ objects: [], claims: [], packages: [] });
  assert.equal(empty.ownership_disagreement_count, 0);
});

test('C001 a catalogue that declares an item and a table that shows it stay silent together', () => {
  const report = runOwnershipChecks({
    objects: [object('obj-000001', 'pkg-a'), object('obj-000002', 'pkg-b')],
    claims: [],
    packages: [
      packageRecord('pkg-a', { owns: owns({ objects: ['obj-000001'] }) }),
      packageRecord('pkg-b', { owns: owns({ objects: ['obj-000002'] }) }),
    ],
  });
  assert.equal(report.ownership_disagreement_count, 0);
  assert.equal(report.orphan_object_count, 0);
  assert.equal(report.owner_collision_count, 0);
  // The disagreement is its own count: it is not smuggled into the unallocated total.
  assert.equal(report.unallocated_count, 0);
});
