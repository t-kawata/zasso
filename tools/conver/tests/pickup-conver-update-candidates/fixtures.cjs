'use strict';

/**
 * Shared fixtures for the pickup-conver-update-candidates test surface.
 *
 * Every test builds its own temporary git repository, so no test depends on the
 * repository it lives in and no test writes outside os.tmpdir().
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

/** The conver development package that owns this test surface. */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** A git identity that cannot leak from the machine running the tests. */
const GIT_IDENTITY = ['-c', 'user.name=PX-457', '-c', 'user.email=px457@example.test'];

/** Create an empty temporary directory. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function makeRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'px457-'));
}

/** Run git in a directory with a fixed identity. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function git(cwd, ...args) {
  return execFileSync('git', [...GIT_IDENTITY, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Create a repository with one commit and no upstream branch. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function initRepoWithoutUpstream() {
  const workspace = makeRepo();
  git(workspace, 'init', '-q');
  fs.mkdirSync(path.join(workspace, '.claude', 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.claude', 'scripts', 'sample.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(workspace, 'README.md'), '# fixture\n');
  git(workspace, 'add', '.');
  git(workspace, 'commit', '-qm', 'seed');
  return workspace;
}

/** Create a repository whose branch tracks a local bare origin. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function initRepoWithUpstream() {
  const workspace = initRepoWithoutUpstream();
  const remote = makeRepo();
  git(remote, 'init', '--bare', '-q');
  git(workspace, 'remote', 'add', 'origin', remote);
  git(workspace, 'push', '-q', '-u', 'origin', 'HEAD');
  return { workspace, remote };
}

/** A schema-valid candidate; overrides replace top-level fields. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function baseCandidate(overrides = {}) {
  return {
    location: {
      file: '.claude/scripts/sample.js',
      hunkHeader: '@@ -1 +1 @@',
      lineStart: 1,
      lineEnd: 1,
    },
    changeType: 'modified',
    primaryCriterion: 'safety',
    secondaryCriteria: [],
    generalization: 'direct',
    adaptationPlan: null,
    symptom: 'A local gate continues when the upstream ref is unset.',
    remedy: 'Fail closed with a named error instead of guessing a baseline.',
    scope: 'Applies to every conver-installed project that has an upstream branch.',
    risk: 'Projects without an upstream now stop before scanning instead of continuing.',
    verification: 'Unit test asserts ERROR:upstream-not-configured and no ledger write.',
    impact: 'high',
    confidence: 'high',
    riskLevel: 'low',
    evidence: {
      upstreamRef: 'origin/main',
      upstreamCommit: 'abc123',
      diffStat: '1 file changed',
      patch: '@@ -1 +1 @@\n-module.exports = 1;\n+module.exports = 2;',
      extractCommand: 'git diff @{u} -- .claude/scripts/sample.js',
      observedAt: '2026-11-27T00:00:00.000Z',
    },
    status: 'candidate',
    note: '',
    ...overrides,
  };
}

/** Build a deterministic list of distinct candidates for rendering tests. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function makeCandidates(count) {
  const candidates = [];
  for (let index = 1; index <= count; index += 1) {
    const id = 'CUC-' + String(index).padStart(4, '0');
    candidates.push(baseCandidate({
      id,
      primaryCriterion: index % 2 === 0 ? 'safety' : 'correctness',
      impact: index % 3 === 0 ? 'low' : 'high',
      evidence: {
        ...baseCandidate().evidence,
        patch: '@@ -1 +1 @@\n-old' + index + '\n+new' + index,
      },
    }));
  }
  return candidates;
}

module.exports = {
  REPO_ROOT,
  makeRepo,
  git,
  initRepoWithoutUpstream,
  initRepoWithUpstream,
  baseCandidate,
  makeCandidates,
};
