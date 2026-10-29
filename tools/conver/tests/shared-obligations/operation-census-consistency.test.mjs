import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildCertificate } from '../../.claude/scripts/shared-obligations/certificate.mjs';
import { decideAll } from '../../.claude/scripts/shared-obligations/decide.mjs';
import { resolveConsistencyObligations } from '../../.claude/scripts/shared-obligations/predicates.mjs';
import {
  compareOperationCensus,
  deriveObligations,
} from '../../.claude/scripts/shared-obligations/registry.mjs';
import { readPinnedCensus } from '../../.claude/scripts/shared-obligations/source-census.mjs';

const CONSISTENCY_ID = 'CENSUS:CONSISTENCY:operations';
const SUPPLIED_DIRECTORY = join('educe-sequences', 'supplied');
const CENSUS_FILE = 'operations-census.md';

// [::TICKET::] PX-303 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-303 --for-spec --no-implementation-order`.
function censusRow(overrides = {}) {
  return { kind: 'OpA', disposition: 'active', purpose: 'a', ...overrides };
}

// [::TICKET::] PX-303 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-303 --for-spec --no-implementation-order`.
function artifactOperation(overrides = {}) {
  return { id: 'OpA', kind: 'OpA', disposition: 'active', purpose: 'a', ...overrides };
}

// [::TICKET::] PX-303 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-303 --for-spec --no-implementation-order`.
function consistencyObligation() {
  return {
    id: CONSISTENCY_ID,
    class: 'mechanical',
    kind: 'consistency',
    state: 'open',
    subject: 'operations',
  };
}

// [::TICKET::] PX-303 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-303 --for-spec --no-implementation-order`.
function pinFor(digest) {
  return {
    source: { file: CENSUS_FILE, sha256: digest },
    selector: { shape: 'jsonFieldRows', parameter: 'kind' },
  };
}

// [::TICKET::] PX-303 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-303 --for-spec --no-implementation-order`.
function writeCensus(root, body) {
  const directory = join(root, SUPPLIED_DIRECTORY);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, CENSUS_FILE), body);
  return createHash('sha256').update(body).digest('hex');
}

// [::TICKET::] PX-303 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-303 --for-spec --no-implementation-order`.
function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), 'px303-census-'));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// @verifies C104
test('C104 a disposition mismatch names the operation and both values', () => {
  const { mismatches } = compareOperationCensus({
    censusRows: [censusRow({ disposition: 'active' })],
    artifact: { operations: [artifactOperation({ disposition: 'excluded' })] },
  });

  assert.equal(mismatches.some((entry) => entry.operationId === 'OpA'
    && entry.field === 'disposition'
    && entry.expected === 'active'
    && entry.actual === 'excluded'), true);
});

// @verifies C105
test('C105 a column mismatch names the column and both values', () => {
  const { mismatches } = compareOperationCensus({
    censusRows: [censusRow({
      disposition: 'active',
      allowed_status_transitions: { submitted: ['accepted'] },
    })],
    artifact: {
      operations: [artifactOperation({
        disposition: 'active',
        allowed_status_transitions: { submitted: ['rejected'] },
      })],
    },
  });

  assert.equal(mismatches.some((entry) => entry.operationId === 'OpA'
    && entry.field === 'allowed_status_transitions'), true);
});

// @verifies C107
test('C107 a census-only and an artifact-only operation are both reported', () => {
  const { mismatches } = compareOperationCensus({
    censusRows: [censusRow()],
    artifact: { operations: [artifactOperation({ id: 'OpB', kind: 'OpB' })] },
  });

  assert.equal(mismatches.some((entry) => entry.operationId === 'OpA' && entry.field === 'presence'), true);
  assert.equal(mismatches.some((entry) => entry.operationId === 'OpB' && entry.field === 'presence'), true);
});

// @verifies C001 (PX-304 contract)
// [::TICKET::] PX-304 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-304 --for-spec --no-implementation-order`.
test('C001 an active operation placed only by an operation unit is not reported', () => {
  const { mismatches } = compareOperationCensus({
    censusRows: [censusRow({ disposition: 'active' })],
    artifact: { operations: [artifactOperation({ disposition: 'active' })] },
    packages: [{
      id: 'pkg-1',
      view: {
        ownedOperationUnits: [],
        obligationUnits: [{ unitId: 'op-OpA', relation: 'assigns', subject: 'OpA', kind: 'operation', ground: 'line 1 states the act' }],
      },
    }],
  });

  assert.equal(mismatches.some((entry) => entry.field === 'owner'), false);
});

