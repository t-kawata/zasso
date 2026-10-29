// PX-341 @verifies C002
//
// The defect this ticket exists for, reproduced as a fixture. A graph package is nested
// under the git root; the generated header must name a script path that runs from /tmp,
// from the package and from the file's own directory. The old form (cd ../.. && node
// .claude/...) is run on the same fixture and must fail, so the test proves the failure
// and the fix rather than only the fix.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { resolveHeaderPaths, generateHeaderComment } = require(
  join(PROJECT_ROOT, '.claude/scripts/rfc-graph/boundify-helpers.js'),
);
const { toDisplayPath } = require(join(PROJECT_ROOT, '.claude/scripts/utils/repo-root.cjs'));

// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
function makeNestedRepository() {
  const repo = mkdtempSync(join(tmpdir(), 'px341-header-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  const claudeScript = join(repo, '.claude', 'scripts', 'rfc-graph', 'show-node-contracts.mjs');
  mkdirSync(dirname(claudeScript), { recursive: true });
  writeFileSync(claudeScript, 'process.exit(0);\n', 'utf8');
  const graphDir = join(repo, 'crates', 'app');
  const fileDir = join(graphDir, 'src', 'api');
  mkdirSync(fileDir, { recursive: true });
  writeFileSync(join(graphDir, 'RFC-GRAPH.json'), '{"nodes":[],"edges":[]}\n', 'utf8');
  writeFileSync(join(graphDir, 'SEQUENCES.json'), '{}\n', 'utf8');
  writeFileSync(join(graphDir, 'RFC-STEP-CONTRACTS.json'), '{}\n', 'utf8');
  return { repo: join(repo, ''), graphDir, fileDir, filePath: join(fileDir, 'h.rs') };
}

// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
function emittedCommand(header) {
  const line = header.split('\n').find((candidate) => candidate.includes('show-node-contracts.mjs --id=N0047'));
  assert.ok(line, `header does not carry the node command:\n${header}`);
  const match = line.match(/\(cd .*?show-node-contracts\.mjs --id=N0047\)/);
  assert.ok(match, `header command is not a closed subshell: ${line}`);
  return match[0];
}

test('C002 invariant: a nested graph package emits a header command that runs from any cwd', () => {
  const fixture = makeNestedRepository();
  try {
    const headerPaths = resolveHeaderPaths(fixture.filePath, fixture.graphDir, {
      graphDirDisplay: toDisplayPath(fixture.graphDir),
      claudeDirDisplay: toDisplayPath(join(fixture.repo, '.claude')),
    });
    const header = generateHeaderComment(headerPaths, [{ nodeId: 'N0047', title: 'Pinned handle' }], [], 'rust');
    const command = emittedCommand(header);

    assert.doesNotMatch(command, /node \.claude\//, 'the script path must be anchored, not cwd-relative');

    for (const cwd of ['/tmp', fixture.graphDir, fixture.fileDir]) {
      const run = spawnSync('/bin/sh', ['-c', command], { cwd, encoding: 'utf8' });
      assert.strictEqual(run.status, 0, `command failed from ${cwd}: ${run.stderr}`);
    }
  } finally {
    rmSync(fixture.repo, { recursive: true, force: true });
  }
});

test('C002 invariant: the old relative form fails on the same fixture', () => {
  const fixture = makeNestedRepository();
  try {
    const oldCommand = '(cd ../.. && node .claude/scripts/rfc-graph/show-node-contracts.mjs --id=N0047)';
    const run = spawnSync('/bin/sh', ['-c', oldCommand], { cwd: fixture.fileDir, encoding: 'utf8' });
    assert.notStrictEqual(run.status, 0, 'the old form must fail when the package is not the git root');
  } finally {
    rmSync(fixture.repo, { recursive: true, force: true });
  }
});
