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

// [::TICKET::] PX-303 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-303 --for-spec --no-implementation-order`.
function censusRow(overrides = {}) {
  return { kind: 'OpA', disposition: 'active', purpose: 'a', ...overrides };
}

// [::TICKET::] PX-303 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-303 --for-spec --no-implementation-order`.
function artifactOperation(overrides = {}) {
  return { id: 'OpA', kind: 'OpA', disposition: 'active', purpose: 'a', ...overrides };
}

// [::TICKET::] PX-303 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-303 --for-spec --no-implementation-order`.
function consistencyObligation() {
  return {
    id: CONSISTENCY_ID,
    class: 'mechanical',
    kind: 'consistency',
    state: 'open',
    subject: 'operations',
  };
}

// [::TICKET::] PX-303 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-303 --for-spec --no-implementation-order`.
function pinFor(digest) {
  return {
    source: { file: CENSUS_FILE, sha256: digest },
    selector: { shape: 'jsonFieldRows', parameter: 'kind' },
  };
}

// [::TICKET::] PX-303 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-303 --for-spec --no-implementation-order`.
function writeCensus(root, body) {
  const directory = join(root, SUPPLIED_DIRECTORY);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, CENSUS_FILE), body);
  return createHash('sha256').update(body).digest('hex');
}

// [::TICKET::] PX-303 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-303 --for-spec --no-implementation-order`.
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

// @verifies C107
test('C107 a view owning an artifact-excluded operation is reported', () => {
  const { mismatches } = compareOperationCensus({
    censusRows: [censusRow({ disposition: 'excluded' })],
    artifact: { operations: [artifactOperation({ disposition: 'excluded' })] },
    packages: [{ id: 'pkg-1', view: { ownedOperationUnits: [{ operationId: 'OpA' }] } }],
  });

  assert.equal(mismatches.some((entry) => entry.field === 'owner'
    && entry.operationId === 'OpA'
    && entry.actual === 'pkg-1'), true);
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
