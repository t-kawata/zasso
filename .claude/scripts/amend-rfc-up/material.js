'use strict';

/**
 * /amend-rfc-up material resolution.
 *
 * A material argument is resolved against the bases a caller can actually see:
 * the invocation directory, the package directory, and the repository root.
 * Absolute and home-prefixed arguments are resolved directly. Every resolved
 * file carries a sha256 so a later replay can prove the same input was used.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const FINDING_DOCUMENT_NAMES = Object.freeze(['FINDINGS.json', 'REVIEW.md', 'AMEND-RFC-UP-REPORT.json']);
const LAW_SKILL_SUFFIX = '-law';
const SKILL_FILE_NAME = 'SKILL.md';
const OKF_DIRECTORY_NAME = 'okf';
const MATERIAL_KINDS = Object.freeze({
  LAW_SKILL: 'law-skill',
  ORDINARY: 'ordinary',
});

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

/** Expand only the home forms a shell would already have expanded. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function expandHome(value, home = os.homedir()) {
  const text = String(value);
  if (text === '~') return home;
  if (text.startsWith('~/')) return path.join(home, text.slice(2));
  return text;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function isLawSkillDirectory(directory) {
  return path.basename(directory).endsWith(LAW_SKILL_SUFFIX)
    && fs.existsSync(path.join(directory, SKILL_FILE_NAME))
    && fs.existsSync(path.join(directory, OKF_DIRECTORY_NAME));
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function collectFilesRecursive(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFilesRecursive(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

/** The bases a relative material path may name, in resolution order. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function buildBases({ invocationDir, packageDir, repoRoot }) {
  const bases = [];
  for (const [name, directory] of [
    ['invocation', invocationDir],
    ['package', packageDir],
    ['repo', repoRoot],
  ]) {
    if (directory && !bases.some((base) => path.resolve(base.dir) === path.resolve(directory))) {
      bases.push({ name, dir: path.resolve(directory) });
    }
  }
  return bases;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function resolveAgainstBases({ argument, bases }) {
  for (const base of bases) {
    const candidate = path.resolve(base.dir, argument);
    if (fs.existsSync(candidate)) return { path: candidate, base: base.name };
  }
  return null;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function materialEntry(filePath) {
  return {
    path: path.resolve(filePath),
    sha256: sha256File(filePath),
    bytes: fs.statSync(filePath).size,
    kind: MATERIAL_KINDS.ORDINARY,
  };
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function lawSkillEntry(directory) {
  const skillFile = path.join(directory, SKILL_FILE_NAME);
  return {
    path: path.resolve(directory),
    skillPath: path.resolve(directory),
    sha256: sha256File(skillFile),
    bytes: fs.statSync(skillFile).size,
    kind: MATERIAL_KINDS.LAW_SKILL,
  };
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function expandDirectoryMaterial(directory) {
  if (isLawSkillDirectory(directory)) return [lawSkillEntry(directory)];
  const files = collectFilesRecursive(directory);
  if (files.length === 0) {
    throw fail('MATERIAL_EMPTY_DIRECTORY', `empty material directory: ${directory}`, { path: directory });
  }
  return files.map(materialEntry);
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function expandMaterialArgument({ argument, expanded, bases }) {
  const absolute = path.isAbsolute(expanded);
  const resolved = absolute
    ? (fs.existsSync(expanded) ? { path: expanded, base: 'absolute' } : null)
    : resolveAgainstBases({ argument: expanded, bases });
  if (!resolved) {
    throw fail('MATERIAL_NOT_FOUND', `material not found: ${expanded}`, {
      triedBases: absolute ? [expanded] : bases.map((base) => path.resolve(base.dir, expanded)),
      argument,
    });
  }
  if (fs.statSync(resolved.path).isDirectory()) return expandDirectoryMaterial(resolved.path);
  return [materialEntry(resolved.path)];
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function discoverFindingDocuments(packageDir) {
  return FINDING_DOCUMENT_NAMES
    .map((name) => path.join(packageDir, name))
    .filter((candidate) => fs.existsSync(candidate));
}

/**
 * Resolve every material argument and return rich entries plus the legacy path list.
 *
 * @param {{ materialArgs?: string[], invocationDir?: string|null,
 *           packageDir?: string, repoRoot?: string|null,
 *           instructionText?: string|null }} input
 * @returns {{ materials: object[], materialPaths: string[], triedBases: string[] }}
 */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function resolveMaterialPaths({
  materialArgs = [],
  invocationDir = null,
  packageDir = process.cwd(),
  repoRoot = null,
  instructionText = null,
} = {}) {
  const bases = buildBases({ invocationDir, packageDir, repoRoot });
  const hasInstruction = instructionText !== null && String(instructionText).trim() !== '';
  // An explicit instruction is complete material on its own; discovering a
  // findings document beside it would silently add a second source.
  const argumentsToResolve = materialArgs.length > 0
    ? materialArgs
    : (hasInstruction ? [] : discoverFindingDocuments(packageDir));

  if (argumentsToResolve.length === 0) {
    if (!hasInstruction) {
      throw fail('MATERIAL_REQUIRED', `no material argument, no instruction, and no ${FINDING_DOCUMENT_NAMES.join(', ')}`);
    }
    return { materials: [], materialPaths: [], triedBases: bases.map((base) => base.dir) };
  }

  const materials = [];
  const seen = new Set();
  for (const argument of argumentsToResolve) {
    const expanded = expandHome(argument);
    for (const material of expandMaterialArgument({ argument, expanded, bases })) {
      if (seen.has(material.path)) continue;
      seen.add(material.path);
      materials.push(material);
    }
  }
  return {
    materials,
    materialPaths: materials.map((material) => material.path),
    triedBases: bases.map((base) => base.dir),
  };
}

module.exports = {
  FINDING_DOCUMENT_NAMES,
  MATERIAL_KINDS,
  expandHome,
  resolveMaterialPaths,
  sha256File,
};
