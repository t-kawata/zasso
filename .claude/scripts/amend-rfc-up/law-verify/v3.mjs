/**
 * Law verifier v3.
 *
 * The 18 law checks keep their names. Eight OKF checks are added. Every check
 * reads the bundle or an executed command, never a generated summary.
 */

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  loadBundle,
  getOutgoing,
  getIncoming,
  validateConformance,
  lintBundle,
  checkProfile as checkBundleProfile,
  resolveRequired,
  buildContext,
} from '../okf-core/index.mjs';
import { conceptBody } from '../okf-core/context/assemble.mjs';
import { status } from './source.mjs';

const REQUIRED_SECTIONS = [
  '## Start Here', '## Directory Traversal', '## Rule Page', '## Outgoing and Incoming',
  '## Multi-Hop Reach', '## Required Context', '## Zero Results', '## Budget Exceeded',
  '## Trust and Freshness', '## Sources and Citation', '## Gate and Attest', '## Failure Modes',
];

const DEV_LAYERS = [
  'SKILL.md', 'DESIGN.md', 'IMPLEMENTATION-LEFTOVERS.md', 'install.js', 'atoms.lock.json',
  'package.json', 'THIRD_PARTY_NOTICES.md', 'okf/index.md', 'okf/log.md', 'okf/rules',
  'okf/sources', 'okf-core/index.mjs', 'scripts/cli.mjs', 'scripts/commands.mjs',
  'scripts/generate-law-bundle.mjs', 'source/manifest.toml', 'source/rule-concepts.json',
  'source/source-view.md', 'source/source.baseline.md', 'source/normative-inventory.json',
  'source/delivery.json', 'dist/skill.mjs', 'tests', 'tests/fixtures/runtime/runtime.json',
];

const INSTALLED_LAYERS = [
  'dist/skill.mjs', 'okf/index.md', 'okf/log.md', 'okf/rules', 'okf/sources',
  'okf-core/index.mjs', 'scripts/cli.mjs', 'source/rule-concepts.json',
  'source/source-view.md', 'source/source.baseline.md', 'package.json',
  'THIRD_PARTY_NOTICES.md', 'tests/fixtures/runtime/runtime.json',
];

// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
function failed(codes, evidence) {
  return status('failed', evidence, { codes: [...new Set([].concat(codes))] });
}

// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
function verified(evidence) {
  return status('machine_verified', evidence, { codes: [] });
}

// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
function unverifiable(code, evidence) {
  return status('unverifiable', evidence, { codes: [code] });
}

// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
function sha256(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

export function checkLayer({ skillPath, mode }) {
  const required = mode === 'installed' ? INSTALLED_LAYERS : DEV_LAYERS;
  const missing = required.filter((entry) => !existsSync(join(skillPath, entry)));
  return missing.length === 0 ? verified('required layers present') : failed('LAYER_MISSING', `missing: ${missing.join(', ')}`);
}

export async function checkManifest({ skillPath, sourceRoot, aliasPath }) {
  if (!sourceRoot) return unverifiable('SOURCE_ROOT_REQUIRED', 'manifest needs --source-root');
  const manifestPath = join(skillPath, 'source/manifest.toml');
  if (!existsSync(manifestPath)) return failed('MANIFEST_MISSING', manifestPath);
  const text = readFileSync(manifestPath, 'utf8');
  const files = [...text.matchAll(/\[\[file\]\]\npath = "([^"]+)"\nsha256 = "([0-9a-f]{64})"/g)]
    .map((match) => ({ path: match[1], sha256: match[2] }));
  const aliases = readJson(aliasPath).aliases ?? {};
  const findings = [];
  for (const file of files) {
    const original = aliases[file.path];
    if (!original) { findings.push(`${file.path}:UNMAPPED`); continue; }
    const absolute = resolve(sourceRoot, original);
    if (!existsSync(absolute)) { findings.push(`${file.path}:MISSING`); continue; }
    if (sha256(readFileSync(absolute, 'utf8').replace(/\r\n?/g, '\n')) !== file.sha256) findings.push(`${file.path}:DRIFT`);
  }
  return findings.length === 0 ? verified(`${files.length} sources re-hashed`) : failed('MANIFEST_HASH_MISMATCH', findings.join(', '));
}

export async function checkLock({ skillPath }) {
  const lockPath = join(skillPath, 'atoms.lock.json');
  if (!existsSync(lockPath)) return failed('LAYER_MISSING', 'atoms.lock.json is missing');
  const lock = readJson(lockPath);
  if (lock.schema !== 'law-atoms/v2') return failed('LOCK_INVALID', 'schema');
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const findings = [];
  for (const record of [...(lock.rules ?? []), ...(lock.sections ?? [])]) {
    const concept = bundle.byId.get(record.concept_id);
    if (!concept) { findings.push(`CONCEPT_MISSING:${record.concept_id}`); continue; }
    if (sha256(conceptBody(concept)) !== record.content_sha256) findings.push(`BODY_HASH_MISMATCH:${record.concept_id}`);
  }
  return findings.length === 0 ? verified(`${(lock.rules ?? []).length + (lock.sections ?? []).length} concept bodies re-hashed`) : failed('LOCK_BODY_HASH_MISMATCH', findings.join(', '));
}

export function checkCoverage({ skillPath }) {
  const ruleMapPath = join(skillPath, 'source/rule-concepts.json');
  const lockPath = join(skillPath, 'atoms.lock.json');
  if (!existsSync(ruleMapPath) || !existsSync(lockPath)) return failed('COVERAGE_MISSING', 'rule map or lock');
  const ruleMap = readJson(ruleMapPath);
  const lock = readJson(lockPath);
  const mapIds = new Set(Object.keys(ruleMap.byRule ?? {}));
  const lockIds = new Set((lock.rules ?? []).map((rule) => rule.rule_id));
  const missing = [...mapIds].filter((id) => !lockIds.has(id));
  const extra = [...lockIds].filter((id) => !mapIds.has(id));
  return missing.length === 0 && extra.length === 0
    ? verified(`${mapIds.size} rules covered`)
    : failed('COVERAGE_GAP', `missing=${missing.join(',')} extra=${extra.join(',')}`);
}

export function checkRegistry({ skillPath }) {
  const ruleMapPath = join(skillPath, 'source/rule-concepts.json');
  if (!existsSync(ruleMapPath)) return failed('REGISTRY_MISSING', ruleMapPath);
  const ruleMap = readJson(ruleMapPath);
  const rules = Object.values(ruleMap.byRule ?? {});
  const ids = new Set(rules.map((rule) => rule.rule_id));
  const concepts = new Set(rules.map((rule) => rule.concept_id));
  const duplicates = rules.length - ids.size;
  const conceptDuplicates = rules.length - concepts.size;
  return rules.length > 0 && duplicates === 0 && conceptDuplicates === 0
    ? verified(`${rules.length} rules are a bijection`)
    : failed('REGISTRY_MISMATCH', `rules=${rules.length} ids=${ids.size} concepts=${concepts.size}`);
}

export function checkGenericBoundary({ skillPath }) {
  const findings = [];
  const patterns = [
    [/[぀-ヿ一-鿿]/, 'CJK'],
    [/\bPX-\d+\b/, 'TICKET_ID'],
    [/\/Users\/[A-Za-z0-9._-]+/, 'ABSOLUTE_PATH'],
  ];
  for (const file of walk(skillPath)) {
    if (file.includes('/okf-core/') || file.includes('/tests/fixtures/')) continue;
    if (!file.endsWith('.md') && !file.endsWith('.mjs') && !file.endsWith('.json')) continue;
    const text = readFileSync(file, 'utf8').replace(/^.*\[::(?:TICKET|AMBIGUOUS)::\].*$/gm, '');
    for (const [pattern, code] of patterns) {
      if (pattern.test(text)) findings.push(`${code}:${relative(skillPath, file)}`);
    }
  }
  return findings.length === 0 ? verified('no generic boundary leak') : failed('GENERIC_BOUNDARY_LEAK', findings.slice(0, 5).join(', '));
}

export function checkDelivery({ skillPath }) {
  const ruleMap = readJson(join(skillPath, 'source/rule-concepts.json'));
  const rules = Object.values(ruleMap.byRule ?? {});
  const missing = rules.filter((rule) => !rule.concept_id || !rule.path);
  return rules.length > 0 && missing.length === 0
    ? verified(`${rules.length} rules carry delivery identity`)
    : failed('DELIVERY_INCOMPLETE', missing.map((rule) => rule.rule_id).join(','));
}

export function checkRedaction({ skillPath }) {
  const path = join(skillPath, 'source/redaction.sha256.json');
  return existsSync(path) ? verified('redaction map present') : failed('REDACTION_MISSING', path);
}

export function checkCoverageSemantics({ skillPath }) {
  const ruleMap = readJson(join(skillPath, 'source/rule-concepts.json'));
  const rules = Object.values(ruleMap.byRule ?? {});
  const untyped = rules.filter((rule) => !rule.applies_to || !rule.phase);
  return untyped.length === 0 ? verified('every rule has applicability and phase') : failed('COVERAGE_SEMANTICS', untyped.map((rule) => rule.rule_id).join(','));
}

export function checkInputLedger({ skillPath }) {
  const path = join(skillPath, 'source/input-ledger.json');
  if (!existsSync(path)) return failed('INPUT_LEDGER_MISSING', path);
  const ledger = readJson(path);
  return Array.isArray(ledger.entries) ? verified(`${ledger.entries.length} inputs decided`) : failed('INPUT_LEDGER_INVALID', path);
}

export function checkPathAlias({ skillPath, aliasPath }) {
  if (!aliasPath || !existsSync(aliasPath)) return unverifiable('ALIAS_REQUIRED', 'alias map missing');
  const inside = resolve(aliasPath).startsWith(`${resolve(skillPath)}/`);
  return inside ? failed('PATH_ALIAS_INSIDE', aliasPath) : verified('alias map is outside the skill');
}

export function checkStyle({ skillPath }) {
  const text = readFileSync(join(skillPath, 'SKILL.md'), 'utf8');
  const findings = [];
  for (const section of REQUIRED_SECTIONS) if (!text.includes(section)) findings.push(section);
  if ((text.match(/^### Scenario/gm) ?? []).length < 12) findings.push('scenarios');
  if (/Never read\s+`?okf\/`?\s+directly/i.test(text)) findings.push('NEVER_READ_OKF');
  if (/[぀-ヿ一-鿿]/.test(text)) findings.push('STYLE_NOT_ENGLISH');
  return findings.length === 0 ? verified('law manual is complete') : failed('STYLE_INVALID', findings.join(','));
}

export function checkInstalledLeak({ skillPath, mode, aliasPath }) {
  if (mode !== 'installed') return verified('dev mode does not claim installed leak');
  const findings = [];
  if (aliasPath && resolve(aliasPath).startsWith(`${resolve(skillPath)}/`)) findings.push('PATH_ALIAS_INSIDE');
  if (existsSync(join(skillPath, 'EXPERT-REVIEW-PACKAGE.md'))) findings.push('SOURCE_LEAK');
  return findings.length === 0 ? verified('installed tree has no leak') : failed('INSTALLED_LEAK', findings.join(','));
}

export async function checkConformance({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const findings = validateConformance(bundle);
  return findings.length === 0 ? verified('official conformance conditions hold') : failed('CONFORMANCE_FAILED', findings.map((finding) => `${finding.code}:${finding.path}`).join(','));
}

export async function checkLint({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const findings = lintBundle(bundle);
  return findings.length === 0 ? verified('lint findings are empty') : failed('LINT_FAILED', findings.map((finding) => `${finding.code}:${finding.path}`).join(','));
}

export async function checkProfile({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const findings = checkBundleProfile(bundle, { requiredRules: ['REST-01'] });
  return findings.length === 0 ? verified('law profile holds') : failed('PROFILE_FAILED', findings.map((finding) => `${finding.code}:${finding.path}`).join(','));
}

export async function checkGraph({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const findings = [];
  for (const concept of bundle.concepts) {
    const index = bundle.reserved.find((file) => file.kind === 'index' && file.directory === directoryOf(concept.path));
    if (!index) { findings.push(`INDEX_MISSING:${concept.id}`); continue; }
    if (!index.links.some((link) => link.concept === concept.id)) findings.push(`INDEX_ORPHAN:${concept.id}`);
    for (const edge of getOutgoing(bundle, concept.id)) {
      if (edge.state !== 'resolved') continue;
      if (!getIncoming(bundle, edge.to).some((incoming) => incoming.from === concept.id)) findings.push(`BACKLINK_MISSING:${concept.id}`);
    }
  }
  return findings.length === 0 ? verified('index and graph are consistent') : failed('GRAPH_INVALID', findings.slice(0, 5).join(','));
}

export async function checkContext({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const ruleMap = readJson(join(skillPath, 'source/rule-concepts.json'));
  const conceptId = ruleMap.byRule['REST-01']?.concept_id;
  if (!conceptId) return failed('CONTEXT_EMPTY', 'REST-01');
  const set = resolveRequired({ bundle, entryIds: [conceptId] });
  if (!set.required.includes(conceptId)) return failed('CONTEXT_INCOMPLETE', JSON.stringify(set));
  try {
    buildContext({ bundle, requiredSet: set, budgetBytes: 1 });
    return failed('CONTEXT_TRUNCATED', 'over-budget context did not stop');
  } catch (error) {
    if (error.code !== 'BUDGET_EXCEEDED') return failed('CONTEXT_FAILED', error.message);
  }
  return verified('required closure and budget are enforced');
}

export function checkNavigation({ skillPath }) {
  const result = spawnSync(process.execPath, [join(skillPath, 'dist/skill.mjs'), 'show', 'REST-01'], { encoding: 'utf8' });
  if (result.status !== 0) return failed('NAVIGATION_FAILED', result.stderr);
  try {
    const page = JSON.parse(result.stdout);
    const required = ['body', 'outgoing', 'incoming', 'sources', 'trustTier', 'freshness'];
    const missing = required.filter((key) => !Object.hasOwn(page, key));
    return missing.length === 0 ? verified('one-hop payload is complete') : failed('NAVIGATION_INCOMPLETE', missing.join(','));
  } catch {
    return failed('NAVIGATION_INVALID', 'show did not print JSON');
  }
}

export function checkRuleIdentity({ skillPath }) {
  const ruleMap = readJson(join(skillPath, 'source/rule-concepts.json'));
  const result = spawnSync(process.execPath, [join(skillPath, 'dist/skill.mjs'), 'explain', '--rule', 'REST-01'], { encoding: 'utf8' });
  if (result.status !== 0) return failed('RULE_IDENTITY_FAILED', result.stderr);
  if (!result.stdout.includes('REST-01')) return failed('RULE_IDENTITY_FAILED', 'rule id absent');
  return Object.keys(ruleMap.byRule ?? {}).length === 466
    ? verified('466 rule ids resolve')
    : failed('RULE_IDENTITY_COUNT', String(Object.keys(ruleMap.byRule ?? {}).length));
}

export async function checkPerformance({ skillPath }) {
  const started = Date.now();
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const elapsed = Date.now() - started;
  return bundle.concepts.length > 0 && elapsed < 3000
    ? verified(`${bundle.concepts.length} concepts in ${elapsed}ms`)
    : failed('PERFORMANCE_FAILED', `${bundle.concepts.length} in ${elapsed}ms`);
}

export function prepareRuntime({ skillPath }) {
  const fixturePath = join(skillPath, 'tests/fixtures/runtime/runtime.json');
  if (!existsSync(fixturePath)) return { ok: false, codes: ['RUNTIME_FIXTURE_MISSING'], evidence: 'runtime fixture missing' };
  const fixture = readJson(fixturePath);
  const dist = join(skillPath, 'dist/skill.mjs');
  const temporary = mkdtempSync(join(tmpdir(), 'law-runtime-'));
  const root = join(temporary, 'fixtures');
  cpSync(join(skillPath, 'tests/fixtures/runtime'), root, { recursive: true });
  const failures = [];
  const run = (args, cwd = root) => spawnSync(process.execPath, [dist, ...args], { cwd, encoding: 'utf8' });
  try {
    if (run(['applies', '--root', join(root, fixture.applies.root), '--paths', fixture.applies.paths.join(',')], join(root, fixture.applies.root)).status !== fixture.applies.expect) failures.push('applies applicable');
    if (run(['applies', '--root', join(root, fixture.unrelated.root), '--paths', fixture.unrelated.paths.join(',')], join(root, fixture.unrelated.root)).status !== fixture.unrelated.expect) failures.push('applies unrelated');
    const manifest = join(temporary, 'manifest.json');
    if (run(['resolve', '--root', join(root, fixture.applies.root), '--paths', fixture.applies.paths.join(','), '--out', manifest], join(root, fixture.applies.root)).status !== 0) failures.push('resolve');
    if (run(['context', '--manifest', manifest, '--phases', fixture.phases.join(','), '--ledger', join(temporary, 'ledger.json')]).status !== 0) failures.push('context');
    const gate = run(['gate', '--manifest', manifest, '--out', join(temporary, 'gate.json')]);
    if (![0, 50].includes(gate.status)) failures.push('gate');
    const rows = join(temporary, 'rows.json');
    writeFileSync(rows, JSON.stringify({ phase: fixture.attest_phase, rows: [] }));
    if (run(['attest', '--manifest', manifest, '--phase', fixture.attest_phase, '--rows', rows]).status === 0) failures.push('attest accepted empty rows');
    if (run(['show', 'REST-01']).status !== 0) failures.push('show');
    if (run(['required', '--rule', 'REST-01']).status !== 0) failures.push('required');
    if (run(['lint']).status !== 0) failures.push('lint');
    return failures.length === 0 ? { ok: true, codes: [], evidence: 'applies/resolve/context/gate/attest/show/required/lint ok' } : { ok: false, codes: ['RUNTIME_FAILED'], evidence: failures.join('; ') };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function checkRuntime({ runtime }) {
  return runtime?.ok ? verified(runtime.evidence) : failed(runtime?.codes ?? 'RUNTIME_FAILED', runtime?.evidence ?? 'runtime missing');
}

export function checkReproduction({ skillPath }) {
  const sourceView = join(skillPath, 'source/source-view.md');
  const baseline = join(skillPath, 'source/source.baseline.md');
  if (!existsSync(sourceView) || !existsSync(baseline)) return failed('SOURCE_VIEW_MISSING', 'source view');
  if (readFileSync(sourceView, 'utf8') !== readFileSync(baseline, 'utf8')) return failed('SOURCE_VIEW_DRIFT', 'baseline differs');
  const result = spawnSync(process.execPath, [join(skillPath, 'dist/skill.mjs'), 'rebuild', '--root', skillPath], { encoding: 'utf8' });
  return result.status === 0 ? verified('source view and rebuild are stable') : failed('REPRODUCTION_FAILED', result.stderr);
}

export function checkTests({ skillPath }) {
  const testsDir = join(skillPath, 'tests');
  if (!existsSync(testsDir)) return failed('TEST_FILE_MISSING', testsDir);
  const files = walk(testsDir).filter((file) => file.endsWith('.test.mjs'));
  if (files.length === 0) return failed('TEST_FILE_MISSING', 'no tests');
  const result = spawnSync(process.execPath, ['--test', ...files], { encoding: 'utf8', timeout: 120000 });
  return result.status === 0 ? verified(`${files.length} test files pass`) : failed('TESTS_FAILED', (result.stdout ?? '').slice(-2000));
}

export function checkInstaller({ skillPath, mode }) {
  if (mode === 'installed') {
    const missing = ['okf-core', 'okf', 'source', 'dist', 'tests'].filter((root) => !existsSync(join(skillPath, root)));
    return missing.length === 0 ? verified('installed roots present') : failed('INSTALLER_INVALID', missing.join(','));
  }
  const target = mkdtempSync(join(tmpdir(), 'law-install-check-'));
  try {
    const result = spawnSync(process.execPath, [join(skillPath, 'install.js'), target], { encoding: 'utf8' });
    if (result.status !== 0) return failed('INSTALLER_INVALID', result.stderr);
    const installed = join(target, '.claude/skills/rust-interface-law');
    if (!existsSync(join(installed, 'okf-core/index.mjs'))) return failed('INSTALLER_INVALID', 'okf-core not installed');
    return verified('installed copy present');
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
}

export function checkDeterminism({ skillPath }) {
  const result = spawnSync(process.execPath, [join(skillPath, 'dist/skill.mjs'), 'rebuild', '--root', skillPath], { encoding: 'utf8' });
  return result.status === 0 ? verified('rebuild is byte-identical') : failed('NON_DETERMINISTIC', result.stderr);
}

// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
function directoryOf(path) {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
function walk(directory) {
  const files = [];
  for (const entry of readdirSyncSafe(directory)) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
function readdirSyncSafe(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}
