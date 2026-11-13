'use strict';

/**
 * /amend-rfc-up *-law skill caller.
 *
 * The canonical verifier lives beside this module. It calls that script for
 * any *-law skill, asserts every required check is machine_verified, and uses
 * only the skill's applies/resolve/context entry points. It never reads okf/.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CANONICAL_VERIFIER_PATH = path.resolve(__dirname, 'verify-law-skill.mjs');
const VERIFIER_SCHEMA = 'law-skill-verification/v1';
const CHECK_CONTRACT = require('./law-verify/checks.json');
const CHECK_SET_VERSION = CHECK_CONTRACT.check_set_version;
const REQUIRED_CHECKS = Object.freeze(CHECK_CONTRACT.checks.map((check) => check.name));
const LAW_APPLIES_SKIP_EXIT = 3;
const LAW_ARTIFACT_DIRECTORY = path.join('amend', 'law');
const MANIFEST_FILENAME = 'manifest.json';
const SOURCE_FILE_SUFFIX = '.rs';
const SYNTHETIC_SOURCE_PATH = 'src/lib.rs';
const EXCLUDED_SOURCE_DIRECTORIES = Object.freeze(new Set(['.git', 'node_modules', 'target', 'dist']));

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function defaultRunner({ scriptPath, args, cwd }) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Run the canonical verifier and return its report. */
// [::TICKET::] PX-418, PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-418|PX-421|PX-422) --for-spec --no-implementation-order`.
function verifyLawSkill({ skillPath, root, target = {}, outPath = null, runner = null }) {
  const { sourceRoot = null, pathAlias = null, mode = null } = target;
  const reportPath = outPath || path.join(path.dirname(path.resolve(skillPath)), 'law-skill-verification.json');
  const args = ['--skill', path.resolve(skillPath), '--root', path.resolve(root), '--out', reportPath];
  if (sourceRoot) args.push('--source-root', path.resolve(sourceRoot));
  if (pathAlias) args.push('--path-alias', path.resolve(pathAlias));
  if (mode) args.push('--mode', mode);
  const result = runner
    ? runner({ scriptPath: CANONICAL_VERIFIER_PATH, args })
    : defaultRunner({ scriptPath: CANONICAL_VERIFIER_PATH, args, cwd: root });
  if (result.status !== 0) {
    throw fail('LAW_SKILL_INVALID', `*-law verifier exited ${result.status}`, { stderr: result.stderr });
  }
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
}

/** Machine pass only: every required check is machine_verified. */
// [::TICKET::] PX-418, PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-418|PX-421|PX-422) --for-spec --no-implementation-order`.
function assertLawSkillValid({ report }) {
  if (!report || report.schema !== VERIFIER_SCHEMA) {
    throw fail('LAW_SKILL_INVALID', 'verification report has the wrong schema');
  }
  const required = report.required_checks ?? REQUIRED_CHECKS;
  const failed = required.filter((name) => report.checks?.[name]?.status !== 'machine_verified');
  if (failed.length > 0) {
    throw fail('LAW_SKILL_INVALID', `*-law checks failed: ${failed.join(', ')}`, { failed });
  }
  return report;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function collectSourceFiles(directory, found = []) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    return found;
  }
  for (const entry of entries) {
    if (EXCLUDED_SOURCE_DIRECTORIES.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectSourceFiles(entryPath, found);
    else if (entry.isFile() && entry.name.endsWith(SOURCE_FILE_SUFFIX)) found.push(entryPath);
  }
  return found;
}

/**
 * Paths the law matches against. A directory never matches a `/**` unit glob,
 * so a package with no Rust source yet is represented by the source file it
 * will create. A non-interface package still resolves to a non-interface unit
 * and is skipped.
 */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function packagePathArgument({ root, packageDir }) {
  const absoluteRoot = path.resolve(root);
  const absolutePackage = path.resolve(packageDir);
  const sourceFiles = collectSourceFiles(absolutePackage)
    .map((file) => path.relative(absoluteRoot, file).replace(/\\/g, '/'))
    .filter((file) => !file.startsWith('..') && !path.isAbsolute(file))
    .sort();
  if (sourceFiles.length > 0) return sourceFiles.join(',');
  const relativePackage = path.relative(absoluteRoot, absolutePackage).replace(/\\/g, '/');
  const base = relativePackage === '' || relativePackage.startsWith('..')
    ? absolutePackage.replace(/\\/g, '/')
    : relativePackage;
  return `${base}/${SYNTHETIC_SOURCE_PATH}`;
}

