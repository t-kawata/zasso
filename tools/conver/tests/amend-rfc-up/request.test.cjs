// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
'use strict';

/**
 * PX-418 — request: material classification, instruction clauses, change request.
 */

const { test } = require('node:test');
// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  LEGACY_REQUEST_SCHEMA,
  MATERIAL_KINDS,
  REQUEST_SCHEMA,
  buildChangeRequest,
  classifyMaterial,
  normalizeRequest,
  parseInstruction,
  validateChangeRequest,
} = require('../../.claude/scripts/amend-rfc-up/request.js');
const {
  GRAPH_CHANGE,
  LAW_SKILL_DIR,
  RFC_CHANGE,
  cleanup,
  makeEmptyDirectory,
  makeLawSkillFixture,
} = require('./helpers.cjs');
const { extractObligations } = require('../../.claude/scripts/amend-rfc-up/obligations.js');

// @verifies C003
test('C003: *-law skill detected; ordinary document is ordinary', () => {
  const law = classifyMaterial({ path: LAW_SKILL_DIR, instructionText: 'use this law' });
  assert.equal(law.kind, MATERIAL_KINDS.LAW_SKILL);
  assert.equal(law.skillPath, path.resolve(LAW_SKILL_DIR));

  const empty = makeEmptyDirectory();
  try {
    const documentPath = path.join(empty, 'NOTES.md');
    fs.writeFileSync(documentPath, '# Notes\n');
    const document = classifyMaterial({ path: documentPath, instructionText: 'use this note' });
    assert.equal(document.kind, MATERIAL_KINDS.ORDINARY);
  } finally {
    cleanup(empty);
  }
});

// @verifies C007
test('C007: every instruction clause has a change or noOpReason', () => {
  const request = buildChangeRequest({
    instructionText: '1. change RFC\n2. rederive GRAPH',
    material: [{ kind: 'ordinary', path: '/tmp/NOTES.md' }],
    law: null,
    changes: [RFC_CHANGE, GRAPH_CHANGE],
  });
  assert.equal(request.schema, REQUEST_SCHEMA);
  assert.equal(request.instructionClauses.length, 2);
  assert.deepEqual(request.instructionClauses[0].changeIds, ['CH1']);
  assert.deepEqual(request.instructionClauses[1].changeIds, ['CH2']);
  assert.deepEqual(validateChangeRequest({ request }), { ok: true });

  const uncovered = {
    ...request,
    instructionClauses: [
      ...request.instructionClauses,
      { id: 'I3', text: 'unanswered', changeIds: [], noOpReason: null },
    ],
  };
  assert.throws(
    () => validateChangeRequest({ request: uncovered }),
    (error) => error.code === 'REQUEST_CLAUSE_UNCOVERED',
  );
});

test('a noOpReason satisfies a clause', () => {
  const request = buildChangeRequest({
    instructionText: '1. change RFC\n2. leave GRAPH alone',
    material: [],
    law: null,
    changes: [RFC_CHANGE],
  });
  request.instructionClauses[1].noOpReason = 'the instruction says to leave GRAPH alone';
  assert.deepEqual(validateChangeRequest({ request }), { ok: true });
});

test('parseInstruction reads numbered and bulleted lines', () => {
  assert.deepEqual(
    parseInstruction({ instructionText: '1. first\n- second\n* third' }).map((clause) => clause.text),
    ['first', 'second', 'third'],
  );
  assert.deepEqual(
    parseInstruction({ instructionText: 'one prose instruction' }).map((clause) => clause.text),
    ['one prose instruction'],
  );
});

test('a change without evidence is CHANGE_INVALID', () => {
  const request = {
    schema: REQUEST_SCHEMA,
    instruction: '1. change RFC',
    material: [],
    law: null,
    instructionClauses: [{ id: 'I1', text: 'change RFC', changeIds: ['CH1'], noOpReason: null }],
    changes: [{ ...RFC_CHANGE, evidence: [] }],
  };
  assert.throws(
    () => validateChangeRequest({ request }),
    (error) => error.code === 'CHANGE_INVALID',
  );
});

test('semantic obligations must all be dispositioned', () => {
  const directory = makeEmptyDirectory();
  const materialPath = path.join(directory, 'HANDBOOK.md');
  try {
    fs.writeFileSync(materialPath, '# Handbook\n\nThe host must isolate the network.\n');
    const obligations = extractObligations({ materialPaths: [materialPath] });
    assert.equal(obligations.length > 0, true);
    const coverage = obligations.map((obligation) => ({
      obligationId: obligation.id,
      status: 'covered',
      changeIds: ['CH1'],
      basis: { changeId: 'CH1', quote: obligation.text },
    }));
    const change = {
      ...RFC_CHANGE,
      text: `${RFC_CHANGE.text}\n\n${obligations.map((obligation) => obligation.text).join('\n')}`,
    };
    const request = buildChangeRequest({
      instructionText: '1. amend the network',
      material: [{ kind: 'ordinary', path: materialPath }],
      changes: [change],
      obligations,
      obligationCoverage: coverage,
    });
    assert.deepEqual(validateChangeRequest({ request, materialPaths: [materialPath] }), { ok: true });

    const uncovered = coverage.map((entry, index) => (
      index === 0 ? { ...entry, status: 'unset', changeIds: [] } : entry
    ));
    assert.throws(
      () => validateChangeRequest({
        request: { ...request, obligationCoverage: uncovered },
        materialPaths: [materialPath],
      }),
      (error) => error.code === 'REQUEST_OBLIGATION_UNCOVERED',
    );
  } finally {
    cleanup(directory);
  }
});

