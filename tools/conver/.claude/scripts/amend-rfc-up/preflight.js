'use strict';

/**
 * /amend-rfc-up preflight.
 *
 * Resolves the package from cwd, the canonical artifacts, the material list,
 * the free instruction (derived into amend/INSTRUCTION.md), and the ticket
 * that owns the amendment. No law-specific resolution lives here.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  resolveDirsTreePath,
  resolveGraphPath,
  resolveSourcePath,
  resolveTicketsPath,
} = require('../lib/package-artifacts.js');
const { createHash } = require('node:crypto');
const { resolveMaterialPaths: resolveMaterialEntries } = require('./material.js');
const { discoverPackages } = require('./workspace.js');
const { ensureAmendmentTicket } = require('./ticket.js');
const { resolveLawSkills } = require('./law-skill-verifier.js');

const COMMAND_ARGUMENT_HINT = '[<material file|directory>...]';
const CANON_AMENDABLE_STATES = Object.freeze(['materialized-fresh', 'materialized-stale']);
const ACTIVE_TICKET_STATUSES = Object.freeze(['planned', 'started', 'in-progress', 'in_progress']);
const FINDING_DOCUMENT_NAMES = Object.freeze(['FINDINGS.json', 'REVIEW.md', 'AMEND-RFC-UP-REPORT.json']);
const TICKET_KEY_PATTERN = /\b(?:PX-\d+|P\d+-\d+)\b/g;
const AMEND_DIRECTORY = 'amend';
const INSTRUCTION_FILENAME = 'INSTRUCTION.md';
const REPORT_BASENAME = 'amend-rfc-up-report';
const REPO_ROOT_FALLBACK = null;

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

/** The git top-level of a directory, or null outside a repository. */
// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function resolveRepoRoot(directory) {
  const result = spawnSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return REPO_ROOT_FALLBACK;
  return result.stdout.trim() || REPO_ROOT_FALLBACK;
}

function collectFilesRecursive(directory) {
  const collected = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collected.push(...collectFilesRecursive(entryPath));
    else if (entry.isFile()) collected.push(entryPath);
  }
  return collected;
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function assertMaterialArguments(materialArgs) {
  for (const argument of materialArgs) {
    if (typeof argument !== 'string') throw fail('PREFLIGHT_UNKNOWN_FLAG', 'material arguments must be paths');
    if (argument.startsWith('--')) throw fail('PREFLIGHT_UNKNOWN_FLAG', `unsupported flag: ${argument}`);
  }
}

function assertPackageContext({ cwd }) {
  const packageDir = path.resolve(cwd);
  let ticketsPath;
  let rfcPath;
  try {
    ticketsPath = resolveTicketsPath({ cwd: packageDir });
    rfcPath = resolveSourcePath({ cwd: packageDir });
  } catch (error) {
    throw fail('PREFLIGHT_ARTIFACT_MISSING', `${packageDir} lacks Tickets.json or RFC.md`, {
      cause: error.message,
    });
  }
  if (!fs.existsSync(ticketsPath) || !fs.existsSync(rfcPath)) {
    throw fail('PREFLIGHT_ARTIFACT_MISSING', `${packageDir} lacks Tickets.json or RFC.md`);
  }
  const graphPath = resolveGraphPath({ cwd: packageDir, allowMissing: true });
  const dirsTreePath = resolveDirsTreePath({ cwd: packageDir, graphPath, allowMissing: true });
  return { packageDir, ticketsPath, rfcPath, graphPath, dirsTreePath };
}

/** Write the free instruction beside the package's derived artifacts. */
// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function writeInstructionFile({ packageDir, instructionText }) {
  const directory = path.join(packageDir, AMEND_DIRECTORY);
  fs.mkdirSync(directory, { recursive: true });
  const instructionPath = path.join(directory, INSTRUCTION_FILENAME);
  fs.writeFileSync(instructionPath, `${instructionText.trim()}\n`);
  return instructionPath;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function resolveMaterialPaths(input = {}) {
  const {
    materialArgs = [],
    cwd,
    invocationDir = null,
    repoRoot = null,
    instructionText = null,
  } = input;
  assertMaterialArguments(materialArgs);
  return resolveMaterialEntries({
    materialArgs,
    invocationDir,
    packageDir: path.resolve(cwd),
    repoRoot,
    instructionText,
  }).materialPaths;
}

