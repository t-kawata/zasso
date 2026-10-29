// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
// Red tests for the canonical path default and the argument-free commands.
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPTS = path.join(ROOT, '.claude/scripts');
const BOUNDIFY_TO_DIRS = path.join(SCRIPTS, 'rfc-graph/boundify-graph-to-dirs.js');
const BOUNDIFY_STATUS = path.join(SCRIPTS, 'rfc-graph/update-boundify-step-status.js');
const ANALYZE_SOURCE = path.join(SCRIPTS, 'rfc-graph/analyze-source-structure.js');
const SHOW_DIRS = path.join(SCRIPTS, 'rfc-graph/show-dirs-files-tree.js');
const WRITE_PHASE = path.join(SCRIPTS, 'rfc-graph/write-phase-name-summary.js');

/** The resolver functions this ticket adds. */
const {
  resolveGraphPath,
  resolveDirsTreePath,
  resolveTicketsPath,
  resolveStageStatusPath,
  resolveSourcePath,
} = require(path.join(SCRIPTS, 'lib/package-artifacts.js'));

const MINIMAL_GRAPH = Object.freeze({
  sourceFile: 'RFC.md',
  mainLanguage: 'typescript',
  nodes: [],
  edges: [],
});

const MINIMAL_DIRS_TREE = Object.freeze({
  schemaVersion: '1.0',
  sourceGraph: 'RFC-GRAPH.json',
  sourceFile: 'RFC.md',
  trees: { typescript: null },
  dependencyDirections: { typescript: [] },
  warnings: [],
});

const MINIMAL_TICKETS = Object.freeze({
  title: 'Fixture',
  metadata: { source: 'RFC.md', generatedAt: '2026-10-28' },
  phases: [{ id: 0, name: 'P0', tickets: [] }],
});

/** Create a canonical package directory for the tests. */
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
function makeCanonicalPackage() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px334-package-'));
  fs.writeFileSync(path.join(cwd, 'RFC.md'), '# Fixture RFC\n\n## Purpose\n\nThe fixture proves the canonical default.\n');
  fs.writeFileSync(path.join(cwd, 'RFC-GRAPH.json'), JSON.stringify(MINIMAL_GRAPH, null, 2));
  fs.writeFileSync(path.join(cwd, 'RFC-GRAPH.json.bak'), JSON.stringify(MINIMAL_GRAPH, null, 2));
  fs.writeFileSync(path.join(cwd, 'RFC-Dirs-Tree.json'), JSON.stringify(MINIMAL_DIRS_TREE, null, 2));
  fs.writeFileSync(path.join(cwd, 'Tickets.json'), JSON.stringify(MINIMAL_TICKETS, null, 2));
  return cwd;
}

// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
function run(script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd,
    input: options.input,
    env: options.env,
    encoding: 'utf8',
  });
}

test('C001 resolver derives the canonical graph, tree, ledger and status', () => {
  const cwd = makeCanonicalPackage();
  assert.equal(resolveGraphPath({ cwd }), path.join(cwd, 'RFC-GRAPH.json'));
  assert.equal(resolveDirsTreePath({ cwd }), path.join(cwd, 'RFC-Dirs-Tree.json'));
  assert.equal(resolveTicketsPath({ cwd }), path.join(cwd, 'Tickets.json'));
  assert.equal(resolveStageStatusPath('boundify', { cwd }), path.join(cwd, 'RFC-BOUNDIFY-Status.json'));
  assert.equal(resolveStageStatusPath('split', { cwd }), path.join(cwd, 'RFC-SPLIT-Status.json'));
  assert.equal(resolveSourcePath({ cwd }), path.join(cwd, 'RFC.md'));
});

test('C001 resolver accepts a single legacy graph and refuses two candidates', () => {
  const legacy = fs.mkdtempSync(path.join(os.tmpdir(), 'px334-legacy-'));
  fs.writeFileSync(path.join(legacy, 'RFC-ROOT-GRAPH.json'), '{}');
  fs.writeFileSync(path.join(legacy, 'RFC-ROOT-Dirs-Tree.json'), '{}');
  assert.equal(resolveGraphPath({ cwd: legacy }), path.join(legacy, 'RFC-ROOT-GRAPH.json'));
  assert.equal(resolveDirsTreePath({ cwd: legacy }), path.join(legacy, 'RFC-ROOT-Dirs-Tree.json'));

  const ambiguous = fs.mkdtempSync(path.join(os.tmpdir(), 'px334-ambiguous-'));
  fs.writeFileSync(path.join(ambiguous, 'A-GRAPH.json'), '{}');
  fs.writeFileSync(path.join(ambiguous, 'B-GRAPH.json'), '{}');
  assert.throws(() => resolveGraphPath({ cwd: ambiguous }), (error) => error.code === 'AMBIGUOUS_GRAPH');

  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'px334-empty-'));
  assert.throws(() => resolveGraphPath({ cwd: empty }), (error) => error.code === 'MISSING_GRAPH');
});

test('C001 resolver never walks to a parent and an explicit override wins', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'px334-parent-'));
  const child = path.join(parent, 'child');
  fs.mkdirSync(child);
  fs.writeFileSync(path.join(parent, 'RFC-GRAPH.json'), '{}');
  assert.throws(() => resolveGraphPath({ cwd: child }), (error) => error.code === 'MISSING_GRAPH');

  const explicit = path.join(parent, 'RFC-GRAPH.json');
  assert.equal(resolveGraphPath({ cwd: child, override: explicit }), explicit);
});

