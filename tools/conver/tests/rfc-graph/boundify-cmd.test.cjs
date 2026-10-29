// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
// PX-314 @verifies C002, C005
// The command documents are part of the mechanical chain: the preflight stage and the
// package view must be on the command line, or the script cannot scope what it checks.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..', '..', '.claude', 'commands');

// [::TICKET::] PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-314 --for-spec --no-implementation-order`.
test('C005 boundify Step 0 runs the preflight stage and Step 2 keeps the dirs check', () => {
  const content = readFileSync(join(ROOT, 'boundify-graph.md'), 'utf8');
  assert.match(content, /verify-chain\.mjs"? --stage=boundify --preflight/);
  assert.match(content, /verify-chain\.mjs"? --stage=boundify --package=/);
});

test('C002 graphify passes the package view to verify-graph-contracts', () => {
  const content = readFileSync(join(ROOT, 'graphify-rfc.md'), 'utf8');
  assert.match(content, /verify-graph-contracts\.js"? --graph="\$graphPath" --registry="\$registryPath" --view="\$viewPath"/);
});

// ============================================================
// PX-339: the documented preflight resolves the graph's home-relative source
// ============================================================

const COMMAND_PATH = join(ROOT, 'boundify-graph.md');

/** The Preflight bash block, extracted from the command document. */
// [::TICKET::] PX-339 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-339 --for-spec --no-implementation-order`.
function readPreflightBlock() {
  const command = readFileSync(COMMAND_PATH, 'utf8');
  const match = command.match(/Preflight[^\n]*\n\n\x60\x60\x60bash\n([\s\S]*?)\x60\x60\x60/);
  assert.ok(match, 'the Preflight bash block must exist');
  return match[1];
}

/** Run the documented preflight with a controlled HOME and package directory. */
// [::TICKET::] PX-339 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-339 --for-spec --no-implementation-order`.
function runPreflight(home, packageDir) {
  return spawnSync('bash', ['-c', readPreflightBlock()], {
    cwd: packageDir,
    env: Object.assign({}, process.env, { HOME: home, ARGUMENTS: '' }),
    encoding: 'utf8',
  });
}

test('C003 the preflight accepts a home-relative sourceFile and rejects an empty or missing one', () => {
  const root = mkdtempSync(join(os.tmpdir(), 'px339-preflight-'));
  try {
    const home = join(root, 'home');
    const pkg = join(home, 'pkg');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'RFC.md'), '# RFC\n', 'utf8');

    const graphPath = join(pkg, 'RFC-GRAPH.json');
    writeFileSync(graphPath, JSON.stringify({ sourceFile: '~/pkg/RFC.md', nodes: [], edges: [] }), 'utf8');
    const ok = runPreflight(home, pkg);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.doesNotMatch(ok.stderr, /MISSING_SOURCE/);

    writeFileSync(graphPath, JSON.stringify({ sourceFile: '', nodes: [], edges: [] }), 'utf8');
    const empty = runPreflight(home, pkg);
    assert.equal(empty.status, 1);
    assert.match(empty.stdout + empty.stderr, /MISSING_SOURCE/);

    writeFileSync(graphPath, JSON.stringify({ sourceFile: '~/pkg/MISSING.md', nodes: [], edges: [] }), 'utf8');
    const missing = runPreflight(home, pkg);
    assert.equal(missing.status, 1);
    assert.match(missing.stdout + missing.stderr, /MISSING_SOURCE/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C003 the graphify sourceFile example matches the home-relative form crud.js writes', () => {
  const graphify = readFileSync(join(ROOT, 'graphify-rfc.md'), 'utf8');
  assert.match(graphify, /sourceFile.*~\/pkg\/RFC\.md/);
  assert.doesNotMatch(graphify, /sourceFile.*"RFC\.md"/);
  assert.match(graphify, /home-relative/);
});
