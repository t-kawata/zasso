// @verifies C004 C005 C013
/**
 * Generic *-law skill verifier.
 *
 * One verifier for every *-law skill. It reads only the declared layers and
 * machine-checkable assets; it never reads a skill's okf rule text as a
 * substitute for the skill's own checks.
 *
 * Status vocabulary: machine_verified is the only pass. failed, unverifiable
 * and not_run are not passes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const VERIFIER_SCHEMA = 'law-skill-verification/v1';
export const VERIFIER_CHECKS = Object.freeze([
  'layer',
  'manifest',
  'lock',
  'coverage',
  'registry',
  'genericBoundary',
  'delivery',
  'runtime',
  'tests',
  'installer',
  'determinism',
]);

const REQUIRED_LAYERS = Object.freeze([
  'SKILL.md',
  'okf/index.md',
  'okf/nodes',
  'atoms.lock.json',
  'coverage.json',
  'coverage.md',
  'source/manifest.toml',
  'scripts',
  'dist/skill.mjs',
  'install.js',
  'tests',
]);
const STRUCTURAL_TYPES = new Set(['Heading', 'Blank', 'TableHeader']);
const MUST_TYPES = new Set([
  'Rule', 'CodeBlock', 'ContractType', 'InterfaceBinding', 'Operation',
  'Documentation', 'Conformance',
]);
const RULE_ID_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const BUILD_COMMAND_PATTERN = /\b(?:npm\s+run\s+build|tsc\b|esbuild\b|build-[a-z0-9-]+)\b/;
const COPY_COMMAND_PATTERN = /\b(?:copyFileSync|rsync|\bcp\s+-R|cpSync)\b/;

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function exists(filePath) {
  return fs.existsSync(filePath);
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function listFiles(directory, predicate = () => true) {
  if (!exists(directory)) return [];
  const collected = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      collected.push(...listFiles(entryPath, predicate));
    } else if (entry.isFile() && predicate(entryPath)) {
      collected.push(entryPath);
    }
  }
  return collected;
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function status(value, evidence, extra = {}) {
  return { status: value, evidence, ...extra };
}

/** Parse the subset of source/manifest.toml the verifier needs. */
export function parseManifest(text) {
  const manifest = { files: [] };
  let currentFile = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '[[file]]') {
      currentFile = {};
      manifest.files.push(currentFile);
      continue;
    }
    const assignment = line.match(/^([a-z_][a-z0-9_]*)\s*=\s*"([^"]*)"$/);
    if (!assignment) continue;
    const [, key, value] = assignment;
    if (currentFile && (key === 'path' || key === 'sha256')) currentFile[key] = value;
    else manifest[key] = value;
  }
  return manifest;
}