function readMaterialTicketKey(materialPaths) {
  const keys = new Set();
  for (const materialPath of materialPaths) {
    if (!fs.existsSync(materialPath) || !fs.statSync(materialPath).isFile()) continue;
    const text = fs.readFileSync(materialPath, 'utf8');
    for (const match of text.matchAll(TICKET_KEY_PATTERN)) keys.add(match[0]);
  }
  return keys.size === 1 ? [...keys][0] : null;
}

function readActiveTicketKey(ticketsPath) {
  const ticketsDocument = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const active = [];
  for (const phase of ticketsDocument.phases || []) {
    for (const ticket of phase.tickets || []) {
      if (!ACTIVE_TICKET_STATUSES.includes(ticket.status)) continue;
      active.push(phase.id === -1 ? `PX-${ticket.id}` : `P${phase.id}-${ticket.id}`);
    }
  }
  return active.length === 1 ? active[0] : null;
}

function deriveTicketKey({ ticketsPath, materialPaths = [] }) {
  const materialKey = readMaterialTicketKey(materialPaths);
  if (materialKey !== null) return materialKey;
  const activeKey = readActiveTicketKey(ticketsPath);
  if (activeKey !== null) return activeKey;
  throw fail('TICKET_REQUIRED', 'no unique active ticket in Tickets.json and no material ticket key');
}

function resolveCanonStatePath({ repoRoot = null, packageDir }) {
  const candidates = [];
  if (repoRoot) candidates.push(path.join(repoRoot, '.claude/scripts/grill-me-for-rfc/canon-state.js'));
  candidates.push(path.resolve(__dirname, '../grill-me-for-rfc/canon-state.js'));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw fail('CANON_STATE_UNREADABLE', `canon-state.js not found for ${packageDir}`);
}

