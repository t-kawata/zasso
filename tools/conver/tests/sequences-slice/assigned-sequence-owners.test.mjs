// A recorded assignment is the only relation that reaches a sequence whose operations
// produce an object no manifest owns. This reader turns those judgments into the owner
// lists a view can project, and it must not invent an owner from an ungrounded row.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveAssignedSequenceOwners } from '../../.claude/scripts/sequences-slice/lib/obligation.mjs';

function ownersOf(recordsByPackageId) {
  return resolveAssignedSequenceOwners({
    packages: [{ id: 'pkg-0001', path: 'crates/a' }, { id: 'pkg-0002', path: 'crates/b' }],
    recordsByPackageId: new Map(Object.entries(recordsByPackageId)),
  });
}

test('a grounded seq assignment gives its package ownership of that sequence', () => {
  const owners = ownersOf({
    'pkg-0001': { assignments: [{ unit: 'seq-S-1', ground: 'no object carries it' }] },
  });
  assert.deepEqual(owners.get('S-1'), ['pkg-0001']);
});

test('two packages assigning one sequence share it, with sorted owners and no duplicate', () => {
  const owners = ownersOf({
    'pkg-0002': {
      assignments: [
        { unit: 'seq-S-1', ground: 'the boundary crosses here' },
        { unit: 'seq-S-1', ground: 'the boundary crosses here' },
      ],
    },
    'pkg-0001': { assignments: [{ unit: 'seq-S-1', ground: 'the boundary crosses here' }] },
  });
  assert.deepEqual(owners.get('S-1'), ['pkg-0001', 'pkg-0002']);
});

test('an assignment without a ground places no owner', () => {
  const owners = ownersOf({
    'pkg-0001': { assignments: [{ unit: 'seq-S-1', ground: '   ' }, { unit: 'seq-S-2' }] },
  });
  assert.equal(owners.size, 0);
});

test('only a seq- unit is a sequence assignment', () => {
  const owners = ownersOf({
    'pkg-0001': {
      assignments: [
        { unit: 'op-Do', ground: 'grounded' },
        { unit: 'obl-boundary', ground: 'grounded' },
        { unit: 'ctr-boundary', ground: 'grounded' },
        { unit: 'seq-', ground: 'grounded' },
      ],
    },
  });
  assert.equal(owners.size, 0);
});

test('a package with no record, or a null record, contributes no owner', () => {
  const owners = ownersOf({
    'pkg-0001': null,
    'pkg-0002': { assignments: [{ unit: 'seq-S-1', ground: 'grounded' }] },
  });
  assert.deepEqual(owners.get('S-1'), ['pkg-0002']);
});

test('no assignment at all produces an empty map rather than an error', () => {
  assert.equal(resolveAssignedSequenceOwners().size, 0);
  assert.equal(resolveAssignedSequenceOwners({ packages: [], recordsByPackageId: new Map() }).size, 0);
});
