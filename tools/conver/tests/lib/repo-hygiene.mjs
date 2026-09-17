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
 *
 * The second subject is the files a run produces. `tools/conver/tmp/` was tracked
 * by the release-branch commit 5c08ac3e and its `.txt` logs turned `make test` red
 * three days after the extension census was written; four bytecode caches are
 * tracked the same way and a test run rewrites them, so the working tree dirties
 * itself. They are the same paragraph as the backup — an artefact that should not
 * be tracked, and the proof that removing it took nothing else with it — so they
 * are measured here rather than in a second module that would re-spell `runGit`,
 * `isGitRepository` and `trackedPaths`.
 *
 * One asymmetry is recorded rather than smoothed: the bytecode caches are
 * rewritten by the next test run, so no digest is frozen for them. Absence from the
 * index and presence on disk is the whole of what can be asserted about them.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

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
 * The root of the repository a directory belongs to.
 *
 * Asked of git rather than counted in `..` segments: how many levels separate a
 * test file from the repository root is a fact about where that file sits, and a
 * miscount does not throw — it yields a different directory whose empty answers
 * read as a clean repository.
 *
 * @param {string} directory
 * @returns {string|null} null when the directory belongs to no repository
 */
// [::TICKET::] P25-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-1 --for-spec --no-implementation-order`.
export function repositoryRootFrom(directory) {
  const result = runGit(directory, ['rev-parse', '--show-toplevel']);
  if (result.status !== 0) return null;
  return result.stdout.trim();
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
 * Directories whose contents are produced by a run and describe the machine it
 * happened on. Named as path prefixes, relative to the repository root.
 */
export const DERIVED_ARTEFACT_PREFIXES = Object.freeze(['tools/conver/tmp/']);

/**
 * Bytecode caches outside the answer key, named one by one because a report can
 * only act on a name. A wildcard would say "somewhere" rather than "here".
 */
export const BYTECODE_CACHE_PATHS = Object.freeze([
  '.claude/scripts/lib/__pycache__/ecc_dashboard_runtime.cpython-314.pyc',
  'crates/siprs/.claude/scripts/lib/__pycache__/ecc_dashboard_runtime.cpython-314.pyc',
  'tools/conver/.claude/scripts/lib/__pycache__/ecc_dashboard_runtime.cpython-314.pyc',
]);

/**
 * The digest of the run output as it stood when it left the index.
 *
 * This is the assertion `git rm` without `--cached` cannot survive: the paths would
 * be untracked and ignored either way, and only the bytes say whether the files
 * were kept. Re-measure with `measureDerivedArtefacts(...).prefixDigest` and record
 * the new value; never adjust it to make a run pass.
 */
export const FROZEN_DERIVED_ARTEFACT_DIGEST = '1ced02bf1375e674c5a889b0d224e84a1d67c5c6a9704e385542977660090a18';

/**
 * Every file beneath a directory, as paths relative to it and sorted.
 *
 * @param {string} directory
 * @returns {string[]}
 */
// [::TICKET::] P25-1, P25-2, P25-3, P25-4, P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-1|P25-2|P25-3|P25-4|P25-5|P25-6) --for-spec --no-implementation-order`.
function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

/**
 * One digest over a set of files, so the proof is one constant and not thirty-seven.
 *
 * Each line pairs the path with the digest of its bytes, so a file that moved and a
 * file that changed are different findings rather than the same one.
 *
 * @param {{ repositoryRoot: string, paths: string[] }} input
 * @returns {string}
 */
export function aggregateDigest({ repositoryRoot, paths }) {
  const lines = [...paths].sort().map((path) =>
    path + '\0' + createHash('sha256').update(readFileSync(join(repositoryRoot, path))).digest('hex'));
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/**
 * The ignore rule that actually decides a path.
 *
 * `git check-ignore -v` names the file and the pattern that matched last, which is
 * git's answer rather than a re-reading of the ignore files. That distinction is
 * the point here: which file carries the rule is what proves the rule is reachable
 * from the path, and a rule written into an ignore file that cannot see the path
 * would decide nothing.
 *
 * @param {{ repositoryRoot: string, path: string }} input
 * @returns {{ file: string, pattern: string }|null} null when nothing ignores the path
 */
export function decidingIgnoreRule({ repositoryRoot, path }) {
  const result = runGit(repositoryRoot, ['check-ignore', '-v', path]);
  if (result.status !== 0) return null;

  const [source] = result.stdout.trim().split('\t');
  const firstColon = source.indexOf(':');
  const secondColon = source.indexOf(':', firstColon + 1);
  if (firstColon < 0 || secondColon < 0) return null;
  return { file: source.slice(0, firstColon), pattern: source.slice(secondColon + 1) };
}

/**
 * Measure whether the files a run produced have left the index and stayed on disk.
 *
 * @param {{ repositoryRoot: string, prefixes?: readonly string[], cachePaths?: readonly string[] }} input
 * @returns {{ unavailable: string|undefined, trackedPrefixPaths: string[]|null, trackedCachePaths: string[]|null, missingOnDisk: string[]|null, prefixFiles: number|null, prefixDigest: string|null }}
 */
export function measureDerivedArtefacts({
  repositoryRoot,
  prefixes = DERIVED_ARTEFACT_PREFIXES,
  cachePaths = BYTECODE_CACHE_PATHS,
}) {
  if (!isGitRepository(repositoryRoot)) {
    return {
      unavailable: NOT_A_REPOSITORY,
      trackedPrefixPaths: null,
      trackedCachePaths: null,
      missingOnDisk: null,
      prefixFiles: null,
      prefixDigest: null,
    };
  }

  const tracked = trackedPaths(repositoryRoot);
  const producedPaths = prefixes.flatMap((prefix) =>
    filesUnder(join(repositoryRoot, prefix)).map((relative) => prefix + relative));

  return {
    unavailable: undefined,
    trackedPrefixPaths: tracked.filter((path) => prefixes.some((prefix) => path.startsWith(prefix))),
    trackedCachePaths: tracked.filter((path) => cachePaths.includes(path)),
    missingOnDisk: [...producedPaths, ...cachePaths].filter((path) => !existsSync(join(repositoryRoot, path))),
    prefixFiles: producedPaths.length,
    prefixDigest: producedPaths.length > 0 ? aggregateDigest({ repositoryRoot, paths: producedPaths }) : null,
  };
}

/**
 * Render the derived-artefact measurement as the report a person reads.
 *
 * @param {ReturnType<typeof measureDerivedArtefacts>} report
 * @returns {string} Markdown
 */
export function renderDerivedArtefactReport(report) {
  if (report.unavailable === NOT_A_REPOSITORY) {
    return '## Derived artefacts\n\n**unavailable** — no git repository at this path, so nothing can be said about the files a run produced';
  }
  const lines = [
    '## Derived artefacts',
    '',
    `- tracked run-output paths: **${report.trackedPrefixPaths.length}**${report.trackedPrefixPaths.length > 0 ? ' — ' + report.trackedPrefixPaths.join(', ') : ''}`,
    `- tracked bytecode caches: **${report.trackedCachePaths.length}**${report.trackedCachePaths.length > 0 ? ' — ' + report.trackedCachePaths.join(', ') : ''}`,
    `- files present on disk: **${report.prefixFiles}** of the recorded run output`,
    `- recorded files missing from disk: **${report.missingOnDisk.length}**${report.missingOnDisk.length > 0 ? ' — ' + report.missingOnDisk.join(', ') : ''}`,
  ];
  const pass = report.trackedPrefixPaths.length === 0
    && report.trackedCachePaths.length === 0
    && report.missingOnDisk.length === 0;
  lines.push('', pass ? '**pass**' : '**fail**');
  return lines.join('\n');
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
