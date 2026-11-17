'use strict';

/**
 * PX-441 C006 — evidence-bound judgments.
 *
 * A PASS is reusable only while the evidence it cites is byte-identical.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  createLedger,
  judgeCoverage,
  recordJudgment,
} = require('../../.claude/scripts/tickets/lib/judgment-ledger.js');

const OBLIGATION = { surface: 'contract', assetId: 'C001', criterion: 'A' };

/** A package with one evidence file. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px441-judgment-'));
  fs.mkdirSync(path.join(cwd, 'src'));
  fs.writeFileSync(path.join(cwd, 'src', 'alpha.js'), 'module.exports = () => 1;\n');
  return cwd;
}

test('C006 Precondition: a judgment records an evidenceDigest over the cited bytes', () => {
  const cwd = fixture();
  try {
    const ledger = createLedger({ obligations: [OBLIGATION] });
    const recorded = recordJudgment(ledger, {
      ...OBLIGATION,
      status: 'PASS',
      evidence: [{ file: 'src/alpha.js', line: 1 }],
      normativeSource: 'contract:C001',
    }, { cwd });

    assert.equal(recorded.ok, true);
    assert.match(recorded.judgment.evidenceDigest, /^sha256:[0-9a-f]{64}$/);
    assert.match(recorded.judgment.evidence[0].fileDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(judgeCoverage(ledger, { cwd }).verdict, 'PASS');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C006 Postcondition: changed evidence makes the judgment unrecorded', () => {
  const cwd = fixture();
  try {
    const ledger = createLedger({ obligations: [OBLIGATION] });
    recordJudgment(ledger, {
      ...OBLIGATION,
      status: 'PASS',
      evidence: [{ file: 'src/alpha.js', line: 1 }],
      normativeSource: 'contract:C001',
    }, { cwd });
    fs.writeFileSync(path.join(cwd, 'src', 'alpha.js'), 'module.exports = () => 2;\n');

    const coverage = judgeCoverage(ledger, { cwd });
    assert.equal(coverage.unrecorded.length, 1);
    assert.notEqual(coverage.verdict, 'PASS');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C006 Invariant: a judgment without evidenceDigest is invalid, never PASS', () => {
  const cwd = fixture();
  try {
    const ledger = createLedger({ obligations: [OBLIGATION] });
    ledger.judgments.push({
      ...OBLIGATION,
      status: 'PASS',
      evidence: [{ file: 'src/alpha.js', line: 1 }],
      normativeSource: 'contract:C001',
    });

    const coverage = judgeCoverage(ledger, { cwd });
    assert.equal(coverage.unrecorded.length, 1);
    assert.equal(coverage.invalid.length, 1);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C006 Invariant: PASS on a TESTABLE clause still requires a PROVEN proof', () => {
  const cwd = fixture();
  try {
    const ledger = createLedger({ obligations: [OBLIGATION] });
    const result = recordJudgment(ledger, {
      ...OBLIGATION,
      status: 'PASS',
      evidence: [{ file: 'src/alpha.js', line: 1 }],
      normativeSource: 'contract:C001',
    }, { cwd, applicability: 'TESTABLE', proof: { status: 'CLAUSE_PROOF_FAILED' } });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'EVIDENCE_UNPROVEN');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C006 Postcondition: the CLI binds evidence to the package passed by --cwd', () => {
  const cwd = fixture();
  const cli = path.resolve(__dirname, '../../.claude/scripts/tickets/lib/judgment-ledger.js');
  try {
    fs.writeFileSync(path.join(cwd, 'OMISSION-JUDGMENT-LEDGER.json'), JSON.stringify({
      version: 1,
      enumeration: { obligations: 1, at: '2026-11-17T00:00:00Z' },
      obligations: [OBLIGATION],
      judgments: [],
    }));
    const recorded = spawnSync(process.execPath, [cli, '--cwd=' + cwd], {
      input: JSON.stringify({
        ...OBLIGATION,
        status: 'PASS',
        evidence: [{ file: 'src/alpha.js', line: 1 }],
        normativeSource: 'contract:C001',
      }),
      encoding: 'utf8',
    });
    assert.equal(recorded.status, 0);
    fs.writeFileSync(path.join(cwd, 'src', 'alpha.js'), 'module.exports = () => 2;\n');

    const reported = spawnSync(process.execPath, [cli, '--cwd=' + cwd, '--report'], { encoding: 'utf8' });
    const report = JSON.parse(reported.stdout);
    assert.equal(report.verdict, 'INCOMPLETE');
    assert.equal(report.unrecorded.length, 1);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
