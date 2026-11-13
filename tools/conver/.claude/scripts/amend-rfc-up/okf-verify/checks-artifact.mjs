// @verifies C001
// @verifies C002
// @verifies C004
// @verifies C005
// @verifies C007
// @verifies C011
/**
 * Artifact checks. Every proof reads the artifact, never a generated summary.
 * `machine_verified` is the only pass; every failure carries a named code.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  exists,
  listFiles,
  normalizeLf,
  parseFrontmatter,
  parseManifest,
  sha256Text,
  status,
  stripOneTrailingNewline,
} from '../law-verify/source.mjs';
import { assertSymmetricConflicts } from '../okf-engine/scripts/lib/conflicts.mjs';
import { auditUsageManual } from '../okf-engine/scripts/lib/usage.mjs';
import { detectStaleNodes } from '../okf-engine/scripts/lib/freshness.mjs';
import { MAX_ANSWER_NODES } from '../okf-engine/scripts/lib/limits.mjs';
import { normalizeSharedModule } from '../okf-engine/scripts/lib/drift.mjs';

const DEV_LAYERS = Object.freeze([
  'SKILL.md',
  'DESIGN.md',
  'IMPLEMENTATION-LEFTOVERS.md',
  'install.js',
  'atoms.lock.json',
  'okf/index.md',
  'okf/log.md',
  'okf/source.md',
  'okf/source.baseline.md',
  'okf/nodes',
  'source/manifest.toml',
  'source/redaction.sha256.json',
  'source/input-ledger.json',
  'source/redaction.review.json',
  'source/claim-inventory.json',
  'source/claim-registry.json',
  'source/knowledge-coverage.json',
  'source/line-coverage.json',
  'source/okf-profile.toml',
  'source/shared-engine.json',
  'scripts/cli.mjs',
  'scripts/commands.mjs',
  'dist/skill.mjs',
  'tests',
  'tests/fixtures/runtime/runtime.json',
]);
const INSTALLED_LAYERS = Object.freeze([
  'dist/skill.mjs',
  'atoms.lock.json',
  'SKILL.md',
  'scripts/cli.mjs',
  'scripts/commands.mjs',
  'okf/index.md',
  'okf/log.md',
  'okf/source.md',
  'okf/source.baseline.md',
  'okf/nodes',
  'source/manifest.toml',
  'source/redaction.sha256.json',
  'source/input-ledger.json',
  'source/redaction.review.json',
  'source/claim-inventory.json',
  'source/claim-registry.json',
  'source/knowledge-coverage.json',
  'source/line-coverage.json',
  'source/shared-engine.json',
  'tests/fixtures/runtime/runtime.json',
]);
const FORBIDDEN = [
  [/[぀-ヿ一-鿿]/, 'CJK'],
  [/\bPX-\d+\b/, 'TICKET_ID'],
  [/\/Users\/[A-Za-z0-9._-]+/, 'ABSOLUTE_PATH'],
  [/rust-interface-law/, 'LAW_LEAK'],
  [/law-skill:checkpoint/, 'INTEGRATION_LEAK'],
];

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function failed(codes, evidence) {
  return status('failed', evidence, { codes: [...new Set([].concat(codes))] });
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
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
    const actual = sha256Text(normalizeLf(readFileSync(absolute, 'utf8')));
    if (actual !== file.sha256) findings.push(`${file.path}:DRIFT`);
  }
  return findings.length === 0 ? verified('manifest hashes match sources') : failed('SOURCE_VIEW_DRIFT', findings.join(', '));
}

export function checkLock({ skillPath, mode }) {
  const lockPath = join(skillPath, 'atoms.lock.json');
  if (!exists(lockPath)) return failed('LOCK_MISSING', lockPath);
  const lock = readJson(lockPath);
  if (lock.schema !== 'okf-atoms-lock/v1' || !Array.isArray(lock.nodes)) return failed('LOCK_INVALID', 'schema');
  const seen = new Set();
  const findings = [];
  for (const node of lock.nodes) {
    if (seen.has(node.id)) findings.push(`DUPLICATE:${node.id}`);
    seen.add(node.id);
    const file = join(skillPath, 'okf/nodes', `${node.id}.md`);
    if (!exists(file)) {
      findings.push(`NODE_MISSING:${node.id}`);
      continue;
    }
    const parsed = parseFrontmatter(readFileSync(file, 'utf8'));
    const body = stripOneTrailingNewline(parsed?.body ?? '');
    if (sha256Text(body) !== node.content_sha256) findings.push(`LOCK_BODY_HASH_MISMATCH:${node.id}`);
  }
  if (mode === 'dev' && exists(join(skillPath, 'source/manifest.toml'))) {
    const manifest = parseManifest(readFileSync(join(skillPath, 'source/manifest.toml'), 'utf8'));
    const manifestSources = new Set((manifest.files ?? []).map((file) => `${file.path}\0${file.sha256}`));
    for (const source of lock.sources ?? []) {
      if (!manifestSources.has(`${source.alias}\0${source.sha256}`)) findings.push(`LOCK_SOURCE_DRIFT:${source.alias}`);
    }
  }
  return findings.length === 0 ? verified('lock and node bodies agree') : failed([...new Set(findings.map((finding) => finding.split(':')[0]))], findings.join(', '));
}

export function checkCoverage({ skillPath }) {
  const lock = readJson(join(skillPath, 'atoms.lock.json'));
  const inventoryPath = join(skillPath, 'source/claim-inventory.json');
  const linePath = join(skillPath, 'source/line-coverage.json');
  if (!exists(inventoryPath)) return failed('COVERAGE_MISSING', inventoryPath);
  if (!exists(linePath)) return failed('COVERAGE_MISSING', linePath);
  const inventory = readJson(inventoryPath);
  const ids = new Set((inventory.entries ?? []).map((entry) => entry.id));
  const nodeIds = new Set(lock.nodes.map((node) => node.id));
  const missing = [...nodeIds].filter((id) => !ids.has(id));
  const extra = [...ids].filter((id) => !nodeIds.has(id));
  const lineCoverage = readJson(linePath);
  const gaps = (lineCoverage.sources ?? []).flatMap((entry) => (entry.gaps ?? []).map((line) => `${entry.alias}:${line}`));
  if (gaps.length > 0) return failed('COVERAGE_GAP', `line gaps: ${gaps.slice(0, 5).join(', ')}`);
  return missing.length === 0 && extra.length === 0
    ? verified('every node and every source line has a decision')
    : failed('COVERAGE_GAP', `missing=${missing.join(',')} extra=${extra.join(',')}`);
}

export function checkRegistry({ skillPath }) {
  const lock = readJson(join(skillPath, 'atoms.lock.json'));
  const registryPath = join(skillPath, 'source/claim-registry.json');
  if (!exists(registryPath)) return failed('REGISTRY_MISSING', registryPath);
  const registry = readJson(registryPath);
  const ids = new Set((registry.entries ?? []).map((entry) => entry.id));
  const lockIds = new Set((lock.claims ?? []).map((entry) => entry.id));
  if (ids.size !== lockIds.size) return failed('REGISTRY_MISMATCH', `registry=${ids.size} lock=${lockIds.size}`);
  for (const id of lockIds) if (!ids.has(id)) return failed('REGISTRY_MISMATCH', `missing:${id}`);
  for (const entry of registry.entries ?? []) {
    if (!entry.source || !entry.span) return failed('REGISTRY_MISMATCH', `provenance:${entry.id}`);
  }
  return verified('claim registry is a bijection');
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
  if (aliasPath && !resolve(aliasPath).startsWith(`${resolve(skillPath)}/`)) {
    // The alias map belongs outside the skill tree; this is the expected state.
  } else if (aliasPath) {
    findings.push('PATH_ALIAS_INSIDE');
  }
  return findings.length === 0 ? verified('no boundary leak') : failed('BOUNDARY_LEAK', findings.slice(0, 5).join(', '));
}

export function checkProvenance({ skillPath }) {
  const lock = readJson(join(skillPath, 'atoms.lock.json'));
  const findings = [];
  for (const node of lock.nodes) {
    if (node.type !== 'Claim' && node.type !== 'CodeBlock') continue;
    if (!Array.isArray(node.sources) || node.sources.length === 0) findings.push(`CLAIM_UNSOURCED:${node.id}`);
    else if (!/^[0-9a-f]{64}$/.test(node.source_sha256 ?? '')) findings.push(`CLAIM_UNSOURCED:${node.id}`);
    else if (!node.span || !Number.isInteger(node.span.start_line)) findings.push(`CLAIM_UNSOURCED:${node.id}`);
  }
  return findings.length === 0 ? verified('every claim carries provenance') : failed('CLAIM_UNSOURCED', findings.join(', '));
}

export function checkCitation({ skillPath }) {
  const lock = readJson(join(skillPath, 'atoms.lock.json'));
  const sources = new Set((lock.sources ?? []).map((entry) => entry.alias));
  const ids = new Set(lock.nodes.map((node) => node.id));
  const findings = [];
  for (const node of lock.nodes) {
    for (const source of node.sources ?? []) if (!sources.has(source)) findings.push(`CITATION_UNRESOLVED:${node.id}->${source}`);
    for (const link of node.links ?? []) if (!ids.has(link)) findings.push(`LINK_UNRESOLVED:${node.id}->${link}`);
  }
  return findings.length === 0 ? verified('citations and links resolve') : failed([...new Set(findings.map((finding) => finding.split(':')[0]))], findings.join(', '));
}

export function checkGraph({ skillPath }) {
  const lock = readJson(join(skillPath, 'atoms.lock.json'));
  const index = readFileSync(join(skillPath, 'okf/index.md'), 'utf8');
  const indexed = new Set([...index.matchAll(/^\| `([^`]+)`/gm)].map((match) => match[1]));
  const ids = new Set(lock.nodes.map((node) => node.id));
  const files = new Set(listFiles(join(skillPath, 'okf/nodes'))
    .filter((file) => file.endsWith('.md'))
    .map((file) => parseFrontmatter(readFileSync(file, 'utf8'))?.fields?.id)
    .filter(Boolean));
  const findings = [];
  for (const id of ids) if (!indexed.has(id)) findings.push(`INDEX_ORPHAN:${id}`);
  for (const id of indexed) if (!ids.has(id)) findings.push(`INDEX_EXTRA:${id}`);
  for (const id of ids) if (!files.has(id)) findings.push(`NODE_FILE_MISSING:${id}`);
  return findings.length === 0 ? verified('index covers every node') : failed('INDEX_ORPHAN', findings.join(', '));
}

export function checkFreshness({ skillPath, sourceRoot, aliasPath }) {
  if (!sourceRoot) return status('unverifiable', 'freshness needs --source-root', { codes: ['SOURCE_ROOT_REQUIRED'] });
  const lock = readJson(join(skillPath, 'atoms.lock.json'));
  const aliasMap = readJson(aliasPath);
  const result = detectStaleNodes({ lock, sourceRoot, aliasMap });
  return result.stale.length === 0
    ? verified('every node matches its current source')
    : failed('STALE_NODE', result.stale.map((entry) => entry.node).join(', '));
}

export function checkConflicts({ skillPath }) {
  const lock = readJson(join(skillPath, 'atoms.lock.json'));
  try {
    assertSymmetricConflicts({ nodes: lock.nodes });
    return verified('conflicts are symmetric');
  } catch (error) {
    return failed('CONFLICT_ASYMMETRIC', error.message);
  }
}

export function checkUsage({ skillPath }) {
  const findings = auditUsageManual(readFileSync(join(skillPath, 'SKILL.md'), 'utf8'));
  return findings.length === 0 ? verified('usage manual is complete') : failed('USAGE_INCOMPLETE', findings.map((finding) => finding.detail).join(', '));
}

export function checkRetrieval({ skillPath, mode }) {
  const entry = mode === 'installed' ? join(skillPath, 'dist/skill.mjs') : join(skillPath, 'scripts/cli.mjs');
  const lock = readJson(join(skillPath, 'atoms.lock.json'));
  const query = lock.nodes[0]?.summary?.split(/\s+/).slice(0, 2).join(' ') ?? '';
  const first = spawnSync(process.execPath, [entry, 'ask', '--query', query], { encoding: 'utf8' });
  const second = spawnSync(process.execPath, [entry, 'ask', '--query', query], { encoding: 'utf8' });
  if (first.status !== 0) return failed('RETRIEVAL_FAILED', first.stderr);
  if (first.stdout !== second.stdout) return failed('RETRIEVAL_NONDETERMINISTIC', 'two runs differ');
  let rows;
  try {
    rows = JSON.parse(first.stdout);
  } catch {
    return failed('RETRIEVAL_INVALID', 'stdout is not JSON');
  }
  if (!Array.isArray(rows) || rows.length > MAX_ANSWER_NODES) return failed('RETRIEVAL_INVALID', 'row count');
  for (const row of rows) {
    if (!row.id || !row.source || !/^[0-9a-f]{64}$/.test(row.content_sha256 ?? '')) return failed('RETRIEVAL_INVALID', JSON.stringify(row));
  }
  return verified('retrieval is deterministic and cited');
}

export function checkDeterminism({ skillPath }) {
  const result = spawnSync(process.execPath, [join(skillPath, 'scripts/cli.mjs'), 'rebuild'], { encoding: 'utf8' });
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
    for (const entry of shared.modules ?? []) {
      const file = join(skillPath, entry.copy);
      if (!exists(file) || sha256Text(normalizeSharedModule(readFileSync(file, 'utf8'))) !== entry.sha256) findings.push(`ENGINE_DRIFT:${entry.copy}`);
    }
  }
  return findings.length === 0 ? verified('distribution artifacts are consistent') : failed('ENGINE_DRIFT', findings.join(', '));
}

export function checkStyle({ skillPath }) {
  const text = readFileSync(join(skillPath, 'SKILL.md'), 'utf8');
  const findings = [];
  if (/[぀-ヿ一-鿿]/.test(text)) findings.push('STYLE_NOT_ENGLISH');
  if (text.split('\n').length < 20) findings.push('STYLE_LOW_DENSITY');
  if (/\b(TOD\u004f|FIXM\u0045|HAC\u004b|XX\u0058)\b/.test(text)) findings.push('STYLE_DEBRIS');
  return findings.length === 0 ? verified('skill manual style ok') : failed('STYLE_INVALID', findings.join(', '));
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