/** Parse the small YAML frontmatter block of one okf node. */
export function parseNodeFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const assignment = line.match(/^([a-z_]+):\s*(.*)$/);
    if (assignment) fields[assignment[1]] = assignment[2].trim();
  }
  return fields;
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function checkLayer(skillPath) {
  const missing = REQUIRED_LAYERS.filter((relativePath) => !exists(path.join(skillPath, relativePath)));
  return status(
    missing.length === 0 ? 'machine_verified' : 'failed',
    missing.length === 0 ? 'all required layers present' : `missing: ${missing.join(', ')}`,
    missing.length === 0 ? {} : { missing },
  );
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function checkManifest(skillPath) {
  const manifestPath = path.join(skillPath, 'source/manifest.toml');
  if (!exists(manifestPath)) return status('failed', 'source/manifest.toml is missing');
  const manifest = parseManifest(readText(manifestPath));
  const problems = [];
  for (const field of ['spec_version', 'source_set_sha256', 'redaction_sha256']) {
    if (!manifest[field]) problems.push(`${field} is missing`);
  }
  if (manifest.source_set_sha256 && !HASH_PATTERN.test(manifest.source_set_sha256)) {
    problems.push('source_set_sha256 is not sha256');
  }
  if (manifest.redaction_sha256 && !HASH_PATTERN.test(manifest.redaction_sha256)) {
    problems.push('redaction_sha256 is not sha256');
  }
  for (const file of manifest.files) {
    if (!file.path || !file.sha256) problems.push('[[file]] path/sha256 is incomplete');
    if (file.path && path.isAbsolute(file.path)) problems.push(`absolute path: ${file.path}`);
    if (file.sha256 && !HASH_PATTERN.test(file.sha256)) problems.push(`bad sha256: ${file.path}`);
  }
  if (manifest.source_set_sha256 && manifest.files.length > 0) {
    const computed = sha256(manifest.files.map((file) => `${file.path}\0${file.sha256}`).join('\n'));
    if (computed !== manifest.source_set_sha256) problems.push('source_set_sha256 does not match files');
  }
  return status(problems.length === 0 ? 'machine_verified' : 'failed', problems.join('; ') || 'manifest identity ok');
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function checkLock(skillPath) {
  const lockPath = path.join(skillPath, 'atoms.lock.json');
  if (!exists(lockPath)) return status('failed', 'atoms.lock.json is missing');
  let lock;
  try {
    lock = JSON.parse(readText(lockPath));
  } catch (error) {
    return status('failed', `atoms.lock.json is not JSON: ${error.message}`);
  }
  const atoms = Array.isArray(lock.atoms) ? lock.atoms : [];
  const nodes = listFiles(path.join(skillPath, 'okf/nodes'), (file) => file.endsWith('.md'));
  const nodeIds = new Set();
  const nodeHashes = new Map();
  for (const nodePath of nodes) {
    const fields = parseNodeFrontmatter(readText(nodePath));
    if (!fields || !fields.id) return status('failed', `node frontmatter missing id: ${nodePath}`);
    nodeIds.add(fields.id);
    if (fields.content_sha256) nodeHashes.set(fields.id, fields.content_sha256);
  }
  const problems = [];
  if (nodes.length !== atoms.length) problems.push(`node count ${nodes.length} != atom count ${atoms.length}`);
  for (const atom of atoms) {
    if (!atom.id) problems.push('atom without id');
    else if (!nodeIds.has(atom.id)) problems.push(`missing node: ${atom.id}`);
    if (atom.content_sha256 && !HASH_PATTERN.test(atom.content_sha256)) problems.push(`bad content_sha256: ${atom.id}`);
    if (atom.content_sha256 && nodeHashes.has(atom.id) && nodeHashes.get(atom.id) !== atom.content_sha256) {
      problems.push(`content_sha256 mismatch: ${atom.id}`);
    }
  }
  return status(problems.length === 0 ? 'machine_verified' : 'failed', problems.slice(0, 5).join('; ') || 'lock matches nodes');
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function checkCoverage(skillPath) {
  const coveragePath = path.join(skillPath, 'coverage.json');
  const reportPath = path.join(skillPath, 'coverage.md');
  if (!exists(coveragePath) || !exists(reportPath)) return status('failed', 'coverage.json or coverage.md is missing');
  let coverage;
  try {
    coverage = JSON.parse(readText(coveragePath));
  } catch (error) {
    return status('failed', `coverage.json is not JSON: ${error.message}`);
  }
  const problems = [];
  for (const file of coverage.files || []) {
    if ((file.gaps || []).length > 0) problems.push(`gap: ${file.path}`);
    if ((file.overlaps || []).length > 0) problems.push(`overlap: ${file.path}`);
    if (file.attributed !== file.lines) problems.push(`attribution: ${file.path}`);
  }
  if (!Array.isArray(coverage.files) || coverage.files.length === 0) problems.push('no source files');
  return status(problems.length === 0 ? 'machine_verified' : 'failed', problems.slice(0, 5).join('; ') || 'coverage partition ok');
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function checkRegistry(skillPath) {
  const lockPath = path.join(skillPath, 'atoms.lock.json');
  if (!exists(lockPath)) return status('failed', 'atoms.lock.json is missing');
  const lock = JSON.parse(readText(lockPath));
  const rules = (lock.atoms || []).filter((atom) => atom.type === 'Rule');
  const ids = new Set();
  const problems = [];
  for (const rule of rules) {
    if (!rule.id || !RULE_ID_PATTERN.test(rule.id)) problems.push(`bad rule id: ${rule.id}`);
    if (ids.has(rule.id)) problems.push(`duplicate rule id: ${rule.id}`);
    ids.add(rule.id);
  }
  if (rules.length === 0) problems.push('no Rule atoms');
  return status(problems.length === 0 ? 'machine_verified' : 'failed', problems.slice(0, 5).join('; ') || `${rules.length} rule atoms`);
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function checkGenericBoundary(skillPath) {
  const redactionPath = path.join(skillPath, 'source/redaction.sha256.json');
  if (!exists(redactionPath)) return status('failed', 'source/redaction.sha256.json is missing');
  let redaction;
  try {
    redaction = JSON.parse(readText(redactionPath));
  } catch (error) {
    return status('failed', `redaction map is not JSON: ${error.message}`);
  }
  const forbidden = new Set((redaction || []).map((entry) => entry.sha256));
  const files = listFiles(skillPath);
  for (const file of files) {
    const text = readText(file);
    for (const token of text.match(/[A-Za-z][A-Za-z0-9_]*/g) || []) {
      if (forbidden.has(sha256(token.toLowerCase()))) {
        return status('failed', `forbidden token in ${file}`);
      }
    }
  }
  const skillText = readText(path.join(skillPath, 'SKILL.md'));
  if (!/## Procedure/.test(skillText)) return status('failed', 'SKILL.md lacks ## Procedure');
  if (/^## Rule/m.test(skillText)) return status('failed', 'SKILL.md carries rule text');
  return status('machine_verified', 'generic boundary ok');
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function checkDelivery(skillPath) {
  const nodes = listFiles(path.join(skillPath, 'okf/nodes'), (file) => file.endsWith('.md'));
  const problems = [];
  for (const nodePath of nodes) {
    const fields = parseNodeFrontmatter(readText(nodePath));
    if (!fields) {
      problems.push(`no frontmatter: ${nodePath}`);
      continue;
    }
    if (!fields.type || !fields.delivery || !fields.phase) problems.push(`incomplete frontmatter: ${nodePath}`);
    if (STRUCTURAL_TYPES.has(fields.type) && fields.delivery === 'must') problems.push(`structural must: ${fields.id}`);
    if (fields.delivery === 'must' && !MUST_TYPES.has(fields.type)) problems.push(`must on ${fields.type}: ${fields.id}`);
  }
  return status(problems.length === 0 ? 'machine_verified' : 'failed', problems.slice(0, 5).join('; ') || 'delivery ok');
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function defaultRunner({ scriptPath, args, cwd }) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function checkRuntime(skillPath, runner) {
  const scriptPath = path.join(skillPath, 'dist/skill.mjs');
  const lockPath = path.join(skillPath, 'atoms.lock.json');
  const commands = [
    ['check', 'lint'],
    ['check', 'graph'],
    ['check', 'coverage', '--lock', lockPath],
    ['check', 'audit', '--lock', lockPath],
  ];
  for (const args of commands) {
    const result = runner({ scriptPath, args, cwd: skillPath });
    if (result.status !== 0) {
      return status('failed', `runtime ${args.join(' ')} exited ${result.status}`, { stderr: result.stderr });
    }
  }
  return status('machine_verified', 'runtime checks ok');
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function defaultTestRunner({ files, cwd }) {
  const result = spawnSync(process.execPath, ['--test', ...files], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function checkTests(skillPath, testRunner) {
  const testsDirectory = path.join(skillPath, 'tests');
  const allTests = listFiles(testsDirectory, (file) => /\.test\.mjs$/.test(file));
  const optional = allTests.filter((file) => {
    const text = readText(file);
    return /scripts\/lib\/dist\.mjs|\besbuild\b/.test(text);
  });
  const core = allTests.filter((file) => !optional.includes(file));
  if (core.length === 0) return status('unverifiable', 'no dependency-free test files', { optional });
  const result = testRunner({ files: core, cwd: skillPath });
  if (result.status !== 0) return status('failed', `core tests exited ${result.status}`, { optional, stderr: result.stderr });
  return status('machine_verified', `${core.length} core tests passed`, { optional });
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function checkInstaller(skillPath) {
  const installerPath = path.join(skillPath, 'install.js');
  if (!exists(installerPath)) return status('failed', 'install.js is missing');
  const text = readText(installerPath);
  if (BUILD_COMMAND_PATTERN.test(text)) return status('failed', 'install.js contains a build command');
  if (!COPY_COMMAND_PATTERN.test(text)) return status('failed', 'install.js contains no copy command');
  return status('machine_verified', 'installer copies only');
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function checkDeterminism(skillPath, runner) {
  const scriptPath = path.join(skillPath, 'dist/skill.mjs');
  const first = runner({ scriptPath, args: ['check', 'lint'], cwd: skillPath });
  const second = runner({ scriptPath, args: ['check', 'lint'], cwd: skillPath });
  if (first.status !== 0 || second.status !== 0) return status('failed', 'check lint failed');
  if (first.stdout !== second.stdout) return status('failed', 'check lint output is not deterministic');
  return status('machine_verified', 'deterministic lint output');
}

/**
 * Verify one *-law skill.
 *
 * @param {{ skillPath: string, root?: string, outPath?: string, runner?: Function, testRunner?: Function }} input
 * @returns {object} law-skill-verification/v1
 */
export function verifyLawSkill({
  skillPath,
  root = process.cwd(),
  outPath = null,
  runner = defaultRunner,
  testRunner = defaultTestRunner,
} = {}) {
  const resolvedSkillPath = path.resolve(skillPath);
  if (!exists(resolvedSkillPath)) {
    throw Object.assign(new Error(`law skill not found: ${resolvedSkillPath}`), { code: 'LAW_SKILL_INVALID' });
  }
  const checks = {
    layer: checkLayer(resolvedSkillPath),
    manifest: checkManifest(resolvedSkillPath),
    lock: checkLock(resolvedSkillPath),
    coverage: checkCoverage(resolvedSkillPath),
    registry: checkRegistry(resolvedSkillPath),
    genericBoundary: checkGenericBoundary(resolvedSkillPath),
    delivery: checkDelivery(resolvedSkillPath),
    runtime: checkRuntime(resolvedSkillPath, runner),
    tests: checkTests(resolvedSkillPath, testRunner),
    installer: checkInstaller(resolvedSkillPath),
    determinism: checkDeterminism(resolvedSkillPath, runner),
  };
  const closure = sha256(VERIFIER_CHECKS.map((name) => `${name}:${checks[name].status}`).join('\n'));
  const report = {
    schema: VERIFIER_SCHEMA,
    skill: resolvedSkillPath,
    root: path.resolve(root),
    checks,
    closure_sha256: closure,
  };
  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(path.resolve(outPath), `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

/** Machine pass only: every required check is machine_verified. */
export function assertMachineVerified({ report }) {
  const failed = VERIFIER_CHECKS.filter((name) => report?.checks?.[name]?.status !== 'machine_verified');
  if (failed.length > 0) {
    throw Object.assign(
      new Error(`*-law skill verification failed: ${failed.join(', ')}`),
      { code: 'LAW_SKILL_INVALID', failed },
    );
  }
  return report;
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

export function main(argv = process.argv.slice(2)) {
  const skillPath = argumentValue(argv, 'skill');
  const outPath = argumentValue(argv, 'out');
  if (!skillPath) {
    process.stdout.write(`${JSON.stringify({ code: 'LAW_SKILL_INVALID', message: '--skill is required' })}\n`);
    return 1;
  }
  try {
    const report = verifyLawSkill({
      skillPath,
      root: argumentValue(argv, 'root') || process.cwd(),
      outPath,
      testRunner: argv.includes('--skip-tests')
        ? () => ({ status: 0, stdout: 'skipped by caller', stderr: '' })
        : defaultTestRunner,
    });
    assertMachineVerified({ report });
    process.stdout.write(`${JSON.stringify({ ok: true, schema: report.schema, closure_sha256: report.closure_sha256 })}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, code: error.code || 'LAW_SKILL_INVALID', message: error.message, failed: error.failed || [] })}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}
