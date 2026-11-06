import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FINDING_CODES } from '../../.claude/scripts/api-consistency/verify-api-consistency.mjs';
import { REPAIR_CLASSIFIERS, buildRepairPlan } from '../../.claude/scripts/api-consistency/repair-plan.mjs';

/** A surface with one declaration and one call reference. */
// [::TICKET::] PX-387 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-387 --for-spec --no-implementation-order`.
function surfaceWith(argumentCount) {
  return [{
    packageId: 'pkg-a',
    rfcPath: '/w/pkg-a/RFC.md',
    declarations: [{ symbol: 'Tag::new', kind: 'fn', parameterCount: 1, receiver: false }],
    references: [{
      symbol: 'Tag::new',
      kind: 'call',
      argumentCount,
      line: 8,
      packageId: 'pkg-a',
      rfcPath: '/w/pkg-a/RFC.md',
    }],
    imports: [],
  }];
}

// [::TICKET::] PX-387 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-387 --for-spec --no-implementation-order`.
function arityFinding() {
  return {
    code: 'ARITY_MISMATCH',
    severity: 'blocking',
    package: 'pkg-a',
    symbol: 'Tag::new',
    rfcPath: '/w/pkg-a/RFC.md',
    cause: 'Tag::new is called with 1 argument(s) and declared with 1 parameter(s)',
  };
}

// PX-387 @verifies C003
// A finding the fixed parser no longer reproduces is not a repair. The plan must
// classify it from the source rather than send the AI to edit correct code.

test('PX-387 C003: a finding the source no longer supports is classified false-positive', () => {
  const plan = buildRepairPlan({
    surfaces: surfaceWith(1),
    findings: [arityFinding()],
    allocateManifest: {},
    treeManifest: {},
  });

  assert.equal(plan.entries[0].classification, 'false-positive');
  assert.equal(plan.entries[0].candidate, null);
});

// PX-387 @verifies C004
// A real arity mismatch names the file and line the AI must repair.

test('PX-387 C004: a real arity mismatch yields a repair candidate with its line', () => {
  const plan = buildRepairPlan({
    surfaces: surfaceWith(2),
    findings: [arityFinding()],
    allocateManifest: {},
    treeManifest: {},
  });

  assert.equal(plan.entries[0].classification, 'repair-candidate');
  assert.equal(plan.entries[0].surface, '/w/pkg-a/RFC.md');
  assert.equal(plan.entries[0].candidate.line, 8);
  assert.equal(plan.entries[0].candidate.argumentCount, 2);
  assert.equal(plan.entries[0].candidate.expectedArity, 1);
});

test('PX-387 C004: one mismatching call keeps the finding a candidate', () => {
  const surface = surfaceWith(1)[0];
  const plan = buildRepairPlan({
    surfaces: [{
      ...surface,
      references: [
        { ...surface.references[0], argumentCount: 1 },
        { ...surface.references[0], argumentCount: 2, line: 12 },
      ],
    }],
    findings: [arityFinding()],
    allocateManifest: {},
    treeManifest: {},
  });

  assert.equal(plan.entries[0].classification, 'repair-candidate');
  assert.equal(plan.entries[0].candidate.line, 12);
});

test('PX-387 C004: a missing dependency boundary names the allocate decisions', () => {
  const plan = buildRepairPlan({
    surfaces: [],
    findings: [{
      code: 'DEPENDENCY_EDGE_MISSING',
      severity: 'blocking',
      package: 'pkg-a',
      symbol: 'Foo',
      rfcPath: '/w/pkg-a/RFC.md',
      cause: 'pkg-a imports Foo from pkg-b (pkg-b) with no declared boundary',
    }],
    allocateManifest: { contract_registry: [] },
    treeManifest: { dependencies: { boundaries: [] } },
  });

  assert.equal(plan.entries[0].classification, 'repair-candidate');
  assert.match(plan.entries[0].surface, /allocate\/DECISIONS\.json/);
  assert.equal(plan.entries[0].candidate.consumer_package, 'pkg-a');
  assert.equal(plan.entries[0].candidate.provider_package, 'pkg-b');
});

test('PX-387 C004: an undefined symbol names the package RFC re-export', () => {
  const plan = buildRepairPlan({
    surfaces: [],
    findings: [{
      code: 'SYMBOL_UNDEFINED',
      severity: 'blocking',
      package: 'pkg-a',
      symbol: 'Foo',
      artifact: '/w/pkg-a/RFC.md',
      rfcPath: '/w/pkg-a/RFC.md',
      cause: 'pkg-a imports Foo from pkg-b, which no declaration in that package provides',
    }],
    allocateManifest: {},
    treeManifest: {},
  });

  assert.equal(plan.entries[0].classification, 'repair-candidate');
  assert.equal(plan.entries[0].surface, '/w/pkg-a/RFC.md');
  assert.match(plan.entries[0].candidate.text, /pub use pkg-b::Foo/);
});

test('PX-387 C004: an unknown finding code refuses rather than guessing a surface', () => {
  assert.throws(
    () => buildRepairPlan({
      surfaces: [],
      findings: [{
        code: 'NOT_A_REAL_CODE',
        severity: 'blocking',
        package: 'pkg-a',
        symbol: 'X',
        rfcPath: '/w/pkg-a/RFC.md',
        cause: 'x',
      }],
      allocateManifest: {},
      treeManifest: {},
    }),
    (error) => error.code === 'UNKNOWN_FINDING_CODE',
  );
});

test('PX-387 C004: every finding code the gate emits has a classifier', () => {
  for (const code of Object.values(FINDING_CODES)) {
    assert.equal(typeof REPAIR_CLASSIFIERS[code], 'function', code);
  }
});
