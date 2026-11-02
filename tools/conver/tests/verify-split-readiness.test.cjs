#!/usr/bin/env node
/**
 * verify-split-readiness.test.cjs — Gate for PX-346 C005.
 *
 * The readiness report is read-only and reports exactly the gates split will read.
 * A failing gate is a named BLOCKED finding, never a silent READY.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const readiness = require('../.claude/scripts/tickets/verify-split-readiness.js');

const stats = { passed: 0, failed: 0, total: 0 };

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function log(...parts) {
  process.stdout.write(parts.map(String).join(' ') + '\n');
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function test(name, fn) {
  stats.total++;
  try {
    fn();
    stats.passed++;
    log('  ✅', name);
  } catch (error) {
    stats.failed++;
    log('  ❌', name);
    console.error('     ' + error.message);
  }
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function passingGate() {
  return { ok: true };
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function failingGate(scriptName, code) {
  return ({ script }) => (path.basename(script) === scriptName
    ? { ok: false, code, detail: scriptName + ' failed' }
    : { ok: true });
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function makePackage(directory, graphExtra) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'RFC.md'), '# RFC\n', 'utf8');
  writeJson(path.join(directory, 'RFC-GRAPH.json'), Object.assign({
    sourceFile: 'RFC.md', mainLanguage: 'rust', nodes: [], edges: [],
  }, graphExtra || {}));
  writeJson(path.join(directory, 'RFC-Dirs-Tree.json'), { schemaVersion: 1, trees: [] });
  writeJson(path.join(directory, 'SEQUENCES.json'), { sequences: [] });
  writeJson(path.join(directory, 'RFC-GRAPHIFY-Status.json'), {
    currentStep: 6, steps: { 0: 'done', 1: 'done', 2: 'done', 3: 'done', 4: 'done', 5: 'done' },
  });
  writeJson(path.join(directory, 'RFC-BOUNDIFY-Status.json'), {
    currentStep: 4, steps: { 0: 'done', 1: 'done', 2: 'done', 3: 'done' },
  });
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function withTempDirectory(fn) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px346-readiness-'));
  try {
    fn(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function snapshot(directory) {
  return fs.readdirSync(directory).sort().map((name) => {
    const filePath = path.join(directory, name);
    return [name, fs.readFileSync(filePath, 'utf8')];
  });
}

log('\n--- verify-split-readiness tests ---\n');

test('C005: a package whose gates pass is READY', () => {
  withTempDirectory((directory) => {
    makePackage(directory, { contractChain: 'obligation' });
    const report = readiness.verifySplitReadiness({ packageDir: directory, runGate: passingGate });
    assert.strictEqual(report.ok, true, JSON.stringify(report.findings));
    assert.strictEqual(report.packages[0].verdict, 'READY');
    assert.strictEqual(report.packages[0].policy, 'obligation');
  });
});

test('C005: an absent policy is reported as a defaulted obligation', () => {
  withTempDirectory((directory) => {
    makePackage(directory);
    const report = readiness.verifySplitReadiness({ packageDir: directory, runGate: passingGate });
    assert.strictEqual(report.packages[0].policy, 'obligation');
    assert.strictEqual(report.packages[0].policyDefaulted, true);
  });
});

test('C005: a failing graph contract gate is BLOCKED with its code', () => {
  withTempDirectory((directory) => {
    makePackage(directory, { contractChain: 'transition' });
    const report = readiness.verifySplitReadiness({
      packageDir: directory,
      runGate: failingGate('verify-graph-contracts.js', 'GRAPH_CONTRACT_ERROR'),
    });
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.packages[0].verdict, 'BLOCKED');
    assert.ok(report.findings.some((finding) => finding.code === 'GRAPH_CONTRACT_ERROR'));
  });
});

test('C005: a stale smooth receipt is BLOCKED', () => {
  withTempDirectory((directory) => {
    makePackage(directory, { contractChain: 'obligation' });
    const report = readiness.verifySplitReadiness({
      packageDir: directory,
      runGate: failingGate('verify-smooth-verdict.mjs', 'STALE_SMOOTH_VERDICT'),
    });
    assert.strictEqual(report.ok, false);
    assert.ok(report.findings.some((finding) => finding.code === 'STALE_SMOOTH_VERDICT'));
  });
});

test('C005: an invalid policy is BLOCKED before any gate runs', () => {
  withTempDirectory((directory) => {
    makePackage(directory, { contractChain: 'Transition' });
    const report = readiness.verifySplitReadiness({ packageDir: directory, runGate: passingGate });
    assert.strictEqual(report.ok, false);
    assert.ok(report.findings.some((finding) => finding.code === 'INVALID_CONTRACT_CHAIN_POLICY'));
  });
});

test('C005: an incomplete graphify step is BLOCKED', () => {
  withTempDirectory((directory) => {
    makePackage(directory, { contractChain: 'obligation' });
    writeJson(path.join(directory, 'RFC-GRAPHIFY-Status.json'), {
      currentStep: 4, steps: { 0: 'done', 1: 'done', 2: 'done', 3: 'done', 4: 'running', 5: 'pending' },
    });
    const report = readiness.verifySplitReadiness({ packageDir: directory, runGate: passingGate });
    assert.strictEqual(report.ok, false);
    assert.ok(report.findings.some((finding) => finding.code === 'GRAPHIFY_INCOMPLETE'));
  });
});

test('C005: readiness never mutates an input file', () => {
  withTempDirectory((directory) => {
    makePackage(directory, { contractChain: 'obligation' });
    const before = snapshot(directory);
    readiness.verifySplitReadiness({ packageDir: directory, runGate: passingGate });
    assert.deepStrictEqual(snapshot(directory), before);
  });
});

test('C005: a workspace manifest evaluates every package', () => {
  withTempDirectory((directory) => {
    makePackage(path.join(directory, 'pkg-a'), { contractChain: 'obligation' });
    makePackage(path.join(directory, 'pkg-b'), { contractChain: 'obligation' });
    writeJson(path.join(directory, 'WORKSPACIFY-TREE-MANIFEST.json'), {
      workspace: { packages: [{ id: 'pkg-a', path: 'pkg-a' }, { id: 'pkg-b', path: 'pkg-b' }] },
    });
    const report = readiness.verifySplitReadiness({ workspaceRoot: directory, runGate: passingGate });
    assert.strictEqual(report.ok, true, JSON.stringify(report.findings));
    assert.deepStrictEqual(report.packages.map((entry) => entry.package), ['pkg-a', 'pkg-b']);
    assert.ok(report.packages.every((entry) => entry.verdict === 'READY'));
  });
});

test('C005: a run reset before phase design skips stale ticket gates', () => {
  withTempDirectory((directory) => {
    makePackage(directory, { contractChain: 'obligation' });
    writeJson(path.join(directory, 'Tickets.json'), { phases: [] });
    writeJson(path.join(directory, 'RFC-SPLIT-Status.json'), {
      steps: { '0-1': 'pending', '4-1': 'pending', '5-2': 'pending' },
    });
    const report = readiness.verifySplitReadiness({
      packageDir: directory,
      runGate: failingGate('verify-ticket-closure.js', 'TICKET_CLOSURE_ERROR'),
    });
    assert.strictEqual(report.ok, true, JSON.stringify(report.findings));
    assert.strictEqual(report.packages[0].ticketGates, 'SKIPPED_REGENERATION');
  });
});

test('C005: --closure-dry-run reports the ticket state it read', () => {
  withTempDirectory((directory) => {
    makePackage(directory, { contractChain: 'obligation' });
    writeJson(path.join(directory, 'Tickets.json'), { phases: [] });
    writeJson(path.join(directory, 'RFC-SPLIT-Status.json'), {
      steps: { '4-1': 'done', '5-2': 'done' },
    });
    const report = readiness.verifySplitReadiness({
      packageDir: directory,
      runGate: passingGate,
      closureDryRun: true,
    });
    assert.strictEqual(report.packages[0].closureDryRun, 'CURRENT_TICKETS');
  });
});

test('C005: passing both --package and --workspace is AMBIGUOUS_ARGUMENT', () => {
  const report = readiness.verifySplitReadiness({ packageDir: '/tmp/a', workspaceRoot: '/tmp/b' });
  assert.strictEqual(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === 'AMBIGUOUS_ARGUMENT'));
});

test('C005: no package or workspace is a named MISSING_ARGUMENT', () => {
  const report = readiness.verifySplitReadiness({ packageDir: null, workspaceRoot: null });
  assert.strictEqual(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === 'MISSING_ARGUMENT'));
});

test('C005: a workspace without a tree manifest is MISSING_TREE_MANIFEST', () => {
  withTempDirectory((directory) => {
    const report = readiness.verifySplitReadiness({ workspaceRoot: directory, runGate: passingGate });
    assert.strictEqual(report.ok, false);
    assert.ok(report.findings.some((finding) => finding.code === 'MISSING_TREE_MANIFEST'));
  });
});

log('\n===================');
log('Total:  ' + stats.total);
log('Passed: ' + stats.passed);
log('Failed: ' + stats.failed);
log('===================');
process.exit(stats.failed > 0 ? 1 : 0);
