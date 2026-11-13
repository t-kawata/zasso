// [::TICKET::] PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-422 --for-spec --no-implementation-order`.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import {
  CANONICAL_LINES as INTEGRATION_CANONICAL_LINES,
  INTEGRATION_CODES,
  INTEGRATION_MARKER,
  MAX_CHECKPOINT_LENGTH,
} from '../../../.claude/scripts/amend-rfc-up/law-integration/contract.mjs';

/**
 * PX-420 — executable contract for the `/build-law-skill` procedure.
 *
 * This module holds the deterministic parts the command states: positional
 * argument parsing, source admission, source measurement, profile derivation,
 * rule-candidate allocation, and the static audit of the command text itself.
 * The command remains the authority for the AI-executed steps; this module is
 * the test surface that proves the stated rules are discriminator enough.
 */

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
  '## Integration Contract',
  '## Integration Checkpoints',
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
  'ARTIFACT_MISSING',
  'LEAK_DETECTED',
  'PATH_ALIAS_MISSING',
  'NORMATIVE_ORPHAN',
  'DELIVERY_OMISSION',
  'VERIFIER_V2_FAILED',
  'INSTALLED_SHA_MISMATCH',
  'CHECKPOINT_INVALID',
]);

export const EXAMPLE_LITERALS = Object.freeze([
  'NATLAB',
  'PJSIP',
  'Apple-Silicon',
  'Implementation-Handbook',
  'BUILDENV',
  'rust-interface-law',
]);

export const CANONICAL_CHECK_CONTRACT = JSON.parse(
  readFileSync(new URL('../../../.claude/scripts/amend-rfc-up/law-verify/checks.json', import.meta.url), 'utf8'),
);
export const CANONICAL_CHECKS = Object.freeze(CANONICAL_CHECK_CONTRACT.checks);

export const REQUIRED_ARTIFACTS = Object.freeze([
  'source/input-ledger.json',
  'source/redaction.review.json',
  'source/normative-inventory.json',
  'source/delivery.json',
  'okf/source.md',
  'okf/source.baseline.md',
  'tests/fixtures/runtime/runtime.json',
]);

export const STYLE_CODES = Object.freeze([
  'STYLE_NOT_ENGLISH',
  'STYLE_NOT_TELEGRAPHIC',
  'STYLE_LOW_DENSITY',
  'STYLE_REDUNDANT',
]);

export const V2_CHECKPOINT_TERMS = Object.freeze([
  'dev',
  'installed',
  'machine_verified',
  'closure',
]);

export {
  INTEGRATION_CANONICAL_LINES,
  INTEGRATION_CODES,
  INTEGRATION_MARKER,
  MAX_CHECKPOINT_LENGTH,
};

export const SPEC_FIELD_ANCHORS = Object.freeze({
  background: '## Background',
  scope: '## Scope',
  testUnit: '## Test Plan',
  testIntegration: '## Test Plan',
  testExceptions: '## Test Plan',
  default_files: '## Implementation Target Files',
  acceptanceCriteria: '## Acceptance Criteria',
  contracts: '## Contracts',
  notes: '## Notes in Prior Implementation Rounds',
  invariants: '## Invariants',
  instrumentation: '### Instrumentation',
  investigation: '## Investigation',
  boyScoutPlan: '## Boy Scout Rule',
});

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


/**
 * Whether the command declares every v2 artifact in its layout and procedure.
 *
 * @param {string} text
 * @returns {object[]}
 */
export function auditArtifacts(text) {
  const findings = [];
  const layout = sectionOf(text, '## Generated Skill Layout');
  const procedure = sectionOf(text, '## Procedure');
  for (const artifact of REQUIRED_ARTIFACTS) {
    if (!layout.includes(artifact)) {
      findings.push({ code: 'MISSING_ARTIFACT', contract: 'C001', message: `layout lacks ${artifact}` });
    }
    if (!procedure.includes(artifact)) {
      findings.push({ code: 'MISSING_ARTIFACT', contract: 'C001', message: `procedure lacks ${artifact}` });
    }
  }
  return findings;
}

/**
 * Whether the command states the leak-prevention contract.
 *
 * @param {string} text
 * @returns {object[]}
 */
export function auditLeak(text) {
  const findings = [];
  const add = (code, message) => findings.push({ code, contract: 'C002', message });
  if (!text.includes('path-alias')) add('MISSING_PATH_ALIAS', 'path alias map is not declared');
  if (!text.includes('outside the skill tree')) add('MISSING_PATH_ALIAS', 'alias map is not placed outside the skill tree');
  if (!text.includes('source/redaction.review.json')) add('MISSING_LEAK_LEDGER', 'redaction review ledger is not declared');
  if (!text.includes('forbidden')) add('MISSING_LEAK_SCAN', 'forbidden-token scan is not declared');
  if (!text.includes('installed')) add('MISSING_INSTALLED_SCAN', 'installed-tree scan is not declared');
  if (!text.includes('runtime')) add('MISSING_RUNTIME_SCAN', 'runtime output scan is not declared');
  return findings;
}

/**
 * Whether the command states the coverage-semantics contract.
 *
 * @param {string} text
 * @returns {object[]}
 */
