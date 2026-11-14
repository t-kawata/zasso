// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * OKF v0.2 artifact checks.
 *
 * Conformance, lint, and profile are separate verdicts. The graph and
 * navigation checks read the bundle through @okforest/okf, not a lock file.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  exists,
  listFiles,
  normalizeLf,
  parseManifest,
  sha256Text,
  status,
} from '../law-verify/source.mjs';
import {
  loadBundle,
  getOutgoing,
  getIncoming,
  resolveReference,
  validateConformance,
  lintBundle,
  checkProfile as checkBundleProfile,
  buildTraversal,
  loadProfile,
} from '../okf-core/index.mjs';
import { conceptBody } from '../okf-core/context/assemble.mjs';
import { auditUsageManual } from '../okf-core/commands/usage.mjs';
import { bodyLines } from '../okf-core/validation/conformance.mjs';
import { directoryOf } from '../okf-core/paths/directory.mjs';

const DEV_LAYERS = Object.freeze([
  'SKILL.md',
  'DESIGN.md',
  'IMPLEMENTATION-LEFTOVERS.md',
  'install.js',
  'PRE-OKF-ORIGINAL.md',
  'atoms.lock.json',
  'okf/index.md',
  'okf/log.md',
  'okf-core/index.mjs',
  'okf-core/cli.mjs',
  'scripts/cli.mjs',
  'dist/skill.mjs',
  'source/manifest.toml',
  'source/pre-okf-original.json',
  'source/input-ledger.json',
  'source/okf-profile.toml',
  'source/okf-log.json',
  'source/concept-inventory.json',
  'source/shared-engine.json',
  'package.json',
  'THIRD_PARTY_NOTICES.md',
  'tests/fixtures/runtime/runtime.json',
]);

const INSTALLED_LAYERS = Object.freeze(DEV_LAYERS.filter((entry) => ![
  'DESIGN.md',
  'IMPLEMENTATION-LEFTOVERS.md',
  'install.js',
  'source/okf-profile.toml',
] .includes(entry)));

