// @verifies C003
// @verifies C004
// @verifies C005
// @verifies C006
// @verifies C007
/**
 * OKF runtime commands.
 *
 * The skill is a wiki, not a law gate: every command answers, explains, or
 * reports. `check` is a health check, not a completion gate.
 */

import { existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditUsageManual } from './lib/usage.mjs';
import { verifyAnswer } from './lib/answer-verify.mjs';
import { assertSymmetricConflicts, findConflictPairs } from './lib/conflicts.mjs';
import { deliverTopicContext } from './lib/context.mjs';
import { detectStaleNodes } from './lib/freshness.mjs';
import { buildOkfManifest } from './lib/manifest-export.mjs';
import { rankNodes, assertQuery } from './lib/retrieval.mjs';
import {
  renderAskMarkdown,
  renderConflictsMarkdown,
  renderFreshnessMarkdown,
  renderPageMarkdown,
  renderResolveMarkdown,
} from './lib/render-ai.mjs';
import { renderOkf, renderOkfDigest } from './lib/render-okf.mjs';
import { matchTopics } from './lib/applicability.mjs';

export function skillRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) {
      options._.push(argument);
      continue;
    }
    const body = argument.slice(2);
    const equals = body.indexOf('=');
    if (equals >= 0) options[body.slice(0, equals)] = body.slice(equals + 1);
    else if (index + 1 < argv.length && !argv[index + 1].startsWith('--')) options[body] = argv[++index];
    else options[body] = true;
  }
  return options;
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function required(options, key) {
  if (!options[key]) throw Object.assign(new Error(`--${key} is required`), { code: 'MISSING_OPTION' });
  return options[key];
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function loadLock() {
  return JSON.parse(readFileSync(join(skillRoot(), 'atoms.lock.json'), 'utf8'));
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function indexRows(lock) {
  return lock.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    topic: node.topic,
    summary: node.summary,
    source: node.sources[0],
    span: node.span,
    content_sha256: node.content_sha256,
  }));
}

export function askCommand(argv) {
  const options = parseArgs(argv);
  const lock = loadLock();
  const rows = rankNodes({ index: indexRows(lock), query: required(options, 'query') });
  if (options.format === 'markdown') process.stdout.write(renderAskMarkdown({ query: options.query, rows }));
  else process.stdout.write(`${JSON.stringify(rows)}\n`);
}

export function searchCommand(argv) {
  askCommand(argv);
}

export function pageCommand(argv) {
  const options = parseArgs(argv);
  const lock = loadLock();
  const node = lock.nodes.find((entry) => entry.id === required(options, 'id'));
  if (!node) throw Object.assign(new Error(`unknown node: ${options.id}`), { code: 'UNKNOWN_NODE' });
  process.stdout.write(renderPageMarkdown(node));
}

export function explainCommand(argv) {
  pageCommand(argv);
}

export function relatedCommand(argv) {
  const options = parseArgs(argv);
  const lock = loadLock();
  const node = lock.nodes.find((entry) => entry.id === required(options, 'id'));
  if (!node) throw Object.assign(new Error(`unknown node: ${options.id}`), { code: 'UNKNOWN_NODE' });
  process.stdout.write(`${JSON.stringify({ id: node.id, links: node.links, conflicts: node.conflicts })}\n`);
}

export function gapsCommand(argv) {
  const options = parseArgs(argv);
  const lock = loadLock();
  const topic = options.topic;
  const nodes = lock.nodes.filter((node) => !topic || node.topic === topic);
  const gaps = nodes.filter((node) => !node.summary || node.summary.length === 0).map((node) => node.id);
  process.stdout.write(`${JSON.stringify({ topic: topic ?? null, nodes: nodes.length, gaps })}\n`);
}

export function resolveCommand() {
  process.stdout.write(renderResolveMarkdown({ lock: loadLock() }));
}

