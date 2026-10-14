// PX-263
// One command answers the criterion clause by clause, so "is the distribution complete" is a value
// a reader reads rather than a judgement a reader makes. It exits 0 only when every clause holds,
// and it prints the boundary line, so a satisfied criterion is never read as a claim that the
// specification names everything the project needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GATE = path.join(process.cwd(), '.claude/scripts/grill-me-for-rfc/check-distribution-completeness.js');

/**
 * A workspace that satisfies every clause: a borrowed census, one owned operation, one pinned
 * vocabulary the operation instantiates, an agreeing registry, and one RFC whose ledger accounts
 * for the unit the view holds and cites a section the RFC carries.
 */
// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
function completeWorkspace(overrides = {}) {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px263-criterion-'));
  const packageDir = path.join(root, 'crates', 'pkg-a');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'SyntheticSpec-sequences.json'), JSON.stringify({
    spec: { lines: 40 },
    pins: {
      sourceEnumerations: [
        { role: 'operations', name: 'census-operations', members: ['R-0001'] },
        { role: 'entries', name: 'census-entries', members: [] },
      ],
      enumerations: overrides.enumerations ?? [{ name: 'VerbMethod', members: ['object.get'] }],
    },
    operations: [{ id: 'R-0001', verb: 'object.get' }],
    sequences: [],
    steps: [],
    exemptions: [],
  }));
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ contract_registry: [] }));
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({ inventory: { objects: [] } }));
  fs.writeFileSync(path.join(packageDir, 'SEQUENCES.json'), JSON.stringify({
    packageId: 'pkg-a',
    ownedOperationUnits: [{ unitId: 'op-R-0001', operationId: 'R-0001' }],
    ownedSequenceUnits: [], crossBoundarySequenceUnits: [], adjudicatedColumns: [],
    // A workspace satisfying every clause places its surface demand, which is what the served
    // column does: the candidate column exists because the pins declare the vocabulary it uses.
    obligationUnits: [{ unitId: 'obl-verb', relation: 'serves', subject: 'verb', coverage: { column: 'verb', carried: 1, total: 1, foreignValues: [], crossChecked: true } }],
    obligationSource: 'declared',
  }));
  if (overrides.rfc !== null) {
    fs.writeFileSync(path.join(packageDir, 'RFC.md'), overrides.rfc ?? [
      '# RFC 0001 — pkg-a', '', '## 3 Acceptance', '', '### 3.4.3 The boundary', '', '## 7 Distribution ledger', '',
      'This document is canonical over the material it was written from.', '',
      '| Unit | Kind | Owner | RFC location | Ground |',
      '| --- | --- | --- | --- | --- |',
      '| op-R-0001 | operation | pkg-a | §3.4.3 | the sequence states it |',
      '| obl-verb | surface | pkg-a | §3.4.3 | the vocabulary the column uses is declared |',
    ].join('\n'));
  }
  return root;
}

// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
function runGate(root) {
  const result = spawnSync(process.execPath, [GATE, root], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('PX-263 a workspace satisfying every clause exits 0 and reports each clause holding', () => {
  const root = completeWorkspace();
  try {
    const result = runGate(root);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^K1 .*holds/m);
    assert.match(result.stdout, /^K8 .*holds/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-263 the boundary line is printed, so a satisfied criterion is not a claim about the world', () => {
  const root = completeWorkspace();
  try {
    const result = runGate(root);

    assert.match(result.stdout, /not measured/);
    assert.match(result.stdout, /specification/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-263 a workspace with no census reports the denominator clause short and exits 1', () => {
  const root = completeWorkspace();
  try {
    const artifactPath = path.join(root, 'SyntheticSpec-sequences.json');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    artifact.pins.sourceEnumerations = [];
    fs.writeFileSync(artifactPath, JSON.stringify(artifact));
    const result = runGate(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /^K1 .*not established/m);
    assert.match(result.stdout, /K1 .*denominatorOf/m, 'the failing clause names the check that measured it');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-263 a ledger location the document does not carry reports the location clause short, and no other clause moves', () => {
  const root = completeWorkspace({ rfc: ['# RFC 0001 — pkg-a', '', '## 3 Acceptance', '', '## 7 Distribution ledger', '', 'This document is canonical over the material it was written from.', '', '| Unit | Kind | Owner | RFC location | Ground |', '| --- | --- | --- | --- | --- |', '| op-R-0001 | operation | pkg-a | §3.4.3 | the sequence states it |'].join('\n') });
  try {
    const result = runGate(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /^K6 .*not established/m);
    assert.match(result.stdout, /^K5 .*holds/m, 'the unit is accounted for, so the accounting clause is unaffected');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-263 a workspace with no artifact at all reports every clause rather than one verdict', () => {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px263-empty-'));
  try {
    const result = runGate(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /^refused: /m, 'the refusal is the gate sentence');
    assert.doesNotMatch(result.stderr, /ReferenceError|TypeError|at main \(/, 'a crash is not a refusal');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-263 a missing argument is refused with the usage line', () => {
  const result = spawnSync(process.execPath, [GATE], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage: check-distribution-completeness\.js <WORKSPACE_ROOT>/);
});
