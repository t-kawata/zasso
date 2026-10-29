'use strict';

/**
 * repo-root helper — the single anchor for every .claude script reference.
 *
 * The helper is the one place that answers "where is the .claude directory for the
 * repository I am standing in". Every writer and every child-process call reads its
 * answer, so these cases pin the four ends that matter: a nested cwd, a repository
 * outside $HOME, a missing .claude, and a cwd that is not a git work tree at all.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HELPER = path.resolve(__dirname, '../../.claude/scripts/utils/repo-root.cjs');
const {
  ERROR_CODES,
  getRepoRoot,
  getClaudeDir,
  toDisplayPath,
  resolveProjectClaudeDir,
  quoteShell,
  buildAnchoredCommand,
} = require(HELPER);

/** A throwaway git repository with a .claude directory and a nested working directory. */
// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
function makeRepository({ withClaude = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-root-'));
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  if (withClaude) fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  const nested = path.join(root, 'crates', 'app', 'src');
  fs.mkdirSync(nested, { recursive: true });
  return { root: fs.realpathSync(root), nested };
}

describe('repo-root helper', () => {
  const repositories = [];

  before(() => {
    repositories.push(makeRepository());
    repositories.push(makeRepository({ withClaude: false }));
  });

  after(() => {
    for (const repository of repositories) fs.rmSync(repository.root, { recursive: true, force: true });
  });

  it('returns the absolute git top level from a nested directory', () => {
    const { root, nested } = repositories[0];
    assert.strictEqual(getRepoRoot(nested), root);
    assert.strictEqual(getClaudeDir(nested), path.join(root, '.claude'));
  });

  it('names a missing root .claude instead of returning a path that does not exist', () => {
    const { nested } = repositories[1];
    assert.throws(
      () => getClaudeDir(nested),
      (error) => error.code === ERROR_CODES.NO_ROOT_CLAUDE,
    );
  });

  it('names a non-git cwd instead of falling back to cwd/.claude', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-root-outside-'));
    try {
      assert.throws(() => getRepoRoot(outside), (error) => error.code === ERROR_CODES.NO_GIT_ROOT);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('returns the documented fallback outside a git work tree', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-root-fallback-'));
    try {
      const fallback = path.join(outside, 'plugin');
      fs.mkdirSync(fallback, { recursive: true });
      assert.strictEqual(resolveProjectClaudeDir({ cwd: outside, fallbackDir: fallback }), fallback);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('renders ~ for a home path and leaves a path outside home absolute', () => {
    assert.strictEqual(toDisplayPath(path.join(os.homedir(), 'work', 'repo')), '~/work/repo');
    assert.strictEqual(toDisplayPath(os.homedir()), '~');
    assert.strictEqual(toDisplayPath('/opt/repo'), '/opt/repo');
  });

  it('quotes a home path containing spaces so $HOME still expands', () => {
    assert.strictEqual(quoteShell('~/repo/.claude/scripts/x.js'), '~/repo/.claude/scripts/x.js');
    assert.strictEqual(
      quoteShell('~/my repo/.claude/scripts/x.js'),
      '"$HOME/my repo/.claude/scripts/x.js"',
    );
    assert.strictEqual(quoteShell('/opt/my repo/x.js'), '"/opt/my repo/x.js"');
  });

  it('builds a subshell command that changes to the graph directory and runs the anchored script', () => {
    const command = buildAnchoredCommand({
      cwdDisplay: '~/repo/crates/app',
      claudeDirDisplay: '~/repo/.claude',
      script: 'rfc-graph/show-node-contracts.mjs',
      args: ['--id=N0047'],
    });
    assert.strictEqual(
      command,
      '(cd ~/repo/crates/app && node ~/repo/.claude/scripts/rfc-graph/show-node-contracts.mjs --id=N0047)',
    );
  });

  it('prints one path from the CLI: root by default, .claude with --claude', () => {
    const { root, nested } = repositories[0];
    const rootRun = spawnSync(process.execPath, [HELPER], { cwd: nested, encoding: 'utf8' });
    assert.strictEqual(rootRun.status, 0);
    assert.strictEqual(rootRun.stdout.trim(), toDisplayPath(root));

    const claudeRun = spawnSync(process.execPath, [HELPER, '--claude'], { cwd: nested, encoding: 'utf8' });
    assert.strictEqual(claudeRun.status, 0);
    assert.strictEqual(claudeRun.stdout.trim(), toDisplayPath(path.join(root, '.claude')));

    const homeRun = spawnSync(process.execPath, [HELPER, '--home'], { cwd: nested, encoding: 'utf8' });
    assert.strictEqual(homeRun.status, 0);
    assert.strictEqual(homeRun.stdout.trim(), toDisplayPath(root));
  });

  it('exits non-zero with a named error outside a git work tree', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-root-cli-'));
    try {
      const run = spawnSync(process.execPath, [HELPER, '--claude'], { cwd: outside, encoding: 'utf8' });
      assert.strictEqual(run.status, 1);
      assert.match(run.stderr, /NO_GIT_ROOT/);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
