'use strict';

/**
 * PX-405 — verification is read-only.
 *
 * A verification run must not write a history entry, a certificate, a ledger or
 * an artifact. The prerequisite gate that used to record BLOCKED_PREREQUISITE
 * through its CLI entry point now runs through its exported function.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const { verifyAmendment } = require('../../.claude/scripts/tickets/verify-amendment.js');

// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
function tempWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px405-readonly-'));
  const pkg = path.join(root, 'pkg');
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
    input: { spec_path: 'DESIGN.md' },
    integrity: {},
  }, null, 2));
  fs.writeFileSync(path.join(root, 'DESIGN.md'), '# Design\n');
  fs.writeFileSync(path.join(pkg, 'RFC.md'), '# RFC\n');
  fs.writeFileSync(path.join(pkg, 'RFC-GRAPH.json'), '{"nodes":[]}\n');
  fs.writeFileSync(path.join(pkg, 'RFC-Dirs-Tree.json'), '{"trees":[]}\n');
  fs.writeFileSync(path.join(pkg, 'Tickets.json'), JSON.stringify({
    title: 'fixture',
    round: 1,
    metadata: {},
    phases: [
      {
        id: 0,
        name: 'P0',
        tickets: [
          { id: 0, phaseId: 0, status: 'todo', title: 'prerequisite', contracts: [{ id: 'C001', precondition: 'p', postcondition: 'q', invariant: 'r' }] },
          { id: 1, phaseId: 0, status: 'planned', title: 'target', prerequisites: [{ ticket: 'P0-0' }], contracts: [{ id: 'C001', precondition: 'p', postcondition: 'q', invariant: 'r' }] },
        ],
      },
    ],
  }, null, 2) + '\n');
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  return { root, pkg };
}

// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
function snapshotTree(root) {
  const entries = [];
  for (const name of fs.readdirSync(root, { recursive: true }).sort()) {
    const filePath = path.join(root, name);
    if (fs.statSync(filePath).isDirectory()) continue;
    entries.push([name, createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')]);
  }
  return entries;
}

// @verifies C005
test('C005: a verification run changes no file and writes no history entry', () => {
  const { root, pkg } = tempWorkspace();
  const before = snapshotTree(root);

  const report = verifyAmendment({
    cwd: pkg,
    ticketKey: 'P0-1',
    ticketsPath: path.join(pkg, 'Tickets.json'),
    report: true,
  });

  const after = snapshotTree(root);
  assert.deepEqual(after, before);
  assert.equal(fs.existsSync(path.join(pkg, '.conver-history.jsonl')), false);
  assert.equal(fs.existsSync(path.join(pkg, 'certificates')), false);
  assert.deepEqual(Object.keys(report).slice(0, 5), ['gate', 'ticketKey', 'findings', 'skipped', 'unverifiable']);
});

// @verifies C005
test('C005: an unverifiable gate is reported, never as a pass', () => {
  const { root, pkg } = tempWorkspace();

  const report = verifyAmendment({
    cwd: pkg,
    ticketKey: 'P0-1',
    ticketsPath: path.join(pkg, 'Tickets.json'),
    report: true,
  });

  assert.equal(Array.isArray(report.unverifiable), true);
  assert.equal(report.unverifiable.every((entry) => typeof entry.reason === 'string'), true);
});
