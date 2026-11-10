'use strict';

/**
 * PX-407 — measured omission gate regression tests.
 *
 * These tests freeze the repair: an unmeasured surface is never clean, the
 * registered runner is the only detector, the ledger enumerates its obligations,
 * and only one ticket is created per stable finding.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  artifactStatus,
  dirsTreePaths,
  enumerateSurfaceReport,
  evaluateCoverage,
  loadRegistry,
} = require('../../.claude/scripts/tickets/lib/omission-detectors.js');
const {
  runDetector,
  runGapScan,
  normalizeFinding,
} = require('../../.claude/scripts/tickets/omission-gap-scan.js');
const {
  runDetectionGate,
  runCalibration,
  runNegativeControl,
  runMetaControl,
  calibrationVerdict,
} = require('../../.claude/scripts/tickets/omission-detection-gate.js');
const {
  createLedger,
  mergeObligations,
  recordJudgment,
  judgeCoverage,
} = require('../../.claude/scripts/tickets/lib/judgment-ledger.js');
const {
  stableFindingKey,
  isConverged,
  recordRun,
  readState,
} = require('../../.claude/scripts/tickets/lib/omission-convergence.js');
const { applyFindings } = require('../../.claude/scripts/tickets/apply-omission-findings.js');
const { scanDirectory } = require('../../.claude/scripts/tickets/scan-incomplete-implementations.js');

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function tempRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function writeJson(root, name, value) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  return file;
}

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function bareTickets(root) {
  return writeJson(root, 'Tickets.json', {
    title: 'repair fixture',
    round: 1,
    metadata: {},
    phases: [{ id: 0, name: 'P0', tickets: [] }],
  });
}

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function hashTree(root) {
  const hash = crypto.createHash('sha256');
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, entry.name);
      hash.update(path.relative(root, full));
      if (entry.isDirectory()) walk(full);
      else hash.update(fs.readFileSync(full));
    }
  };
  walk(root);
  return hash.digest('hex');
}

// @verifies C001
test('C001: an absent graph artifact is notMeasured, never clean', () => {
  const root = tempRoot('px407-absent-');
  try {
    const tickets = bareTickets(root);
    const artifacts = artifactStatus({ cwd: root, ticketsPath: tickets });
    assert.equal(artifacts.families['graph-node'].state, 'absent');

    const report = enumerateSurfaceReport({ cwd: root, ticketsPath: tickets });
    assert.equal(report.artifacts.families['graph-node'].state, 'absent');

    const coverage = evaluateCoverage({
      registry: loadRegistry({ cwd: root }),
      surfaces: report.surfaces,
      artifacts: report.artifacts,
    });
    assert.equal(coverage.ok, false);
    assert.ok(coverage.findings.some((finding) => finding.surface === 'graph-node' && finding.code === 'ARTIFACT_MISSING'));
    assert.ok(coverage.notMeasured.includes('graph-node'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// @verifies C001
test('C001: a registry whose runner is missing is blocked, not a must-fix finding', () => {
  const root = tempRoot('px407-broken-');
  try {
    const tickets = bareTickets(root);
    const detector = { id: 'broken', kind: 'mechanical', surfaces: ['contract'], runner: { script: 'tickets/does-not-exist.js', args: [], scope: 'package', output: 'gate-report' } };
    const result = runDetector(detector, { cwd: root, ticketsPath: tickets });
    assert.equal(result.status, 'blocked');
    assert.equal(result.measured, false);
    assert.deepEqual(result.findings, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// @verifies C001
test('C001: the detection gate exits non-zero when a mechanical runner is broken', () => {
  const root = tempRoot('px407-gate-');
  try {
    const tickets = bareTickets(root);
    const registry = loadRegistry({ cwd: root });
    const broken = {
      ...registry,
      detectors: registry.detectors.map((detector) => detector.kind === 'mechanical'
        ? { ...detector, runner: { script: 'tickets/does-not-exist.js', args: [], scope: 'package', output: 'gate-report' } }
        : detector),
    };
    const result = runDetectionGate({ cwd: root, ticketsPath: tickets, registry: broken });
    assert.equal(result.coverage.ok, false);
    assert.notEqual(result.exitCode, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// @verifies C002
test('C002: the omission source set excludes dependency and build directories', () => {
  const root = tempRoot('px407-source-');
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'node_modules', 'dep'), { recursive: true });
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.js'), 'function ok() { return 1; }\n');
    fs.writeFileSync(path.join(root, 'node_modules', 'dep', 'a.js'), '// dependency marker\n');
    fs.writeFileSync(path.join(root, 'dist', 'a.js'), '// build marker\n');

    const findings = scanDirectory(root, 'all', { sourceSet: 'omission' });
    assert.equal(findings.some((finding) => finding.file.includes('node_modules')), false);
    assert.equal(findings.some((finding) => finding.file.includes('/dist/')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// @verifies C002
test('C002: an empty function body and a suppression are classified', () => {
  const root = tempRoot('px407-classify-');
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.js'), 'function empty() {}\n// eslint-disable-next-line no-console\nconsole.log(1);\n');
    const findings = scanDirectory(root, 'all', { sourceSet: 'omission', classify: true });
    const empty = findings.find((finding) => finding.pattern === 'empty function body');
    const suppression = findings.find((finding) => finding.pattern === 'eslint-disable');
    assert.ok(empty);
    assert.equal(empty.classification, 'unmarked-confirmed');
    assert.ok(suppression);
    assert.equal(suppression.classification, 'needsJudgment');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// @verifies C002
test('C002: every mechanical family detects its seed with the real detector', () => {
  const registry = loadRegistry({ cwd: process.cwd() });
  const calibration = runCalibration({ registry });
  const mechanical = registry.detectors.filter((detector) => detector.kind === 'mechanical');
  assert.equal(calibration.seeds.length, mechanical.length);
  assert.ok(calibration.seeds.every((seed) => seed.detected === true), JSON.stringify(calibration.seeds.filter((seed) => !seed.detected), null, 2));
  assert.equal(calibrationVerdict(calibration).ok, true);

  const negative = runNegativeControl({ registry });
  assert.equal(negative.ok, true);
  assert.deepEqual(negative.findings, []);

  const meta = runMetaControl({ registry, surfaces: [{ surface: 'contract', assetId: 'C001' }] });
  assert.equal(meta.ok, true);
});

// @verifies C003
test('C003: the ledger enumerates obligations and an empty ledger is INCOMPLETE', () => {
  const obligation = { surface: 'contract', assetId: 'C001', criterion: 'A', detector: 'contract-translation' };
  const ledger = createLedger({ obligations: [] });
  const merged = mergeObligations(ledger, [obligation]);
  assert.equal(merged.obligations.length, 1);
  assert.equal(judgeCoverage(merged).verdict, 'INCOMPLETE');

  const pass = { surface: 'contract', assetId: 'C001', criterion: 'A', status: 'PASS', evidence: [{ file: 'src/a.js', line: 1 }], normativeSource: 'contract:C001' };
  assert.equal(recordJudgment(merged, pass).ok, true);
  assert.equal(judgeCoverage(merged).verdict, 'PASS');
});

// @verifies C003
test('C003: a PASS without a normative source is refused', () => {
  const ledger = createLedger({ obligations: [{ surface: 'contract', assetId: 'C001', criterion: 'A' }] });
  const result = recordJudgment(ledger, {
    surface: 'contract', assetId: 'C001', criterion: 'A', status: 'PASS',
    evidence: [{ file: 'src/a.js', line: 1 }], normativeSource: null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NORMATIVE_SOURCE_MISSING');
});

// @verifies C004
test('C004: one stable key creates one ticket and no new ticket is created on repeat', () => {
  const root = tempRoot('px407-dedup-');
  try {
    const tickets = writeJson(root, 'Tickets.json', {
      title: 'dedup fixture',
      round: 1,
      metadata: {},
      phases: [{ id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, status: 'todo', title: 'source', contracts: [], testUnit: [], testIntegration: [], acceptanceCriteria: [] }] }],
    });
    const finding = {
      stableKey: stableFindingKey({ surface: 'contract', assetId: 'P0-1/C001/precondition', criterion: 'contract-delivery' }),
      surface: 'contract', assetId: 'P0-1/C001/precondition', criterion: 'contract-delivery',
      code: 'CONTRACT_CLAUSE_UNTESTED', problem: 'missing test', severity: 'high',
      ticketKey: 'P0-1', normativeSource: 'contract:C001', repair: 'author-and-insert-test', class: 'must-fix',
    };
    const report = { findings: [finding], digest: 'd1' };
    const first = applyFindings({ cwd: root, ticketsPath: tickets, report, state: null });
    assert.equal(first.createdTickets, 1);
    const second = applyFindings({ cwd: root, ticketsPath: tickets, report, state: first.state });
    assert.equal(second.createdTickets, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// @verifies C004
test('C004: convergence requires adjudication, no unticketed must-fix, non-increasing debt, two identical runs and no new ticket', () => {
  const state = { unrecorded: [], unticketedMustFix: [], debt: { before: 1, after: 1 }, runs: [{ digest: 'd' }, { digest: 'd' }], newTickets: 0 };
  assert.equal(isConverged(state), true);
  assert.equal(isConverged({ ...state, unrecorded: [{ surface: 'contract' }] }), false);
  assert.equal(isConverged({ ...state, unticketedMustFix: [{ surface: 'contract' }] }), false);
  assert.equal(isConverged({ ...state, debt: { before: 1, after: 2 } }), false);
  assert.equal(isConverged({ ...state, runs: [{ digest: 'a' }, { digest: 'b' }] }), false);
  assert.equal(isConverged({ ...state, newTickets: 1 }), false);
});

// @verifies C004
test('C004: report-only leaves the workspace byte-identical', () => {
  const root = tempRoot('px407-report-only-');
  try {
    const tickets = bareTickets(root);
    const before = hashTree(root);
    runGapScan({ cwd: root, ticketsPath: tickets, reportOnly: true });
    assert.equal(hashTree(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// @verifies C001
test('C001: a derived finding carries a stable key and only a real normative source', () => {
  const detector = { id: 'contract-delivery', kind: 'mechanical', surfaces: ['contract'] };
  const finding = normalizeFinding(detector, {
    code: 'CONTRACT_CLAUSE_UNTESTED', asset: 'P0-1/C001/precondition', problem: 'missing',
  });
  assert.match(finding.stableKey, /^contract\|P0-1\/C001\/precondition\|contract-delivery$/);
  assert.equal(finding.ticketKey, 'P0-1');
  assert.equal(finding.normativeSource, 'contract:C001');
  assert.equal(finding.class, 'must-fix');
});

// @verifies C001
test('C001: Dirs-Tree paths follow the real trees schema without a doubled language root', () => {
  const paths = dirsTreePaths({
    trees: { rust: { name: 'rust', type: 'directory', children: [{ name: 'a.rs', type: 'file', mappedNodeIds: ['N0001'] }] } },
  });
  assert.deepEqual(paths, ['rust/a.rs']);
});

// @verifies C001
test('C001: a ticket-closure finding and a sequence-step design finding are must-fix', () => {
  const closure = normalizeFinding(
    { id: 'ticket-closure', kind: 'mechanical', surfaces: ['ticket'] },
    { code: 'CONTRACT_CHAIN_OPEN', assetId: 'P0-1', ticketKey: 'P0-1', problem: 'open chain' },
  );
  assert.equal(closure.normativeSource, 'tickets:P0-1');
  assert.equal(closure.class, 'must-fix');

  const design = normalizeFinding(
    { id: 'chain', kind: 'mechanical', surfaces: ['sequence-step'] },
    { code: 'SEQUENCE_STEPS_UNDISTRIBUTED', assetId: 'S1-1', problem: 'undistributed' },
  );
  assert.equal(design.normativeSource, 'design:S1-1');
  assert.equal(design.class, 'must-fix');
});

// @verifies C002
test('C002: the registered stub-marker detector reports an unresolvable key, not a detector failure', () => {
  const root = tempRoot('px407-stub-detector-');
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.js'), '// [::STUB::] MUST RESOLVE: unresolved key\n');
    const tickets = bareTickets(root);
    const registry = loadRegistry({ cwd: process.cwd() });
    const detector = registry.detectors.find((entry) => entry.id === 'stub-marker');
    const result = runDetector(detector, { cwd: root, ticketsPath: tickets });
    assert.equal(result.status, 'measured');
    assert.ok(result.findings.some((finding) => finding.code === 'STUB_KEY_UNRESOLVABLE'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// @verifies C004
test('C004: a design finding without a source ticket enters the design-amendment queue', () => {
  const root = tempRoot('px407-design-queue-');
  try {
    const tickets = bareTickets(root);
    const finding = {
      stableKey: stableFindingKey({ surface: 'sequence-step', assetId: 'S1-1', criterion: 'chain' }),
      surface: 'sequence-step', assetId: 'S1-1', criterion: 'chain',
      code: 'SEQUENCE_STEPS_UNDISTRIBUTED', problem: 'undistributed', severity: 'high',
      ticketKey: null, normativeSource: 'design:S1-1', class: 'must-fix',
    };
    const result = applyFindings({ cwd: root, ticketsPath: tickets, report: { findings: [finding], digest: 'd' }, state: null });
    assert.equal(result.createdTickets, 0);
    assert.equal(result.designQueue.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