test('an inventory that does not match the material is rejected', () => {
  const directory = makeEmptyDirectory();
  const materialPath = path.join(directory, 'HANDBOOK.md');
  try {
    fs.writeFileSync(materialPath, '# Handbook\n\nThe host must isolate the network.\n');
    const request = buildChangeRequest({
      instructionText: '1. amend the network',
      material: [{ kind: 'ordinary', path: materialPath }],
      changes: [RFC_CHANGE],
      obligations: [],
      obligationCoverage: [],
    });
    assert.throws(
      () => validateChangeRequest({ request, materialPaths: [materialPath] }),
      (error) => error.code === 'OBLIGATION_INVENTORY_STALE',
    );
  } finally {
    cleanup(directory);
  }
});

test('a manually discovered obligation may be added to the inventory', () => {
  const directory = makeEmptyDirectory();
  const materialPath = path.join(directory, 'HANDBOOK.md');
  try {
    fs.writeFileSync(materialPath, '# Handbook\n\nThe host must isolate the network.\n');
    const obligations = extractObligations({ materialPaths: [materialPath] });
    const manual = {
      id: 'OB-000000000001',
      kind: 'requirement',
      text: 'The host must also audit every isolation attempt.',
      source: { file: materialPath, line: 1 },
    };
    const combined = [...obligations, manual];
    const change = {
      ...RFC_CHANGE,
      text: `${RFC_CHANGE.text}\n\n${combined.map((obligation) => obligation.text).join('\n')}`,
    };
    const request = buildChangeRequest({
      instructionText: '1. amend the network',
      material: [{ kind: 'ordinary', path: materialPath }],
      changes: [change],
      obligations: combined,
      obligationCoverage: combined.map((obligation) => ({
        obligationId: obligation.id,
        status: 'covered',
        changeIds: ['CH1'],
        basis: { changeId: 'CH1', quote: obligation.text },
      })),
    });
    assert.deepEqual(validateChangeRequest({ request, materialPaths: [materialPath] }), { ok: true });
  } finally {
    cleanup(directory);
  }
});

// @verifies C007
test('C007: request v2 validates packages, impacts, and a multi-package DAG', () => {
  const packages = [
    { id: 'pkg-a', dir: '/tmp/a' },
    { id: 'pkg-b', dir: '/tmp/b' },
  ];
  const request = buildChangeRequest({
    instructionText: '1. amend both packages',
    material: [],
    law: null,
    packages,
    changes: [
      { ...RFC_CHANGE, package: 'pkg-a' },
      { ...GRAPH_CHANGE, package: 'pkg-b', dependsOn: ['CH1'] },
    ],
    crossPackageImpacts: [
      { from: 'pkg-a', to: 'pkg-b', kind: 'contract', reference: 'C-100', changeIds: ['CH2'] },
    ],
  });
  assert.equal(request.schema, 'amend-rfc-up.request/v2');
  assert.deepEqual(validateChangeRequest({ request, packages }), { ok: true });

  assert.throws(
    () => validateChangeRequest({
      request: { ...request, changes: [{ ...RFC_CHANGE, package: 'pkg-absent' }] },
      packages,
    }),
    (error) => error.code === 'CHANGE_INVALID',
  );
  assert.throws(
    () => validateChangeRequest({
      request: {
        ...request,
        changes: [
          { ...RFC_CHANGE, package: 'pkg-a', dependsOn: ['CH2'] },
          { ...GRAPH_CHANGE, package: 'pkg-b', dependsOn: ['CH1'] },
        ],
      },
      packages,
    }),
    (error) => error.code === 'CHANGE_DAG_CYCLE',
  );
});

test('C007: a v1 request is normalized to v2 for a single package', () => {
  const request = {
    schema: LEGACY_REQUEST_SCHEMA,
    instruction: '1. change RFC',
    material: [],
    law: null,
    instructionClauses: [{ id: 'I1', text: 'change RFC', changeIds: ['CH1'], noOpReason: null }],
    changes: [RFC_CHANGE],
  };
  const normalized = normalizeRequest({ request, defaultPackage: 'pkg-a' });
  assert.equal(normalized.schema, 'amend-rfc-up.request/v2');
  assert.equal(normalized.changes[0].package, 'pkg-a');
});
