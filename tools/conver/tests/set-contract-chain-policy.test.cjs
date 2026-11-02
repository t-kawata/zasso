#!/usr/bin/env node
/**
 * set-contract-chain-policy.test.cjs — Gate for PX-346 C004.
 *
 * The migration is the only sanctioned writer of the graph policy. It preserves every
 * other field, is idempotent, and refuses to replace an explicit different value
 * without --force.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const policyModule = require('../.claude/scripts/rfc-graph/set-contract-chain-policy.js');

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
function makeGraph(extra) {
  return Object.assign({ sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [] }, extra || {});
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function writeGraph(directory, name, value) {
  const graphPath = path.join(directory, name + '-GRAPH.json');
  fs.writeFileSync(graphPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
  return graphPath;
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function stripPolicy(value) {
  return JSON.stringify(Object.assign({}, value, { contractChain: undefined }));
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function withTempDirectory(fn) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px346-policy-'));
  try {
    fn(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

log('\n--- set-contract-chain-policy tests ---\n');

test('C004: adds contractChain and preserves every other field', () => {
  withTempDirectory((directory) => {
    const graphPath = writeGraph(directory, 'RFC', makeGraph());
    const before = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    const result = policyModule.setContractChainPolicy({ graphPath, policy: 'obligation' });
    const after = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    assert.strictEqual(result.changed, true);
    assert.strictEqual(after.contractChain, 'obligation');
    assert.strictEqual(stripPolicy(after), stripPolicy(before));
  });
});

test('C004: a second run is an idempotent no-op', () => {
  withTempDirectory((directory) => {
    const graphPath = writeGraph(directory, 'RFC', makeGraph());
    policyModule.setContractChainPolicy({ graphPath, policy: 'obligation' });
    const once = fs.readFileSync(graphPath, 'utf8');
    const second = policyModule.setContractChainPolicy({ graphPath, policy: 'obligation' });
    assert.strictEqual(second.changed, false);
    assert.strictEqual(fs.readFileSync(graphPath, 'utf8'), once);
  });
});

test('C004: an existing different value is refused without --force', () => {
  withTempDirectory((directory) => {
    const graphPath = writeGraph(directory, 'RFC', makeGraph({ contractChain: 'obligation' }));
    assert.throws(
      () => policyModule.setContractChainPolicy({ graphPath, policy: 'transition' }),
      (error) => error.code === 'POLICY_CONFLICT',
    );
    assert.strictEqual(JSON.parse(fs.readFileSync(graphPath, 'utf8')).contractChain, 'obligation');
  });
});

test('C004: --force replaces an existing different value', () => {
  withTempDirectory((directory) => {
    const graphPath = writeGraph(directory, 'RFC', makeGraph({ contractChain: 'obligation' }));
    const result = policyModule.setContractChainPolicy({ graphPath, policy: 'transition', force: true });
    assert.strictEqual(result.changed, true);
    assert.strictEqual(JSON.parse(fs.readFileSync(graphPath, 'utf8')).contractChain, 'transition');
  });
});

test('C004: --check reports the change without writing', () => {
  withTempDirectory((directory) => {
    const graphPath = writeGraph(directory, 'RFC', makeGraph());
    const original = fs.readFileSync(graphPath, 'utf8');
    const result = policyModule.setContractChainPolicy({ graphPath, policy: 'obligation', check: true });
    assert.strictEqual(result.changed, true);
    assert.strictEqual(fs.readFileSync(graphPath, 'utf8'), original);
  });
});

test('C004: a workspace run updates every package graph', () => {
  withTempDirectory((directory) => {
    const packageA = path.join(directory, 'pkg-a');
    const packageB = path.join(directory, 'pkg-b');
    fs.mkdirSync(packageA);
    fs.mkdirSync(packageB);
    writeGraph(packageA, 'RFC', makeGraph());
    writeGraph(packageB, 'RFC', makeGraph({ contractChain: 'transition' }));
    fs.writeFileSync(path.join(directory, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
      workspace: { packages: [{ id: 'pkg-a', path: 'pkg-a' }, { id: 'pkg-b', path: 'pkg-b' }] },
    }), 'utf8');
    const result = policyModule.setContractChainPolicyForWorkspace({
      workspaceRoot: directory,
      policy: 'obligation',
      force: true,
    });
    assert.strictEqual(result.packages.length, 2);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(packageA, 'RFC-GRAPH.json'), 'utf8')).contractChain, 'obligation');
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(packageB, 'RFC-GRAPH.json'), 'utf8')).contractChain, 'obligation');
  });
});

test('C004: a workspace conflict leaves every graph unchanged', () => {
  withTempDirectory((directory) => {
    const packageA = path.join(directory, 'pkg-a');
    const packageB = path.join(directory, 'pkg-b');
    fs.mkdirSync(packageA);
    fs.mkdirSync(packageB);
    writeGraph(packageA, 'RFC', makeGraph());
    writeGraph(packageB, 'RFC', makeGraph({ contractChain: 'transition' }));
    fs.writeFileSync(path.join(directory, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
      workspace: { packages: [{ id: 'pkg-a', path: 'pkg-a' }, { id: 'pkg-b', path: 'pkg-b' }] },
    }), 'utf8');
    assert.throws(
      () => policyModule.setContractChainPolicyForWorkspace({ workspaceRoot: directory, policy: 'obligation' }),
      (error) => error.code === 'POLICY_CONFLICT',
    );
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(packageA, 'RFC-GRAPH.json'), 'utf8')).contractChain, undefined);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(packageB, 'RFC-GRAPH.json'), 'utf8')).contractChain, 'transition');
  });
});

log('\n===================');
log('Total:  ' + stats.total);
log('Passed: ' + stats.passed);
log('Failed: ' + stats.failed);
log('===================');
process.exit(stats.failed > 0 ? 1 : 0);