export function contextCommand(argv) {
  const options = parseArgs(argv);
  const lock = loadLock();
  const topics = String(required(options, 'topics')).split(',').map((topic) => topic.trim()).filter(Boolean);
  const result = deliverTopicContext({ lock, topics, ledger: options.ledger ?? join(skillRoot(), 'target/okf-ledger.json') });
  process.stdout.write(`${JSON.stringify({ topics: result.topics, nodes: result.nodes.map((node) => node.id), hash: result.hash })}\n`);
}

export function freshnessCommand(argv) {
  const options = parseArgs(argv);
  const lock = loadLock();
  const aliasMap = JSON.parse(readFileSync(required(options, 'alias'), 'utf8'));
  const result = detectStaleNodes({ lock, sourceRoot: required(options, 'root'), aliasMap });
  process.stdout.write(options.format === 'markdown' ? renderFreshnessMarkdown(result) : `${JSON.stringify(result.stale)}\n`);
  return result.stale.length === 0 ? 0 : 1;
}

export function conflictsCommand(argv) {
  const options = parseArgs(argv);
  const lock = loadLock();
  assertSymmetricConflicts({ nodes: lock.nodes });
  const pairs = findConflictPairs({ nodes: lock.nodes });
  process.stdout.write(options.format === 'markdown' ? renderConflictsMarkdown({ pairs }) : `${JSON.stringify(pairs)}\n`);
  return 0;
}

export function verifyAnswerCommand(argv) {
  const options = parseArgs(argv);
  const lock = loadLock();
  const text = options.answer ? readFileSync(options.answer, 'utf8') : required(options, 'text');
  const result = verifyAnswer({ text, nodes: lock.nodes });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.status === 'machine_verified' ? 0 : 1;
}

export function appliesCommand(argv) {
  const options = parseArgs(argv);
  const paths = String(options.paths ?? '').split(',').filter(Boolean);
  const profile = existsSync(join(skillRoot(), 'source/okf-profile.toml'))
    ? { topics: loadLock().topics }
    : { topics: [] };
  const result = matchTopics({ profile, paths });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.matched.length > 0 ? 0 : 3;
}

export function shouldRunCommand(argv) {
  return appliesCommand(argv);
}

export function renderCommand(argv) {
  const options = parseArgs(argv);
  const lock = JSON.parse(readFileSync(required(options, 'lock'), 'utf8'));
  const out = required(options, 'out');
  renderOkf({ lock, outDir: out });
  process.stdout.write(`rendered ${lock.nodes.length} nodes to ${out}\n`);
}

