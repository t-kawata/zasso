// [::TICKET::] PX-188: run.mjs CLI negative-path coverage.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-188 --for-spec --no-implementation-order`
// @verifies C001
// @verifies C005

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { stageTreeDecisions, stageTreeDecisionsFrom } from '../helpers/stage-tree-decisions.mjs';

const RUN_SCRIPT = join(process.cwd(), '.claude/scripts/workspacify-tree/run.mjs');
const SPEC = join(process.cwd(), 'tests/workspacify-tree/fixtures/objects-table.md');
const { settlePulseCandidates } = await import('../helpers/settle-pulse.mjs');
const { settleDependencyReviews } = await import('../helpers/settle-dependency-reviews.mjs');
const COMPLETE = join(process.cwd(), 'tests/workspacify-tree/fixtures/decisions-complete.json');

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function runCli(args, cwd = process.cwd()) {
  return spawnSync(process.execPath, [RUN_SCRIPT, ...args], { cwd, encoding: 'utf8' });
}

const SPEC_FILE_TEXT = '# S\n\n## Object Catalog\n\n| object | kind |\n|--------|------|\n| RuleRecord | record |\n';

// [::TICKET::] PX-215 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-215 --for-spec --no-implementation-order`.
test('PX-188 C001 [PX-188 @verifies C001]: unknown subcommand prints usage and exits non-zero', () => {
  const result = runCli(['bogus']);
  assert.notEqual(result.status, 0);
  assert.ok(result.stdout.includes('usage:'));
});

test('PX-188 C001 [PX-188 @verifies C001]: parse and extract require the fixed specification', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-cli-nospec-'));
  const parse = runCli(['parse'], dir);
  assert.notEqual(parse.status, 0);
  assert.match(parse.stdout + parse.stderr, /SYSTEM-DESIGN\.md/);
  const extract = runCli(['extract'], dir);
  assert.notEqual(extract.status, 0);
  assert.match(extract.stdout + extract.stderr, /SYSTEM-DESIGN\.md/);
});

test('PX-188 C001 [PX-188 @verifies C001]: extract prints inventory stats JSON and exits 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-cli-'));
  const specPath = join(dir, 'SYSTEM-DESIGN.md');
  writeFileSync(specPath, SPEC_FILE_TEXT);
  const result = runCli(['extract'], dir);
  assert.equal(result.status, 0);
  const stats = JSON.parse(result.stdout);
  assert.equal(typeof stats.harvested, 'number');
});

test('PX-188 C001 [PX-188 @verifies C001]: gate and finalize refuse an argument and name the document they need', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-cli-'));
  writeFileSync(join(dir, 'SYSTEM-DESIGN.md'), SPEC_FILE_TEXT);
  // The decisions document is derived at the subject, so the working directory has
  // to be a scratch directory: a call that inherited the repository would stage a
  // document into the repository.
  for (const subcommand of ['gate', 'finalize']) {
    const supplied = runCli([subcommand, 'dynamic.md'], dir);
    assert.notEqual(supplied.status, 0);
    assert.match(supplied.stdout + supplied.stderr, /takes no argument/);
  }
  const gateNoDecisions = runCli(['gate'], dir);
  assert.notEqual(gateNoDecisions.status, 0, 'a gate with no staged document cannot pass');
  assert.ok(gateNoDecisions.stdout.includes('DECISIONS.json'), 'and it names the document it looked for');
});

test('PX-188 C002 [PX-188 @verifies C002]: finalize is blocked when an existing manifest records a different source hash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-block-'));
  const specPath = join(dir, 'SYSTEM-DESIGN.md');
  writeFileSync(specPath, '# S\n\n## Object Catalog\n\n| object | kind |\n|--------|------|\n| RuleRecord | record |\n');
  const decisions = {
    workspace: [{ id: 'pkg-rules', name: 'rules', path: 'crates/protocol/rules', layer: 'protocol', kind: 'production-library', responsibilities: ['owns records'], seed_required: true, owns: { objects: ['obj-000001'], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] } }],
    tree: [{ name: 'crates', path: 'crates', kind: 'dir', children: [{ name: 'protocol', path: 'crates/protocol', kind: 'dir', children: [{ name: 'rules', path: 'crates/protocol/rules', kind: 'dir', children: [] }] }] }],
    ownership: [{ objectId: 'obj-000001', packageId: 'pkg-rules' }],
    dependencies: [],
    boundaries: [],
    adapters: { ports: [], databasePolicy: { applicable: false } },
    approvals: [],
    semantic_review: { status: 'APPROVED', statement: 'rules owns the record', approver: 'ai' },
  };
  const settled = settlePulseCandidates({ specPath, decisions: settleDependencyReviews({ decisions }) });
  stageTreeDecisions(dir, settled);
  const first = runCli(['finalize'], dir);
  assert.equal(first.status, 0, first.stdout);
  const manifestPath = join(dir, 'WORKSPACIFY-TREE-MANIFEST.json');
  const original = readFileSync(manifestPath, 'utf8');
  writeFileSync(specPath, '# T\n\n## Object Catalog\n\n| object | kind |\n|--------|------|\n| OtherRecord | record |\n');
  // The same document, staged again: the first finalize published and therefore
  // swept it, and the run under test is the one that meets the existing manifest.
  stageTreeDecisions(dir, settled);
  const second = runCli(['finalize'], dir);
  assert.notEqual(second.status, 0);
  assert.equal(readFileSync(manifestPath, 'utf8'), original, 'existing manifest is preserved');
});

