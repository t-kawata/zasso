// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
// C001 + C004 over the gaia shape: 84 boundaries, 10 connection kinds, and the
// 19 boundaries of the three kinds that had no scope row.
import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveObligations } from '../../.claude/scripts/shared-obligations/registry.mjs';
import {
  CONNECTION_KINDS,
  buildBoundaryContractScope,
} from '../../.claude/scripts/workspacify-tree/lib/contract-clauses.mjs';

const BOUNDARY_COUNT = 84;
const MINIMAL_KINDS = ['checkpoint-reference', 'adapter-implementation', 'conformance'];
const SCOPED_KINDS = CONNECTION_KINDS.filter((kind) => !MINIMAL_KINDS.includes(kind));

/**
 * The gaia distribution: 19 boundaries carry the three kinds that had no scope
 * row, and the remaining 65 cycle the seven kinds that already had one.
 */
// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
function kindAt(index) {
  if (index < 19) return MINIMAL_KINDS[index % MINIMAL_KINDS.length];
  return SCOPED_KINDS[(index - 19) % SCOPED_KINDS.length];
}

// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
function contractClausesForScope(scope) {
  const clauses = {};
  for (const clause of scope) {
    if (['preconditions', 'postconditions', 'invariants', 'errors', 'tests'].includes(clause)) {
      clauses[clause] = [`${clause} for this boundary`];
      continue;
    }
    if (clause === 'input' || clause === 'output') {
      clauses[clause] = `${clause} value for this boundary`;
      continue;
    }
    clauses[clause] = `${clause} value`;
  }
  return clauses;
}

// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
function gaiaShape() {
  const boundaries = Array.from({ length: BOUNDARY_COUNT }, (_, index) => {
    const kind = kindAt(index);
    return {
      id: `boundary-${String(index + 1).padStart(3, '0')}`,
      consumer_package: `pkg-${String((index % 12) + 1).padStart(4, '0')}`,
      provider_package: `pkg-${String(((index + 1) % 12) + 1).padStart(4, '0')}`,
      dependency_reason_code: 'canonical-object',
      connection_kind: kind,
      stage2_contract_scope: buildBoundaryContractScope(kind),
    };
  });
  const contracts = boundaries.map((boundary) => ({
    boundary_id: boundary.id,
    connection_kind: boundary.connection_kind,
    clauses: contractClausesForScope(boundary.stage2_contract_scope),
  }));
  return { boundaries, contracts };
}

// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
function obligationsFor(shape) {
  return deriveObligations({
    census: { operations: [], entries: [], sections: [] },
    declaration: { entries: [], sections: [] },
    artifact: { operations: [], sequences: [], steps: [] },
    treeManifest: {
      workspace: { packages: [] },
      dependencies: { boundaries: shape.boundaries },
    },
    allocateManifest: { contract_registry: shape.contracts },
    packages: [],
    readings: {},
  });
}

test('C001 the 19 minimal-scope boundaries gain errors and tests', () => {
  const shape = gaiaShape();
  const minimal = shape.boundaries.filter((boundary) => MINIMAL_KINDS.includes(boundary.connection_kind));

  assert.equal(minimal.length, 19);
  for (const boundary of minimal) {
    assert.ok(boundary.stage2_contract_scope.includes('errors'), boundary.id);
    assert.ok(boundary.stage2_contract_scope.includes('tests'), boundary.id);
  }
});

test('C004 no boundary asks for a JUDGE kind outside its declared scope', () => {
  const shape = gaiaShape();
  const byId = new Map(shape.boundaries.map((boundary) => [boundary.id, boundary]));
  const obligations = obligationsFor(shape);
  const judge = obligations.filter((entry) => entry.id.startsWith('JUDGE:'));

  assert.equal(judge.length > 0, true);
  for (const entry of judge) {
    if (entry.state !== 'open') continue;
    const [, kind, boundaryId] = entry.id.split(':');
    const scope = byId.get(boundaryId).stage2_contract_scope;
    const clauses = kind === 'ENTAILMENT'
      ? ['preconditions', 'postconditions']
      : kind === 'TRANSLATION' ? ['input', 'output']
        : kind === 'INVARIANT' ? ['invariants'] : [kind.toLowerCase()];
    for (const clause of clauses) {
      assert.ok(scope.includes(clause), `${entry.id} opens a clause outside ${boundaryId}'s scope`);
    }
  }
});
