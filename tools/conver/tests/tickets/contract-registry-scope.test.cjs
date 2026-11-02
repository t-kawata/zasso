#!/usr/bin/env node
// PX-348: carried upstream from the workspace run. A local step of a multi-package
// sequence may span a boundary between two other packages; that boundary is not this
// package's to owe, and the closure gate already scopes to this package's boundaries.

/**
 * contract-registry-scope.test.cjs — whose boundary clauses a package owes.
 *
 * @verifies SCOPE-1
 * @verifies SCOPE-2
 */

let passed = 0;
let failed = 0;

// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

process.stdout.write('\n━━━ contract-registry-scope.test.cjs ━━━\n\n');

let registryForPackage;
try {
  ({ registryForPackage } = require('../../.claude/scripts/tickets/merge-contracts-to-tickets.js'));
} catch (e) {
  failed++;
  process.stdout.write('  ✗ Failed to load merge-contracts-to-tickets.js: ' + e.message + '\n\n');
  process.stdout.write('Passed: ' + passed + '\nFailed: ' + failed + '\n\n');
  process.exit(1);
}

if (typeof registryForPackage !== 'function') {
  failed++;
  process.stdout.write('  ✗ merge-contracts-to-tickets.js does not export registryForPackage\n\n');
  process.stdout.write('Passed: ' + passed + '\nFailed: ' + failed + '\n\n');
  process.exit(1);
}

const rows = [
  { boundary_id: 'boundary-005', provider_package: 'pkg-0002', consumer_package: 'pkg-0004', clauses: null },
  { boundary_id: 'boundary-029', provider_package: 'pkg-0004', consumer_package: 'pkg-0011', clauses: null },
];

// ======================================================================
// SCOPE-1: a boundary this package is not a party to is not projected.

// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
(function testForeignBoundaryExcluded() {
  const scoped = registryForPackage(rows, { packageId: 'pkg-0002' });
  assert(
    scoped.every((row) => row.boundary_id !== 'boundary-029'),
    'SCOPE-1: a boundary between two other packages is not this package’s to owe',
  );
})();

// ======================================================================
// SCOPE-2: a boundary this package provides stays projected.

// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
(function testOwnBoundaryKept() {
  const scoped = registryForPackage(rows, { packageId: 'pkg-0002' });
  assert(
    scoped.some((row) => row.boundary_id === 'boundary-005'),
    'SCOPE-2: a boundary this package provides is still projected',
  );
  assert(
    registryForPackage(rows, null).length === rows.length,
    'SCOPE-2: without a view every row is kept, preserving the pre-scope behaviour',
  );
})();

process.stdout.write('\nPassed: ' + passed + '\nFailed: ' + failed + '\n\n');
if (failed > 0) process.exit(1);