test('PX-188 C001 [PX-188 @verifies C001]: schema-invalid decisions never reach the pipeline', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-cli-'));
  writeFileSync(join(dir, 'SYSTEM-DESIGN.md'), SPEC_FILE_TEXT);
  stageTreeDecisions(dir, { workspace: [{ id: 'pkg-1' }], ownership: [], dependencies: [], approvals: [] });
  const gate = runCli(['gate'], dir);
  assert.notEqual(gate.status, 0);
  assert.ok(gate.stdout.includes('decision schema invalid'));
});

test('PX-188 C001 [PX-188 @verifies C001]: finalize on a non-COMPLETE decision publishes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-cli-'));
  const decisions = JSON.parse(readFileSync(COMPLETE, 'utf8'));
  delete decisions.semantic_review;
  stageTreeDecisions(dir, decisions);
  const result = runCli(['finalize'], dir);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json')), false);
});

test('PX-188 C001 [PX-188 @verifies C001]: finalize with a test-support package emits conformance.test_obligations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-cli-'));
  const specPath = join(dir, 'SYSTEM-DESIGN.md');
  writeFileSync(specPath, '# S\n\n## Object Catalog\n\n| object | kind |\n|--------|------|\n| RuleRecord | record |\n');
  const decisions = {
    workspace: [
      { id: 'pkg-rules', name: 'rules', path: 'crates/protocol/rules', layer: 'protocol', kind: 'production-library', responsibilities: ['owns records'], seed_required: true, owns: { objects: ['obj-000001'], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] } },
      { id: 'pkg-testkit', name: 'testkit', path: 'crates/conformance/testkit', layer: 'conformance', kind: 'test-support', responsibilities: ['conformance sink'], seed_required: true, owns: { objects: [], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] } },
    ],
    tree: [{ name: 'crates', path: 'crates', kind: 'dir', children: [{ name: 'protocol', path: 'crates/protocol', kind: 'dir', children: [{ name: 'rules', path: 'crates/protocol/rules', kind: 'dir', children: [] }] }, { name: 'conformance', path: 'crates/conformance', kind: 'dir', children: [{ name: 'testkit', path: 'crates/conformance/testkit', kind: 'dir', children: [] }] }] }],
    ownership: [{ objectId: 'obj-000001', packageId: 'pkg-rules' }],
    dependencies: [{ from: 'pkg-rules', to: 'pkg-testkit', kind: 'forbidden', reasonCode: 'forbidden-layer', reason: 'protocol must not reach conformance directly', alternative: 'port-injection' }],
    boundaries: [],
    adapters: { ports: [], databasePolicy: { applicable: false } },
    approvals: [],
    semantic_review: { status: 'APPROVED', statement: 'rules owns the record; testkit is the conformance sink', approver: 'ai' },
  };
  stageTreeDecisions(dir, settlePulseCandidates({ specPath, decisions: settleDependencyReviews({ decisions }) }));
  const result = runCli(['finalize'], dir);
  assert.equal(result.status, 0, result.stdout);
  const manifest = JSON.parse(readFileSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
  assert.ok(manifest.conformance.test_obligations.some((entry) => entry.package === 'pkg-testkit'));
  assert.equal(manifest.dependencies.forbidden_edges.length, 1);
});

test('PX-188 C005 [PX-188 @verifies C005]: run.mjs CLI exit codes stay deterministic after any dead-branch cleanup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-cli-'));
  const specPath = join(dir, 'SYSTEM-DESIGN.md');
  writeFileSync(specPath, SPEC_FILE_TEXT);
  assert.equal(runCli(['parse'], dir).status, 0);
  assert.equal(runCli(['extract'], dir).status, 0);
  assert.notEqual(runCli(['bogus']).status, 0);
});
