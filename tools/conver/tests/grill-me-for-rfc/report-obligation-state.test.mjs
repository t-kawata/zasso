// PX-262 @verifies C003
// A reporter that could fail would be a second blocking point, and a second blocking point is a
// second place a workspace can be stopped over a state nobody claimed. These tests pin the exit
// code across the four states the reporter has to survive, and pin that it reports the gates
// rather than measuring a second time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPORTER = path.join(process.cwd(), '.claude/scripts/grill-me-for-rfc/report-obligation-state.js');

/** A workspace whose one operation one package owns, with or without the census it answers to. */
// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
function workspaceWithOneOperation({ census = true } = {}) {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px262-reporter-'));
  fs.mkdirSync(path.join(root, 'crates', 'pkg-a'), { recursive: true });
  fs.writeFileSync(path.join(root, 'SyntheticSpec-sequences.json'), JSON.stringify({
    spec: { lines: 10 },
    pins: census ? { sourceEnumerations: [{ role: 'operations', name: 'census-operations', members: ['R-0001'] }, { role: 'entries', name: 'census-entries', members: [] }] } : {},
    operations: [{ id: 'R-0001', result_object_classes: ['Alpha'] }],
    sequences: [],
    steps: [],
    exemptions: [],
  }));
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ contract_registry: [] }));
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({ inventory: { objects: [] } }));
  fs.writeFileSync(path.join(root, 'crates', 'pkg-a', 'SEQUENCES.json'), JSON.stringify({
    packageId: 'pkg-a',
    ownedOperationUnits: [{ unitId: 'op-R-0001', operationId: 'R-0001' }],
    ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [], adjudicatedColumns: [],
    obligationSource: 'undeclared',
  }));
  return root;
}

// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
function runReporter(root) {
  const result = spawnSync(process.execPath, [REPORTER, root], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('C003 the reporter exits 0 over a workspace whose every demand is placed', () => {
  const root = workspaceWithOneOperation();
  try {
    const result = runReporter(root);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /^obligation state: /m);
    assert.match(result.stdout, /coverage: reported nothing to repair/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C003 the reporter exits 0 over a workspace with unassigned demands, and still reports them', () => {
  const root = workspaceWithOneOperation();
  try {
    fs.writeFileSync(path.join(root, 'crates', 'pkg-a', 'SEQUENCES.json'), JSON.stringify({
      packageId: 'pkg-a',
      ownedOperationUnits: [], ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [], adjudicatedColumns: [],
      obligationSource: 'undeclared',
    }));
    const result = runReporter(root);

    assert.equal(result.status, 0, 'a state that is not holds is not a state this reporter blocks on');
    assert.match(result.stdout, /verdict: not established/);
    assert.match(result.stdout, /operations: R-0001/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C003 the reporter exits 0 over a workspace with no artifact, and names the refusal as the gate wrote it', () => {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px262-reporter-empty-'));
  try {
    const result = runReporter(root);

    assert.equal(result.status, 0);
    assert.match(result.stderr, /^refused: /m, 'the gate refusal is the gate sentence');
    assert.doesNotMatch(result.stderr, /ReferenceError|TypeError|at main \(/, 'a crash is not a refusal');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C003 the reporter exits 0 over a nonexistent path and over no argument, which is the whole point of it', () => {
  const missing = runReporter('/nonexistent/workspace/path');
  const noArgument = spawnSync(process.execPath, [REPORTER], { encoding: 'utf8' });

  assert.equal(missing.status, 0);
  assert.equal(noArgument.status, 0);
  assert.match(noArgument.stderr, /usage: report-obligation-state\.js <WORKSPACE_ROOT>/);
});

test('C003 the reporter never returns a nonzero code on any path, asserted over every state at once', () => {
  const states = [workspaceWithOneOperation(), workspaceWithOneOperation({ census: false }), '/nonexistent/workspace/path'];
  try {
    for (const root of states) assert.equal(runReporter(root).status, 0);
  } finally {
    for (const root of states) fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C003 the reporter states that it does not block, so a reader is not left to infer it from the exit code', () => {
  const root = workspaceWithOneOperation();
  try {
    assert.match(runReporter(root).stdout, /advisory: nothing here blocks; the blocking decision belongs to the grill Step 8 gate/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
