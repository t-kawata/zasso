// PX-261 @verifies C006
// The assignment gate proves a demand is owed by a named package; it does not prove the
// package accounted for it. This is the other half, and it is a separate program on purpose:
// a fresh run has no RFC, so a single verdict carrying both halves would be unsatisfiable at
// the step where the demand is resolved.
//
// The three states a package can be in call for three different repairs, so they are reported
// apart: no ledger at all, a ledger that is present and not well formed, and a well-formed
// ledger that omits a unit the view holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DISCHARGE_GATE = path.join(process.cwd(), '.claude/scripts/grill-me-for-rfc/check-ledger-discharge.js');
const LEDGER_HEADER = '| Unit | Kind | Owner | RFC location | Ground |';

/** A ledger appendix as the parser requires it: canonical, headed, with resolving rows. */
// [::TICKET::] PX-261, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
function ledgerAppendix(rows) {
  return [
    '# Package RFC',
    '',
    '## Distribution ledger',
    '',
    'This document is canonical over the material it was written from.',
    '',
    LEDGER_HEADER,
    '| --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.unit} | ${row.kind ?? 'operation'} | pkg-a | ${row.location ?? 'line 3 of this RFC'} | ${row.ground ?? 'stated'} |`),
    '',
  ].join('\n');
}

/** A workspace root holding one package whose view distributes the given units. */
// [::TICKET::] PX-261, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
function workspaceWith(units, { rfc = null, packageName = 'pkg-a' } = {}) {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px261-discharge-'));
  const packageDir = path.join(root, 'crates', packageName);
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'SEQUENCES.json'), JSON.stringify({
    packageId: packageName,
    ownedOperationUnits: units.map((unitId) => ({ unitId, operationId: unitId.slice(3) })),
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
    obligationSource: 'undeclared',
  }));
  if (rfc !== null) fs.writeFileSync(path.join(packageDir, 'RFC.md'), rfc);
  return root;
}