export function auditCoverage(text) {
  const findings = [];
  const add = (code, message) => findings.push({ code, contract: 'C003', message });
  for (const artifact of ['source/input-ledger.json', 'source/normative-inventory.json', 'source/delivery.json']) {
    if (!text.includes(artifact)) add('MISSING_COVERAGE_LEDGER', `coverage ledger is not declared: ${artifact}`);
  }
  if (!text.includes('delivered_by')) add('MISSING_DELIVERY_REASON', 'delivered_by is not declared');
  if (!text.includes('fact-bearing')) add('MISSING_FACT_BEARING', 'fact-bearing classification is not declared');
  if (!text.includes('orphan')) add('MISSING_ORPHAN_GATE', 'orphan gate is not declared');
  if (!text.includes('omission')) add('MISSING_OMISSION_GATE', 'delivery omission gate is not declared');
  return findings;
}

/**
 * Whether the command states the four style findings.
 *
 * @param {string} text
 * @returns {object[]}
 */
export function auditStyle(text) {
  return STYLE_CODES
    .filter((code) => !text.includes(code))
    .map((code) => ({ code: 'MISSING_STYLE_RULE', contract: 'C006', message: code }));
}

/**
 * Whether the command consumes the frozen v2 check contract.
 *
 * @param {string} text
 * @returns {object[]}
 */
export function auditVerifierContract(text) {
  const findings = [];
  const verification = sectionOf(text, '## Verification Gates');
  if (!verification.includes('verify-law-skill.mjs')) {
    findings.push({ code: 'MISSING_VERIFIER', contract: 'C004', message: 'canonical verifier is not named' });
  }
  for (const token of ['machine_verified', 'check_set_version', 'closure', 'dev', 'installed', String(CANONICAL_CHECKS.length)]) {
    if (!verification.includes(token)) {
      findings.push({ code: 'MISSING_GATE_TERM', contract: 'C004', message: `verification gate lacks ${token}` });
    }
  }
  for (const check of CANONICAL_CHECKS) {
    if (!text.includes(`\`${check.name}\``)) {
      findings.push({ code: 'MISSING_GATE_TERM', contract: 'C004', message: `check is not declared: ${check.name}` });
    }
  }
  return findings;
}

/**
 * The law section of a pipeline command.
 *
 * @param {string} text
 * @returns {string}
 */
export function lawSectionOf(text) {
  const lines = normalizeLf(text).split('\n');
  const start = lines.findIndex((line) => /^### .*Rust interface law/.test(line));
  if (start < 0) return '';
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) break;
    body.push(lines[index]);
  }
  return body.join('\n').trim();
}

/**
 * Whether one pipeline command carries a bounded v2 checkpoint.
 *
 * @param {string} text
 * @returns {object[]}
 */
export function auditPipelineCheckpoint(text) {
  const findings = [];
  const law = lawSectionOf(text);
  if (law === '') {
    return [{ code: 'MISSING_V2_CHECKPOINT', contract: 'C005', message: 'Rust interface law section is absent' }];
  }
  for (const token of V2_CHECKPOINT_TERMS) {
    if (!law.includes(token)) {
      findings.push({ code: 'MISSING_V2_CHECKPOINT', contract: 'C005', message: `law checkpoint lacks ${token}` });
    }
  }
  if (/--(?:root|source-root|path-alias)/.test(law)) {
    findings.push({ code: 'CLI_IN_CHECKPOINT', contract: 'C005', message: 'law checkpoint duplicates exact CLI' });
  }
  const v2Lines = law.split('\n').filter((line) => /v2/i.test(line));
  if (v2Lines.length === 0) {
    findings.push({ code: 'MISSING_V2_CHECKPOINT', contract: 'C005', message: 'no v2 line' });
  }
  for (const line of v2Lines) {
    if (line.length > 240) findings.push({ code: 'CHECKPOINT_TOO_LONG', contract: 'C005', message: line.slice(0, 60) });
  }
  return findings;
}

/**
 * Whether CLAUDE.md carries the conditional v2 block.
 *
 * @param {string} text
 * @returns {object[]}
 */
export function auditClaudeBlock(text) {
  const lines = normalizeLf(text).split('\n');
  const start = lines.findIndex((line) => line.trim() === '### Rust interface law (conditional)');
  if (start < 0) {
    return [{ code: 'MISSING_V2_CHECKPOINT', contract: 'C005', message: 'conditional law block is absent' }];
  }
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) break;
    body.push(lines[index]);
  }
  const block = body.join('\n');
  return V2_CHECKPOINT_TERMS
    .filter((token) => !block.includes(token))
    .map((token) => ({ code: 'MISSING_V2_CHECKPOINT', contract: 'C005', message: `CLAUDE block lacks ${token}` }));
}

/**
 * Whether the command declares the fixed integration contract.
 *
 * The contract is intentionally one line per host file. This audit proves the
 * command carries the six canonical lines, the verifier, the gate row, and
 * every failure code that the producer must emit.
 *
 * @param {string} text
 * @returns {object[]}
 */
// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
export function auditIntegrationContract(text) {
  const findings = [];
  const add = (code, message) => findings.push({ code, contract: 'C005', message });
  const body = normalizeLf(text);
  const section = sectionOf(body, '## Integration Contract');
  if (section === '') {
    add('MISSING_INTEGRATION_CONTRACT', '## Integration Contract is absent');
    return findings;
  }
  if (!section.includes(INTEGRATION_MARKER)) {
    add('MISSING_INTEGRATION_MARKER', 'canonical marker is absent');
  }
  const markerLines = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(INTEGRATION_MARKER));
  if (markerLines.length !== Object.keys(INTEGRATION_CANONICAL_LINES).length) {
    add('MISSING_INTEGRATION_LINE', 'the section must carry exactly six canonical lines');
  }
  for (const line of markerLines) {
    if (line.length > MAX_CHECKPOINT_LENGTH) add('CHECKPOINT_TOO_LONG', 'canonical line exceeds the limit');
    if (/--(?:root|source-root|path-alias)/.test(line)) add('INTEGRATION_CLI_LEAK', 'canonical line carries exact CLI');
    for (const term of V2_CHECKPOINT_TERMS) {
      if (!line.includes(term)) add('MISSING_INTEGRATION_LINE', `canonical line lacks ${term}`);
    }
  }
  for (const [key, line] of Object.entries(INTEGRATION_CANONICAL_LINES)) {
    if (!markerLines.includes(line)) add('MISSING_INTEGRATION_LINE', `canonical line is absent or drifted: ${key}`);
  }
  if (!section.includes('verify-law-integration.mjs')) {
    add('MISSING_INTEGRATION_VERIFIER', 'integration verifier is not named');
  }
  if (!/\|\s*Integration\s*\|/.test(sectionOf(body, '## Verification Gates'))) {
    add('MISSING_INTEGRATION_GATE', 'Verification Gates lacks an Integration row');
  }
  if (!sectionOf(body, '## Procedure').includes('Step 12.5')) {
    add('MISSING_INTEGRATION_STEP', 'Step 12.5 is absent');
  }
  for (const code of INTEGRATION_CODES) {
    if (!body.includes(code)) add('MISSING_INTEGRATION_CODE', `failure table lacks ${code}`);
  }
  return findings;
}

/**
 * Whether the exported spec carries every ticket field.
 *
 * @param {object} ticket
 * @param {string} specText
 * @returns {object[]}
 */
export function auditSpecParity(ticket, specText) {
  const findings = [];
  for (const [field, anchor] of Object.entries(SPEC_FIELD_ANCHORS)) {
    const value = ticket[field];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) ? value.length === 0 : String(value).trim() === '') continue;
    if (!specText.includes(anchor)) {
      findings.push({ code: 'SPEC_FIELD_MISSING', contract: 'C005', message: `${field} anchor ${anchor}` });
      continue;
    }
    const first = Array.isArray(value) ? value[0] : value;
    const representative = first && typeof first === 'object'
      ? String(first.id ?? first.sourceEdge ?? '')
      : String(first);
    if (representative === '' || !specText.includes(representative.slice(0, 40))) {
      findings.push({ code: 'SPEC_FIELD_MISSING', contract: 'C005', message: `${field} value is absent` });
    }
  }
  return findings;
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
  if (!pathAnchor.includes("printf '%s/.claude\\n' \"$(git rev-parse --show-toplevel)\"")) {
    add('SKILL_LOCATION_DRIFT', 'C001', 'path anchor does not print <repo>/.claude from the git top-level');
  }
  if (!pathAnchor.includes('SKILL_DIR="$CLAUDE_DIR/skills/<name>-law"')) {
    add('SKILL_LOCATION_DRIFT', 'C001', 'SKILL_DIR is not fixed to $CLAUDE_DIR/skills/<name>-law');
  }
  if (/\b(?:PWD_ROOT|DEV_ROOT)\b/.test(pathAnchor)) {
    add('SKILL_LOCATION_DRIFT', 'C001', 'path anchor uses a non-canonical root or skill location');
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
  for (const token of ['check lint', 'check graph', 'check coverage', 'check audit', 'rebuild', 'byte-identical', 'forbidden']) {
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

  for (const literal of EXAMPLE_LITERALS) {
    if (body.includes(literal)) {
      add('EXAMPLE_LITERAL_IN_EXECUTION', 'C004', `command names external fixture ${literal}`);
    }
  }
  if (/\bdocs\//.test(body)) {
    add('EXTERNAL_FIXTURE_REFERENCE', 'C004', 'command names an external source path');
  }
  if (ABSOLUTE_PATH.test(body)) add('ABSOLUTE_PATH', 'C002', 'command contains an absolute path');
  if (TICKET_ID.test(body)) add('TICKET_ID', 'C005', 'command contains a ticket id');
  if (CJK.test(body)) add('CJK_TEXT', 'C001', 'command contains CJK text');

  findings.push(
    ...auditArtifacts(body),
    ...auditLeak(body),
    ...auditCoverage(body),
    ...auditStyle(body),
    ...auditVerifierContract(body),
    ...auditIntegrationContract(body),
  );

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