export function rebuildCommand() {
  const lock = loadLock();
  const temporary = mkdtempSync(join(tmpdir(), 'okf-rebuild-'));
  try {
    renderOkf({ lock, outDir: temporary });
    for (const file of ['index.md', 'log.md', 'source.md', 'source.baseline.md']) {
      if (readFileSync(join(skillRoot(), 'okf', file), 'utf8') !== readFileSync(join(temporary, file), 'utf8')) {
        throw Object.assign(new Error(`rebuild drift: okf/${file}`), { code: 'NON_DETERMINISTIC' });
      }
    }
    process.stdout.write(`rebuild: byte-identical ${renderOkfDigest({ lock })}\n`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export async function packageCommand() {
  const { buildDist } = await import('./lib/dist.mjs');
  const result = await buildDist({ root: skillRoot() });
  process.stdout.write(`${JSON.stringify({ path: result.path, sha256: result.sha256 })}\n`);
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function parseIndex(text) {
  return text.split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => {
      const id = line.match(/^\| `([^`]+)`/) ?? [];
      return id[1] ?? null;
    })
    .filter(Boolean);
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function checkLint(lock) {
  const findings = [];
  if (!existsSync(join(skillRoot(), 'SKILL.md'))) findings.push('SKILL_MISSING');
  if (lock.nodes.length === 0) findings.push('NODE_ZERO');
  if (!existsSync(join(skillRoot(), 'okf/index.md'))) findings.push('INDEX_MISSING');
  return findings;
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function checkGraph(lock) {
  const findings = [];
  const index = new Set(parseIndex(readFileSync(join(skillRoot(), 'okf/index.md'), 'utf8')));
  const nodes = new Set(lock.nodes.map((node) => node.id));
  for (const id of nodes) if (!index.has(id)) findings.push(`INDEX_ORPHAN:${id}`);
  for (const id of index) if (!nodes.has(id)) findings.push(`INDEX_EXTRA:${id}`);
  const known = new Set(nodes);
  for (const node of lock.nodes) {
    for (const link of node.links ?? []) if (!known.has(link)) findings.push(`LINK_UNRESOLVED:${node.id}->${link}`);
  }
  return findings;
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function checkCoverage(lock) {
  const inventory = JSON.parse(readFileSync(join(skillRoot(), 'source/claim-inventory.json'), 'utf8'));
  const ids = new Set(inventory.entries.map((entry) => entry.id));
  const findings = [];
  for (const node of lock.nodes) if (!ids.has(node.id)) findings.push(`COVERAGE_GAP:${node.id}`);
  return findings;
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function checkProvenance(lock) {
  const findings = [];
  for (const node of lock.nodes) {
    if (node.type !== 'Claim' && node.type !== 'CodeBlock') continue;
    if (!node.sources || node.sources.length === 0) findings.push(`CLAIM_UNSOURCED:${node.id}`);
    else if (!node.source_sha256) findings.push(`CLAIM_UNSOURCED:${node.id}`);
    else if (!node.span || !Number.isInteger(node.span.start_line)) findings.push(`CLAIM_UNSOURCED:${node.id}`);
  }
  return findings;
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function checkCitation(lock) {
  const sources = new Set((lock.sources ?? []).map((entry) => entry.alias));
  const findings = [];
  for (const node of lock.nodes) {
    for (const source of node.sources ?? []) if (!sources.has(source)) findings.push(`CITATION_UNRESOLVED:${node.id}->${source}`);
  }
  return findings;
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function checkUsage() {
  return auditUsageManual(readFileSync(join(skillRoot(), 'SKILL.md'), 'utf8')).map((finding) => finding.code);
}

export function checkCommand(argv) {
  const options = parseArgs(argv);
  const sub = options._[0] ?? 'lint';
  const lock = loadLock();
  const actions = {
    lint: () => checkLint(lock),
    graph: () => checkGraph(lock),
    index: () => checkGraph(lock),
    coverage: () => checkCoverage(lock),
    provenance: () => checkProvenance(lock),
    citation: () => checkCitation(lock),
    usage: () => checkUsage(),
    conflicts: () => {
      assertSymmetricConflicts({ nodes: lock.nodes });
      return findConflictPairs({ nodes: lock.nodes }).map((pair) => `CONFLICT:${pair.left}<->${pair.right}`);
    },
  };
  const action = actions[sub];
  if (!action) throw Object.assign(new Error(`unknown check: ${sub}`), { code: 'UNKNOWN_CHECK' });
  const findings = action();
  process.stdout.write(`${JSON.stringify({ check: sub, ok: findings.length === 0, findings })}\n`);
  return findings.length === 0 ? 0 : 1;
}

export function ingestCommand(argv) {
  const options = parseArgs(argv);
  const source = required(options, 'source');
  const root = required(options, 'root');
  const lock = loadLock();
  const path = join(root, source);
  if (!existsSync(path)) throw Object.assign(new Error(`source missing: ${source}`), { code: 'SOURCE_MISSING' });
  const text = readFileSync(path, 'utf8');
  const alias = `sources/${source.split('/').pop()}`;
  writeFileSync(join(skillRoot(), 'source', 'ingest-pending.json'), JSON.stringify({ alias, text }) + '\n');
  process.stdout.write(`${JSON.stringify({ schema: 'okf-ingest/v1', alias, nodes: lock.nodes.length, status: 'pending-review' })}\n`);
}

export function buildManifestCommand() {
  const lock = loadLock();
  process.stdout.write(`${JSON.stringify(buildOkfManifest({ topics: lock.topics, nodes: lock.nodes }))}\n`);
}

export function writeAtomicPublic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, text);
  renameSync(temporary, path);
}
