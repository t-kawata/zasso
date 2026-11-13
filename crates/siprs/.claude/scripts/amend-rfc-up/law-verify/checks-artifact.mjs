/**
 * Artifact checks: every proof reads the artifact, never a generated summary.
 *
 * A check returns one status object. `machine_verified` is the only pass.
 * Every failure carries a named code so a mutated fixture can assert the exact
 * contract that failed.
 */

import path from 'node:path';
import {
  ALIAS_PATTERN,
  EVIDENCE_LIMIT,
  exists,
  hashSpan,
  isInside,
  listFiles,
  loadAliasMap,
  normalizeLf,
  parseFrontmatter,
  parseManifest,
  readText,
  redactText,
  resolveAlias,
  sha256Text,
  splitLines,
  status,
  stripOneTrailingNewline,
} from './source.mjs';
import {
  RULE_ID_PATTERN,
  collectNodes,
  collectRegistryIds,
  parseCoverageReport,
  parseMarkdownTables,
  splitRow,
} from './parsers.mjs';

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const STRUCTURAL_TYPES = new Set(['Heading', 'Blank', 'TableHeader']);
const MUST_TYPES = new Set([
  'Rule', 'CodeBlock', 'ContractType', 'InterfaceBinding', 'Operation',
  'Documentation', 'Conformance',
]);
const DEV_LAYERS = Object.freeze([
  'SKILL.md',
  'DESIGN.md',
  'IMPLEMENTATION-LEFTOVERS.md',
  'okf/index.md',
  'okf/log.md',
  'okf/source.md',
  'okf/source.baseline.md',
  'okf/nodes',
  'atoms.lock.json',
  'coverage.json',
  'coverage.md',
  'source/manifest.toml',
  'source/redaction.sha256.json',
  'source/input-ledger.json',
  'source/redaction.review.json',
  'source/normative-inventory.json',
  'source/delivery.json',
  'scripts',
  'dist/skill.mjs',
  'install.js',
  'tests',
]);
const INSTALLED_LAYERS = Object.freeze([
  'dist/skill.mjs',
  'okf/index.md',
  'okf/log.md',
  'okf/source.md',
  'okf/source.baseline.md',
  'okf/nodes',
  'source/manifest.toml',
  'source/redaction.sha256.json',
  'source/input-ledger.json',
  'source/redaction.review.json',
  'source/normative-inventory.json',
  'source/delivery.json',
  'tests/fixtures/runtime/runtime.json',
]);
const FACT_HEADERS = new Set([
  'ID', 'Rule', 'Verification', 'Gate', 'Contract', 'Operation', 'Error',
  'Required', 'Field', 'Stage', 'Level', 'Status', 'Meaning', 'Effect',
  'Value', 'Type', 'Name', 'Scope', 'Phase', 'Input', 'Output',
]);
const NORMATIVE_CONSTANT = /^(?:[A-Z]{2,}|[A-Za-z]*\d[\w.-]*|v\d+(?:\.\d+)*)$/;
const GENERIC_REASONS = new Set([
  'n/a', 'na', 'none', 'not needed', 'reference', 'no reason', 'not applicable',
]);
const FILLER_PHRASES = Object.freeze([
  /\bin order to\b/i,
  /\bit is important to note\b/i,
  /\bplease note\b/i,
  /\bneedless to say\b/i,
  /\bas a matter of fact\b/i,
  /\bdue to the fact that\b/i,
  /\bfor the purpose of\b/i,
]);
const CJK_PATTERN = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;
const MAX_AUTHORED_LINE = 600;

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function failed(code, evidence, extra = {}) {
  return status('failed', evidence, { codes: [code], ...extra });
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function verified(evidence, extra = {}) {
  return status('machine_verified', evidence, { codes: [], ...extra });
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function unverifiable(code, evidence) {
  return status('unverifiable', evidence, { codes: [code] });
}

export function checkLayer({ skillPath, mode }) {
  const required = mode === 'installed' ? INSTALLED_LAYERS : DEV_LAYERS;
  const missing = required.filter((relativePath) => !exists(path.join(skillPath, relativePath)));
  if (missing.length > 0) return failed('LAYER_MISSING', `missing: ${missing.join(', ')}`, { missing });
  return verified('all required layers present');
}

export function loadSourceContext({ skillPath, sourceRoot, aliasPath }) {
  const manifestPath = path.join(skillPath, 'source/manifest.toml');
  const redactionPath = path.join(skillPath, 'source/redaction.sha256.json');
  if (!exists(manifestPath)) {
    throw Object.assign(new Error('source/manifest.toml is missing'), { code: 'LAYER_MISSING' });
  }
  if (!exists(redactionPath)) {
    throw Object.assign(new Error('source/redaction.sha256.json is missing'), { code: 'LAYER_MISSING' });
  }
  const manifestText = readText(manifestPath);
  const manifest = parseManifest(manifestText);
  const redactionText = readText(redactionPath);
  const redaction = JSON.parse(redactionText);
  const aliasMap = loadAliasMap(aliasPath);
  const documents = [];
  for (const file of manifest.files) {
    if (!file.path || !file.sha256) {
      throw Object.assign(new Error('manifest file entry is incomplete'), { code: 'MANIFEST_HASH_MISMATCH' });
    }
    const original = resolveAlias({ alias: file.path, aliasMap, sourceRoot });
    const text = normalizeLf(readText(original));
    documents.push({ alias: file.path, original, text, lines: splitLines(text) });
  }
  return { manifest, manifestText, redaction, redactionText, aliasMap, documents };
}

export function checkManifest({ skillPath, sourceRoot, aliasPath }) {
  if (!sourceRoot) return unverifiable('SOURCE_ROOT_REQUIRED', 'dev manifest check needs --source-root');
  try {
    const context = loadSourceContext({ skillPath, sourceRoot, aliasPath });
    const problems = [];
    for (const field of ['spec_version', 'source_set_sha256', 'redaction_sha256']) {
      if (!context.manifest[field]) problems.push(`${field} is missing`);
    }
    for (const file of context.manifest.files) {
      if (!ALIAS_PATTERN.test(file.path)) problems.push(`path is not an alias: ${file.path}`);
      if (!HASH_PATTERN.test(file.sha256)) problems.push(`bad sha256: ${file.path}`);
    }
    for (const document of context.documents) {
      if (sha256Text(document.text) !== context.manifest.files.find((file) => file.path === document.alias).sha256) {
        problems.push(`source hash mismatch: ${document.alias}`);
      }
    }
    const recomputed = sha256Text(
      context.manifest.files.map((file) => `${file.path}\0${file.sha256}`).join('\n'),
    );
    if (context.manifest.source_set_sha256 !== recomputed) {
      problems.push('source_set_sha256 does not match source bytes');
    }
    if (context.manifest.redaction_sha256 !== sha256Text(context.redactionText)) {
      problems.push('redaction_sha256 does not match the redaction map');
    }
    if (problems.length > 0) return failed('MANIFEST_HASH_MISMATCH', problems.slice(0, EVIDENCE_LIMIT).join('; '));
    return verified(`${context.documents.length} sources re-hashed`);
  } catch (error) {
    return failed(error.code ?? 'MANIFEST_HASH_MISMATCH', error.message);
  }
}

export function checkLock({ skillPath, mode }) {
  const nodes = collectNodes(skillPath);
  if (nodes.length === 0) return failed('LAYER_MISSING', 'okf/nodes is empty');
  for (const node of nodes) {
    if (!node.fields?.content_sha256) return failed('LOCK_BODY_HASH_MISMATCH', `node lacks content_sha256: ${node.file}`);
    const bodyHash = sha256Text(stripOneTrailingNewline(node.body));
    if (bodyHash !== node.fields.content_sha256) {
      return failed('LOCK_BODY_HASH_MISMATCH', `node body hash mismatch: ${node.file}`);
    }
  }
  if (mode === 'installed') return verified(`${nodes.length} node bodies re-hashed`);

  const lockPath = path.join(skillPath, 'atoms.lock.json');
  if (!exists(lockPath)) return failed('LAYER_MISSING', 'atoms.lock.json is missing');
  let lock;
  try {
    lock = JSON.parse(readText(lockPath));
  } catch (error) {
    return failed('LOCK_NODE_MISMATCH', `atoms.lock.json is not JSON: ${error.message}`);
  }
  const atoms = Array.isArray(lock.atoms) ? lock.atoms : [];
  if (atoms.length !== nodes.length) {
    return failed('LOCK_NODE_MISMATCH', `node count ${nodes.length} != atom count ${atoms.length}`);
  }
  const byId = new Map(nodes.map((node) => [node.fields.id, node]));
  for (const atom of atoms) {
    const node = byId.get(atom.id);
    if (!node) return failed('LOCK_NODE_MISMATCH', `missing node: ${atom.id}`);
    if (node.fields.source !== atom.source) return failed('LOCK_BODY_HASH_MISMATCH', `source mismatch: ${atom.id}`);
    if (stripOneTrailingNewline(node.body) !== atom.text) {
      return failed('LOCK_BODY_HASH_MISMATCH', `node body differs from lock text: ${atom.id}`);
    }
    if (atom.type === 'Rule' && (!atom.source || !atom.span)) {
      return failed('LOCK_NODE_MISMATCH', `Rule atom lacks source/span: ${atom.id}`);
    }
  }
  return verified(`${nodes.length} nodes match the lock`);
}

export function checkCoverage({ skillPath, sourceRoot, aliasPath }) {
  if (!sourceRoot) return unverifiable('SOURCE_ROOT_REQUIRED', 'dev coverage check needs --source-root');
  try {
    const context = loadSourceContext({ skillPath, sourceRoot, aliasPath });
    const lock = JSON.parse(readText(path.join(skillPath, 'atoms.lock.json')));
    const coveragePath = path.join(skillPath, 'coverage.json');
    const reportPath = path.join(skillPath, 'coverage.md');
    if (!exists(coveragePath) || !exists(reportPath)) return failed('COVERAGE_DRIFT', 'coverage artifacts are missing');
    const coverage = JSON.parse(readText(coveragePath));
    const bySource = new Map();
    for (const atom of lock.atoms ?? []) {
      if (!bySource.has(atom.source)) bySource.set(atom.source, []);
      bySource.get(atom.source).push(atom);
    }
    const problems = [];
    for (const document of context.documents) {
      const atoms = bySource.get(document.alias) ?? [];
      const owners = new Map();
      let overlaps = 0;
      for (const atom of atoms) {
        for (let line = atom.span.start_line; line <= atom.span.end_line; line++) {
          if (owners.has(line)) overlaps++;
          else owners.set(line, atom.id);
        }
      }
      let gaps = 0;
      for (let line = 1; line <= document.lines.length; line++) if (!owners.has(line)) gaps++;
      const excluded = atoms
        .filter((atom) => STRUCTURAL_TYPES.has(atom.type))
        .reduce((total, atom) => total + atom.span.end_line - atom.span.start_line + 1, 0);
      const entry = (coverage.files ?? []).find((file) => file.path === document.alias);
      if (!entry) {
        problems.push(`coverage entry missing: ${document.alias}`);
        continue;
      }
      if (entry.lines !== document.lines.length) problems.push(`line count: ${document.alias}`);
      if (entry.attributed !== owners.size) problems.push(`attribution: ${document.alias}`);
      if (entry.excluded !== excluded) problems.push(`exclusion: ${document.alias}`);
      if ((entry.gaps ?? []).length !== gaps) problems.push(`gaps: ${document.alias}`);
      if ((entry.overlaps ?? []).length !== overlaps) problems.push(`overlaps: ${document.alias}`);
      if (entry.sha256 !== sha256Text(document.text)) problems.push(`source hash: ${document.alias}`);
      if (gaps > 0) return failed('COVERAGE_GAP', `coverage gap in ${document.alias}`);
      if (overlaps > 0) return failed('COVERAGE_OVERLAP', `coverage overlap in ${document.alias}`);
    }
    if ((coverage.gaps ?? []).length > 0) return failed('COVERAGE_GAP', 'global coverage gaps');
    if ((coverage.overlaps ?? []).length > 0) return failed('COVERAGE_OVERLAP', 'global coverage overlaps');
    if (coverage.source_manifest_sha256 !== sha256Text(context.manifestText)) {
      problems.push('source_manifest_sha256 mismatch');
    }
    const reportRows = parseCoverageReport(readText(reportPath));
    for (const row of reportRows) {
      const entry = (coverage.files ?? []).find((file) => file.path === row.path);
      if (!entry) {
        problems.push(`report row without coverage: ${row.path}`);
        continue;
      }
      if (row.lines !== entry.lines || row.attributed !== entry.attributed || row.excluded !== entry.excluded) {
        problems.push(`report row mismatch: ${row.path}`);
      }
      if (row.gaps !== (entry.gaps ?? []).length || row.overlaps !== (entry.overlaps ?? []).length) {
        problems.push(`report gap/overlap mismatch: ${row.path}`);
      }
    }
    if (reportRows.length !== (coverage.files ?? []).length) problems.push('coverage report row count mismatch');
    if (problems.length > 0) return failed('COVERAGE_DRIFT', problems.slice(0, EVIDENCE_LIMIT).join('; '));
    return verified(`${context.documents.length} files partitioned`);
  } catch (error) {
    return failed(error.code ?? 'COVERAGE_DRIFT', error.message);
  }
}

export function checkRegistry({ skillPath, sourceRoot, aliasPath }) {
  if (!sourceRoot) return unverifiable('SOURCE_ROOT_REQUIRED', 'dev registry check needs --source-root');
  try {
    const context = loadSourceContext({ skillPath, sourceRoot, aliasPath });
    const lock = JSON.parse(readText(path.join(skillPath, 'atoms.lock.json')));
    const ruleIds = new Set((lock.atoms ?? []).filter((atom) => atom.type === 'Rule').map((atom) => atom.id));
    const { ids, invalid } = collectRegistryIds(context.documents);
    if (invalid.length > 0) return failed('REGISTRY_BIJECTION_FAILED', `invalid registry ids: ${invalid.slice(0, 3).join(', ')}`);
    if (ruleIds.size === 0) return failed('REGISTRY_BIJECTION_FAILED', 'no Rule atoms');
    if (ruleIds.size !== ids.size) {
      return failed('REGISTRY_BIJECTION_FAILED', `Rule atoms ${ruleIds.size} != registry rows ${ids.size}`);
    }
    for (const id of ruleIds) if (!ids.has(id)) return failed('REGISTRY_BIJECTION_FAILED', `registry row missing: ${id}`);
    for (const id of ids) if (!ruleIds.has(id)) return failed('REGISTRY_BIJECTION_FAILED', `Rule atom missing: ${id}`);
    for (const atom of lock.atoms.filter((entry) => entry.type === 'Rule')) {
      if (!RULE_ID_PATTERN.test(atom.id)) return failed('REGISTRY_BIJECTION_FAILED', `bad rule id: ${atom.id}`);
    }
    return verified(`${ruleIds.size} rule ids are bijective`);
  } catch (error) {
    return failed(error.code ?? 'REGISTRY_BIJECTION_FAILED', error.message);
  }
}

export function checkGenericBoundary({ skillPath, mode }) {
  const mapPath = path.join(skillPath, 'source/redaction.sha256.json');
  if (!exists(mapPath)) return failed('LAYER_MISSING', 'redaction map is missing');
  let redaction;
  try {
    redaction = JSON.parse(readText(mapPath));
  } catch (error) {
    return failed('REDACTION_MAP_MISMATCH', `redaction map is not JSON: ${error.message}`);
  }
  if (!Array.isArray(redaction)) return failed('REDACTION_MAP_MISMATCH', 'redaction map is not an array');
  for (const entry of redaction) {
    const keys = Object.keys(entry ?? {}).sort();
    if (keys.length !== 2 || keys[0] !== 'placeholder' || keys[1] !== 'sha256' || !HASH_PATTERN.test(entry.sha256)) {
      return failed('REDACTION_MAP_MISMATCH', 'redaction map is not hash-only');
    }
  }
  const forbidden = new Set(redaction.map((entry) => entry.sha256));
  for (const file of listFiles(skillPath)) {
    const text = readText(file);
    for (const match of text.matchAll(/[A-Za-z][A-Za-z0-9_]*/g)) {
      if (forbidden.has(sha256Text(match[0].toLowerCase()))) {
        return failed('FORBIDDEN_TOKEN', `forbidden token in ${path.relative(skillPath, file)}`);
      }
    }
  }
  if (mode === 'dev') {
    const skillText = readText(path.join(skillPath, 'SKILL.md'));
    if (!/## Procedure/.test(skillText)) return failed('SKILL_PROCEDURE_MISSING', 'SKILL.md lacks ## Procedure');
    if (/^## Rule/m.test(skillText)) return failed('FORBIDDEN_TOKEN', 'SKILL.md carries rule text');
  }
  return verified('generic boundary ok');
}

export function checkDelivery({ skillPath }) {
  const nodes = collectNodes(skillPath);
  const problems = [];
  for (const node of nodes) {
    const fields = node.fields;
    if (!fields) {
      problems.push(`no frontmatter: ${node.file}`);
      continue;
    }
    if (!fields.type || !fields.delivery || !fields.phase) problems.push(`incomplete frontmatter: ${node.file}`);
    if (STRUCTURAL_TYPES.has(fields.type) && fields.delivery === 'must') problems.push(`structural must: ${fields.id}`);
    if (fields.delivery === 'must' && !MUST_TYPES.has(fields.type)) problems.push(`must on ${fields.type}: ${fields.id}`);
  }
  if (problems.length > 0) return failed('DELIVERY_INVALID', problems.slice(0, EVIDENCE_LIMIT).join('; '));
  return verified('delivery types ok');
}

export function checkRedaction({ skillPath, sourceRoot, aliasPath }) {
  if (!sourceRoot) return unverifiable('SOURCE_ROOT_REQUIRED', 'dev redaction check needs --source-root');
  try {
    const context = loadSourceContext({ skillPath, sourceRoot, aliasPath });
    const reviewPath = path.join(skillPath, 'source/redaction.review.json');
    if (!exists(reviewPath)) return failed('REDACTION_CANDIDATE_UNRESOLVED', 'redaction review is missing');
    const review = JSON.parse(readText(reviewPath));
    if (review.schema !== 'law-redaction-review/v1' || !Array.isArray(review.entries)) {
      return failed('REDACTION_CANDIDATE_UNRESOLVED', 'redaction review schema is invalid');
    }
    const map = context.redaction;
    const mapHashes = new Set(map.map((entry) => entry.sha256));
    const placeholders = new Set();
    for (const entry of map) {
      if (placeholders.has(entry.placeholder)) return failed('REDACTION_MAP_MISMATCH', `duplicate placeholder: ${entry.placeholder}`);
      placeholders.add(entry.placeholder);
    }
    const decisions = new Map();
    for (const entry of review.entries) {
      if (!HASH_PATTERN.test(entry.sha256 ?? '')) return failed('REDACTION_CANDIDATE_UNRESOLVED', 'review entry has a bad hash');
      if (!['redacted', 'allowlist', 'generic'].includes(entry.decision)) {
        return failed('REDACTION_CANDIDATE_UNRESOLVED', `unknown decision: ${entry.decision}`);
      }
      if (decisions.has(entry.sha256)) return failed('REDACTION_CANDIDATE_UNRESOLVED', `duplicate decision: ${entry.sha256}`);
      decisions.set(entry.sha256, entry);
    }
    const candidates = new Map();
    for (const document of context.documents) {
      for (const match of document.text.matchAll(/[A-Za-z][A-Za-z0-9_]*/g)) {
        const token = match[0];
        const hash = sha256Text(token.toLowerCase());
        if (mapHashes.has(hash) || /^[A-Z]/.test(token)) candidates.set(hash, token);
      }
    }
    for (const [hash, token] of candidates) {
      if (!decisions.has(hash)) return failed('REDACTION_CANDIDATE_UNRESOLVED', `candidate has no decision: ${token}`);
    }
    for (const entry of map) {
      const decision = decisions.get(entry.sha256);
      if (!decision || decision.decision !== 'redacted') {
        return failed('REDACTION_MAP_MISMATCH', `map entry lacks a redacted decision: ${entry.placeholder}`);
      }
      if (!decision.category) return failed('REDACTION_MAP_MISMATCH', `redacted entry lacks a category: ${entry.placeholder}`);
    }
    for (const entry of review.entries) {
      if (entry.decision !== 'redacted' && mapHashes.has(entry.sha256)) {
        return failed('REDACTION_MAP_MISMATCH', 'map entry is not marked redacted');
      }
    }
    for (const [hash, token] of candidates) {
      if (decisions.get(hash)?.decision === 'redacted' && NORMATIVE_CONSTANT.test(token)) {
        return failed('OVER_REDACTION', `normative constant is redacted: ${token}`);
      }
    }
    return verified(`${candidates.size} candidates decided`);
  } catch (error) {
    return failed(error.code ?? 'REDACTION_CANDIDATE_UNRESOLVED', error.message);
  }
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function factBearing(atom) {
  if (atom.type === 'Rule') return true;
  if (atom.classification === 'normative') return true;
  if (atom.type === 'CodeBlock') return String(atom.text ?? '').trim() !== '';
  if (atom.type === 'Table') {
    const first = String(atom.text ?? '').split('\n')[0];
    const headers = splitRow(first);
    return headers.some((header) => FACT_HEADERS.has(header));
  }
  return false;
}

export function checkCoverageSemantics({ skillPath }) {
  const lockPath = path.join(skillPath, 'atoms.lock.json');
  if (!exists(lockPath)) return failed('LAYER_MISSING', 'atoms.lock.json is missing');
  const lock = JSON.parse(readText(lockPath));
  const atoms = lock.atoms ?? [];
  const inventoryPath = path.join(skillPath, 'source/normative-inventory.json');
  const deliveryPath = path.join(skillPath, 'source/delivery.json');
  if (!exists(inventoryPath)) return failed('NORMATIVE_ORPHAN', 'normative inventory is missing');
  if (!exists(deliveryPath)) return failed('DELIVERY_OMISSION', 'delivery ledger is missing');
  const inventory = JSON.parse(readText(inventoryPath));
  const delivery = JSON.parse(readText(deliveryPath));
  if (inventory.schema !== 'law-normative-inventory/v1' || !Array.isArray(inventory.entries)) {
    return failed('NORMATIVE_ORPHAN', 'normative inventory schema is invalid');
  }
  if (delivery.schema !== 'law-delivery/v1' || !Array.isArray(delivery.atoms)) {
    return failed('DELIVERY_OMISSION', 'delivery schema is invalid');
  }
  const rules = new Set(atoms.filter((atom) => atom.type === 'Rule').map((atom) => atom.id));
  const inventoryById = new Map(inventory.entries.map((entry) => [entry.id, entry]));
  for (const atom of atoms.filter((entry) => entry.classification === 'normative')) {
    const entry = inventoryById.get(atom.id);
    if (!entry) return failed('NORMATIVE_ORPHAN', `normative atom has no decision: ${atom.id}`);
    if (atom.type === 'Rule') {
      if (entry.kind !== 'rule' || entry.rule_id !== atom.id) {
        return failed('NORMATIVE_ORPHAN', `rule entry is not self-identified: ${atom.id}`);
      }
    } else if (entry.kind !== 'non-rule' || !entry.reason || entry.reason.trim().length < 20) {
      return failed('NORMATIVE_ORPHAN', `non-rule entry needs an explicit reason: ${atom.id}`);
    } else if (entry.rule_id && !rules.has(entry.rule_id)) {
      return failed('NORMATIVE_ORPHAN', `non-rule entry names a missing rule: ${atom.id}`);
    }
  }
  const defaults = delivery.defaults ?? {};
  const deliveryById = new Map(delivery.atoms.map((entry) => [entry.id, entry]));
  const nodes = collectNodes(skillPath);
  const nodeById = new Map(nodes.map((node) => [node.fields?.id, node.fields]));
  for (const atom of atoms.filter((entry) => factBearing(entry))) {
    const entry = deliveryById.get(atom.id);
    const decision = entry?.decision ?? defaults[atom.type];
    if (!decision) return failed('DELIVERY_OMISSION', `fact-bearing atom has no decision: ${atom.id}`);
    if (!['must', 'reference'].includes(decision)) {
      return failed('DELIVERY_OMISSION', `invalid delivery decision: ${atom.id}`);
    }
    if (decision === 'must' && !MUST_TYPES.has(atom.type)) {
      return failed('DELIVERY_OMISSION', `must is not allowed for ${atom.type}: ${atom.id}`);
    }
    const node = nodeById.get(atom.id);
    if (node && node.delivery !== decision) {
      return failed('DELIVERY_OMISSION', `node delivery differs from the ledger: ${atom.id}`);
    }
    if (decision === 'reference' && entry) {
      const reason = String(entry.reason ?? '').trim();
      if (reason.length < 20 || GENERIC_REASONS.has(reason.toLowerCase())) {
        return failed('DELIVERY_OMISSION', `reference needs a specific reason: ${atom.id}`);
      }
      if (['Table', 'Paragraph', 'List'].includes(atom.type)) {
        if (!Array.isArray(entry.delivered_by) || entry.delivered_by.length === 0) {
          return failed('DELIVERY_OMISSION', `reference lacks delivered_by: ${atom.id}`);
        }
        for (const ruleId of entry.delivered_by) {
          if (!rules.has(ruleId)) return failed('DELIVERY_OMISSION', `delivered_by names a missing rule: ${atom.id}`);
        }
      }
    }
  }
  return verified('normative inventory and delivery coverage are complete');
}

export function checkInputLedger({ skillPath, sourceRoot, aliasPath }) {
  if (!sourceRoot) return unverifiable('SOURCE_ROOT_REQUIRED', 'dev input-ledger check needs --source-root');
  try {
    const aliasMap = loadAliasMap(aliasPath);
    const ledgerPath = path.join(skillPath, 'source/input-ledger.json');
    if (!exists(ledgerPath)) return failed('INPUT_LEDGER_MISSING', 'input ledger is missing');
    const ledgerText = readText(ledgerPath);
    const ledger = JSON.parse(ledgerText);
    if (ledger.schema !== 'law-input-ledger/v1' || !Array.isArray(ledger.entries)) {
      return failed('INPUT_LEDGER_MISSING', 'input ledger schema is invalid');
    }
    const manifest = parseManifest(readText(path.join(skillPath, 'source/manifest.toml')));
    const byAlias = new Map();
    for (const entry of ledger.entries) {
      if (!ALIAS_PATTERN.test(entry.alias ?? '')) return failed('INPUT_LEDGER_INCOMPLETE', `bad alias: ${entry.alias}`);
      if (!HASH_PATTERN.test(entry.sha256 ?? '')) return failed('INPUT_LEDGER_INCOMPLETE', `bad hash: ${entry.alias}`);
      if (!['included', 'excluded'].includes(entry.decision)) return failed('INPUT_LEDGER_INCOMPLETE', `bad decision: ${entry.alias}`);
      if (byAlias.has(entry.alias)) return failed('INPUT_LEDGER_INCOMPLETE', `duplicate alias: ${entry.alias}`);
      byAlias.set(entry.alias, entry);
    }
    for (const original of Object.values(aliasMap.aliases)) {
      if (ledgerText.includes(original)) return failed('INPUT_LEDGER_ORIGINAL_PATH', `ledger contains an original path: ${original}`);
    }
    for (const root of aliasMap.input_roots) {
      if (ledgerText.includes(root)) return failed('INPUT_LEDGER_ORIGINAL_PATH', `ledger contains an input root: ${root}`);
    }
    const seen = new Set();
    for (const root of aliasMap.input_roots) {
      const absoluteRoot = path.resolve(sourceRoot, root);
      for (const file of listFiles(absoluteRoot)) {
        const original = path.relative(sourceRoot, file).replace(/\\/g, '/');
        const alias = Object.entries(aliasMap.aliases).find(([, value]) => value === original)?.[0];
        if (!alias) return failed('PATH_ALIAS_MISSING', `input has no alias: ${original}`);
        const entry = byAlias.get(alias);
        if (!entry) return failed('INPUT_LEDGER_INCOMPLETE', `input has no ledger entry: ${alias}`);
        const text = normalizeLf(readText(file));
        if (sha256Text(text) !== entry.sha256) return failed('INPUT_LEDGER_INCOMPLETE', `input hash mismatch: ${alias}`);
        if (entry.decision === 'excluded') {
          if (!entry.reason || !entry.phrase || !text.includes(entry.phrase)) {
            return failed('INPUT_LEDGER_INCOMPLETE', `excluded entry lacks a source phrase: ${alias}`);
          }
        }
        seen.add(alias);
      }
    }
    for (const alias of Object.keys(aliasMap.aliases)) {
      if (!byAlias.has(alias)) return failed('INPUT_LEDGER_INCOMPLETE', `alias has no ledger entry: ${alias}`);
    }
    const included = new Set(ledger.entries.filter((entry) => entry.decision === 'included').map((entry) => entry.alias));
    for (const file of manifest.files) {
      if (!included.has(file.path)) return failed('INPUT_LEDGER_INCOMPLETE', `manifest file is not included: ${file.path}`);
      if (byAlias.get(file.path)?.sha256 !== file.sha256) return failed('INPUT_LEDGER_INCOMPLETE', `manifest hash differs from ledger: ${file.path}`);
    }
    for (const alias of included) {
      if (!manifest.files.some((file) => file.path === alias)) {
        return failed('INPUT_LEDGER_INCOMPLETE', `included entry is not in the manifest: ${alias}`);
      }
    }
    return verified(`${seen.size} inputs decided`);
  } catch (error) {
    return failed(error.code ?? 'INPUT_LEDGER_INCOMPLETE', error.message);
  }
}

export function checkPathAlias({ skillPath, sourceRoot, aliasPath }) {
  if (!sourceRoot) return unverifiable('SOURCE_ROOT_REQUIRED', 'dev path-alias check needs --source-root');
  try {
    if (isInside(skillPath, aliasPath)) {
      return failed('PATH_ALIAS_INSIDE_TREE', 'path alias map is inside the distributable tree');
    }
    const aliasMap = loadAliasMap(aliasPath);
    const manifest = parseManifest(readText(path.join(skillPath, 'source/manifest.toml')));
    const ledger = JSON.parse(readText(path.join(skillPath, 'source/input-ledger.json')));
    const originals = Object.values(aliasMap.aliases);
    if (new Set(originals).size !== originals.length) return failed('PATH_ALIAS_MISSING', 'alias targets are not unique');
    for (const file of manifest.files) {
      if (!aliasMap.aliases[file.path]) return failed('PATH_ALIAS_MISSING', `manifest alias is unmapped: ${file.path}`);
    }
    for (const entry of ledger.entries ?? []) {
      if (!aliasMap.aliases[entry.alias]) return failed('PATH_ALIAS_MISSING', `ledger alias is unmapped: ${entry.alias}`);
    }
    for (const document of Object.entries(aliasMap.aliases)) {
      if (!aliasMap.input_roots.some((root) => document[1] === root || document[1].startsWith(`${root}/`))) {
        return failed('PATH_ALIAS_MISSING', `alias target is outside input roots: ${document[1]}`);
      }
    }
    const lockPath = path.join(skillPath, 'atoms.lock.json');
    const coveragePath = path.join(skillPath, 'coverage.json');
    if (exists(lockPath)) {
      for (const atom of JSON.parse(readText(lockPath)).atoms ?? []) {
        if (!aliasMap.aliases[atom.source]) return failed('PATH_ALIAS_MISSING', `lock source is not an alias: ${atom.source}`);
      }
    }
    if (exists(coveragePath)) {
      for (const file of JSON.parse(readText(coveragePath)).files ?? []) {
        if (!aliasMap.aliases[file.path]) return failed('PATH_ALIAS_MISSING', `coverage path is not an alias: ${file.path}`);
      }
    }
    for (const node of collectNodes(skillPath)) {
      if (!aliasMap.aliases[node.fields?.source]) return failed('PATH_ALIAS_MISSING', `node source is not an alias: ${node.fields?.source}`);
    }
    const leakSurfaces = listFiles(skillPath);
    for (const file of leakSurfaces) {
      const text = readText(file);
      for (const original of originals) {
        if (text.includes(original)) return failed('ORIGINAL_PATH_LEAK', `original path in ${path.relative(skillPath, file)}`);
      }
      for (const root of aliasMap.input_roots) {
        if (text.includes(root)) return failed('ORIGINAL_PATH_LEAK', `input root in ${path.relative(skillPath, file)}`);
      }
    }
    return verified(`${Object.keys(aliasMap.aliases).length} aliases are exclusive`);
  } catch (error) {
    return failed(error.code ?? 'PATH_ALIAS_MISSING', error.message);
  }
}

export function checkStyle({ skillPath, mode }) {
  const files = mode === 'installed'
    ? ['okf/index.md', 'okf/log.md'].map((relative) => path.join(skillPath, relative)).filter(exists)
    : listFiles(skillPath, (file) => file.endsWith('.md'))
      .filter((file) => !path.relative(skillPath, file).startsWith('okf/'))
      .filter((file) => !path.relative(skillPath, file).startsWith('tests/'));
  const findings = [];
  for (const file of files) {
    const relative = path.relative(skillPath, file);
    const lines = normalizeLf(readText(file)).split('\n');
    let inCode = false;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (CJK_PATTERN.test(line)) findings.push(`${relative}:${index + 1}:STYLE_NOT_ENGLISH`);
      for (const phrase of FILLER_PHRASES) {
        if (phrase.test(line)) findings.push(`${relative}:${index + 1}:STYLE_NOT_TELEGRAPHIC`);
      }
      if (line.length > MAX_AUTHORED_LINE) findings.push(`${relative}:${index + 1}:STYLE_LOW_DENSITY`);
      if (line.trim().startsWith('```')) {
        inCode = !inCode;
        continue;
      }
      if (inCode || index === 0) continue;
      const previous = lines[index - 1].trim();
      const current = line.trim();
      if (!current || current.startsWith('|') || current === '---') continue;
      if (current === previous) findings.push(`${relative}:${index + 1}:STYLE_REDUNDANT`);
    }
  }
  if (findings.length > 0) {
    const codes = [...new Set(findings.map((finding) => finding.split(':').pop()))];
    return failed('STYLE_INVALID', findings.slice(0, EVIDENCE_LIMIT).join('; '), { codes, findings });
  }
  return verified('authored Markdown is telegraphic English');
}

export function checkInstalledLeak({ skillPath, mode, aliasPath, sourceRoot, runtime }) {
  const mapPath = path.join(skillPath, 'source/redaction.sha256.json');
  const redaction = exists(mapPath) ? JSON.parse(readText(mapPath)) : [];
  const forbidden = new Set(redaction.map((entry) => entry.sha256));
  const machinePath = /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)/;
  for (const file of listFiles(skillPath)) {
    const text = readText(file);
    const relative = path.relative(skillPath, file);
    if (machinePath.test(text)) return failed('INSTALLED_LEAK', `absolute machine path in ${relative}`);
    for (const match of text.matchAll(/[A-Za-z][A-Za-z0-9_]*/g)) {
      if (forbidden.has(sha256Text(match[0].toLowerCase()))) return failed('INSTALLED_LEAK', `forbidden token in ${relative}`);
    }
    if (path.basename(file).endsWith('.path-alias.json')) return failed('INSTALLED_LEAK', `alias map inside the tree: ${relative}`);
  }
  if (aliasPath && exists(aliasPath)) {
    const aliasMap = loadAliasMap(aliasPath);
    for (const file of listFiles(skillPath)) {
      const text = readText(file);
      for (const original of Object.values(aliasMap.aliases)) {
        if (text.includes(original)) return failed('ORIGINAL_PATH_LEAK', `original path in ${path.relative(skillPath, file)}`);
      }
    }
    if (mode === 'installed' && isInside(skillPath, aliasPath)) {
      return failed('PATH_ALIAS_INSIDE_TREE', 'alias map is inside the installed tree');
    }
  }
  if (runtime?.contextOutput) {
    for (const match of runtime.contextOutput.matchAll(/[A-Za-z][A-Za-z0-9_]*/g)) {
      if (forbidden.has(sha256Text(match[0].toLowerCase()))) return failed('INSTALLED_LEAK', 'forbidden token in runtime output');
    }
    if (machinePath.test(runtime.contextOutput)) return failed('INSTALLED_LEAK', 'absolute machine path in runtime output');
  }
  void sourceRoot;
  return verified('installed tree and runtime output are clean');
}

export function parseNodeDelivery(skillPath) {
  return collectNodes(skillPath).map((node) => node.fields).filter(Boolean);
}

export {
  DEV_LAYERS,
  INSTALLED_LAYERS,
  STRUCTURAL_TYPES,
  MUST_TYPES,
  parseFrontmatter,
  parseMarkdownTables,
  redactText,
  hashSpan,
  sha256Text,
};
