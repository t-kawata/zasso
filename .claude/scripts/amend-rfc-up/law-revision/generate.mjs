// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, sha256Text } from '../revision/determinism.mjs';
import { buildRevisionCoverage } from '../revision/coverage.mjs';
import { buildCoherenceMatrix } from '../revision/coherence.mjs';
import { buildAuthorizations } from '../revision/authorization.mjs';
import { buildRevisionLedger } from '../revision/ledger.mjs';
import { parseProcessDirectives, validatePolicy } from '../revision/policy.mjs';
import { writeDirectoryIndexes } from '../okf-core/authoring/index.mjs';
import { writeLog } from '../okf-core/authoring/log.mjs';
import { renderConcept } from '../okf-core/authoring/write.mjs';
import { conceptBody } from '../okf-core/context/assemble.mjs';
import { loadBundle } from '../okf-core/index.mjs';
import {
  aliasPathFor,
  appendInputLedger,
  appendSourceView,
  readJsonFile,
  syncGeneratedRuleCount,
  updatePackageVersion,
  upsertManifestFile,
  writeAliasFile,
  writeJsonFile,
  writePreOkfOriginal,
  writeTextFile,
} from '../revision/skill-tree.mjs';

const RULE_FILE_EXTENSION = '.md';

export async function generateLawBundleRevision({ baseline, revision, output }) {
  const { registry, identity, plan, context, documentMap, documentText, documentAlias } = revision;
  const { outDir } = output;
  const date = context.date;
  const ruleConcepts = buildRuleConcepts({ baseline, registry, plan, context, documentAlias });
  const hasBundle = existsSync(join(outDir, 'okf/rules'));
  if (hasBundle) await patchLawConceptPages({ outDir, baseline, ruleConcepts, plan, documentAlias, date });
  else writeRuleConcepts({ outDir, ruleConcepts, date });

  const lock = hasBundle
    ? await buildLockFromBundle({ outDir, baselineLock: baseline.lock, documentMap, documentAlias })
    : buildMinimalLock({ ruleConcepts, baselineLock: baseline.lock, documentMap, documentAlias });
  const coverage = buildRevisionCoverage({ documentMap, plan, interpretations: plan.interpretations ?? [] });
  const coherence = buildCoherenceMatrix({ profile: 'law', required: plan.coherence?.required, dispositions: plan.coherence?.dispositions ?? {} });
  const authorizations = buildAuthorizations({ plan, documentMap });
  const policy = parseProcessDirectives({ plan });
  validatePolicy(policy);
  const effectiveIdentity = alignIdentityConcepts({ identity, ruleConcepts });
  const ledger = buildRevisionLedger({
    baseline,
    plan: { revision: { sha256: documentMap.sha256 } },
    effective: effectiveIdentity,
    authorizations,
  });

  writeJsonFile(join(outDir, 'atoms.lock.json'), lock);
  writeJsonFile(join(outDir, 'source/rule-concepts.json'), ruleConcepts);
  writeJsonFile(join(outDir, 'source/coverage-v3.json'), buildCoverageLedger({ baseline, registry, ruleConcepts }));
  writeJsonFile(join(outDir, 'source/delivery.json'), buildDelivery({ baseline, registry, ruleConcepts }));
  writeJsonFile(join(outDir, 'source/normative-inventory.json'), readOptionalJson(join(baseline.skill, 'source/normative-inventory.json')) ?? { schema: 'law-normative-inventory/v1', entries: [] });
  writeJsonFile(join(outDir, 'source/law-bundle.json'), buildLawBundle({ baseline, registry, context, documentAlias }));
  writeJsonFile(join(outDir, 'source/build-identity.json'), {
    schema: 'law-build-identity/v1',
    skill: context.skill,
    version: context.version,
    baseline_version: context.baseline_version,
    baseline_digest: baseline.digest,
    revision_sha256: documentMap.sha256,
  });
  writeRevisionArtifacts({ outDir, plan, context, documentMap, coverage, coherence, authorizations, ledger, policy, identity: effectiveIdentity });
  writeBaselineArtifacts({ baseline, outDir });
  writeManifestAndAlias({ baseline, output, context, documentMap, documentText, documentAlias, date });
  if (hasBundle) {
    await regenerateIndexesAndLog({ outDir, date, version: context.version });
    syncGeneratedRuleCount({
      outDir,
      baselineCount: Object.keys(baseline.ruleConcepts.byRule ?? {}).length,
      effectiveCount: Object.keys(ruleConcepts.byRule ?? {}).length,
    });
  }
  updatePackageVersion({ outDir, version: context.version });

  return { ruleConcepts, lock, coverage, coherence, authorizations, policy, ledger, registry };
}

