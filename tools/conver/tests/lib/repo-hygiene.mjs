/**
 * repo-hygiene — a tracked artefact that should not be tracked, and the proof
 * that removing it took nothing else with it.
 *
 * `Tickets.json.p22-ja.bak` is a 4,270,361-byte backup committed as blob
 * `bf1992ca` and referenced by nothing. It leaves the index and stays on disk:
 * untracking is a repository operation, deleting a user's backup is not.
 *
 * The digest is not decoration. `git rm` without `--cached` deletes the
 * working-tree file, and every assertion here would still pass — the path would
 * be untracked and ignored either way. The digest is what makes that mistake fail
 * loudly instead of surfacing as a missing file days later.
 *
 * History is deliberately untouched: removing the blob from the 28 commits that
 * carry it means a rebase and a force push, which is outward-facing and needs
 * explicit authorisation. This module reports the state it finds and never
 * rewrites anything.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The tracked backup this module is about. */
export const UNTRACKED_BACKUP_NAME = 'Tickets.json.p22-ja.bak';

/** The single ignore rule that keeps it out of the index. */
export const BACKUP_IGNORE_PATTERN = '*.bak';

/** The file that carries that rule. */
export const GITIGNORE_NAME = '.gitignore';

/** Returned when the tree is not a git repository, so silence cannot read as clean. */
export const NOT_A_REPOSITORY = 'not-a-repository';

/**
 * Run git in a tree and return its result.
 *
 * @param {string} projectRoot
 * @param {string[]} args
 * @returns {{ status: number|null, stdout: string, stderr: string }}
 */
// [::TICKET::] PX-205, PX-206, PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-205|PX-206|PX-207) --for-spec --no-implementation-order`.
function runGit(projectRoot, args) {
  const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * Whether a tree is a git repository at all.
 *
 * @param {string} projectRoot
 * @returns {boolean}
 */
export function isGitRepository(projectRoot) {
  return runGit(projectRoot, ['rev-parse', '--git-dir']).status === 0;
}

/**
 * Every path in the index, relative to the tree root.
 *
 * @param {string} projectRoot
 * @returns {string[]} sorted
 */
export function trackedPaths(projectRoot) {
  if (!isGitRepository(projectRoot)) return [];
  return runGit(projectRoot, ['ls-files']).stdout.split('\n').filter(Boolean).sort();
}

/**
 * Ignore rules that match a path but are not the declared one.
 *
 * A second rule matching the same file is redundant and hides which rule is
 * load-bearing; `git check-ignore -v` names the rule that actually decided, so the
 * answer is git's rather than a re-reading of the file.
 *
 * @param {string} projectRoot
 * @param {string} name
 * @returns {string[]}
 */
// [::TICKET::] PX-205, PX-206, PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-205|PX-206|PX-207) --for-spec --no-implementation-order`.
function redundantIgnoreRules(projectRoot, name) {
  const result = runGit(projectRoot, ['check-ignore', '-v', name]);
  if (result.status !== 0) return [];
  const matched = result.stdout.trim().split('\t')[1];
  if (matched === undefined || matched === BACKUP_IGNORE_PATTERN) return [];
  return [matched];
}

/**
 * Measure the backup's tracking state.
 *
 * @param {{ projectRoot: string, name?: string }} input
 * @returns {{ tracked: boolean|null, ignored: boolean|null, workingTreeDigest: string|null, absent: boolean, stalePatterns: string[], unavailable: string|undefined }}
 */
export function assertBackupUntracked({ projectRoot, name = UNTRACKED_BACKUP_NAME }) {
  if (!isGitRepository(projectRoot)) {
    return {
      tracked: null,
      ignored: null,
      workingTreeDigest: null,
      absent: !existsSync(join(projectRoot, name)),
      stalePatterns: [],
      unavailable: NOT_A_REPOSITORY,
    };
  }

  const fullPath = join(projectRoot, name);
  const present = existsSync(fullPath);

  return {
    tracked: runGit(projectRoot, ['ls-files', '--error-unmatch', name]).status === 0,
    ignored: runGit(projectRoot, ['check-ignore', '-q', name]).status === 0,
    workingTreeDigest: present ? createHash('sha256').update(readFileSync(fullPath)).digest('hex') : null,
    absent: !present,
    stalePatterns: redundantIgnoreRules(projectRoot, name),
  };
}

/**
 * Render the measurement as the report a person reads.
 *
 * @param {ReturnType<typeof assertBackupUntracked>} report
 * @param {string} name
 * @returns {string} Markdown
 */
export function renderHygieneReport(report, name = UNTRACKED_BACKUP_NAME) {
  if (report.unavailable === NOT_A_REPOSITORY) {
    return `## Repository hygiene\n\n**unavailable** — no git repository at this path, so nothing can be said about ${name}`;
  }
  const lines = [
    '## Repository hygiene',
    '',
    `- \`${name}\` is tracked: **${report.tracked}**`,
    `- \`${name}\` is ignored: **${report.ignored}**`,
    `- working-tree file present: **${report.absent === false}**`,
  ];
  if (report.stalePatterns.length > 0) lines.push(`- redundant ignore rules: ${report.stalePatterns.join(', ')}`);
  const pass = report.tracked === false && report.ignored === true;
  lines.push('', pass ? '**pass**' : '**fail**');
  return lines.join('\n');
}