test('C002 boundify command is argument-free', () => {
  const text = fs.readFileSync(path.join(ROOT, '.claude/commands/boundify-graph.md'), 'utf8');
  assert.equal(/^argument-hint:/m.test(text), false);
  assert.match(text, /^# \/boundify-graph$/m);
  assert.match(text, /graphPath="RFC-GRAPH\.json"/);
  assert.match(text, /MISSING_GRAPH/);
  assert.match(text, /UNEXPECTED_ARGUMENT/);
  assert.equal(/--graph="\$graphPath"/.test(text), false);
});

test('C003 split command is argument-free', () => {
  const text = fs.readFileSync(path.join(ROOT, '.claude/commands/split-to-tickets.md'), 'utf8');
  assert.equal(/^argument-hint:/m.test(text), false);
  assert.match(text, /^# \/split-to-tickets$/m);
  assert.match(text, /DOC_PATH="RFC\.md"/);
  assert.match(text, /MISSING_RFC/);
  assert.match(text, /UNEXPECTED_ARGUMENT/);
  assert.equal(/--tickets="\$TICKETS_PATH"/.test(text), false);
});

test('C004 a representative script runs bare and logs the resolved path', () => {
  const cwd = makeCanonicalPackage();
  const result = run(BOUNDIFY_TO_DIRS, ['--dry-run'], { cwd });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /resolved graph: .*RFC-GRAPH\.json/);
});

test('C004 the step-status script resolves its canonical status file', () => {
  const cwd = makeCanonicalPackage();
  const result = run(BOUNDIFY_STATUS, ['start-step', '0'], { cwd });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(cwd, 'RFC-BOUNDIFY-Status.json')), true);
});

test('C004 source and tree scripts run bare', () => {
  const cwd = makeCanonicalPackage();
  const analyzed = run(ANALYZE_SOURCE, [], { cwd });
  assert.equal(analyzed.status, 0, analyzed.stderr);
  const shown = run(SHOW_DIRS, [], { cwd });
  assert.equal(shown.status, 0, shown.stderr);
});

test('C004 write-phase-name-summary accepts the bare phase and the legacy form', () => {
  const cwd = makeCanonicalPackage();
  const bare = run(WRITE_PHASE, ['P0'], {
    cwd,
    input: JSON.stringify({ name: 'Foundation', summary: 'The first phase.' }),
  });
  assert.equal(bare.status, 0, bare.stderr);
  const legacy = run(WRITE_PHASE, ['Tickets.json', 'P0'], {
    cwd,
    input: JSON.stringify({ name: 'Foundation', summary: 'The first phase.' }),
  });
  assert.equal(legacy.status, 0, legacy.stderr);
});

test('C004 add-tickets-for-phase parses the bare phase and the legacy form', () => {
  const { parseCliArguments } = require(path.join(SCRIPTS, 'tickets/add-tickets-for-phase.js'));
  const cwd = makeCanonicalPackage();
  const bare = parseCliArguments(['node', 'script', 'P0'], { cwd });
  assert.equal(bare.error, null);
  assert.equal(bare.phaseArg, 'P0');
  assert.equal(bare.ticketsJsonPath, path.join(cwd, 'Tickets.json'));

  const legacy = parseCliArguments(['node', 'script', 'Tickets.json', 'P0'], { cwd });
  assert.equal(legacy.error, null);
  assert.equal(legacy.phaseArg, 'P0');
  assert.equal(legacy.ticketsJsonPath, path.join(cwd, 'Tickets.json'));
});

test('C004 consolidate-phase-tickets defaults the ledger and status', () => {
  const { parseCliArgs } = require(path.join(SCRIPTS, 'tickets/consolidate-phase-tickets.js'));
  const cwd = makeCanonicalPackage();
  const parsed = parseCliArgs([], { cwd });
  assert.equal(parsed.error, null);
  assert.equal(parsed.ticketsPath, path.join(cwd, 'Tickets.json'));
  assert.equal(parsed.statusPath, path.join(cwd, 'RFC-SPLIT-Status.json'));
});

test('C005 backup and cleanup expand a home-relative graph file', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'px334-home-'));
  const cwd = path.join(home, 'package');
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(path.join(cwd, 'RFC.md'), '# RFC\n');
  fs.writeFileSync(path.join(cwd, 'RFC-GRAPH.json'), JSON.stringify(MINIMAL_GRAPH));
  const env = { ...process.env, HOME: home };

  const begin = run(BOUNDIFY_STATUS, ['--status=RFC-BOUNDIFY-Status.json', 'begin-run', '--run-id=t'], { cwd, env });
  assert.equal(begin.status, 0, begin.stderr);
  const backup = run(BOUNDIFY_STATUS, ['--status=RFC-BOUNDIFY-Status.json', 'backup'], { cwd, env });
  assert.equal(backup.status, 0, backup.stderr);
  assert.equal(fs.existsSync(path.join(cwd, 'RFC-GRAPH.json.bak')), true);
  const cleanup = run(BOUNDIFY_STATUS, ['--status=RFC-BOUNDIFY-Status.json', 'cleanup'], { cwd, env });
  assert.equal(cleanup.status, 0, cleanup.stderr);
  assert.equal(fs.existsSync(path.join(cwd, 'RFC-GRAPH.json.bak')), false);
});