export function buildRuleConcepts({ baseline, registry, plan, context, documentAlias }) {
  const byRule = cloneBaselineRules(baseline.ruleConcepts);
  const operations = plan.operations ?? [];
  const registryIds = new Set(registry.map((row) => row.id));
  for (const row of registry) {
    const operation = findRuleOperation(operations, row.id);
    if (byRule[row.id]) {
      applyRegistryRowToConcept({ concept: byRule[row.id], row, operation });
    } else {
      byRule[row.id] = makeRuleConcept({ row, operation, context, documentAlias, existingRules: byRule });
    }
  }
  const tombstones = new Set(baseline.tombstones ?? []);
  for (const id of Object.keys(byRule)) {
    if (!registryIds.has(id) || tombstones.has(id)) delete byRule[id];
  }
  const aliases = collectRuleAliases({ operations, identity: null });
  rewriteRequires({ byRule, aliases, tombstones });
  const ordered = Object.fromEntries(Object.keys(byRule).sort().map((id) => [id, byRule[id]]));
  return { schema: 'law-rule-concepts/v1', byRule: ordered, aliases: {} };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function cloneBaselineRules(ruleConcepts) {
  const byRule = {};
  for (const [id, entry] of Object.entries(ruleConcepts?.byRule ?? {})) {
    byRule[id] = {
      ...entry,
      requires: [...(entry.requires ?? [])],
      required_rules: [...(entry.required_rules ?? [])],
    };
  }
  return byRule;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function findRuleOperation(operations, id) {
  return operations.find((entry) => entry.target === id || entry.id === id) ?? null;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function applyRegistryRowToConcept({ concept, row, operation }) {
  concept.applies_to = row.applicability ?? concept.applies_to;
  concept.statement = row.statement ?? concept.statement;
  if (row.class) concept.class = row.class;
  if (operation?.phase) concept.phase = operation.phase;
  if (operation?.requires) concept.requires = [...operation.requires];
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function makeRuleConcept({ row, operation, context, documentAlias, existingRules }) {
  const conceptId = deriveConceptIdForClass(row);
  const requires = operation?.requires ?? defaultRequires(existingRules);
  return {
    rule_id: row.id,
    concept_id: conceptId,
    path: `${conceptId}${RULE_FILE_EXTENSION}`,
    phase: operation?.phase ?? 'adapter',
    requires,
    required_rules: [],
    applies_to: row.applicability ?? 'all',
    class: row.class ?? row.id.slice(0, 1),
    source_alias: operation?.source ?? documentAlias,
    source_span: operation?.evidence ? `${operation.evidence.line}-${operation.evidence.line}` : '1-1',
    statement: row.statement,
  };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function deriveConceptIdForClass(row) {
  const classCode = String(row.class ?? row.id.slice(0, 1)).toLowerCase();
  return `rules/${classCode}/${row.id.toLowerCase()}`;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function defaultRequires(existingRules) {
  if (Object.hasOwn(existingRules, 'APP-01')) return [existingRules['APP-01'].concept_id];
  const first = Object.values(existingRules)[0];
  return first ? [first.concept_id] : [];
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function collectRuleAliases({ operations }) {
  const aliases = {};
  for (const operation of operations) {
    if (operation.op === 'rename-rule') aliases[operation.target] = operation.new_id;
    if (operation.op === 'merge-rules' && operation.kept_id) {
      for (const target of operation.targets ?? []) if (target !== operation.kept_id) aliases[target] = operation.kept_id;
    }
    if (operation.op === 'split-rule' && operation.kept_id && operation.kept_id !== operation.target) {
      aliases[operation.target] = operation.kept_id;
    }
  }
  return aliases;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function rewriteRequires({ byRule, aliases, tombstones }) {
  const conceptByRule = Object.fromEntries(Object.entries(byRule).map(([id, entry]) => [entry.concept_id, id]));
  for (const entry of Object.values(byRule)) {
    const next = [];
    for (const conceptId of entry.requires ?? []) {
      const ruleId = conceptByRule[conceptId] ?? null;
      const targetRule = ruleId && aliases[ruleId] ? aliases[ruleId] : ruleId;
      const targetConcept = targetRule && byRule[targetRule] ? byRule[targetRule].concept_id : conceptId;
      if (tombstones.has(conceptId) || !Object.values(byRule).some((candidate) => candidate.concept_id === targetConcept)) continue;
      if (!next.includes(targetConcept)) next.push(targetConcept);
    }
    entry.requires = next;
    entry.required_rules = next.map((conceptId) => conceptByRule[conceptId]).filter(Boolean);
  }
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
async function patchLawConceptPages({ outDir, baseline, ruleConcepts, plan, documentAlias, date }) {
  const bundle = await loadBundle(join(outDir, 'okf'));
  const conceptByRule = new Map(bundle.concepts.filter((concept) => concept.frontmatter?.['x-rule-id']).map((concept) => [concept.frontmatter['x-rule-id'], concept]));
  const changed = changedRuleIds({ plan, ruleConcepts, baseline });
  for (const id of changed) {
    const rule = ruleConcepts.byRule[id];
    const existing = conceptByRule.get(id);
    if (!rule) {
      if (existing) rmSync(join(outDir, 'okf', existing.path), { force: true });
      continue;
    }
    upsertRuleConcept({ outDir, rule, existing, plan, documentAlias, date });
  }
  rewriteConceptReferences({ outDir, baseline, ruleConcepts });
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function changedRuleIds({ plan, ruleConcepts, baseline }) {
  const ids = new Set();
  for (const operation of plan.operations ?? []) {
    if (operation.op === 'update-rule' || operation.op === 'update-registry-row') ids.add(operation.target);
    if (operation.op === 'add-rule') ids.add(operation.id);
    if (operation.op === 'retire-rule') ids.add(operation.target);
    if (operation.op === 'rename-rule') { ids.add(operation.target); ids.add(operation.new_id); }
    if (operation.op === 'merge-rules') { for (const target of operation.targets ?? []) ids.add(target); }
    if (operation.op === 'split-rule') {
      ids.add(operation.target);
      ids.add(operation.kept_id);
      for (const rule of operation.new_rules ?? []) ids.add(rule.id);
    }
  }
  for (const id of Object.keys(baseline.ruleConcepts.byRule ?? {})) {
    if (!ruleConcepts.byRule[id]) ids.add(id);
  }
  return [...ids];
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function upsertRuleConcept({ outDir, rule, existing, plan, documentAlias, date }) {
  const operation = findRuleOperation(plan.operations ?? [], rule.rule_id);
  const concept = existing
    ? updateConceptModel({ existing, rule, operation })
    : createConceptModel({ rule, operation, documentAlias, date });
  const path = join(outDir, 'okf', rule.path);
  if (existing && existing.path !== rule.path) rmSync(join(outDir, 'okf', existing.path), { force: true });
  writeTextFile(path, `${renderConcept(concept)}\n`);
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function updateConceptModel({ existing, rule, operation }) {
  const statement = rule.statement ?? rule.rule_id;
  const frontmatter = {
    ...existing.frontmatter,
    title: `${rule.rule_id} — ${statement}`,
    description: statement,
    'x-applies-to': rule.applies_to,
    'x-rule-class': rule.class ?? existing.frontmatter['x-rule-class'],
    'x-rule-id': rule.rule_id,
    'x-phase': rule.phase ?? existing.frontmatter['x-phase'],
    'x-requires': rule.requires ?? [],
    'x-source-span': rule.source_span ?? existing.frontmatter['x-source-span'],
  };
  if (operation?.source) {
    frontmatter.sources = [{ resource: operation.source, id: rule.rule_id.toLowerCase(), title: rule.rule_id }];
  }
  return { frontmatter, body: replaceStatementParagraph(conceptBody(existing), statement) };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function createConceptModel({ rule, operation, documentAlias, date }) {
  const statement = rule.statement ?? rule.rule_id;
  return {
    frontmatter: {
      type: 'Rule',
      title: `${rule.rule_id} — ${statement}`,
      description: statement,
      sources: [{ resource: operation?.source ?? documentAlias, id: rule.rule_id.toLowerCase(), title: rule.rule_id }],
      generated: { by: 'build-law-skill', at: date },
      verified: [{ by: 'human:law-review', at: date }],
      status: 'stable',
      'x-applies-to': rule.applies_to,
      'x-enforcement': 'review',
      'x-parent': rule.rule_id.split('-')[0],
      'x-phase': rule.phase,
      'x-requires': rule.requires ?? [],
      'x-rule-class': rule.class,
      'x-rule-id': rule.rule_id,
      'x-source-span': rule.source_span,
      'x-verification': 'V1',
    },
    body: `# ${rule.rule_id}\n\n${statement}\n`,
  };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function replaceStatementParagraph(body, statement) {
  const lines = String(body ?? '').split('\n');
  const headingIndex = lines.findIndex((line) => /^#\s+\S/.test(line));
  let start = headingIndex + 1;
  while (start < lines.length && lines[start].trim() === '') start += 1;
  if (start >= lines.length) return `${body}\n\n${statement}\n`;
  let end = start;
  while (end < lines.length && lines[end].trim() !== '') end += 1;
  return [...lines.slice(0, start), statement, ...lines.slice(end)].join('\n');
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function rewriteConceptReferences({ outDir, baseline, ruleConcepts }) {
  const retired = Object.entries(baseline.ruleConcepts.byRule ?? {})
    .filter(([id]) => !ruleConcepts.byRule[id])
    .map(([, entry]) => entry);
  const renames = Object.entries(ruleConcepts.byRule)
    .filter(([id, entry]) => baseline.ruleConcepts.byRule[id] && baseline.ruleConcepts.byRule[id].concept_id !== entry.concept_id)
    .map(([, entry]) => ({ from: baseline.ruleConcepts.byRule[entry.rule_id].concept_id, to: entry.concept_id }));
  if (retired.length === 0 && renames.length === 0) return;
  for (const file of walkMarkdown(join(outDir, 'okf'))) {
    let text = readFileSync(file, 'utf8');
    text = unlinkRetired(text, retired);
    text = rewireRenamed(text, renames);
    writeTextFile(file, text);
  }
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function unlinkRetired(text, retired) {
  let next = text;
  for (const entry of retired) {
    const slug = entry.path.split('/').pop().replace(/\.md$/, '');
    next = next.replace(new RegExp(`\\[([^\\]]*)\\]\\([^)]*/?${escapeRegExp(slug)}\\.md\\)`, 'g'), '$1');
    next = next.replace(new RegExp(`^\\s*-\\s*"?${escapeRegExp(entry.concept_id)}"?\\s*$`, 'gm'), '');
  }
  return next;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function rewireRenamed(text, renames) {
  let next = text;
  for (const rename of renames) {
    const fromSlug = rename.from.split('/').pop();
    const toSlug = rename.to.split('/').pop();
    next = next.split(`${fromSlug}.md`).join(`${toSlug}.md`);
    next = next.split(`"${rename.from}"`).join(`"${rename.to}"`);
    next = next.split(rename.from).join(rename.to);
  }
  return next;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
async function buildLockFromBundle({ outDir, baselineLock, documentMap, documentAlias }) {
  const bundle = await loadBundle(join(outDir, 'okf'));
  const rules = [];
  const sections = [];
  for (const concept of bundle.concepts) {
    const record = { concept_id: concept.id, path: concept.path, content_sha256: sha256Text(conceptBody(concept)) };
    const ruleId = concept.frontmatter?.['x-rule-id'];
    if (ruleId) rules.push({ rule_id: ruleId, ...record });
    else sections.push(record);
  }
  rules.sort((left, right) => left.rule_id.localeCompare(right.rule_id));
  sections.sort((left, right) => left.concept_id.localeCompare(right.concept_id));
  const sources = (baselineLock.sources ?? []).filter((source) => source.alias !== documentAlias);
  sources.push({ alias: documentAlias, sha256: documentMap.sha256 });
  return {
    schema: 'law-atoms/v3',
    check_set_version: baselineLock.check_set_version ?? '3',
    rules,
    sections,
    sources,
  };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function buildMinimalLock({ ruleConcepts, baselineLock, documentMap, documentAlias }) {
  return {
    schema: baselineLock.schema ?? 'law-atoms/v1',
    check_set_version: baselineLock.check_set_version ?? '3',
    rules: Object.values(ruleConcepts.byRule).map((rule) => ({
      rule_id: rule.rule_id,
      concept_id: rule.concept_id,
      path: rule.path,
      content_sha256: sha256Text(`${rule.rule_id}\n${rule.statement ?? ''}`),
    })),
    sections: baselineLock.sections ?? [],
    sources: [...(baselineLock.sources ?? []), { alias: documentAlias, sha256: documentMap.sha256 }],
  };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function buildCoverageLedger({ baseline, registry, ruleConcepts }) {
  const baselineCoverage = readOptionalJson(join(baseline.skill, 'source/coverage-v3.json'));
  if (!baselineCoverage) {
    return {
      schema: 'law-source-coverage/v3',
      counts: { headings: 0, ruleRows: registry.length, concepts: Object.keys(ruleConcepts.byRule).length, aliases: 0, nonNormative: 0, unmappedHeadings: 0, unmappedRuleRows: 0 },
      headings: [],
      rules: registry.map((row) => ({ id: row.id, line: 1, disposition: 'concept', target: ruleConcepts.byRule[row.id]?.concept_id ?? null })),
      unmapped: [],
    };
  }
  const delta = registry.length - (baseline.registry?.length ?? registry.length);
  return {
    ...baselineCoverage,
    counts: {
      ...baselineCoverage.counts,
      ruleRows: (baselineCoverage.counts?.ruleRows ?? 0) + delta,
      unmappedHeadings: 0,
      unmappedRuleRows: 0,
    },
  };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function buildDelivery({ baseline, registry, ruleConcepts }) {
  const existing = readOptionalJson(join(baseline.skill, 'source/delivery.json'));
  return {
    schema: existing?.schema ?? 'law-delivery/v3',
    rules: registry.map((row) => ({
      rule_id: row.id,
      concept_id: ruleConcepts.byRule[row.id]?.concept_id ?? null,
      decision: 'must',
    })),
  };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function buildLawBundle({ baseline, registry, context, documentAlias }) {
  const existing = readOptionalJson(join(baseline.skill, 'source/law-bundle.json')) ?? {};
  const sources = new Set([...(existing.sources ?? []), documentAlias]);
  return { ...existing, schema: existing.schema ?? 'law-bundle/v1', skill: context.skill, generated_at: context.date, rules: registry.length, sources: [...sources] };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeRevisionArtifacts({ outDir, plan, context, documentMap, coverage, coherence, authorizations, ledger, policy, identity }) {
  writeJsonFile(join(outDir, 'source/revision/context.json'), context);
  writeJsonFile(join(outDir, 'source/revision/plan.json'), plan);
  writeJsonFile(join(outDir, 'source/revision/document.map.json'), documentMap);
  writeJsonFile(join(outDir, 'source/revision/coverage.json'), coverage);
  writeJsonFile(join(outDir, 'source/revision/coherence.json'), coherence);
  writeJsonFile(join(outDir, 'source/revision/authorizations.json'), authorizations);
  writeJsonFile(join(outDir, 'source/revision/ledger.json'), ledger);
  writeJsonFile(join(outDir, 'source/revision/policy.json'), policy);
  writeJsonFile(join(outDir, 'source/revision/tombstones.json'), { schema: 'revision-tombstones/v1', rules: identity.tombstones });
  writeJsonFile(join(outDir, 'source/revision/aliases.json'), { schema: 'revision-aliases/v1', rules: identity.aliases });
  writeJsonFile(join(outDir, 'source/revision/artifact-map.json'), {
    schema: 'revision-artifact-map/v1',
    artifacts: { rule_concepts: 'source/rule-concepts.json', lock: 'atoms.lock.json', bundle: 'okf/' },
  });
  writeJsonFile(join(outDir, 'source/revision/revision-log.json'), {
    schema: 'revision-log/v1',
    status: 'installed',
    deterministic: true,
    date: context.date,
    version: context.version,
    baseline_version: context.baseline_version,
    counts: ledger.counts,
  });
  writeJsonFile(join(outDir, 'source/revision/effective-registry.json'), { schema: 'revision-effective-registry/v1', rows: Object.values(identity.rules) });
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeBaselineArtifacts({ baseline, outDir }) {
  writeJsonFile(join(outDir, 'source/baseline/rule-concepts.json'), baseline.ruleConcepts);
  writeJsonFile(join(outDir, 'source/baseline/registry.json'), baseline.registry);
  writeJsonFile(join(outDir, 'source/baseline/atoms.lock.json'), baseline.lock);
  copyBaselineOriginal({ baseline, outDir });
  writeJsonFile(join(outDir, 'source/baseline.json'), {
    schema: 'revision-baseline/v1',
    skill: baseline.skill.split('/').pop(),
    version: baseline.version,
    origin: 'installed',
    digest: baseline.digest,
  });
}

/**
 * The canonical verifier reserves the root PRE-OKF pair for the update input.
 * The baseline original stays beside the baseline ledgers so both inputs remain
 * auditable without changing the v1 contract.
 */
// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function copyBaselineOriginal({ baseline, outDir }) {
  const original = join(baseline.skill, 'PRE-OKF-ORIGINAL.md');
  const ledger = join(baseline.skill, 'source/pre-okf-original.json');
  if (existsSync(original)) writeTextFile(join(outDir, 'source/baseline/PRE-OKF-ORIGINAL.md'), readFileSync(original, 'utf8'));
  if (existsSync(ledger)) writeJsonFile(join(outDir, 'source/baseline/pre-okf-original.json'), JSON.parse(readFileSync(ledger, 'utf8')));
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeManifestAndAlias({ baseline, output, context, documentMap, documentText, documentAlias, date }) {
  const { outDir, sourceRoot, revisionPath, aliasPath, baselineAliasPath } = output;
  upsertManifestFile({
    manifestPath: join(outDir, 'source/manifest.toml'),
    alias: documentAlias,
    sha256: documentMap.sha256,
    bytes: Buffer.byteLength(documentText, 'utf8'),
    lines: documentMap.lineCount,
  });
  const baselineAliases = readOptionalJson(baselineAliasPath)?.aliases ?? {};
  const aliases = { ...baselineAliases, [documentAlias]: aliasPathFor({ sourceRoot, targetPath: revisionPath ?? documentAlias }) };
  writeAliasFile({ aliasPath, schema: 'law-path-alias/v1', skill: context.skill, aliases });
  writePreOkfOriginal({ outDir, text: documentText, alias: documentAlias });
  appendInputLedger({
    outDir,
    entry: {
      alias: documentAlias,
      sha256: documentMap.sha256,
      decision: 'included',
      reason: 'revision input',
    },
  });
  appendSourceView({
    outDir,
    baselineSkill: baseline.skill,
    notice: `# Source: ${documentAlias}\n\nUpdate ${context.version} was applied on ${date}. The raw revision document is PRE-OKF-ORIGINAL.md.`,
  });
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
async function regenerateIndexesAndLog({ outDir, date, version }) {
  const bundle = await loadBundle(join(outDir, 'okf'));
  writeDirectoryIndexes({ bundle, outDir: join(outDir, 'okf') });
  const logPath = join(outDir, 'source/okf-log.json');
  const entries = existsSync(logPath) ? readJsonFile(logPath).entries ?? [] : [];
  const next = [...entries, { date, text: `Applied update ${version}.` }].sort((left, right) => String(right.date).localeCompare(String(left.date)));
  writeJsonFile(logPath, { schema: 'okf-log/v1', entries: next });
  writeLog({ outDir: join(outDir, 'okf'), entries: next });
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function alignIdentityConcepts({ identity, ruleConcepts }) {
  const rules = {};
  for (const [id, entry] of Object.entries(identity.rules ?? {})) {
    rules[id] = { ...entry, concept_id: ruleConcepts.byRule[id]?.concept_id ?? entry.concept_id ?? null };
  }
  return { ...identity, rules };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeRuleConcepts({ outDir, ruleConcepts, date }) {
  for (const rule of Object.values(ruleConcepts.byRule)) {
    if (!rule.statement) continue;
    const concept = createConceptModel({ rule, operation: null, documentAlias: rule.source_alias, date });
    writeTextFile(join(outDir, 'okf', rule.path), `${renderConcept(concept)}\n`);
  }
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function readOptionalJson(path) {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function walkMarkdown(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkMarkdown(path));
    else if (entry.isFile() && entry.name.endsWith(RULE_FILE_EXTENSION)) files.push(path);
  }
  return files;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function hashArtifact(value) {
  return sha256Text(canonicalJson(value));
}
