// PX-259 @verifies C003
// PX-259 @verifies C004
// The gate is what makes the guarantee checkable: it is measured over the workspace, so every
// package's run reaches the same verdict, and it names the demand that nobody owes rather than
// letting it read as a satisfied obligation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GATE = path.join(process.cwd(), '.claude/scripts/grill-me-for-rfc/check-obligation-coverage.js');

/** A minimal workspace whose single operation one package owns, so the verdict starts at holds. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
// [::TICKET::] PX-288 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-288 --for-spec --no-implementation-order`.
// [::TICKET::] PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function workspaceWithOneOwnedOperation(overrides = {}) {
  // Destructured in the body rather than in the signature: the fixture has grown one knob per
  // ticket that touched the gate, and a five-parameter ceiling is what stops the call sites from
  // becoming unreadable. The call sites pass one object either way.
  const { ownerDeclaration = null, exemptions = [], sequences = [], enumerations = [], columns = {}, census = true } = overrides;
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px259-coverage-'));
  const packageDir = path.join(root, 'crates', 'pkg-a');
  fs.mkdirSync(packageDir, { recursive: true });
  const operations = [{ id: 'R-0001', result_object_classes: ['Alpha'], ...columns }];
  fs.writeFileSync(path.join(root, 'SyntheticSpec-sequences.json'), JSON.stringify({
    spec: { lines: 10 },
    // The census the workspace borrowed, in the shape the rail pins it. A workspace whose fixture
    // omits it is a workspace whose demand list is measured against nothing, which is the state
    // the withholding tests below are about rather than the state every other test wants.
    pins: {
      enumerations,
      ...(census ? {
        sourceEnumerations: [
          { role: 'operations', name: 'census-operations', members: operations.map((operation) => operation.id) },
          { role: 'entries', name: 'census-entries', members: sequences.map((sequence) => sequence.id) },
        ],
      } : {}),
    },
    operations,
    sequences,
    steps: [],
    exemptions,
  }));
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ contract_registry: [] }));
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({ inventory: { objects: [] } }));
  writeView(packageDir, { ownedOperationUnits: [{ unitId: 'op-R-0001', operationId: 'R-0001' }], obligationUnits: ownerDeclaration ?? [] , obligationSource: ownerDeclaration === null ? 'undeclared' : 'declared' });
  return root;
}

// [::TICKET::] PX-259, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-259|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function writeView(packageDir, view) {
  fs.writeFileSync(path.join(packageDir, 'SEQUENCES.json'), JSON.stringify({
    packageId: 'pkg-a',
    ownedOperationUnits: [], ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [], adjudicatedColumns: [], obligationSource: 'undeclared',
    ...view,
  }));
}

// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function runGate(root) {
  const result = spawnSync(process.execPath, [GATE, root], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('C003 a workspace whose every demand is assigned holds, and the gate says so at exit 0', () => {
  const root = workspaceWithOneOwnedOperation();
  try {
    const result = runGate(root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /verdict: holds/);
    assert.doesNotMatch(result.stdout, /unassigned/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C003 a demand nobody owes is reported by axis and id, and the gate exits 1', () => {
  const root = workspaceWithOneOwnedOperation();
  try {
    writeView(path.join(root, 'crates', 'pkg-a'), { ownedOperationUnits: [] });
    const result = runGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /verdict: not established/);
    assert.match(result.stdout, /unassigned operations: 1/);
    assert.match(result.stdout, /operations: R-0001/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C004 a declaration that bound to no unit is reported apart from an unserved demand', () => {
  const root = workspaceWithOneOwnedOperation({ ownerDeclaration: [] });
  try {
    const result = runGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /declared but unbound: pkg-a/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C003 a missing argument is refused with the usage line and exit 1', () => {
  const result = spawnSync(process.execPath, [GATE], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage: check-obligation-coverage\.js <WORKSPACE_ROOT>/);
});

test('C003 a root without an artifact is refused by name rather than measured as empty', () => {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px259-empty-'));
  try {
    const result = runGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not hold both an artifact/);
    // A refusal is the gate's own sentence. A crash prints a traceback, which quotes the
    // source line and so carries the sentence too — the mistake this asserts against.
    assert.match(result.stderr, /^refused: /m, 'the refusal is the gate sentence');
    assert.doesNotMatch(result.stderr, /ReferenceError|TypeError|at main \(/, 'a crash is not a refusal');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// PX-261 — the route of an exemption, the ground behind it, and the guarantee's boundary
// ---------------------------------------------------------------------------

test('PX-261 the gate names the route an exemption came from', () => {
  const root = workspaceWithOneOwnedOperation({ enumerations: [{ name: 'VerbMethod', members: ['object.get'] }], columns: { verb: 'object.get' } });
  try {
    writeView(path.join(root, 'crates', 'pkg-a'), {
      ownedOperationUnits: [{ unitId: 'op-R-0001', operationId: 'R-0001' }],
      adjudicatedColumns: [{ column: 'verb', ground: 'the specification states it on line 4', carriedBy: 'pkg-a' }],
    });
    const result = runGate(root);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /exempted \(record\): verb/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-261 one demand exempted by several rows is printed once, because the partition counts it once', () => {
  const root = workspaceWithOneOwnedOperation({ enumerations: [{ name: 'VerbMethod', members: ['object.get'] }], columns: { verb: 'object.get' } });
  try {
    writeView(path.join(root, 'crates', 'pkg-a'), {
      ownedOperationUnits: [{ unitId: 'op-R-0001', operationId: 'R-0001' }],
      adjudicatedColumns: [{ column: 'verb', ground: 'the specification states it on line 4', carriedBy: 'pkg-a' }],
    });
    const result = runGate(root);

    assert.equal(result.stdout.split('exempted (record): verb').length - 1, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-261 a ground that names nothing the workspace holds is reported with the demand that carried it', () => {
  const root = workspaceWithOneOwnedOperation();
  try {
    writeView(path.join(root, 'crates', 'pkg-a'), {
      ownedOperationUnits: [],
      obligationUnits: [{ unitId: 'op-R-0001', relation: 'assigns', subject: 'R-0001', kind: 'operation', ground: 'it is obviously required' }],
    });
    const result = runGate(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /unresolved ground: operations R-0001 — it is obviously required/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-261 a declaration whose column holds a value its vocabulary does not cover is reported as binding nothing', () => {
  const root = workspaceWithOneOwnedOperation();
  try {
    writeView(path.join(root, 'crates', 'pkg-a'), {
      ownedOperationUnits: [{ unitId: 'op-R-0001', operationId: 'R-0001' }],
      obligationUnits: [{ unitId: 'obl-surface-one', relation: 'serves', subject: 'surface-one', coverage: { column: 'verb', operationSet: 'VerbMethod', carried: 1, total: 1, uncoveredSpellings: [], foreignValues: ['stray'], crossChecked: true } }],
    });
    const result = runGate(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /declaration binding nothing: pkg-a obl-surface-one — 1 value of verb is not VerbMethod/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-261 the gate states what its verdict does and does not guarantee', () => {
  const root = workspaceWithOneOwnedOperation();
  try {
    const result = runGate(root);

    assert.match(result.stdout, /guarantees: every demand is placed by a named package, by a route that resolves/);
    assert.match(result.stdout, /does not guarantee: that a judgment is the right one, or that the specification names every procedure the project needs/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// PX-260 — the gate refuses the exemption that would make the guarantee vacuous
// ---------------------------------------------------------------------------

test('PX-260 an exemption of an operation or a sequence is refused by name, and the demand stays unassigned', () => {
  const root = workspaceWithOneOwnedOperation({
    exemptions: [
      { subject: 'R-0001', lens: 'obligation', why: 'the specification states no procedure for it' },
      { subject: 'S-0001', lens: 'obligation', why: 'the specification states no procedure for it' },
    ],
    sequences: [{ id: 'S-0001', outcome: 'direct' }],
  });
  try {
    writeView(path.join(root, 'crates', 'pkg-a'), { ownedOperationUnits: [] });
    const result = runGate(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /refused exemptions: 2/);
    assert.match(result.stdout, /operation R-0001 was exempted — an operation may not be exempted/);
    assert.match(result.stdout, /sequence S-0001 was exempted — a sequence may not be exempted/);
    assert.match(result.stdout, /unassigned operations: 1/);
    assert.match(result.stdout, /unassigned sequences: 1/);
    assert.doesNotMatch(result.stdout, /verdict: holds/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-260 the gate names the per-axis assigned count with its relation mix and the distribution across packages', () => {
  const root = workspaceWithOneOwnedOperation();
  try {
    const result = runGate(root);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /assigned operations: 1 \(owns 1\)/);
    assert.match(result.stdout, /assignment distribution: pkg-a 1/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-260 an assignment with no ground is reported, and the demand it named is still unassigned', () => {
  const root = workspaceWithOneOwnedOperation();
  try {
    writeView(path.join(root, 'crates', 'pkg-a'), {
      ownedOperationUnits: [],
      obligationUnits: [{ unitId: 'op-R-0001', relation: 'assigns', subject: 'R-0001', kind: 'operation', ground: '  ' }],
    });
    const result = runGate(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /ungrounded assignments: pkg-a/);
    assert.match(result.stdout, /operations: R-0001/);
    assert.doesNotMatch(result.stdout, /verdict: holds/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-260 a recorded assignment naming nothing the artifact holds is reported rather than dressed as coverage', () => {
  const root = workspaceWithOneOwnedOperation();
  try {
    writeView(path.join(root, 'crates', 'pkg-a'), {
      ownedOperationUnits: [{ unitId: 'op-R-0001', operationId: 'R-0001' }],
      unboundAssignments: ['op-R-9999'],
    });
    const result = runGate(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /unbound assignments: pkg-a — op-R-9999/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-260 a recorded judgment places its demand, and the gate says so with the relation it was placed by', () => {
  const root = workspaceWithOneOwnedOperation();
  try {
    writeView(path.join(root, 'crates', 'pkg-a'), {
      ownedOperationUnits: [],
      obligationUnits: [{ unitId: 'op-R-0001', relation: 'assigns', subject: 'R-0001', kind: 'operation', ground: 'the specification states it on line 4' }],
    });
    const result = runGate(root);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /assigned operations: 1 \(assigns 1\)/);
    assert.match(result.stdout, /verdict: holds/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// PX-262 — the denominator: what the verdict rests on, printed rather than assumed
// ---------------------------------------------------------------------------

test('C002 the gate prints what each axis is measured against, so a count is readable against its frame', () => {
  const root = workspaceWithOneOwnedOperation();
  try {
    const result = runGate(root);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^denominator: operations census 1, sequences census 0, boundaries registry 0, surfaces unstated 0$/m);
    assert.doesNotMatch(result.stdout, /unstated denominator/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C002 every demand assigned with no census borrowed is not established, and the gaps name the repair', () => {
  const root = workspaceWithOneOwnedOperation({ census: false });
  try {
    const result = runGate(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /verdict: not established/);
    assert.doesNotMatch(result.stdout, /unassigned operations/, 'nothing is unassigned');
    assert.match(result.stdout, /^unstated denominator: 2$/m);
    assert.match(result.stdout, /^  operations: no census is borrowed for the operations role, so the artifact is its own denominator\. repair: /m);
    assert.match(result.stdout, /^  sequences: no census names the realized sequences, so the artifact is its own denominator\. repair: /m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C002 a workspace with no artifact is refused by name and writes no denominator line', () => {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px262-empty-'));
  try {
    const result = runGate(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /^refused: /m, 'the refusal is the gate sentence');
    assert.doesNotMatch(result.stderr, /ReferenceError|TypeError|at main \(/, 'a crash is not a refusal');
    assert.doesNotMatch(result.stdout, /denominator:/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C004 an exemption naming no carrier is refused on the gate face, with the field it lacks', () => {
  const root = workspaceWithOneOwnedOperation({ exemptions: [{ subject: 'R-0001', lens: 'obligation', why: 'the specification states no procedure for it' }] });
  try {
    const result = runGate(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /^refused exemptions: 1$/m);
    assert.match(result.stdout, /R-0001 was exempted — an operation may not be exempted/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C004 an artifact exemption naming a column and no carrier is refused, and the column stays unassigned', () => {
  // The subject has to name a demand for the carrier to be required of it: a candidate column is the
  // surface demand, and it exists where the pins declare the vocabulary the column values use.
  const root = workspaceWithOneOwnedOperation({ enumerations: [{ name: 'VerbMethod', members: ['object.get'] }], columns: { verb: 'object.get' }, exemptions: [{ subject: 'verb', lens: 'obligation', why: 'the column is a protocol verb, not a surface' }] });
  try {
    const result = runGate(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /was exempted — the exemption names no carriedBy, so it places nothing/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


// ---------------------------------------------------------------------------
// PX-263 — the claim is what this stage can establish
// ---------------------------------------------------------------------------

// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
test('C004 the guarantee line claims an RFC section anchor and a ledger row, and no longer claims a node or a header', () => {
  const root = workspaceWithOneOwnedOperation();
  try {
    const result = runGate(root);

    // The claim is what the guarantees line asserts, so the assertion is aimed at that line rather
    // than at the words anywhere in the output: the gate names the node and the header on purpose,
    // on the line stating where they are measured instead.
    const [claim] = result.stdout.split("\n").filter((line) => line.startsWith("guarantees:"));
    assert.match(claim, /traceable to an RFC section anchor and a ledger row/);
    assert.doesNotMatch(claim, /design node/);
    assert.doesNotMatch(claim, /a header/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C004 the gate names where the rest of the provenance chain is measured, so a reader is not left to infer it', () => {
  const root = workspaceWithOneOwnedOperation();
  try {
    assert.match(runGate(root).stdout, /drill-rfc-down Step 5/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