function assertCanonAmendable({ packageDir, repoRoot = null, canonStatePath = null, canonStateRunner = null }) {
  const scriptPath = canonStatePath || resolveCanonStatePath({ repoRoot, packageDir });
  const runner = canonStateRunner || (({ script, directory }) => {
    const result = spawnSync(process.execPath, [script, directory, '--json'], { encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  });
  const result = runner({ script: scriptPath, directory: packageDir });
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    throw fail('CANON_STATE_UNREADABLE', `canon-state output is not JSON: ${error.message}`);
  }
  if (!CANON_AMENDABLE_STATES.includes(parsed.state)) {
    throw fail('CANON_NOT_AMENDABLE', `canon state ${parsed.state} is not owned by /amend-rfc-up`, {
      state: parsed.state,
      owner: 'grill',
      action: 'run /grill-me-for-rfc',
    });
  }
  return parsed;
}

// [::TICKET::] PX-418, PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-418|PX-419) --for-spec --no-implementation-order`.
function resolveCommandVariables(input = {}) {
  const {
    cwd = process.cwd(),
    invocationDir = null,
    materialArgs = [],
    instructionText = null,
    repoRoot = null,
  } = input;
  const context = assertPackageContext({ cwd });
  const resolvedRepoRoot = repoRoot || resolveRepoRoot(context.packageDir);
  if (!resolvedRepoRoot) {
    throw fail('PREFLIGHT_NOT_A_REPOSITORY', `${context.packageDir} is not inside a git repository`);
  }
  assertMaterialArguments(materialArgs);
  const materialResolution = resolveMaterialEntries({
    materialArgs,
    invocationDir,
    packageDir: context.packageDir,
    repoRoot: resolvedRepoRoot,
    instructionText,
  });
  const amendOut = path.join(context.packageDir, AMEND_DIRECTORY);
  const instructionPath = instructionText && instructionText.trim()
    ? writeInstructionFile({ packageDir: context.packageDir, instructionText })
    : null;
  const materialDigest = createHash('sha256')
    .update(materialResolution.materials.map((material) => material.sha256).sort().join(':'))
    .digest('hex');
  const instructionDigest = createHash('sha256').update(String(instructionText || '')).digest('hex');
  let ticketKey;
  let ticketCreated = false;
  try {
    ticketKey = deriveTicketKey({
      ticketsPath: context.ticketsPath,
      materialPaths: materialResolution.materialPaths,
    });
  } catch (error) {
    if (error.code !== 'TICKET_REQUIRED') throw error;
    const amendmentTicket = ensureAmendmentTicket({
      packageDir: context.packageDir,
      ticketsPath: context.ticketsPath,
      materialDigest,
      instructionDigest,
    });
    ticketKey = amendmentTicket.ticketKey;
    ticketCreated = amendmentTicket.created;
  }
  const workspace = discoverPackages({ repoRoot: resolvedRepoRoot });
  const lawSkills = resolveLawSkills({
    instructionText: instructionText || '',
    repoRoot: resolvedRepoRoot,
    claudeDir: path.join(resolvedRepoRoot, '.claude'),
  });
  return {
    packageDir: context.packageDir,
    repoRoot: resolvedRepoRoot,
    ticketsPath: context.ticketsPath,
    rfcPath: context.rfcPath,
    graphPath: context.graphPath,
    dirsTreePath: context.dirsTreePath,
    amendOut,
    lawOut: path.join(amendOut, 'law'),
    reportPath: path.join(amendOut, `${REPORT_BASENAME}.json`),
    reportMarkdownPath: path.join(amendOut, `${REPORT_BASENAME}.md`),
    materialPaths: materialResolution.materialPaths,
    materials: materialResolution.materials,
    materialDigest,
    instructionDigest,
    packages: workspace.packages,
    workspaceSource: workspace.source,
    lawSkills,
    instructionPath,
    ticketKey,
    ticketCreated,
  };
}

// [::TICKET::] PX-418, PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-418|PX-419) --for-spec --no-implementation-order`.
function renderVariables(variables) {
  return [
    '[VARIABLES]',
    `PACKAGE_DIR=${variables.packageDir}`,
    `REPO_ROOT=${variables.repoRoot}`,
    `TICKETS_PATH=${variables.ticketsPath}`,
    `RFC_PATH=${variables.rfcPath}`,
    `GRAPH_PATH=${variables.graphPath}`,
    `DIRS_TREE_PATH=${variables.dirsTreePath}`,
    `AMEND_OUT=${variables.amendOut}`,
    `LAW_OUT=${variables.lawOut}`,
    `REPORT_PATH=${variables.reportPath}`,
    `REPORT_MARKDOWN_PATH=${variables.reportMarkdownPath}`,
    `INSTRUCTION_PATH=${variables.instructionPath ?? ''}`,
    `TICKET_KEY=${variables.ticketKey}`,
    `TICKET_CREATED=${variables.ticketCreated ? 'true' : 'false'}`,
    `MATERIAL_DIGEST=${variables.materialDigest}`,
    `INSTRUCTION_DIGEST=${variables.instructionDigest}`,
    `PACKAGES=${JSON.stringify(variables.packages)}`,
    `LAW_SKILLS=${JSON.stringify(variables.lawSkills)}`,
    `MATERIALS=${JSON.stringify(variables.materials)}`,
    `MATERIAL_PATHS=${JSON.stringify(variables.materialPaths)}`,
    '[END VARIABLES]',
  ].join('\n');
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

// [::TICKET::] PX-418, PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-418|PX-419) --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  if (argv[0] === 'canon') {
    const packageArgument = argumentValue(argv, 'package');
    const repoArgument = argumentValue(argv, 'repo');
    const packageDir = path.resolve(packageArgument || process.cwd());
    try {
      const classification = assertCanonAmendable({ packageDir, repoRoot: repoArgument });
      process.stdout.write(`${JSON.stringify(classification)}\n`);
      return 0;
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ code: error.code, message: error.message, state: error.state || null })}\n`);
      return 1;
    }
  }
  const cwd = path.resolve(argumentValue(argv, 'cwd') || process.cwd());
  const instructionPath = argumentValue(argv, 'instruction');
  const instructionText = instructionPath ? fs.readFileSync(instructionPath.replace(/^@/, ''), 'utf8') : null;
  const materialArgs = argv.filter((argument) => !argument.startsWith('--') && argument !== 'canon');
  try {
    const variables = resolveCommandVariables({
      cwd,
      invocationDir: argumentValue(argv, 'invocation'),
      materialArgs,
      instructionText,
      repoRoot: argumentValue(argv, 'repo'),
    });
    process.stdout.write(`${renderVariables(variables)}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ code: error.code, message: error.message })}\n`);
    return 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = {
  COMMAND_ARGUMENT_HINT,
  CANON_AMENDABLE_STATES,
  assertCanonAmendable,
  assertPackageContext,
  deriveTicketKey,
  renderVariables,
  resolveCommandVariables,
  resolveMaterialPaths,
  writeInstructionFile,
};
