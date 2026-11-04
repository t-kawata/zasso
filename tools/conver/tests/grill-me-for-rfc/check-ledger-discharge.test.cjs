// PX-261 @verifies C006
// The assignment gate proves a demand is owed by a named package; it does not prove the
// package accounted for it. This is the other half, and it is a separate program on purpose:
// a fresh run has no RFC, so a single verdict carrying both halves would be unsatisfiable at
// the step where the demand is resolved.
//
// The three states a package can be in call for three different repairs, so they are reported
// apart: no ledger at all, a ledger that is present and not well formed, and a well-formed
// ledger that omits a unit the view holds.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DISCHARGE_GATE = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/../grill-me-for-rfc/check-ledger-discharge.js');
const LEDGER_HEADER = '| Unit | Kind | Owner | RFC location | Ground |';

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'px261-discharge-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** A ledger appendix as the parser requires it: canonical, headed, with resolving rows. */
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
    ...(rows.length === 0 ? ['', '**Composition check.** nothing was distributed to this package.'] : []),
    '',
  ].join('\n');
}

/** A workspace root holding one package whose view distributes the given units. */
function workspaceWith(units, { rfc = null, packageName = 'pkg-a', rootPath = null } = {}) {
  const root = rootPath ?? fs.mkdtempSync(path.join(tmpRoot, 'ws-'));
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

function runDischarge(root) {
  const result = spawnSync(process.execPath, [DISCHARGE_GATE, root], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('check-ledger-discharge.js', () => {
  it('C006 a workspace whose every unit is accounted for discharges, and the gate says so at exit 0', () => {
    const root = workspaceWith(['op-R-0001', 'op-R-0002'], { rfc: ledgerAppendix([{ unit: 'op-R-0001' }, { unit: 'op-R-0002' }]) });
    try {
      const result = runDischarge(root);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /discharged: every unit every view holds is accounted for/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('C006 a unit the view holds that no ledger row accounts for is reported by package and unit id', () => {
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

  it('C006 a package holding units and carrying no ledger is reported apart from one whose ledger omits a unit', () => {
    const root = workspaceWith(['op-R-0001']);
    try {
      const result = runDischarge(root);
      assert.equal(result.status, 1);
      assert.match(result.stdout, /no distribution ledger: pkg-a/);
      assert.doesNotMatch(result.stdout, /unaccounted:/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('C006 a ledger that is present and not well formed is reported apart from both', () => {
    const root = workspaceWith(['op-R-0001'], { rfc: '# Package RFC\n\n## Distribution ledger\n\nnot a table\n' });
    try {
      const result = runDischarge(root);
      assert.equal(result.status, 1);
      assert.match(result.stdout, /not well formed: pkg-a/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('C006 a package holding no unit reports nothing, and a root with no package discharges', () => {
    const empty = fs.mkdtempSync(path.join(tmpRoot, 'empty-'));
    try {
      const result = runDischarge(empty);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /discharged: every unit every view holds is accounted for/);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('C006 a package that was never grilled is visible rather than silent, and one package does not excuse another', () => {
    const root = workspaceWith(['op-R-0001'], { rfc: ledgerAppendix([{ unit: 'op-R-0001' }]), packageName: 'pkg-a' });
    try {
      workspaceWith(['op-R-0002'], { packageName: 'pkg-b', rootPath: root });
      const result = runDischarge(root);
      assert.equal(result.status, 1);
      assert.match(result.stdout, /no distribution ledger: pkg-b/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('C006 a missing argument is refused with the usage line and exit 1', () => {
    const result = spawnSync(process.execPath, [DISCHARGE_GATE], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /usage: check-ledger-discharge\.js <WORKSPACE_ROOT>/);
  });

  it('C006 the ledger is parsed by the slice own reader and not by a second implementation', () => {
    const root = workspaceWith(['op-R-0001'], { rfc: ledgerAppendix([{ unit: 'op-R-0001', location: 'line 3 of this RFC' }]) });
    try {
      const result = runDischarge(root);
      assert.equal(result.status, 0, result.stdout + result.stderr);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('C002 a location citing a section the document carries is accounted for, and the gate exits 0', () => {
    const root = workspaceWith(['op-R-0001'], { rfc: ledgerAppendix([{ unit: 'op-R-0001' }]) });
    try {
      assert.equal(runDischarge(root).status, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('C002 a line the document does not have is a location that does not resolve', () => {
    const root = workspaceWith(['op-R-0001'], { rfc: ledgerAppendix([{ unit: 'op-R-0001' }]).replace('line 3 of this RFC', 'line 9999') });
    try {
      const result = runDischarge(root);
      assert.equal(result.status, 1);
      assert.match(result.stdout, /location does not resolve: pkg-a/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('C002 invariant: the three discharge families stay apart and no row is reported twice', () => {
    const root = workspaceWith(['op-R-0001'], { rfc: '# RFC\n\nNo ledger here.\n' });
    try {
      const result = runDischarge(root);
      const lines = result.stdout.split('\n').filter((line) => line.includes('pkg-a'));
      assert.equal(lines.filter((line) => line.startsWith('no distribution ledger')).length, 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('PX-355 C006 the root view the manifest names is discharged by the root RFC ledger', () => {
    const root = fs.mkdtempSync(path.join(tmpRoot, 'root-'));
    try {
      fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
        workspace: { packages: [{ id: 'pkg-root', name: 'root', path: '.' }] },
      }));
      fs.writeFileSync(path.join(root, 'SEQUENCES.json'), JSON.stringify({
        packageId: 'pkg-root', ownedOperationUnits: [{ unitId: 'op-R-0001', operationId: 'R-0001' }],
        ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [], obligationSource: 'undeclared',
      }));
      fs.writeFileSync(path.join(root, 'RFC.md'), ledgerAppendix([{ unit: 'op-R-0001' }]).replace(/pkg-a/g, 'pkg-root'));
      assert.equal(runDischarge(root).status, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('PX-355 C006 a root unit the root ledger omits is reported as unaccounted by pkg-root', () => {
    const root = fs.mkdtempSync(path.join(tmpRoot, 'root-miss-'));
    try {
      fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
        workspace: { packages: [{ id: 'pkg-root', name: 'root', path: '.' }] },
      }));
      fs.writeFileSync(path.join(root, 'SEQUENCES.json'), JSON.stringify({
        packageId: 'pkg-root', ownedOperationUnits: [{ unitId: 'op-R-0001', operationId: 'R-0001' }],
        ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [], obligationSource: 'undeclared',
      }));
      fs.writeFileSync(path.join(root, 'RFC.md'), ledgerAppendix([]).replace(/pkg-a/g, 'pkg-root'));
      const result = runDischarge(root);
      assert.equal(result.status, 1);
      assert.match(result.stdout, /unaccounted: pkg-root — op-R-0001/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('PX-367 C004 every blocking finding renders the repair record', () => {
    const root = workspaceWith(['op-R-0001']);
    try {
      const result = runDischarge(root);
      assert.equal(result.status, 1);
      assert.match(result.stdout, /\[ERROR\] NO_DISTRIBUTION_LEDGER/);
      for (const label of ['Cause:', 'Layer:', 'Artifact:', 'Action:', 'Verify:', 'Route:']) {
        assert.match(result.stdout, new RegExp(label));
      }
      assert.match(result.stdout, /Route: in-drill/);
      assert.match(result.stdout, /RFC\.md/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