/** Run the verified skill's applies/resolve/context entry points. */
// [::TICKET::] PX-418, PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-418|PX-419) --for-spec --no-implementation-order`.
function runLawSkill({ skillPath, root, packageDir, phases, runner = defaultRunner }) {
  const scriptPath = path.join(path.resolve(skillPath), 'dist/skill.mjs');
  const pathsArgument = packagePathArgument({ root, packageDir });
  const appliesArgs = ['applies', '--root', path.resolve(root), '--paths', pathsArgument];
  const applies = runner({ scriptPath, args: appliesArgs, cwd: root });
  if (applies.status === LAW_APPLIES_SKIP_EXIT) {
    return { applies: false, code: 'LAW_NOT_APPLICABLE' };
  }
  if (applies.status !== 0) {
    throw fail('LAW_APPLIES_FAILED', `law applies exited ${applies.status}`, { stderr: applies.stderr });
  }
  const manifestPath = path.join(path.resolve(packageDir), LAW_ARTIFACT_DIRECTORY, MANIFEST_FILENAME);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const resolveArgs = [
    'resolve', '--root', path.resolve(root), '--paths', pathsArgument, '--out', manifestPath,
  ];
  const resolved = runner({ scriptPath, args: resolveArgs, cwd: root });
  if (resolved.status !== 0) {
    throw fail('LAW_RESOLVE_FAILED', `law resolve exited ${resolved.status}`, { stderr: resolved.stderr });
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const resolvedPhases = Array.isArray(phases) && phases.length > 0
    ? phases
    : deriveLawPhases({ manifest });
  const contextArgs = ['context', '--manifest', manifestPath, '--phases', resolvedPhases.join(',')];
  const contexts = runner({ scriptPath, args: contextArgs, cwd: root });
  if (contexts.status !== 0) {
    throw fail('LAW_CONTEXT_FAILED', `law context exited ${contexts.status}`, { stderr: contexts.stderr });
  }
  return {
    applies: true,
    manifest,
    phases: resolvedPhases,
    contexts: contexts.stdout,
  };
}

/** Names of *-law skills the instruction asks to use. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function extractLawSkillNames({ instructionText = '' } = {}) {
  return [...new Set(String(instructionText).match(/\b[a-z][a-z0-9-]*-law\b/g) || [])];
}

/** Resolve an instruction-named *-law skill under the repo or .claude skills tree. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function resolveLawSkills({ instructionText = '', repoRoot, claudeDir } = {}) {
  const names = extractLawSkillNames({ instructionText });
  const resolved = [];
  for (const name of names) {
    const candidates = [
      path.join(path.resolve(repoRoot), '.claude/skills', name),
      path.join(path.resolve(claudeDir), 'skills', name),
    ].filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());
    const unique = [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
    if (unique.length === 0) {
      throw fail('LAW_SKILL_NOT_FOUND', `law skill not found: ${name}`, { name });
    }
    if (unique.length > 1) {
      throw fail('LAW_SKILL_AMBIGUOUS', `law skill has multiple roots: ${name}`, { name, candidates: unique });
    }
    resolved.push({ name, skillPath: unique[0] });
  }
  return resolved;
}

/** Phase order from a resolve manifest; never guessed. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function deriveLawPhases({ manifest } = {}) {
  const phases = [];
  const add = (phase) => {
    if (typeof phase === 'string' && phase.trim() !== '' && !phases.includes(phase)) phases.push(phase);
  };
  if (Array.isArray(manifest?.phases)) manifest.phases.forEach(add);
  if (phases.length === 0 && Array.isArray(manifest?.units)) {
    for (const unit of manifest.units) {
      add(unit.phase);
      if (Array.isArray(unit.phases)) unit.phases.forEach(add);
    }
  }
  if (phases.length === 0) {
    throw fail('LAW_PHASES_UNDECIDED', 'resolve manifest does not name any phase');
  }
  return phases;
}

/** Verify the skill, then run applies/resolve/context once. */
// [::TICKET::] PX-419, PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-419|PX-421|PX-422) --for-spec --no-implementation-order`.
function defaultPathAlias(skillPath) {
  const base = path.resolve(skillPath);
  return path.join(path.dirname(base), `${path.basename(base)}.path-alias.json`);
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function runVerifiedLawSkill(input = {}) {
  const {
    skillPath,
    root,
    packageDir,
    phases = null,
    sourceRoot = null,
    pathAlias = null,
    mode = null,
    outPath = null,
    runner = defaultRunner,
  } = input;
  const resolvedSourceRoot = sourceRoot ?? root;
  const resolvedAlias = pathAlias ?? defaultPathAlias(skillPath);
  const resolvedMode = mode ?? (fs.existsSync(resolvedAlias) ? 'dev' : 'installed');
  const report = verifyLawSkill({
    skillPath,
    root,
    target: {
      sourceRoot: resolvedMode === 'dev' ? resolvedSourceRoot : null,
      pathAlias: resolvedAlias,
      mode: resolvedMode,
    },
    outPath,
    runner,
  });
  assertLawSkillValid({ report });
  return {
    ...runLawSkill({ skillPath, root, packageDir, phases, runner }),
    lawVerification: report,
  };
}

module.exports = {
  CANONICAL_VERIFIER_PATH,
  REQUIRED_CHECKS,
  VERIFIER_SCHEMA,
  assertLawSkillValid,
  deriveLawPhases,
  extractLawSkillNames,
  resolveLawSkills,
  runLawSkill,
  runVerifiedLawSkill,
  verifyLawSkill,
};
