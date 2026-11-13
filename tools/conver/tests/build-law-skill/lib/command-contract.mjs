import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

/**
 * PX-420 — executable contract for the `/build-law-skill` procedure.
 *
 * This module holds the deterministic parts the command states: positional
 * argument parsing, source admission, source measurement, profile derivation,
 * rule-candidate allocation, and the static audit of the command text itself.
 * The command remains the authority for the AI-executed steps; this module is
 * the test surface that proves the stated rules are discriminator enough.
 */

export const ACCEPTANCE_HEADING = '## Acceptance Fixtures';
export const NON_INTERACTIVE_HEADING = '# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION';

export const PIPELINE_COMMANDS = Object.freeze([
  'make-ticket',
  'plan-ticket',
  'start-ticket',
  'review-ticket',
  'resolve-ticket',
]);

export const COMMAND_SECTIONS = Object.freeze([
  '## Path Anchor',
  '## Language Protocol',
  '## Arguments',
  '## Invariants',
  '## Input Contract',
  '## Generated Skill Layout',
  '## Procedure',
  '## Verification Gates',
  '## Failure Modes',
  '## Integration Checkpoints',
  '## Acceptance Fixtures',
  '## Completion',
]);

export const FAILURE_CODES = Object.freeze([
  'INVALID_ARGUMENT',
  'SOURCE_MISSING',
  'SOURCE_OUTSIDE_ROOT',
  'SOURCE_NOT_ENGLISH',
  'SOURCE_NOT_MARKDOWN',
  'DERIVED_EXCLUDED',
  'RULE_ZERO',
  'COVERAGE_GAP',
  'REGISTRY_MISMATCH',
  'NON_DETERMINISTIC',
  'VERIFIER_FAILED',
  'INSTALL_BLOCKED',
]);

export const EXAMPLE_LITERALS = Object.freeze([
  'NATLAB',
  'PJSIP',
  'Apple-Silicon',
  'Implementation-Handbook',
  'BUILDENV',
]);

const NORMATIVE = /\b(MUST NOT|MUST|SHALL|SHOULD|NEVER|REQUIRED|MANDATORY|PROHIBITED)\b|\b(?:Do not|DO NOT)\b/;
const CJK = /[　-〿぀-ヿ㐀-鿿豈-﫿＀-￯]/;
const TICKET_ID = /\bPX-\d+\b/;
const ABSOLUTE_PATH = /\/Users\/|\/home\/|[A-Za-z]:\\\\/;
const FLAG_IN_GRAMMAR = /--[A-Za-z]/;

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
export class ArgumentError extends Error {
// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
  constructor(code, message = code) {
    super(message);
    this.name = 'ArgumentError';
    this.code = code;
  }
}

export function sha256Text(text) {
  return createHash('sha256').update(normalizeLf(text)).digest('hex');
}

export function normalizeLf(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function splitLines(text) {
  const lines = normalizeLf(text).split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function sectionOf(text, heading) {
  const lines = normalizeLf(text).split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return '';
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) break;
    body.push(lines[index]);
  }
  return body.join('\n').trim();
}