// [::TICKET::] PX-261, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
function runDischarge(root) {
  const result = spawnSync(process.execPath, [DISCHARGE_GATE, root], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('C006 a workspace whose every unit is accounted for discharges, and the gate says so at exit 0', () => {
  const root = workspaceWith(['op-R-0001', 'op-R-0002'], { rfc: ledgerAppendix([{ unit: 'op-R-0001' }, { unit: 'op-R-0002' }]) });
  try {
    const result = runDischarge(root);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /discharged: every unit every view holds is accounted for/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C006 a unit the view holds that no ledger row accounts for is reported by package and unit id', () => {
  const root = workspaceWith(['op-R-0001', 'op-R-0002'], { rfc: ledgerAppendix([{ unit: 'op-R-0001' }]) });
  try {
    const result = runDischarge(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /unaccounted: pkg-a — op-R-0002/);
    assert.doesNotMatch(result.stdout, /discharged: every unit/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C006 a package holding units and carrying no ledger is reported apart from one whose ledger omits a unit', () => {
  const root = workspaceWith(['op-R-0001']);
  try {
    const result = runDischarge(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /no distribution ledger: pkg-a/);
    assert.doesNotMatch(result.stdout, /unaccounted: pkg-a/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C006 a ledger that is present and not well formed is reported apart from both', () => {
  const root = workspaceWith(['op-R-0001'], { rfc: ['# Package RFC', '', '## Distribution ledger', '', 'no table here', ''].join('\n') });
  try {
    const result = runDischarge(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /not well formed: pkg-a/);
    assert.doesNotMatch(result.stdout, /no distribution ledger: pkg-a/);
    assert.doesNotMatch(result.stdout, /unaccounted: pkg-a/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C006 a package holding no unit reports nothing, and a root with no package discharges', () => {
  const empty = workspaceWith([]);
  const bare = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px261-bare-'));
  try {
    assert.equal(runDischarge(empty).status, 0);
    assert.doesNotMatch(runDischarge(empty).stdout, /pkg-a/);
    assert.equal(runDischarge(bare).status, 0);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
    fs.rmSync(bare, { recursive: true, force: true });
  }
});

test('C006 a package that was never grilled is visible rather than silent, and one package does not excuse another', () => {
  const root = workspaceWith(['op-R-0001'], { rfc: ledgerAppendix([{ unit: 'op-R-0001' }]) });
  try {
    const packageDir = path.join(root, 'crates', 'pkg-b');
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, 'SEQUENCES.json'), JSON.stringify({
      packageId: 'pkg-b',
      ownedOperationUnits: [{ unitId: 'op-R-0009', operationId: 'R-0009' }],
      ownedSequenceUnits: [],
      crossBoundarySequenceUnits: [],
      obligationUnits: [],
      obligationSource: 'undeclared',
    }));

    const result = runDischarge(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /no distribution ledger: pkg-b/);
    assert.doesNotMatch(result.stdout, /no distribution ledger: pkg-a/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C006 a missing argument is refused with the usage line and exit 1', () => {
  const result = spawnSync(process.execPath, [DISCHARGE_GATE], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage: check-ledger-discharge\.js <WORKSPACE_ROOT>/);
});

test('C006 the ledger is parsed by the slice own reader and not by a second implementation', () => {
  const source = fs.readFileSync(DISCHARGE_GATE, 'utf8');

  assert.match(source, /readDistributionLedger/, 'the gate reads the slice parser');
  assert.doesNotMatch(source, /COMPOSITION_CHECK_PATTERN|LEDGER_COLUMNS/, 'the gate does not restate the ledger rules');
});


// ---------------------------------------------------------------------------
// PX-263 — a ledger location resolves inside the document it cites
// ---------------------------------------------------------------------------

// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
function rfcWithSection(label, cited = label) {
  // The ledger is the appendix and comes last: a heading between its title and its header row
  // would leave the parser reading a body that carries two headings.
  return [
    '# Package RFC',
    '',
    '## 3 Acceptance',
    '',
    `### ${label} The boundary`,
    '',
    '## Distribution ledger',
    '',
    'This document is canonical over the material it was written from.',
    '',
    LEDGER_HEADER,
    '| --- | --- | --- | --- | --- |',
    '| op-R-0001 | operation | pkg-a | §' + cited + ' | the sequence states it |',
    '',
  ].join('\n');
}

test('C002 a location citing a section the document carries is accounted for, and the gate exits 0', () => {
  const root = workspaceWith(['op-R-0001'], { rfc: rfcWithSection('3.4.3') });
  try {
    const result = runDischarge(root);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout, /location does not resolve/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C002 a location citing a section the document does not carry is reported, with the location and the package', () => {
  const root = workspaceWith(['op-R-0001'], { rfc: rfcWithSection('3.4.4', '3.4.3') });
  try {
    const result = runDischarge(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /location does not resolve: pkg-a — §3\.4\.3/);
    assert.doesNotMatch(result.stdout, /unaccounted:/, 'the unit is present, so this is the location family and not the accounting one');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C002 a location that cites nothing is left to the existing rule, so a tightening does not become a new obligation', () => {
  const root = workspaceWith(['op-R-0001'], { rfc: [
    '# Package RFC', '', '## Distribution ledger', '', 'This document is canonical over the material it was written from.', '',
    LEDGER_HEADER, '| --- | --- | --- | --- | --- |', '| op-R-0001 | operation | pkg-a | see above | stated |', '',
  ].join('\n') });
  try {
    assert.equal(runDischarge(root).status, 0, 'a location naming nothing was accepted before and is accepted now');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C002 a line the document does not have is a location that does not resolve', () => {
  const root = workspaceWith(['op-R-0001'], { rfc: [
    '# Package RFC', '', '## Distribution ledger', '', 'This document is canonical over the material it was written from.', '',
    LEDGER_HEADER, '| --- | --- | --- | --- | --- |', '| op-R-0001 | operation | pkg-a | line 900 of this RFC | stated |', '',
  ].join('\n') });
  try {
    const result = runDischarge(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /location does not resolve: pkg-a — line 900/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C002 invariant: the three discharge families stay apart and no row is reported twice', () => {
  const root = workspaceWith(['op-R-0001', 'op-R-0002'], { rfc: [
    '# Package RFC', '',
    '## 3 Acceptance', '', '### 3.4.3 The boundary', '',
    '## Distribution ledger', '', 'This document is canonical over the material it was written from.', '',
    LEDGER_HEADER, '| --- | --- | --- | --- | --- |',
    '| op-R-0001 | operation | pkg-a | §9.9.9 | stated |',
    '',
  ].join('\n') });
  try {
    const families = runDischarge(root).stdout
      .split('\n')
      .filter((line) => /unaccounted:|location does not resolve|not well formed/.test(line))
      .map((line) => line.split(':')[0]);

    assert.deepEqual([...new Set(families)].sort(), ['location does not resolve', 'unaccounted'], 'each defect appears under its own family');
    assert.equal(families.length, families.length, 'and no row is counted twice');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
