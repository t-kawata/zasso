'use strict';

/**
 * scan.js — discover local changes under CLAUDE_DIR against the upstream branch.
 *
 * The scan is read-only and path-scoped. `git diff @{u}` covers tracked changes
 * and untracked files are added explicitly, because `git diff` alone would miss
 * a new local script, which is one of the most valuable candidate shapes.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { isInside } = require('./schema.js');

const UPSTREAM_NOT_CONFIGURED = 'ERROR:upstream-not-configured';

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function runGit(workspace, args) {
  return execFileSync('git', ['-C', workspace, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Resolve the upstream ref of the current branch.
 *
 * @returns {{ok:true, ref:string}} | {{ok:false, code:string, cause:string, action:string, verify:string}}
 */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function resolveUpstream(workspace) {
  try {
    const ref = runGit(workspace, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).trim();
    if (!ref) throw new Error('git returned an empty upstream ref');
    return { ok: true, ref };
  } catch (error) {
    return {
      ok: false,
      code: UPSTREAM_NOT_CONFIGURED,
      cause: 'No upstream branch is configured for the current branch: ' + error.message,
      action: `Configure an upstream with git branch --set-upstream-to=<remote>/<branch> and rerun scan --workspace ${workspace}.`,
      verify: 'git rev-parse --abbrev-ref --symbolic-full-name @{u}',
    };
  }
}

/** Extract the first hunk header and its new-file line range. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function parseHunk(diff) {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/m.exec(diff);
  if (!match) return { hunkHeader: '', lineStart: 0, lineEnd: 0 };
  const start = Number(match[3]);
  const count = match[4] === undefined ? 1 : Number(match[4]);
  return { hunkHeader: match[0], lineStart: start, lineEnd: start + Math.max(count, 1) - 1 };
}

/** A unified diff for a file that git does not track yet. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function synthesizeAddedDiff(file, contents) {
  const lines = contents.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return [
    `diff --git a/${file} b/${file}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${file}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => '+' + line),
    '',
  ].join('\n');
}

/** Read git's name-status output into change records. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function parseNameStatus(output) {
  const entries = [];
  for (const line of output.split('\n').filter(Boolean)) {
    const columns = line.split('\t');
    const status = columns[0];
    if (status.startsWith('R') && columns.length >= 3) {
      entries.push({ from: columns[1], file: columns[2], changeType: 'renamed' });
      continue;
    }
    const file = columns[1];
    const changeType = status.startsWith('A')
      ? 'added'
      : status.startsWith('D')
        ? 'deleted'
        : 'modified';
    entries.push({ from: file, file, changeType });
  }
  return entries;
}

/**
 * Scan CLAUDE_DIR against the configured upstream.
 *
 * @param {{workspace:string, claudeDir:string, git?:Function}} options
 * @returns {{ok:true, status:'skipped:no-changes'} | {ok:true, status:'changes', files:object[]} | {ok:false, code:string, cause:string}}
 */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function scanClaudeDir({ workspace, claudeDir, git }) {
  const gitRun = git || ((args) => runGit(workspace, args));
  const upstream = resolveUpstream(workspace);
  if (!upstream.ok) return upstream;

  const claudeRelative = path.relative(workspace, claudeDir) || '.';
  if (claudeRelative === '..' || claudeRelative.startsWith('..' + path.sep) || path.isAbsolute(claudeRelative)) {
    return {
      ok: false,
      code: 'ERROR:claude-dir-outside-workspace',
      cause: 'claudeDir must sit inside the workspace',
    };
  }

  let stat;
  let untracked;
  let nameStatus;
  try {
    stat = gitRun(['diff', '--stat', upstream.ref, '--', claudeRelative]);
    untracked = gitRun(['ls-files', '--others', '--exclude-standard', '--', claudeRelative]);
    nameStatus = gitRun(['diff', '--name-status', upstream.ref, '--', claudeRelative]);
  } catch (error) {
    return { ok: false, code: 'ERROR:git-failed', cause: error.message };
  }

  const untrackedFiles = untracked
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => isInside(path.resolve(claudeDir), path.resolve(workspace, file)));

  if (stat.trim() === '' && untrackedFiles.length === 0) {
    return { ok: true, status: 'skipped:no-changes' };
  }

  const files = [];
  for (const entry of parseNameStatus(nameStatus)) {
    if (!isInside(path.resolve(claudeDir), path.resolve(workspace, entry.file))) continue;
    const diff = gitRun(['diff', upstream.ref, '--', entry.from, entry.file]);
    files.push({
      file: entry.file,
      changeType: entry.changeType,
      diff,
      ...parseHunk(diff),
    });
  }

  for (const file of untrackedFiles) {
    const contents = fs.readFileSync(path.join(workspace, file), 'utf8');
    const diff = synthesizeAddedDiff(file, contents);
    files.push({
      file,
      changeType: 'added',
      diff,
      ...parseHunk(diff),
    });
  }

  return { ok: true, status: 'changes', files };
}

module.exports = {
  resolveUpstream,
  scanClaudeDir,
  parseHunk,
  synthesizeAddedDiff,
};