export function parseInvocation(argv) {
  if (argv.length === 0) throw new ArgumentError('INVALID_ARGUMENT');
  if (argv.some((argument) => argument.trim() === '')) throw new ArgumentError('INVALID_ARGUMENT');
  if (argv.some((argument) => argument.startsWith('-'))) throw new ArgumentError('INVALID_ARGUMENT');

  const paired = argv.map((argument) => argument.includes('='));
  if (paired.every(Boolean)) return parsePairs(argv);
  if (paired.some(Boolean)) throw new ArgumentError('MIXED_ARGUMENT_FORMS');
  return [parseSingle(argv)];
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function parsePairs(argv) {
  const units = new Map();
  for (const argument of argv) {
    const separator = argument.indexOf('=');
    const name = argument.slice(0, separator);
    const source = argument.slice(separator + 1);
    assertName(name);
    assertSource(source);
    if (!units.has(name)) units.set(name, { name, sources: [] });
    units.get(name).sources.push(source);
  }
  return [...units.values()];
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function parseSingle(argv) {
  const [name, ...sources] = argv;
  assertName(name);
  if (sources.length === 0) throw new ArgumentError('INVALID_ARGUMENT');
  for (const source of sources) assertSource(source);
  return { name, sources };
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function assertName(name) {
  if (!/^[a-z][a-z0-9-]*-law$/.test(name)) throw new ArgumentError('INVALID_ARGUMENT');
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function assertSource(source) {
  if (!source || source.trim() === '') throw new ArgumentError('INVALID_ARGUMENT');
}

export function validateSource({ root, path }) {
  const absoluteRoot = resolve(root);
  const absolutePath = isAbsolute(path) ? resolve(path) : resolve(absoluteRoot, path);
  const relativePath = relative(absoluteRoot, absolutePath).replace(/\\/g, '/');
  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new ArgumentError('SOURCE_OUTSIDE_ROOT');
  }
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new ArgumentError('SOURCE_MISSING');
  }
  if (!/\.(md|markdown)$/i.test(absolutePath)) {
    throw new ArgumentError('SOURCE_NOT_MARKDOWN');
  }
  const buffer = readFileSync(absolutePath);
  if (buffer.includes(0)) throw new ArgumentError('SOURCE_NOT_MARKDOWN');
  const text = normalizeLf(buffer.toString('utf8'));
  if (CJK.test(text)) throw new ArgumentError('SOURCE_NOT_ENGLISH');
  return { path: relativePath, absolute: absolutePath, text, sha256: sha256Text(text), ...measureSource(text) };
}

export function measureSource(text) {
  const lines = splitLines(text);
  let inFence = false;
  let normative = 0;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && !/^#{1,6}\s/.test(line) && NORMATIVE.test(line)) normative += 1;
  }
  return {
    lines: lines.length,
    headings: lines.filter((line) => /^#{1,6}\s/.test(line)).length,
    fences: lines.filter((line) => /^\s*```/.test(line)).length,
    tableRows: lines.filter((line) => /^\s*\|/.test(line)).length,
    normative,
  };
}

export function deriveProfile({ sources }) {
  const headings = sources.flatMap((source) => splitLines(source.text)
    .filter((line) => /^##\s/.test(line))
    .map((line) => line.replace(/^##\s+/, '').trim()));
  const phases = dedupe(['scope', ...headings.map(slug)].slice(0, 15));
  if (!phases.includes('review')) phases.push('review');
  const prefixes = [];
  const prefixForPhase = {};
  for (const phase of phases) {
    const prefix = uniquePrefix(prefixFrom(phase), prefixes);
    prefixes.push(prefix);
    prefixForPhase[phase] = prefix;
  }
  const title = sources.flatMap((source) => splitLines(source.text))
    .find((line) => /^#\s/.test(line));
  return {
    domain: slug(title ? title.replace(/^#\s+/, '') : sources[0]?.path ?? 'law'),
    phases,
    surfaces: [...phases],
    prefixes,
    prefixForPhase,
    sourcePaths: sources.map((source) => source.path),
  };
}

export function allocateRuleCandidates({ sources, profile }) {
  const counters = new Map();
  const candidates = [];
  for (const source of sources) {
    let heading = 'scope';
    let inFence = false;
    const lines = splitLines(source.text);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const h2 = line.match(/^##\s+(.*)$/);
      if (h2) {
        heading = slug(h2[1]);
        continue;
      }
      if (/^#{1,6}\s/.test(line)) continue;
      if (!NORMATIVE.test(line)) continue;
      const prefix = profile.prefixForPhase[heading] ?? profile.prefixes[0] ?? 'GEN';
      const ordinal = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, ordinal);
      candidates.push({
        id: `${prefix}-${String(ordinal).padStart(2, '0')}`,
        source: source.path,
        line: index + 1,
        heading,
        statement: line.trim(),
      });
    }
  }
  return candidates;
}

export function auditCommand(text) {
  const findings = [];
  const add = (code, contract, message) => findings.push({ code, contract, message });
  const body = normalizeLf(text);

  auditFrontmatter(body, add);
  if (!body.includes(NON_INTERACTIVE_HEADING)) {
    add('MISSING_NON_INTERACTIVE', 'C001', 'non-interactive execution block is absent');
  }
  for (const heading of COMMAND_SECTIONS) {
    if (!body.includes(`${heading}\n`) && !body.endsWith(heading)) {
      add('MISSING_SECTION', 'C001', `missing ${heading}`);
    }
  }

  const pathAnchor = sectionOf(body, '## Path Anchor');
  if (!pathAnchor.includes('SKILL_DIR="$PWD_ROOT/.claude/skills/<name>-law"')) {
    add('SKILL_LOCATION_DRIFT', 'C001', 'SKILL_DIR is not fixed to $PWD_ROOT/.claude/skills/<name>-law');
  }
  if (/DEV_ROOT\s*=/.test(pathAnchor)) {
    add('SKILL_LOCATION_DRIFT', 'C001', 'path anchor assigns DEV_ROOT instead of the current directory');
  }

  const argumentsSection = sectionOf(body, '## Arguments');
  if (FLAG_IN_GRAMMAR.test(argumentsSection)) {
    add('FLAG_IN_ARGUMENT_GRAMMAR', 'C001', 'argument grammar contains an option flag');
  }
  if (!argumentsSection.includes('<skill-name> <source-doc>')
    || !argumentsSection.includes('<skill-name>=<source-doc>')) {
    add('MISSING_ARGUMENT_FORM', 'C001', 'both positional forms are not stated');
  }
  if (!/mix/i.test(argumentsSection) || !/reject/i.test(argumentsSection)) {
    add('MISSING_MIXING_REJECTION', 'C001', 'mixed-form rejection is not stated');
  }

  const inputContract = sectionOf(body, '## Input Contract');
  for (const token of ['English', 'Markdown', 'LF', 'SHA-256']) {
    if (!inputContract.includes(token)) add('MISSING_INPUT_CONTRACT', 'C002', `input contract lacks ${token}`);
  }
  if (!inputContract.includes('read-only')) {
    add('MISSING_SOURCE_READ_ONLY', 'C002', 'input contract does not declare sources read-only');
  }

  const layout = sectionOf(body, '## Generated Skill Layout');
  for (const token of ['okf/', 'atoms.lock.json', 'coverage.json', 'source/manifest.toml', 'scripts/', 'dist/skill.mjs', 'install.js', 'tests/']) {
    if (!layout.includes(token)) add('MISSING_LAYER', 'C001', `layout lacks ${token}`);
  }

  const procedure = sectionOf(body, '## Procedure');
  for (const token of ['Step 0', 'Step 14', 'Red', 'Green', 'Refactor', 'profile', 'registry', 'OKF', 'dist', 'staging', 'rollback']) {
    if (!procedure.includes(token)) add('MISSING_PROCEDURE_TERM', 'C001', `procedure lacks ${token}`);
  }

  const verification = sectionOf(body, '## Verification Gates');
  if (!verification.includes('verify-law-skill.mjs')) {
    add('MISSING_VERIFIER', 'C003', 'canonical verifier is not named');
  }
  for (const token of ['machine_verified', '11', 'check lint', 'check graph', 'check coverage', 'check audit', 'rebuild', 'byte-identical', 'forbidden']) {
    if (!verification.includes(token)) add('MISSING_GATE_TERM', 'C003', `verification gate lacks ${token}`);
  }

  const failureModes = sectionOf(body, '## Failure Modes');
  for (const code of FAILURE_CODES) {
    if (!failureModes.includes(code)) add('MISSING_FAILURE_CODE', 'C002', `failure table lacks ${code}`);
  }

  const checkpoints = sectionOf(body, '## Integration Checkpoints');
  for (const command of PIPELINE_COMMANDS) {
    if (!checkpoints.includes(command)) add('MISSING_CHECKPOINT', 'C005', `checkpoint lacks ${command}`);
  }
  if (!checkpoints.includes('SKILL.md')) {
    add('MISSING_CLI_PLACEMENT', 'C005', 'checkpoint does not name SKILL.md as the CLI home');
  }
  if (checkpoints.includes('--root')) {
    add('CLI_IN_CHECKPOINT', 'C005', 'checkpoint duplicates exact CLI');
  }
  if (checkpoints.split('\n').filter((line) => line.trim() !== '').length > 5) {
    add('CHECKPOINT_TOO_LONG', 'C005', 'checkpoint block exceeds five lines');
  }

  const acceptance = sectionOf(body, ACCEPTANCE_HEADING);
  if (!body.includes(`${ACCEPTANCE_HEADING}\n`)) {
    add('MISSING_SECTION', 'C004', `missing ${ACCEPTANCE_HEADING}`);
  }
  for (const path of [
    'docs/NATLAB/Implementation-Handbook.md',
    'docs/BUILDENV/Apple-Silicon-Local-Rust-FFI-Runbook.md',
    'docs/BUILDENV/PJSIP-BUILD-GUIDE.md',
  ]) {
    if (!acceptance.includes(path)) add('MISSING_ACCEPTANCE_FIXTURE', 'C004', `acceptance lacks ${path}`);
  }

  const cut = body.indexOf(ACCEPTANCE_HEADING);
  const execution = cut < 0 ? body : body.slice(0, cut);
  for (const literal of EXAMPLE_LITERALS) {
    if (execution.includes(literal)) {
      add('EXAMPLE_LITERAL_IN_EXECUTION', 'C004', `execution logic names ${literal}`);
    }
  }
  if (ABSOLUTE_PATH.test(execution)) add('ABSOLUTE_PATH', 'C002', 'execution logic contains an absolute path');
  if (TICKET_ID.test(execution)) add('TICKET_ID', 'C005', 'execution logic contains a ticket id');
  if (CJK.test(execution)) add('CJK_TEXT', 'C001', 'execution logic contains CJK text');

  if (!body.includes('node --test')) {
    add('MISSING_NODE_TEST_POLICY', 'C006', 'node --test policy is absent');
  }
  if (/\bmake test\b/.test(body) && !/never[^\n]*make test/i.test(body)) {
    add('MAKE_TEST_ALLOWED', 'C006', 'make test appears without a prohibition');
  }
  for (const token of ['rebuild', 'byte-identical']) {
    if (!verification.includes(token)) add('MISSING_DETERMINISM_TERM', 'C006', `determinism gate lacks ${token}`);
  }
  for (const token of ['stable sort', 'atomic']) {
    if (!body.includes(token)) add('MISSING_DETERMINISM_TERM', 'C006', `determinism term absent: ${token}`);
  }

  return findings;
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function auditFrontmatter(body, add) {
  if (!body.startsWith('---\n')) {
    add('MISSING_FRONTMATTER', 'C001', 'frontmatter is absent');
    return;
  }
  const end = body.indexOf('\n---', 4);
  if (end < 0) {
    add('MISSING_FRONTMATTER', 'C001', 'frontmatter is not closed');
    return;
  }
  const frontmatter = body.slice(0, end);
  if (!/^description:\s*\S/m.test(frontmatter)) {
    add('MISSING_FRONTMATTER', 'C001', 'description is absent');
  }
  if (!/^argument-hint:\s*\S/m.test(frontmatter)) {
    add('MISSING_FRONTMATTER', 'C001', 'argument-hint is absent');
  }
  if (!/^disable-model-invocation:\s*true$/m.test(frontmatter)) {
    add('MISSING_FRONTMATTER', 'C001', 'disable-model-invocation is not true');
  }
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'root';
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function dedupe(values) {
  return [...new Set(values.filter((value) => value !== ''))];
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function prefixFrom(phase) {
  const segment = phase.split('-').find((part) => /^[a-z]/.test(part)) ?? 'gen';
  return segment.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function uniquePrefix(base, used) {
  const safe = /^[A-Z]/.test(base) ? base : `P${base}`;
  if (!used.includes(safe)) return safe;
  let index = 2;
  while (used.includes(`${safe}${index}`)) index += 1;
  return `${safe}${index}`;
}