// @verifies C002 (PX-304 contract)
// PX-304 supersedes the PX-303 test-plan item that reported an excluded operation
// merely because a view owned its result objects. Object ownership is not placement.
test('C002 an excluded operation owned through result classes is not reported', () => {
  const { mismatches } = compareOperationCensus({
    censusRows: [censusRow({ disposition: 'excluded' })],
    artifact: { operations: [artifactOperation({ disposition: 'excluded' })] },
    packages: [{ id: 'pkg-1', view: { ownedOperationUnits: [{ operationId: 'OpA' }] } }],
  });

  assert.equal(mismatches.some((entry) => entry.field === 'owner'), false);
});

// @verifies C003 (PX-304 contract)
test('C003 an active operation with no placement is reported', () => {
  const { mismatches } = compareOperationCensus({
    censusRows: [censusRow({ disposition: 'active' })],
    artifact: { operations: [artifactOperation({ disposition: 'active' })] },
    packages: [{ id: 'pkg-1', view: { ownedOperationUnits: [], obligationUnits: [] } }],
  });

  const owner = mismatches.filter((entry) => entry.field === 'owner');
  assert.equal(owner.length, 1);
  assert.equal(owner[0].operationId, 'OpA');
});

// @verifies C004 (PX-304 contract)
test('C004 a sequence-kind obligation unit does not place an operation', () => {
  const packagesFor = (unit) => [{ id: 'pkg-1', view: { obligationUnits: [unit] } }];
  const inputs = {
    censusRows: [censusRow({ disposition: 'active' })],
    artifact: { operations: [artifactOperation({ disposition: 'active' })] },
  };

  const sequenceKind = compareOperationCensus({
    ...inputs,
    packages: packagesFor({ unitId: 'seq-OpA', kind: 'sequence', subject: 'OpA' }),
  });
  assert.equal(sequenceKind.mismatches.some((entry) => entry.field === 'owner'), true);

  const operationKind = compareOperationCensus({
    ...inputs,
    packages: packagesFor({ unitId: 'op-OpA', kind: 'operation', subject: 'OpA' }),
  });
  assert.equal(operationKind.mismatches.some((entry) => entry.field === 'owner'), false);
});

// @verifies C001 (PX-304 contract)
test('the placement map unions owned units and operation units', () => {
  const packages = [
    { id: 'pkg-owned', view: { ownedOperationUnits: [{ operationId: 'OpA' }] } },
    { id: 'pkg-obliged', view: { obligationUnits: [{ unitId: 'op-OpB', kind: 'operation', subject: 'OpB' }] } },
  ];
  const artifact = {
    operations: [
      artifactOperation({ id: 'OpA', kind: 'OpA', disposition: 'active' }),
      artifactOperation({ id: 'OpB', kind: 'OpB', disposition: 'active' }),
    ],
  };
  const censusRows = [censusRow({ kind: 'OpA' }), censusRow({ kind: 'OpB' })];

  const both = compareOperationCensus({ censusRows, artifact, packages });
  assert.equal(both.mismatches.some((entry) => entry.field === 'owner'), false);

  const ownedOnly = compareOperationCensus({ censusRows, artifact, packages: [packages[0]] });
  assert.equal(ownedOnly.mismatches.some((entry) => entry.field === 'owner'
    && entry.operationId === 'OpB'), true);
});

// @verifies C003 (PX-304 contract)
test('C003 an empty census and an empty artifact close the obligation', () => {
  const closed = resolveConsistencyObligations([consistencyObligation()], {
    operationCensus: { ok: true, rows: [] },
    artifact: { operations: [] },
    packages: [],
    allocateManifest: {},
  });

  assert.equal(closed[0].state, 'closed');
});

// @verifies C106
test('C106 one mismatch opens the obligation and zero mismatches close it', () => {
  const opened = resolveConsistencyObligations([consistencyObligation()], {
    operationCensus: { ok: true, rows: [censusRow()] },
    artifact: { operations: [artifactOperation({ disposition: 'excluded' })] },
    packages: [],
    allocateManifest: {},
  });
  assert.equal(opened[0].state, 'open');
  assert.equal(opened[0].reason, 'OPERATION_CENSUS_MISMATCH');

  const alignedRows = [censusRow({ disposition: 'framework' })];
  const alignedArtifact = { operations: [artifactOperation({ disposition: 'framework' })] };
  const closed = resolveConsistencyObligations([consistencyObligation()], {
    operationCensus: { ok: true, rows: alignedRows },
    artifact: alignedArtifact,
    packages: [],
    allocateManifest: {},
  });
  assert.equal(closed[0].state, 'closed');
});

