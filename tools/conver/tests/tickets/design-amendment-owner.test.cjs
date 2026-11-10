'use strict';

/**
 * PX-405 — owner safety and rollback coverage.
 *
 * A derived artifact is written only through its owner. Every declared owner
 * output is snapshotted before the owner runs, so a failed gate or a dry-run
 * restores modified files and removes files the owner created.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runAmendment } = require('../../.claude/scripts/tickets/design-amendment.js');

const BASE_CLAIM = {
  target: { kind: 'clause', id: '§1.1' },
  predicate: 'the clause exists in the design',
  requiredTest: 'UT: clause exists',
  title: 'Missing clause',
  text: 'The clause states the missing constraint.',
};

const CLEAN_RUNNER = () => ({ findings: [], unverifiable: [] });

// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
function failedGate() {
  return { findings: [{ code: 'GATE_FAILED', asset: 'fixture', problem: 'forced failure', fixes: [], rerun: 'rerun' }], unverifiable: [] };
}

// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
function passingThenFailingRunner() {
  let calls = 0;
  return () => {
    calls += 1;
    return calls === 1 ? { findings: [], unverifiable: [] } : failedGate();
  };
}

// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
function tempPackage(files = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px405-owner-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, name), content);
  }
  return directory;
}

const OWNER_OUTPUTS = {
  graphify: ['RFC-GRAPH.json', 'RFC-Dirs-Tree.json'],
};

// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
function writingOwner() {
  return ({ cwd }) => {
    fs.writeFileSync(path.join(cwd, 'RFC-GRAPH.json'), '{"nodes":["new"]}\n');
    fs.writeFileSync(path.join(cwd, 'RFC-Dirs-Tree.json'), '{"trees":["new"]}\n');
    return { ok: true };
  };
}

// @verifies C003
test('C003: a failed gate restores modified owner output and removes a created file', async () => {
  const directory = tempPackage({ 'RFC-GRAPH.json': '{"nodes":[]}\n' });
  const graphPath = path.join(directory, 'RFC-GRAPH.json');
  const before = fs.readFileSync(graphPath);

  const result = await runAmendment({
    cwd: directory,
    ticketKey: 'PX-405',
    artifact: 'graph',
    operation: 'mutate',
    claim: BASE_CLAIM,
    dryRun: false,
    owners: { graphify: writingOwner() },
    ownerOutputs: OWNER_OUTPUTS,
    gateRunner: passingThenFailingRunner(),
  });

  assert.equal(result.outcome, 'rolled-back');
  assert.ok(fs.readFileSync(graphPath).equals(before));
  assert.equal(fs.existsSync(path.join(directory, 'RFC-Dirs-Tree.json')), false);
});

// @verifies C003
test('C003: a dry-run restores every owner output and removes a created file', async () => {
  const directory = tempPackage({ 'RFC-GRAPH.json': '{"nodes":[]}\n' });
  const graphPath = path.join(directory, 'RFC-GRAPH.json');
  const before = fs.readFileSync(graphPath);

  const result = await runAmendment({
    cwd: directory,
    ticketKey: 'PX-405',
    artifact: 'graph',
    operation: 'mutate',
    claim: BASE_CLAIM,
    dryRun: true,
    owners: { graphify: writingOwner() },
    ownerOutputs: OWNER_OUTPUTS,
    gateRunner: CLEAN_RUNNER,
  });

  assert.equal(result.outcome, 'dry-run');
  assert.equal(result.wouldPromote, true);
  assert.ok(fs.readFileSync(graphPath).equals(before));
  assert.equal(fs.existsSync(path.join(directory, 'RFC-Dirs-Tree.json')), false);
});

// @verifies C003
test('C003: a derived artifact without an owner refuses with OWNER_REQUIRED and writes nothing', async () => {
  const directory = tempPackage({ 'RFC-GRAPH.json': '{"nodes":[]}\n' });
  const before = fs.readFileSync(path.join(directory, 'RFC-GRAPH.json'));

  const result = await runAmendment({
    cwd: directory,
    ticketKey: 'PX-405',
    artifact: 'graph',
    operation: 'mutate',
    claim: BASE_CLAIM,
    dryRun: false,
    owners: {},
    gateRunner: CLEAN_RUNNER,
  });

  assert.equal(result.outcome, 'refused');
  assert.equal(result.findings[0].code, 'OWNER_REQUIRED');
  assert.ok(fs.readFileSync(path.join(directory, 'RFC-GRAPH.json')).equals(before));
});

// @verifies C003
test('C003: an owner refusal restores every declared output', async () => {
  const directory = tempPackage({ 'RFC-GRAPH.json': '{"nodes":[]}\n' });
  const before = fs.readFileSync(path.join(directory, 'RFC-GRAPH.json'));

  const result = await runAmendment({
    cwd: directory,
    ticketKey: 'PX-405',
    artifact: 'graph',
    operation: 'mutate',
    claim: BASE_CLAIM,
    dryRun: false,
    owners: {
      graphify: ({ cwd }) => {
        fs.writeFileSync(path.join(cwd, 'RFC-GRAPH.json'), '{"nodes":["failed"]}\n');
        return { ok: false, code: 'OWNER_REFUSED' };
      },
    },
    ownerOutputs: OWNER_OUTPUTS,
    gateRunner: CLEAN_RUNNER,
  });

  assert.equal(result.outcome, 'refused');
  assert.equal(result.findings[0].code, 'OWNER_REFUSED');
  assert.ok(fs.readFileSync(path.join(directory, 'RFC-GRAPH.json')).equals(before));
});
