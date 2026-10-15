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

// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
const { describeCarriage } = await import(REPORTER);

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

// [::TICKET::] PX-262, PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-262|PX-270) --for-spec --no-implementation-order`.
function runReporter(root, ...materials) {
  const result = spawnSync(process.execPath, [REPORTER, root, ...materials], { encoding: 'utf8' });
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

// ---------------------------------------------------------------------------
// PX-270 @verifies C003
// PX-270 @verifies C005
//
// The per-directory half, printed only when the run was handed an artifact.
//
// The reporter already answers whether a workspace's obligations hold, and it answers with the
// gates. What it could not say is which directory to open and what to write in it, so a run that
// saw a short clause had to reconstruct the repair from three scripts and six files. The section
// added here says it. It is emitted only when an argument names a *-sequences.json, so every
// invocation that passes a root alone prints exactly what it printed before.
// ---------------------------------------------------------------------------

/** A workspace holding one directory whose carried unit its own ledger does not name. */
// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
function workspaceWithOneCarriedUnit() {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px270-reporter-'));
  const packageDir = path.join(root, 'crates', 'pkg-a');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'SyntheticSpec-sequences.json'), JSON.stringify({
    spec: { lines: 10 }, pins: {}, operations: [], sequences: [], steps: [], exemptions: [],
  }));
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({
    contract_registry: [{ boundary_id: 'boundary-001', provider_package: 'pkg-a', consumer_package: 'pkg-b' }],
  }));
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({ inventory: { objects: [] } }));
  fs.writeFileSync(path.join(packageDir, 'SEQUENCES.json'), JSON.stringify({
    packageId: 'pkg-a',
    ownedOperationUnits: [], ownedSequenceUnits: [], crossBoundarySequenceUnits: [],
    obligationUnits: [{ unitId: 'ctr-boundary-001', relation: 'carries', subject: 'boundary-001' }],
    adjudicatedColumns: [], obligationSource: 'undeclared',
  }));
  fs.writeFileSync(path.join(packageDir, 'RFC.md'), [
    '# pkg-a design',
    '',
    '## Distribution ledger',
    '',
    'This document is canonical for the units below.',
    '',
    '| Unit | Kind | Owner | RFC location | Ground |',
    '| --- | --- | --- | --- | --- |',
    '',
    '**Composition check.** The projection distributed nothing here.',
    '',
  ].join('\n'));
  return root;
}

// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
test('C003 the carriage section names the directory, the state, the missing units and the repair', () => {
  const root = workspaceWithOneCarriedUnit();
  const report = describeCarriage({ root });

  const entry = report.entries.find((candidate) => candidate.packageId === 'pkg-a');
  assert.equal(entry.state, 'failed');
  assert.equal(entry.reason, 'unaccounted-unit');
  assert.deepEqual(entry.unaccountedUnitIds, ['ctr-boundary-001']);
  assert.match(entry.repair, /re-run \/grill-me-for-rfc in crates\/pkg-a/);
  assert.match(report.text, /ctr-boundary-001/);
  assert.match(report.text, /carries/);

  // The shape, not only the content: a section that mentions the right ids in one comma-joined
  // paragraph satisfies a substring assertion while being the opposite of a report a reader can
  // act on. Every part is therefore pinned to its own line.
  const lines = report.text.split('\n');
  assert.equal(lines.includes('## Obligation carriage'), true);
  assert.equal(lines.some((line) => line.startsWith('### ')), true, 'the failed directory is not headed on its own line');
  assert.equal(lines.some((line) => line.startsWith('**What is missing.** ')), true);
  assert.equal(lines.some((line) => line.startsWith('  - `ctr-boundary-001`')), true, 'the missing units are not listed one per line');
  assert.equal(lines.some((line) => line.startsWith('**What to write.** ')), true);
  assert.equal(lines.some((line) => line.startsWith('**Repair.** ')), true);
  assert.equal(report.text.includes(',### '), false, 'the section was stringified as a list rather than joined as lines');
  assert.equal(report.text.includes(',,'), false, 'the section carries an empty element joined as a list');
  // A count and its noun, not a count and a template: "(s)" is the mark of a sentence assembled
  // from parts rather than written, and this section exists to be read.
  assert.match(report.text, /\b1 directory named\b/);
  assert.match(report.text, /\b1 unit\b/);
  assert.equal(report.text.includes('(s)'), false, 'a count is printed with a template plural');
  assert.equal(report.text.includes('(ies)'), false, 'a count is printed with a template plural');
  // One action per place. The per-directory line says what to do in that directory and nothing
  // else; the acceptance is stated once, at the end, so a reader is not told the same command
  // twice in adjacent sentences.
  assert.equal((report.text.match(/check-ledger-discharge\.js/g) ?? []).length, 1, 'the verifying command is stated more than once');
  assert.match(report.text, /\*\*Done when\.\*\* /);
});

// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
test('C003 the directories the section fails are exactly the directories the discharge gate names', () => {
  const root = workspaceWithOneCarriedUnit();
  const report = describeCarriage({ root });
  const gate = spawnSync(
    process.execPath,
    [path.join(process.cwd(), '.claude/scripts/grill-me-for-rfc/check-ledger-discharge.js'), root],
    { encoding: 'utf8' },
  );
  const namedByGate = gate.stdout
    .split('\n')
    .filter((line) => line.startsWith('unaccounted: '))
    .map((line) => line.slice('unaccounted: '.length).split(' — ')[0]);

  assert.equal(gate.status, 1);
  assert.deepEqual(report.failedPackageIds, namedByGate);
});

// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
test('C003 an invocation that names no artifact prints the two gate summaries and no carriage section', () => {
  const root = workspaceWithOneCarriedUnit();
  const withoutArtifact = runReporter(root);
  const withArtifact = runReporter(root, path.join(root, 'SyntheticSpec-sequences.json'));

  assert.equal(withoutArtifact.status, 0);
  // The unit id is not the discriminator: the discharge gate prints it too, which is the whole
  // reason the two halves are read together. The section and its repair are what this run adds.
  assert.equal(withoutArtifact.stdout.includes('## Obligation carriage'), false);
  assert.equal(withoutArtifact.stdout.includes('**Repair.**'), false);
  assert.equal(withArtifact.stdout.includes('## Obligation carriage'), true);
  assert.equal(withArtifact.stdout.includes('ctr-boundary-001'), true);
  assert.equal(withArtifact.stdout.includes('**Repair.**'), true);
});

// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
test('C005 two invocations over one workspace print the same section and exit 0 both times', () => {
  const root = workspaceWithOneCarriedUnit();
  const artifactPath = path.join(root, 'SyntheticSpec-sequences.json');
  const first = runReporter(root, artifactPath);
  const second = runReporter(root, artifactPath);

  // The section itself is asserted first: two identical runs that both print nothing would
  // satisfy an equality alone, which is the accidental green this case exists to avoid.
  assert.match(first.stdout, /## Obligation carriage/);
  assert.match(first.stdout, /ctr-boundary-001/);
  assert.equal(first.stdout, second.stdout);
  assert.equal(first.status, 0);
  assert.equal(second.status, 0);
});