const FORBIDDEN = [
  [/[぀-ヿ一-鿿]/, 'CJK'],
  [/\bPX-\d+\b/, 'TICKET_ID'],
  [/\/Users\/[A-Za-z0-9._-]+/, 'ABSOLUTE_PATH'],
  [/rust-interface-law/, 'LAW_LEAK'],
  [/law-skill:checkpoint/, 'INTEGRATION_LEAK'],
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function failed(codes, evidence) {
  return status('failed', evidence, { codes: [...new Set([].concat(codes))] });
}

function verified(evidence) {
  return status('machine_verified', evidence, { codes: [] });
}

export function checkLayer({ skillPath, mode }) {
  const required = mode === 'installed' ? INSTALLED_LAYERS : DEV_LAYERS;
  const missing = required.filter((entry) => !exists(join(skillPath, entry)));
  return missing.length === 0 ? verified('required layers present') : failed('LAYER_MISSING', `missing: ${missing.join(', ')}`);
}

export function checkManifest({ skillPath, sourceRoot, aliasPath }) {
  if (!sourceRoot) return status('unverifiable', 'manifest needs --source-root', { codes: ['SOURCE_ROOT_REQUIRED'] });
  const manifestPath = join(skillPath, 'source/manifest.toml');
  if (!exists(manifestPath)) return failed('MANIFEST_MISSING', manifestPath);
  const manifest = parseManifest(readFileSync(manifestPath, 'utf8'));
  const aliasMap = readJson(aliasPath);
  const findings = [];
  for (const file of manifest.files ?? []) {
    const original = aliasMap.aliases?.[file.path];
    if (!original) {
      findings.push(`${file.path}:UNMAPPED`);
      continue;
    }
    const absolute = resolve(sourceRoot, original);
    if (!exists(absolute)) {
      findings.push(`${file.path}:MISSING`);
      continue;
    }
    if (sha256Text(normalizeLf(readFileSync(absolute, 'utf8'))) !== file.sha256) findings.push(`${file.path}:DRIFT`);
  }
  findings.push(...checkPreOkfOriginal({ skillPath, sourceRoot, aliases: aliasMap.aliases ?? {} }));
  const preFindings = findings.filter((finding) => finding.startsWith('PRE_OKF'));
  const sourceFindings = findings.filter((finding) => !finding.startsWith('PRE_OKF'));
  if (sourceFindings.length > 0) return failed('SOURCE_VIEW_DRIFT', findings.join(', '));
  if (preFindings.length > 0) return failed(preFindings[0].split(':')[0], preFindings.join(', '));
  return verified('manifest hashes match sources');
}

/**
 * PRE-OKF-ORIGINAL.md is the portable copy of the build input. A skill that
 * ships the OKF form without the original is not independently auditable.
 */
function checkPreOkfOriginal({ skillPath, sourceRoot, aliases }) {
  const findings = [];
  const originalPath = join(skillPath, 'PRE-OKF-ORIGINAL.md');
  const ledgerPath = join(skillPath, 'source/pre-okf-original.json');
  if (!exists(originalPath)) findings.push('PRE_OKF_ORIGINAL_MISSING:file');
  if (!exists(ledgerPath)) findings.push('PRE_OKF_ORIGINAL_MISSING:ledger');
  if (findings.length > 0) return findings;
  const record = readJson(ledgerPath);
  if (record.schema !== 'pre-okf-original/v1') findings.push('PRE_OKF_ORIGINAL_INVALID:schema');
  const text = normalizeLf(readFileSync(originalPath, 'utf8'));
  const hash = sha256Text(text);
  if (record.sha256 !== hash) findings.push('PRE_OKF_ORIGINAL_DRIFT:local');
  if (record.bytes !== Buffer.byteLength(text, 'utf8')) findings.push('PRE_OKF_ORIGINAL_DRIFT:bytes');
  const original = aliases[record.source];
  if (!original) findings.push('PRE_OKF_ORIGINAL_SOURCE_UNMAPPED');
  else {
    const absolute = resolve(sourceRoot, original);
    if (!exists(absolute)) findings.push('PRE_OKF_ORIGINAL_SOURCE_MISSING');
    else if (sha256Text(normalizeLf(readFileSync(absolute, 'utf8'))) !== hash) findings.push('PRE_OKF_ORIGINAL_DRIFT:source');
  }
  return findings;
}

export async function checkLock({ skillPath }) {
  const lockPath = join(skillPath, 'atoms.lock.json');
  if (!exists(lockPath)) return failed('LOCK_MISSING', lockPath);
  const lock = readJson(lockPath);
  if (lock.schema !== 'okf-atoms/v2' || !Array.isArray(lock.concepts)) return failed('LOCK_INVALID', 'schema');
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const findings = [];
  for (const record of lock.concepts) {
    const concept = bundle.byId.get(record.id);
    if (!concept) {
      findings.push(`CONCEPT_MISSING:${record.id}`);
      continue;
    }
    if (concept.path !== record.path) findings.push(`PATH_MISMATCH:${record.id}`);
    if (sha256Text(conceptBody(concept)) !== record.body_sha256) findings.push(`BODY_HASH_MISMATCH:${record.id}`);
  }
  return findings.length === 0 ? verified('lock and concept bodies agree') : failed('LOCK_INVALID', findings.join(', '));
}

export async function checkCoverage({ skillPath }) {
  const lock = readJson(join(skillPath, 'atoms.lock.json'));
  const inventoryPath = join(skillPath, 'source/concept-inventory.json');
  if (!exists(inventoryPath)) return failed('COVERAGE_MISSING', inventoryPath);
  const coveragePath = join(skillPath, 'source/coverage.json');
  if (!exists(coveragePath)) return failed('COVERAGE_MISSING', coveragePath);
  const coverage = readJson(coveragePath);
  if (coverage.schema !== 'okf-source-coverage/v1') {
    return failed('COVERAGE_SCHEMA', String(coverage.schema));
  }
  const unmapped = unmappedCounts(coverage.counts ?? {});
  if (unmapped.length > 0) return failed('COVERAGE_GAP', `unmapped: ${unmapped.join(',')}`);
  const inventory = readJson(inventoryPath);
  const ids = new Set((inventory.entries ?? []).map((entry) => entry.id));
  const lockIds = new Set((lock.concepts ?? []).map((entry) => entry.id));
  const missing = [...lockIds].filter((id) => !ids.has(id));
  const extra = [...ids].filter((id) => !lockIds.has(id));
  return missing.length === 0 && extra.length === 0
    ? verified('every concept has an inventory decision and every source line is mapped')
    : failed('COVERAGE_GAP', `missing=${missing.join(',')} extra=${extra.join(',')}`);
}

// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
// The build writes one count per loss class. Naming them here keeps the
// failure code derived from the data rather than from a hardcoded list.
// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
function unmappedCounts(counts) {
  return ['unmappedHeadings', 'unmappedPreamble', 'unmappedLines']
    .filter((name) => counts[name] !== undefined && counts[name] !== 0);
}

export function checkRegistry({ skillPath }) {
  const inventoryPath = join(skillPath, 'source/concept-inventory.json');
  if (!exists(inventoryPath)) return failed('REGISTRY_MISSING', inventoryPath);
  const inventory = readJson(inventoryPath);
  const missing = (inventory.entries ?? []).filter((entry) => !entry.source);
  return missing.length === 0
    ? verified('every concept names a source')
    : failed('REGISTRY_MISMATCH', missing.map((entry) => entry.id).join(','));
}

export function checkBoundary({ skillPath, aliasPath }) {
  const findings = [];
  const scanned = [
    join(skillPath, 'SKILL.md'),
    join(skillPath, 'DESIGN.md'),
    join(skillPath, 'IMPLEMENTATION-LEFTOVERS.md'),
    ...listFiles(join(skillPath, 'okf')),
    ...listFiles(join(skillPath, 'source')),
  ].filter((file) => exists(file));
  for (const file of scanned) {
    const text = readFileSync(file, 'utf8');
    for (const [pattern, code] of FORBIDDEN) if (pattern.test(text)) findings.push(`${code}:${relative(skillPath, file)}`);
  }
  if (aliasPath && resolve(aliasPath).startsWith(`${resolve(skillPath)}/`)) findings.push('PATH_ALIAS_INSIDE');
  return findings.length === 0 ? verified('no boundary leak') : failed('BOUNDARY_LEAK', findings.slice(0, 5).join(', '));
}

export async function checkProvenance({ skillPath }) {
  const lock = readJson(join(skillPath, 'atoms.lock.json'));
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const findings = [];
  for (const record of lock.concepts ?? []) {
    const concept = bundle.byId.get(record.id);
    if (!concept) continue;
    if (!Array.isArray(concept.sources) || concept.sources.length === 0) findings.push(`CLAIM_UNSOURCED:${record.id}`);
    for (const source of concept.sources ?? []) {
      if (!source.resource || !source.id) findings.push(`CLAIM_UNSOURCED:${record.id}`);
    }
    if (!/^[0-9a-f]{64}$/.test(record.body_sha256 ?? '')) findings.push(`CLAIM_UNSOURCED:${record.id}`);
  }
  return findings.length === 0 ? verified('every concept carries provenance') : failed('CLAIM_UNSOURCED', findings.join(', '));
}

export async function checkCitation({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const findings = [];
  for (const concept of bundle.concepts) {
    const ids = new Set((concept.sources ?? []).map((source) => source.id).filter(Boolean));
    for (const footnote of concept.footnotes ?? []) {
      if (!ids.has(footnote.label)) findings.push(`CITATION_UNRESOLVED:${concept.id}->${footnote.label}`);
    }
  }
  return findings.length === 0 ? verified('source ids and footnotes agree') : failed('CITATION_UNRESOLVED', findings.join(', '));
}

export async function checkGraph({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const findings = [];
  for (const concept of bundle.concepts) {
    const index = bundle.reserved.find((file) => file.kind === 'index' && file.directory === directoryOf(concept.path));
    if (!index) {
      findings.push(`INDEX_MISSING:${concept.id}`);
      continue;
    }
    if (!index.links.some((link) => link.concept === concept.id)) findings.push(`INDEX_ORPHAN:${concept.id}`);
    for (const edge of getOutgoing(bundle, concept.id)) {
      if (edge.state !== 'resolved') continue;
      if (!getIncoming(bundle, edge.to).some((incoming) => incoming.from === concept.id)) {
        findings.push(`BACKLINK_MISSING:${concept.id}->${edge.to}`);
      }
    }
  }
  return findings.length === 0 ? verified('index and graph are consistent') : failed('GRAPH_INVALID', findings.join(', '));
}

export async function checkFreshness({ skillPath, sourceRoot, aliasPath }) {
  if (!sourceRoot) return status('unverifiable', 'freshness needs --source-root', { codes: ['SOURCE_ROOT_REQUIRED'] });
  const manifestResult = checkManifest({ skillPath, sourceRoot, aliasPath });
  if (manifestResult.status !== 'machine_verified') return failed('STALE_NODE', manifestResult.evidence);
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const stale = bundle.concepts.filter((concept) => concept.isStale(new Date()));
  return stale.length === 0 ? verified('every concept matches its source') : failed('STALE_NODE', stale.map((concept) => concept.id).join(','));
}

export async function checkConflicts({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const withConflicts = bundle.concepts.filter((concept) => (concept.frontmatter?.conflicts ?? []).length > 0);
  return withConflicts.length === 0
    ? verified('no unresolved conflict declaration')
    : failed('CONFLICT_ASYMMETRIC', withConflicts.map((concept) => concept.id).join(','));
}

export function checkUsage({ skillPath }) {
  const findings = auditUsageManual(readFileSync(join(skillPath, 'SKILL.md'), 'utf8'));
  return findings.length === 0 ? verified('usage manual is complete') : failed('USAGE_INCOMPLETE', findings.map((finding) => finding.detail).join(', '));
}

export function checkRetrieval({ skillPath, mode }) {
  const entry = mode === 'installed' ? join(skillPath, 'dist/skill.mjs') : join(skillPath, 'scripts/cli.mjs');
  const lock = readJson(join(skillPath, 'atoms.lock.json'));
  const query = lock.concepts?.[0]?.title?.split(/\s+/).slice(0, 2).join(' ') ?? '';
  // [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
  // Retrieval verifies the JSON contract; two runs must still be byte-identical.
  const first = spawnSync(process.execPath, [entry, 'search', '--query', query, '--root', join(skillPath, 'okf'), '--format', 'json'], { encoding: 'utf8' });
  const second = spawnSync(process.execPath, [entry, 'search', '--query', query, '--root', join(skillPath, 'okf'), '--format', 'json'], { encoding: 'utf8' });
  if (first.status !== 0) return failed('RETRIEVAL_FAILED', first.stderr);
  if (first.stdout !== second.stdout) return failed('RETRIEVAL_NONDETERMINISTIC', 'two runs differ');
  try {
    const rows = JSON.parse(first.stdout).rows;
    if (!Array.isArray(rows)) return failed('RETRIEVAL_INVALID', 'rows');
  } catch {
    return failed('RETRIEVAL_INVALID', 'stdout is not JSON');
  }
  return verified('retrieval is deterministic');
}

export function checkDeterminism({ skillPath }) {
  const result = spawnSync(process.execPath, [join(skillPath, 'scripts/cli.mjs'), 'rebuild', '--root', join(skillPath, 'okf')], { encoding: 'utf8' });
  if (result.status !== 0) return failed('NON_DETERMINISTIC', result.stderr);
  return verified('rebuild is byte-identical');
}

export function checkDistribution({ skillPath, aliasPath }) {
  const findings = [];
  if (aliasPath && resolve(aliasPath).startsWith(`${resolve(skillPath)}/`)) findings.push('PATH_ALIAS_INSIDE');
  const sharedPath = join(skillPath, 'source/shared-engine.json');
  if (!exists(sharedPath)) findings.push('SHARED_ENGINE_MISSING');
  else {
    const shared = readJson(sharedPath);
    if (shared.schema !== 'okf-shared-engine/v1' || !Array.isArray(shared.modules)) findings.push('SHARED_ENGINE_INVALID');
  }
  return findings.length === 0 ? verified('distribution artifacts are consistent') : failed('ENGINE_DRIFT', findings.join(', '));
}

export function checkStyle({ skillPath }) {
  const text = readFileSync(join(skillPath, 'SKILL.md'), 'utf8');
  const findings = [];
  if (/[぀-ヿ一-鿿]/.test(text)) findings.push('STYLE_NOT_ENGLISH');
  if (text.split('\n').length < 20) findings.push('STYLE_LOW_DENSITY');
  if (/\b(T[O]DO|F[I]XME|H[A]CK|X[X]X)\b/.test(text)) findings.push('STYLE_DEBRIS');
  return findings.length === 0 ? verified('skill manual style ok') : failed('STYLE_INVALID', findings.join(', '));
}

export async function checkConformance({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const findings = validateConformance(bundle);
  return findings.length === 0 ? verified('official conformance conditions hold') : failed('CONFORMANCE_FAILED', findings.map((finding) => `${finding.code}:${finding.path}`).join(', '));
}

export async function checkLint({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const findings = lintBundle(bundle);
  return findings.length === 0 ? verified('lint findings are empty') : failed('LINT_FAILED', findings.map((finding) => `${finding.code}:${finding.path}`).join(', '));
}

export async function checkProfile({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const findings = checkBundleProfile(bundle, { requiredTypes: ['Page'] });
  return findings.length === 0 ? verified('profile requirements hold') : failed('PROFILE_FAILED', findings.map((finding) => `${finding.code}:${finding.path}`).join(', '));
}

export async function checkIndexlog({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const findings = [];
  for (const concept of bundle.concepts) {
    const directory = directoryOf(concept.path);
    if (!bundle.reserved.some((file) => file.kind === 'index' && file.directory === directory)) findings.push(`INDEX_MISSING:${directory}`);
  }
  for (const log of bundle.reserved.filter((file) => file.kind === 'log')) {
    const headings = bodyLines(log).filter((line) => /^##\s+/.test(line));
    for (const heading of headings) if (!/^##\s+\d{4}-\d{2}-\d{2}\s*$/.test(heading)) findings.push(`LOG_STRUCTURE_INVALID:${log.path}`);
  }
  return findings.length === 0 ? verified('index and log structure ok') : failed('INDEXLOG_INVALID', [...new Set(findings)].join(', '));
}

export async function checkTrust({ skillPath }) {
  const allowed = new Set(['unverified', 'machine-confirmed', 'human-reviewed']);
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const findings = bundle.concepts.filter((concept) => !allowed.has(concept.trustTier));
  return findings.length === 0 ? verified('trust tiers are valid') : failed('TRUST_INVALID', findings.map((concept) => concept.id).join(','));
}

export async function checkSources({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const findings = [];
  for (const concept of bundle.concepts) {
    if ((concept.sources ?? []).length === 0) findings.push(`SOURCE_MISSING:${concept.id}`);
    for (const source of concept.sources ?? []) if (!source.resource || !source.id) findings.push(`SOURCE_INVALID:${concept.id}`);
  }
  return findings.length === 0 ? verified('every concept has sources objects') : failed('SOURCE_INVALID', findings.join(', '));
}

export function checkContext({ skillPath }) {
  const lock = readJson(join(skillPath, 'atoms.lock.json'));
  const id = lock.concepts?.[0]?.id;
  if (!id) return failed('CONTEXT_EMPTY', 'no concept');
  const required = spawnSync(process.execPath, [join(skillPath, 'scripts/cli.mjs'), 'required', '--entry', id, '--root', join(skillPath, 'okf')], { encoding: 'utf8' });
  if (required.status !== 0) return failed('CONTEXT_FAILED', required.stderr);
  const context = spawnSync(process.execPath, [join(skillPath, 'scripts/cli.mjs'), 'context', '--entry', id, '--budget', '1000000', '--root', join(skillPath, 'okf')], { encoding: 'utf8' });
  if (context.status !== 0) return failed('CONTEXT_FAILED', context.stderr);
  const tiny = spawnSync(process.execPath, [join(skillPath, 'scripts/cli.mjs'), 'context', '--entry', id, '--budget', '1', '--root', join(skillPath, 'okf')], { encoding: 'utf8' });
  if (tiny.status === 0 || !tiny.stderr.includes('BUDGET_EXCEEDED')) return failed('CONTEXT_TRUNCATED', 'over-budget context did not stop');
  const prerequisite = checkPrerequisiteClosure({ skillPath, lock });
  if (prerequisite) return prerequisite;
  return verified('context closure and budget are enforced');
}

/**
 * A multi-concept bundle must declare a reachable prerequisite chain. A flat
 * bundle still retrieves one page at a time, but `required` cannot deliver the
 * closure the traversal contract promises.
 */
function checkPrerequisiteClosure({ skillPath, lock }) {
  if ((lock.concepts ?? []).length <= 1) return null;
  const okfDir = join(skillPath, 'okf');
  const files = listFiles(okfDir).filter((file) => file.endsWith('.md') && !/\/(index|log)\.md$/.test(file));
  const declared = files.filter((file) => /^x-requires:/m.test(readFileSync(file, 'utf8')));
  if (declared.length === 0) return failed('PREREQUISITE_GRAPH_FLAT', 'no concept declares x-requires');
  const id = relative(okfDir, declared[0]).replace(/\.md$/, '');
  const required = spawnSync(process.execPath, [join(skillPath, 'scripts/cli.mjs'), 'required', '--entry', id, '--root', okfDir], { encoding: 'utf8' });
  if (required.status !== 0) return failed('CONTEXT_FAILED', required.stderr);
  const line = required.stdout.split('\n').find((entry) => entry.startsWith('- required:'));
  if (!line) return failed('PREREQUISITE_CLOSURE_FLAT', 'required line is absent');
  const ids = line.replace('- required:', '').split(',').map((entry) => entry.trim()).filter(Boolean);
  if (ids.length <= 1) return failed('PREREQUISITE_CLOSURE_FLAT', `${id} closure is single-node`);
  return null;
}

export function checkNavigation({ skillPath }) {
  const lock = readJson(join(skillPath, 'atoms.lock.json'));
  const id = lock.concepts?.[0]?.id;
  // [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
  // The verifier is a machine consumer; it reads the JSON contract explicitly.
  const show = spawnSync(process.execPath, [join(skillPath, 'scripts/cli.mjs'), 'show', id, '--root', join(skillPath, 'okf'), '--format', 'json'], { encoding: 'utf8' });
  if (show.status !== 0) return failed('NAVIGATION_FAILED', show.stderr);
  let page;
  try {
    page = JSON.parse(show.stdout);
  } catch {
    return failed('NAVIGATION_INVALID', 'show did not print JSON');
  }
  const required = ['body', 'outgoing', 'incoming', 'sources', 'trustTier', 'freshness'];
  const missing = required.filter((key) => !Object.hasOwn(page, key));
  return missing.length === 0 ? verified('one-hop payload is complete') : failed('NAVIGATION_INCOMPLETE', missing.join(','));
}

export async function checkContainment({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const result = resolveReference({ fromPath: bundle.concepts[0]?.path ?? 'a.md', rawTarget: '../../../../etc/passwd', root: join(skillPath, 'okf'), files: bundle.files });
  return result.state === 'blocked' ? verified('root escape is blocked') : failed('CONTAINMENT_FAILED', JSON.stringify(result));
}

// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
export async function checkTraversalEnvelope({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const concept = bundle.concepts[0];
  if (!concept) return failed('TRAVERSAL_EMPTY_BUNDLE', 'no concepts');
  const page = buildTraversal({ bundle, id: concept.id, profile: 'default' });
  const fields = ['protocol', 'node', 'coverage', 'frontier', 'guidance'];
  const missing = fields.filter((field) => !Object.hasOwn(page, field));
  if (missing.length > 0) return failed('TRAVERSAL_ENVELOPE_MISSING', missing.join(','));
  return page.protocol === 'okf-traversal/v1'
    ? verified('traversal envelope carries node, coverage, frontier, and guidance')
    : failed('TRAVERSAL_PROTOCOL', page.protocol);
}

// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
export async function checkFrontierCompleteness({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const empty = [];
  for (const concept of bundle.concepts) {
    const page = buildTraversal({ bundle, id: concept.id, profile: 'okf-wiki' });
    if (page.frontier.length === 0 && page.guidance.state !== 'stop') empty.push(concept.id);
  }
  return empty.length === 0
    ? verified(`${bundle.concepts.length} concepts expose a frontier or an explicit stop`)
    : failed('FRONTIER_EMPTY', empty.slice(0, 5).join(','));
}

// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
export function checkUnknownId({ skillPath }) {
  const cli = join(skillPath, 'scripts/cli.mjs');
  const result = spawnSync(process.execPath, [cli, 'show', 'does/not/exist', '--root', join(skillPath, 'okf')], { encoding: 'utf8' });
  if (result.status !== 2) return failed('UNKNOWN_ID_EXIT', String(result.status));
  return /unknown|candidate/i.test(`${result.stdout}${result.stderr}`)
    ? verified('an absent id exits 2 with a candidate message')
    : failed('UNKNOWN_ID_MESSAGE', 'no candidate message');
}

// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
export async function checkGraphReach({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const indexText = readFileSync(join(skillPath, 'okf/index.md'), 'utf8');
  const targets = [...indexText.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
  if (targets.length === 0) return failed('GRAPH_INDEX_EMPTY', 'index.md has no link');
  for (const rawTarget of targets) {
    const normalized = rawTarget.replace(/^\.\//, '');
    if (normalized.endsWith('/index.md')) {
      const directory = normalized.slice(0, -'/index.md'.length);
      if (bundle.directories.includes(directory)) {
        return verified(`index link ${rawTarget} opens directory ${directory}`);
      }
    }
    const result = resolveReference({ fromPath: 'index.md', rawTarget, root: join(skillPath, 'okf'), files: bundle.files });
    if (['resolved', 'directory', 'non-concept'].includes(result.state)) {
      return verified(`index link ${rawTarget} is reachable (${result.state})`);
    }
  }
  return failed('GRAPH_DEGENERATE', `no index link resolved: ${targets.slice(0, 3).join(', ')}`);
}

// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
export async function checkFacetSufficiency({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const concept = bundle.concepts.find((entry) => entry.type !== 'Rule') ?? bundle.concepts[0];
  if (!concept) return failed('FACET_EMPTY_BUNDLE', 'no concepts');
  const profile = loadProfile('okf-wiki');
  const page = buildTraversal({ bundle, id: concept.id, profile, payloadIds: [concept.id] });
  const consistent = page.coverage.sufficient === (page.coverage.missing.length === 0);
  return consistent
    ? verified('coverage.sufficient matches the missing facet list')
    : failed('FACET_INCONSISTENT', JSON.stringify(page.coverage));
}

// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
export async function checkGuidanceDeterminism({ skillPath }) {
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const concept = bundle.concepts[0];
  if (!concept) return failed('GUIDANCE_EMPTY_BUNDLE', 'no concepts');
  const profile = loadProfile('okf-wiki');
  const first = buildTraversal({ bundle, id: concept.id, profile });
  const second = buildTraversal({ bundle, id: concept.id, profile });
  return JSON.stringify(first.guidance) === JSON.stringify(second.guidance)
    && JSON.stringify(first.frontier) === JSON.stringify(second.frontier)
    ? verified('guidance and frontier are deterministic')
    : failed('GUIDANCE_NONDETERMINISTIC', 'two calls differ');
}

export function checkLibrary({ skillPath }) {
  const path = join(skillPath, 'okf-core/library.json');
  if (!exists(path)) return failed('LIBRARY_DECISION_MISSING', path);
  const record = readJson(path);
  return record.primary === '@okforest/okf' ? verified('library decision names @okforest/okf') : failed('LIBRARY_DECISION_INVALID', record.primary);
}

export async function checkPerformance({ skillPath }) {
  const started = Date.now();
  const bundle = await loadBundle(join(skillPath, 'okf'));
  const elapsed = Date.now() - started;
  return bundle.concepts.length > 0 && elapsed < 2000
    ? verified(`loaded ${bundle.concepts.length} concepts in ${elapsed}ms`)
    : failed('PERFORMANCE_FAILED', `${bundle.concepts.length} concepts in ${elapsed}ms`);
}

export function treeDigest(directory, roots) {
  const digest = createHash('sha256');
  for (const rootName of roots) {
    const absolute = join(directory, rootName);
    if (!exists(absolute)) continue;
    for (const file of listFiles(absolute)) {
      digest.update(relative(directory, file));
      digest.update('\0');
      digest.update(readFileSync(file));
      digest.update('\0');
    }
  }
  return digest.digest('hex');
}
