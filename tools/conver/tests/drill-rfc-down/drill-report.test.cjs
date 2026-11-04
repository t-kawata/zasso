// PX-368 @verifies C006
// The report is the only writer of COMPLETE. These tests pin the state rule, the file
// pair, the repair-record shape and the cap that keeps the Markdown readable.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  toRepairRecord,
  writeDrillReport,
} = require('../../.claude/scripts/drill-rfc-down/drill-report.js');
const { createFinding } = require('../../.claude/scripts/lib/repair-finding.js');

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'px368-report-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// [::TICKET::] PX-368 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-368 --for-spec --no-implementation-order`.
function session(name) {
  const directory = path.join(tmpRoot, name);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

describe('toRepairRecord', () => {
  it('C007 postcondition: a high consistency finding carries the eight repair fields', () => {
    const record = toRepairRecord({
      severity: 'high',
      code: 'MISSING_UNIT_AT_LAYER',
      unitId: 'seq-A',
      layer: 'rfc',
      message: 'unit seq-A is distributed by the view and absent from the distribution ledger',
    }, {
      artifact: '/pkg/RFC.md',
      verifyCommand: 'node "$(git rev-parse --show-toplevel)/.claude/scripts/drill-rfc-down/verify-step.js"',
    });

    for (const field of ['severity', 'code', 'layer', 'artifact', 'cause', 'action', 'verify', 'route']) {
      assert.equal(typeof record[field], 'string', `finding.${field} is required`);
      assert.ok(record[field].length > 0, `finding.${field} is empty`);
    }
    assert.equal(record.severity, 'blocking');
    assert.match(record.cause, /seq-A/);
  });

  it('C007 invariant: a finding without action is a script defect', () => {
    // The enforcement point is createFinding, which every repair record passes through.
    assert.throws(
      () => createFinding({ severity: 'blocking', code: 'X', layer: 'drill', artifact: 'a.md', cause: 'c', verify: 'node x.js', route: 'in-drill' }),
      /finding\.action is required/,
    );
  });
});

describe('writeDrillReport', () => {
  it('C006 invariant: every P1 gate at zero writes COMPLETE with gate names and exit codes', () => {
    const directory = session('complete');
    const result = writeDrillReport({
      sessionDir: directory,
      packageDir: '/pkg',
      p1: {
        gates: [
          { name: 'verify-consistencies', exitCode: 0, status: 'passed', detail: 'ok' },
          { name: 'check-formula-coverage', exitCode: 0, status: 'passed', detail: 'zero owned' },
          { name: 'verifyFormulaChain', exitCode: 0, status: 'passed', detail: 'ok' },
        ],
        findings: [],
      },
      p2: { gates: [], findings: [] },
    });

    assert.equal(result.state, 'COMPLETE');
    const report = JSON.parse(fs.readFileSync(path.join(directory, 'DRILL-REPORT.json'), 'utf8'));
    assert.equal(report.state, 'COMPLETE');
    assert.deepEqual(report.p1.gates.map((gate) => gate.name), ['verify-consistencies', 'check-formula-coverage', 'verifyFormulaChain']);
    assert.ok(fs.existsSync(path.join(directory, 'DRILL-REPORT.md')));
  });

  it('C006 error: a failing P1 gate writes REPAIR_NO_PROGRESS, never COMPLETE', () => {
    const directory = session('repair');
    const result = writeDrillReport({
      sessionDir: directory,
      packageDir: '/pkg',
      p1: {
        gates: [{ name: 'verify-consistencies', exitCode: 1, status: 'failed', detail: 'unit seq-A missing' }],
        findings: [{ severity: 'high', code: 'MISSING_UNIT_AT_LAYER', message: 'unit seq-A is absent' }],
      },
      p2: { gates: [], findings: [] },
    });

    assert.equal(result.state, 'REPAIR_NO_PROGRESS');
    const report = JSON.parse(fs.readFileSync(path.join(directory, 'DRILL-REPORT.json'), 'utf8'));
    assert.equal(report.state, 'REPAIR_NO_PROGRESS');
  });

  it('C005 invariant: a failing P2 gate never changes the state', () => {
    const directory = session('p2');
    const result = writeDrillReport({
      sessionDir: directory,
      packageDir: '/pkg',
      p1: { gates: [{ name: 'verify-consistencies', exitCode: 0, status: 'passed', detail: 'ok' }], findings: [] },
      p2: { gates: [{ name: 'check-obligation-coverage', exitCode: 1, status: 'failed', detail: 'workspace residue' }], findings: [] },
    });

    assert.equal(result.state, 'COMPLETE');
    const report = JSON.parse(fs.readFileSync(path.join(directory, 'DRILL-REPORT.json'), 'utf8'));
    assert.equal(report.p2.gates.length, 1);
    assert.equal(report.p2.gates[0].exitCode, 1);
  });

  it('caps the Markdown and says how many lines were withheld', () => {
    const directory = session('capped');
    const findings = Array.from({ length: 60 }, (_, index) => ({
      severity: 'high', code: 'MISSING_UNIT_AT_LAYER', message: `unit op-${index} is absent`,
    }));
    writeDrillReport({
      sessionDir: directory,
      packageDir: '/pkg',
      p1: { gates: [{ name: 'verify-consistencies', exitCode: 1, status: 'failed', detail: 'many' }], findings },
      p2: { gates: [], findings: [] },
      markdownCap: 10,
    });

    const markdown = fs.readFileSync(path.join(directory, 'DRILL-REPORT.md'), 'utf8');
    assert.match(markdown, /\.\.\.and \d+ more/);
  });
});
