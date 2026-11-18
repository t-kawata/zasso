// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildRevisionCoverage } from '../revision/coverage.mjs';
import { validateInterpretations } from '../revision/interpretations.mjs';
import { validateRevisionPlan } from '../revision/plan.mjs';
import { buildCoherenceMatrix } from '../revision/coherence.mjs';
import { buildAuthorizations } from '../revision/authorization.mjs';
import { buildRevisionLedger } from '../revision/ledger.mjs';
import { parseProcessDirectives, validatePolicy } from '../revision/policy.mjs';
import { hasCjk, normalizeDocument } from '../revision/document.mjs';
import { failRevision } from '../revision/errors.mjs';
import { sha256Text } from '../revision/determinism.mjs';
import {
  aliasPathFor,
  appendOkfInputLedger,
  prepareSkillTree,
  readJsonFile,
  stripFrontmatter,
  updatePackageVersion,
  writeAliasFile,
  writeJsonFile,
  writePreOkfOriginal,
  writeTextFile,
} from '../revision/skill-tree.mjs';
import { writeDirectoryIndexes } from '../okf-core/authoring/index.mjs';
import { writeLog } from '../okf-core/authoring/log.mjs';
import { renderConcept, writeConcept } from '../okf-core/authoring/write.mjs';
import { conceptBody } from '../okf-core/context/assemble.mjs';
import { loadBundle } from '../okf-core/index.mjs';
import { adoptOkfBaseline, loadOkfBaseline } from './baseline.mjs';
import { applyFreshness } from './freshness.mjs';
import { assertGraph, recomputeRequires } from './graph.mjs';
import { appendRevisionLog } from './log.mjs';
import { applySourceOperations } from './sources.mjs';
import { writeArtifactMap, writeConceptIdentity } from './artifacts.mjs';

const DEFAULT_SOURCE_ALIAS = 'sources/pre-okf-original.md';
const REVISION_RAW_ALIAS = 'sources/revision-input.md';