// @verifies C106
test('C106 an open consistency obligation makes the certificate incomplete with its code', () => {
  const obligations = resolveConsistencyObligations([consistencyObligation()], {
    operationCensus: { ok: true, rows: [censusRow()] },
    artifact: { operations: [artifactOperation({ disposition: 'excluded' })] },
    packages: [],
    allocateManifest: {},
  });
  const decisions = decideAll({ obligations, worklist: [], judgments: [], attacks: [] });
  const certificate = buildCertificate({ obligations, decisions: decisions.decisions, checks: [] });

  assert.equal(certificate.status, 'incomplete');
  assert.equal(certificate.open.some((entry) => entry.code === 'OPERATION_CENSUS_MISMATCH'), true);
});

// @verifies C106
test('C106 an aligned census closes the obligation and the certificate is complete', () => {
  const obligations = resolveConsistencyObligations([consistencyObligation()], {
    operationCensus: { ok: true, rows: [censusRow({ disposition: 'framework' })] },
    artifact: { operations: [artifactOperation({ disposition: 'framework' })] },
    packages: [],
    allocateManifest: {},
  });
  const decisions = decideAll({ obligations, worklist: [], judgments: [], attacks: [] });
  const certificate = buildCertificate({ obligations, decisions: decisions.decisions, checks: [] });

  assert.equal(certificate.status, 'complete');
});

// @verifies C106
test('C106 the obligation is derived only when the pinned census is supplied', () => {
  const inputs = {
    census: { operations: ['OpA'], entries: [], sections: [] },
    declaration: { entries: [], sections: [] },
    artifact: {
      operations: [artifactOperation()],
      sequences: [],
      steps: [],
      sections: [],
      pins: { columns: [] },
    },
    treeManifest: { workspace: { packages: [] }, dependencies: { boundaries: [] } },
    allocateManifest: { contract_registry: [] },
    packages: [],
    readings: {},
  };

  const present = deriveObligations({
    ...inputs,
    operationCensus: { ok: true, rows: [censusRow()] },
  }).find((entry) => entry.id === CONSISTENCY_ID);
  const absent = deriveObligations({ ...inputs, operationCensus: undefined })
    .find((entry) => entry.id === CONSISTENCY_ID);

  assert.equal(present.class, 'mechanical');
  assert.equal(present.state, 'open');
  assert.equal(absent, undefined);
});

// @verifies C107
test('C107 a pinned census file is parsed by its key parameter', () => {
  const { root, cleanup } = temporaryRoot();
  try {
    const body = '# Operations census\n\n```jsonl\n'
      + '{"kind":"OpA","disposition":"active"}\n'
      + '{"kind":"OpB","disposition":"excluded"}\n'
      + '```\n';
    const digest = writeCensus(root, body);
    const result = readPinnedCensus(root, pinFor(digest));

    assert.equal(result.ok, true);
    assert.equal(result.rows.length, 2);
    assert.equal(result.byKey.get('OpB').disposition, 'excluded');
  } finally {
    cleanup();
  }
});

// @verifies C107
test('C107 a missing file and a missing block are named refusals', () => {
  const { root, cleanup } = temporaryRoot();
  try {
    assert.equal(readPinnedCensus(root, pinFor('0'.repeat(64))).code, 'CENSUS_FILE_MISSING');

    const body = '# Operations census\n\nno fenced block\n';
    const digest = writeCensus(root, body);
    assert.equal(readPinnedCensus(root, pinFor(digest)).code, 'CENSUS_BLOCK_MISSING');
  } finally {
    cleanup();
  }
});

// @verifies C107
test('C107 a digest mismatch and a duplicate key are named refusals', () => {
  const { root, cleanup } = temporaryRoot();
  try {
    const body = '```jsonl\n{"kind":"OpA"}\n```\n';
    writeCensus(root, body);
    assert.equal(readPinnedCensus(root, pinFor('f'.repeat(64))).code, 'CENSUS_DIGEST_MISMATCH');

    const duplicate = '```jsonl\n{"kind":"OpA"}\n{"kind":"OpA"}\n```\n';
    const digest = writeCensus(root, duplicate);
    assert.equal(readPinnedCensus(root, pinFor(digest)).code, 'CENSUS_DUPLICATE_KEY');
  } finally {
    cleanup();
  }
});