export async function applyOkfRevision(options) {
  const {
    baselineSkill,
    role,
    plan,
    documentMap,
    context,
    outDir,
    sourceText,
    sourceAlias,
    sourceRoot = null,
    revisionPath = null,
    aliasPath = null,
  } = options;
  validateInterpretations({ interpretations: plan.interpretations ?? [], documentMap });
  const baseline = loadOkfBaseline({ baselineSkill });
  validateRevisionPlan({ plan, baseline: { rules: {} }, documentMap, policy: context });
  const hasBundle = existsSync(join(baselineSkill, 'okf'));
  if (!hasBundle) {
    return applyMinimalOkfRevision({ baseline, baselineSkill, role, plan, documentMap, context, outDir, sourceText, sourceAlias });
  }
  prepareSkillTree({ baselineSkill, outDir });
  adoptOkfBaseline({ baseline, outDir });

  const baselineBundle = await loadBundle(join(baselineSkill, 'okf'));
  const effectiveSource = buildEffectiveSource({ sourceText, plan, sourceAlias });
  const baseText = readBaselineSource(baselineSkill);
  const spanOffset = countLines(baseText) + 1;
  const sourceResult = applySourceOperations({
    sourceText: effectiveSource.text,
    sourceAlias,
    operations: plan.operations,
    outDir,
    date: context.date,
    existingInventory: baseline.inventory,
    spanOffset,
    writeConcepts: false,
  });
  const preparedConcepts = prepareConcepts({
    concepts: sourceResult.concepts,
    date: context.date,
    defaultRequires: chooseDefaultRequires(baselineBundle),
  });
  for (const concept of preparedConcepts) writeConceptWithBodyHash({ outDir, concept });
  removeRetiredConceptFiles({ outDir, baseline, retired: sourceResult.retired });
  const pruned = pruneRetiredRequires({ outDir, baseline, retired: sourceResult.retired });

  const combined = combineSources({ baseText, revisionText: effectiveSource.text });
  writeTextFile(join(outDir, 'source/source.baseline.md'), combined);
  writeTextFile(join(outDir, 'source/source-view.md'), combined);

  const bundle = await loadBundle(join(outDir, 'okf'));
  writeDirectoryIndexes({ bundle, outDir: join(outDir, 'okf') });
  writeJsonFile(join(outDir, 'source/concept-inventory.json'), mergeInventory({
    baseline: baseline.inventory,
    concepts: preparedConcepts,
    sourceAlias,
    retired: sourceResult.retired,
  }));
  const lock = buildLock(bundle);
  writeJsonFile(join(outDir, 'atoms.lock.json'), lock);
  const coverage = buildCoverage({ baseline, preparedConcepts, alias: firstManifestAlias(baselineSkill, sourceAlias), combined, sourceAlias });
  writeJsonFile(join(outDir, 'source/coverage.json'), coverage);
  writeConceptIdentity({ outDir, concepts: preparedConcepts });
  writeArtifactMap({ outDir, artifacts: { lock: 'atoms.lock.json', concepts: preparedConcepts.length, pruned } });

  const coherence = buildCoherenceMatrix({ profile: 'okf', required: plan.coherence?.required, dispositions: plan.coherence?.dispositions ?? {} });
  const authorizations = buildAuthorizations({ plan, documentMap });
  const policy = parseProcessDirectives({ plan });
  validatePolicy(policy);
  assertGraph({ concepts: recomputeRequires({ concepts: preparedConcepts, operations: plan.operations }) });
  const ledger = buildRevisionLedger({
    baseline,
    plan: { revision: { sha256: documentMap.sha256 } },
    effective: buildEffectiveIdentity({ bundle, preparedConcepts }),
    authorizations,
  });
  writeRevisionArtifacts({ outDir, role, plan, context, documentMap, coverage, coherence, authorizations, ledger, policy, retired: sourceResult.retired, citations: sourceResult.citations });
  writeManifestAndAlias({ outDir, baselineSkill, sourceRoot, revisionPath, aliasPath, sourceAlias, rawText: sourceText, context, combined });
  const logEntries = appendRevisionLog({
    outDir,
    entries: baseline.log.entries ?? [],
    entry: { date: context.date, text: `Applied update ${context.version}.` },
  });
  writeLog({ outDir: join(outDir, 'okf'), entries: logEntries });
  updatePackageVersion({ outDir, version: context.version });
  return { baseline, concepts: bundle.concepts, retired: sourceResult.retired, citations: sourceResult.citations, inventory: readJsonFile(join(outDir, 'source/concept-inventory.json')), coverage, coherence, authorizations, ledger, lock };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function buildEffectiveSource({ sourceText, plan, sourceAlias }) {
  const normalized = normalizeDocument(sourceText);
  if (!hasCjk(normalized)) return { text: normalized, derived: false };
  const parts = ['# Revision Source'];
  for (const operation of plan.operations ?? []) {
    if (!['add-source', 'update-source'].includes(operation.op)) continue;
    const body = operation.body ?? operation.statement;
    if (!body || hasCjk(body)) {
      failRevision('REVISION_TRANSLATION_REQUIRED', `non-English input needs an English body for ${operation.op}`, { target: operation.source_alias ?? sourceAlias });
    }
    parts.push('', `## ${operation.heading ?? operation.target ?? 'Revision'}`, '', body);
  }
  return { text: `${parts.join('\n')}\n`, derived: true };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function readBaselineSource(baselineSkill) {
  const path = join(baselineSkill, 'source/source.baseline.md');
  return existsSync(path) ? readFileSync(path, 'utf8') : '# Source View\n\nGenerated from the source documents. Do not edit.\n';
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function countLines(text) {
  const normalized = String(text).replace(/\n+$/, '');
  return normalized.length === 0 ? 0 : normalized.split('\n').length;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function combineSources({ baseText, revisionText }) {
  return `${String(baseText).replace(/\n+$/, '')}\n\n${String(revisionText).replace(/\n+$/, '')}\n`;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function chooseDefaultRequires(bundle) {
  const preamble = bundle.concepts.find((concept) => concept.id.endsWith('/preamble'));
  if (preamble) return [preamble.id];
  const declaring = bundle.concepts.find((concept) => (concept.frontmatter?.['x-requires'] ?? []).length > 0);
  return declaring ? [declaring.id] : [];
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function prepareConcepts({ concepts, date, defaultRequires }) {
  return applyFreshness({ concepts: concepts.map((concept) => ({
    ...concept,
    frontmatter: {
      ...concept.frontmatter,
      'x-requires': (concept.frontmatter?.['x-requires'] ?? []).length > 0
        ? concept.frontmatter['x-requires']
        : defaultRequires,
    },
  })), date });
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeConceptWithBodyHash({ outDir, concept }) {
  const bundleDir = join(outDir, 'okf');
  writeConcept({ outDir: bundleDir, concept });
  const file = join(bundleDir, concept.path);
  const { body } = stripFrontmatter(readFileSync(file, 'utf8'));
  concept.frontmatter['x-content-sha256'] = sha256Text(body);
  writeConcept({ outDir: bundleDir, concept });
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function removeRetiredConceptFiles({ outDir, baseline, retired }) {
  const paths = new Map((baseline.inventory.entries ?? []).map((entry) => [entry.id, entry.path]));
  for (const id of retired) {
    const path = paths.get(id);
    if (path) rmSync(join(outDir, 'okf', path), { force: true });
  }
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function pruneRetiredRequires({ outDir, baseline, retired }) {
  if (retired.length === 0) return 0;
  const retiredSet = new Set(retired);
  const paths = new Map((baseline.inventory.entries ?? []).map((entry) => [entry.id, entry.path]));
  let pruned = 0;
  for (const [id, path] of paths) {
    if (retiredSet.has(id)) continue;
    const file = join(outDir, 'okf', path);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const removed = retired.filter((retiredId) => text.includes(retiredId));
    if (removed.length === 0) continue;
    writeTextFile(file, unlinkReferences({ text, retired: removed, paths }));
    pruned += 1;
  }
  return pruned;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function unlinkReferences({ text, retired, paths }) {
  let next = text;
  for (const id of retired) {
    const path = paths.get(id) ?? `${id}.md`;
    const slug = path.split('/').pop().replace(/\.md$/, '');
    next = next.replace(new RegExp(`\\[([^\\]]*)\\]\\([^)]*/?${escapeRegExp(slug)}\\.md\\)`, 'g'), '$1');
    next = next.replace(new RegExp(`^\\s*-\\s*"?${escapeRegExp(id)}"?\\s*$`, 'gm'), '');
    next = next.split(`"${id}"`).join('');
  }
  return next;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function buildLock(bundle) {
  const concepts = bundle.concepts.map((concept) => ({
    id: concept.id,
    path: concept.path,
    title: concept.frontmatter?.title ?? concept.id.split('/').pop(),
    type: concept.frontmatter?.type ?? 'Page',
    body_sha256: sha256Text(conceptBody(concept)),
  }));
  concepts.sort((left, right) => left.id.localeCompare(right.id));
  return { schema: 'okf-atoms/v2', concepts };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function mergeInventory({ baseline, concepts, sourceAlias, retired = [] }) {
  const retiredSet = new Set(retired);
  const entries = (baseline.entries ?? []).filter((entry) => !retiredSet.has(entry.id));
  for (const concept of concepts) {
    const existing = entries.find((entry) => entry.id === concept.id);
    if (existing) existing.source = sourceAlias;
    else entries.push({ id: concept.id, path: concept.path, source: sourceAlias });
  }
  return { schema: 'okf-concept-inventory/v1', entries };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function buildCoverage({ baseline, preparedConcepts, alias, combined, sourceAlias }) {
  const baselineConcepts = baseline.coverage?.counts?.concepts ?? 0;
  const baselinePreamble = baseline.coverage?.counts?.preamble ?? 0;
  const newPreamble = preparedConcepts.filter((concept) => concept.id.endsWith('/preamble')).length;
  const lines = countLines(combined);
  const concepts = baselineConcepts + preparedConcepts.length;
  return {
    schema: 'okf-source-coverage/v1',
    records: [{
      source: alias,
      lines,
      concepts,
      preamble: baselinePreamble + newPreamble,
      unmappedHeadings: 0,
      unmappedPreamble: 0,
      unmappedLines: 0,
      revision_source: sourceAlias,
    }],
    counts: {
      lines,
      concepts,
      preamble: baselinePreamble + newPreamble,
      unmappedHeadings: 0,
      unmappedPreamble: 0,
      unmappedLines: 0,
    },
  };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function buildEffectiveIdentity({ bundle, preparedConcepts }) {
  const changed = new Set(preparedConcepts.map((concept) => concept.id));
  const rules = {};
  for (const concept of bundle.concepts) {
    rules[concept.id] = { concept_id: concept.id, status: changed.has(concept.id) ? 'updated' : 'unchanged' };
  }
  return { rules };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeRevisionArtifacts({ outDir, role, plan, context, documentMap, coverage, coherence, authorizations, ledger, policy, retired, citations }) {
  writeJsonFile(join(outDir, 'source/revision/context.json'), { ...context, role });
  writeJsonFile(join(outDir, 'source/revision/plan.json'), plan);
  writeJsonFile(join(outDir, 'source/revision/document.map.json'), documentMap);
  writeJsonFile(join(outDir, 'source/revision/coverage.json'), buildRevisionCoverage({ documentMap, plan, interpretations: plan.interpretations ?? [] }));
  writeJsonFile(join(outDir, 'source/revision/coherence.json'), coherence);
  writeJsonFile(join(outDir, 'source/revision/authorizations.json'), authorizations);
  writeJsonFile(join(outDir, 'source/revision/ledger.json'), ledger);
  writeJsonFile(join(outDir, 'source/revision/policy.json'), policy);
  writeJsonFile(join(outDir, 'source/revision/tombstones.json'), { schema: 'revision-tombstones/v1', concepts: retired });
  writeJsonFile(join(outDir, 'source/revision/reference-citations.json'), { schema: 'revision-reference-citations/v1', citations });
  writeJsonFile(join(outDir, 'source/revision/revision-log.json'), {
    schema: 'revision-log/v1',
    status: 'installed',
    deterministic: true,
    date: context.date,
    version: context.version,
    baseline_version: context.baseline_version,
  });
  writeJsonFile(join(outDir, 'source/revision/artifact-map.json'), { schema: 'revision-artifact-map/v1', artifacts: { bundle: 'okf/', lock: 'atoms.lock.json' } });
  writeJsonFile(join(outDir, 'source/revision/source-coverage.json'), coverage);
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function firstManifestAlias(baselineSkill, fallback) {
  const manifestPath = join(baselineSkill, 'source/manifest.toml');
  if (!existsSync(manifestPath)) return fallback;
  const match = readFileSync(manifestPath, 'utf8').match(/\[\[file\]\]\npath = "([^"]+)"/);
  return match ? match[1] : fallback;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeManifestAndAlias({ outDir, baselineSkill, sourceRoot, revisionPath, aliasPath, sourceAlias, rawText, context, combined }) {
  const manifestAlias = firstManifestAlias(baselineSkill, DEFAULT_SOURCE_ALIAS);
  const rawAlias = sourceAlias === manifestAlias ? REVISION_RAW_ALIAS : sourceAlias;
  const metrics = {
    sha256: sha256Text(combined),
    lines: countLines(combined),
    bytes: Buffer.byteLength(combined, 'utf8'),
  };
  writeManifest({ outDir, baselineSkill, alias: manifestAlias, metrics });
  writePreOkfOriginal({ outDir, text: rawText, alias: rawAlias });
  appendOkfInputLedger({
    outDir,
    entry: { path: rawAlias, status: 'included', reason: 'revision input' },
  });
  writeAliasFile({
    aliasPath,
    schema: 'okf-path-alias/v1',
    skill: context.skill,
    aliases: {
      [manifestAlias]: resolve(join(outDir, 'source/source.baseline.md')),
      [rawAlias]: revisionPath ? resolve(revisionPath) : aliasPathFor({ sourceRoot, targetPath: rawAlias }),
    },
    inputRoots: [outDir],
  });
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeManifest({ outDir, baselineSkill, alias, metrics }) {
  const baselineManifest = join(baselineSkill, 'source/manifest.toml');
  const header = existsSync(baselineManifest)
    ? readFileSync(baselineManifest, 'utf8').split('[[file]]')[0].trimEnd()
    : 'spec_version = "okf-source-manifest/v1"';
  writeTextFile(join(outDir, 'source/manifest.toml'), [
    header,
    '',
    '[[file]]',
    `path = "${alias}"`,
    `sha256 = "${metrics.sha256}"`,
    `lines = "${metrics.lines}"`,
    `bytes = "${metrics.bytes}"`,
    '',
  ].join('\n'));
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function applyMinimalOkfRevision({ baseline, baselineSkill, role, plan, documentMap, context, outDir, sourceText, sourceAlias }) {
  prepareSkillTree({ baselineSkill, outDir });
  adoptOkfBaseline({ baseline, outDir });
  const sourceResult = applySourceOperations({
    sourceText,
    sourceAlias,
    operations: plan.operations,
    outDir,
    date: context.date,
    existingInventory: baseline.inventory,
  });
  const concepts = applyFreshness({ concepts: sourceResult.concepts, date: context.date });
  const requires = recomputeRequires({ concepts, operations: plan.operations });
  assertGraph({ concepts: requires });
  const inventory = mergeInventory({ baseline: baseline.inventory, concepts: requires, sourceAlias, retired: sourceResult.retired });
  writeJsonFile(join(outDir, 'source/concept-inventory.json'), inventory);
  writeJsonFile(join(outDir, 'source/coverage.json'), {
    schema: 'okf-source-coverage/v1',
    counts: { headings: 0, concepts: requires.length, unmappedHeadings: 0, unmappedPreamble: 0, unmappedLines: 0 },
  });
  const coherence = buildCoherenceMatrix({ profile: 'okf', required: plan.coherence?.required, dispositions: plan.coherence?.dispositions ?? {} });
  const authorizations = buildAuthorizations({ plan, documentMap });
  const policy = parseProcessDirectives({ plan });
  validatePolicy(policy);
  const ledger = buildRevisionLedger({
    baseline,
    plan: { revision: { sha256: documentMap.sha256 } },
    effective: { rules: Object.fromEntries(requires.map((concept) => [concept.id, { concept_id: concept.id, status: 'added' }])) },
    authorizations,
  });
  const coverage = { schema: 'okf-source-coverage/v1', counts: { unmapped: 0, items: requires.length } };
  writeRevisionArtifacts({ outDir, role, plan, context, documentMap, coverage, coherence, authorizations, ledger, policy, retired: sourceResult.retired, citations: sourceResult.citations });
  appendRevisionLog({ outDir, entries: baseline.log.entries ?? [], entry: { date: context.date, text: `Applied update ${context.version}.` } });
  writeJsonFile(join(outDir, 'source/baseline.json'), {
    schema: 'revision-baseline/v1',
    skill: baseline.skill.split('/').pop(),
    version: baseline.version,
    origin: 'installed',
    digest: baseline.digest,
  });
  return { baseline, concepts: requires, retired: sourceResult.retired, citations: sourceResult.citations, inventory, coverage, coherence, authorizations, ledger };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
