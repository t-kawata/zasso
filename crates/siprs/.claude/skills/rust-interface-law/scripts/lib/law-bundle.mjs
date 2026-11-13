// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
/**
 * Law-specific adapter over the OKF core.
 *
 * The stable law identifier is x-rule-id. The path-based concept id is the
 * OKF address. The manifest keeps the old node shape so gate and attest do not
 * need a second rule model.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBundle, getOutgoing, getIncoming } from '../../okf-core/index.mjs';
import { conceptBody } from '../../okf-core/context/assemble.mjs';
import { sha256 } from './redact.mjs';

export async function loadLawBundle({ skillRoot }) {
  const bundle = await loadBundle(join(skillRoot, 'okf'));
  const ruleMap = loadRuleMap(join(skillRoot, 'source/rule-concepts.json'));
  return { bundle, ruleMap };
}

export function loadRuleMap(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const rules = Object.values(data.byRule ?? {});
  return {
    schema: data.schema ?? 'law-rule-concepts/v1',
    rules,
    byRule: new Map(rules.map((entry) => [entry.rule_id, entry])),
    byConcept: new Map(rules.map((entry) => [entry.concept_id, entry])),
  };
}

export async function loadLawNodes({ skillRoot }) {
  const { bundle, ruleMap } = await loadLawBundle({ skillRoot });
  return {
    bundle,
    ruleMap,
    nodes: bundle.concepts
      .filter((concept) => typeof concept.frontmatter?.['x-rule-id'] === 'string')
      .map((concept) => toLawNode({ concept, bundle, ruleMap })),
  };
}

export function toLawNode({ concept, bundle, ruleMap, now = new Date() }) {
  const ruleId = concept.frontmatter['x-rule-id'];
  const entry = ruleMap.byRule.get(ruleId);
  return {
    id: ruleId,
    concept_id: concept.id,
    phase: concept.frontmatter['x-phase'] ?? 'operation',
    delivery: 'must',
    applies_to: concept.frontmatter['x-applies-to'] ?? 'all',
    requires: entry?.required_rules ?? concept.frontmatter['x-requires'] ?? [],
    verify: [{ level: 'V1', mode: 'process' }],
    content_sha256: sha256(conceptBody(concept)),
    source: concept.sources?.[0]?.resource ?? entry?.source_alias ?? null,
    body: conceptBody(concept),
    title: concept.title,
    description: concept.description,
    rule_class: concept.frontmatter['x-rule-class'] ?? null,
    verification: concept.frontmatter['x-verification'] ?? null,
    enforcement: concept.frontmatter['x-enforcement'] ?? null,
    outgoing: getOutgoing(bundle, concept.id),
    incoming: getIncoming(bundle, concept.id),
    sources: concept.sources ?? [],
    trustTier: concept.trustTier,
    freshness: {
      status: concept.status,
      stale: concept.isStale(now),
      staleAfter: concept.staleAfter ?? null,
    },
  };
}

export async function explainRule({ ruleId, ruleMap, skillRoot, now = new Date(), implementation = null }) {
  const entry = ruleMap.byRule.get(ruleId);
  if (!entry) throw Object.assign(new Error(`unknown rule: ${ruleId}`), { code: 'UNKNOWN_RULE' });
  const bundle = await loadBundle(join(skillRoot, 'okf'));
  const concept = bundle.byId.get(entry.concept_id);
  if (!concept) throw Object.assign(new Error(`rule concept missing: ${entry.concept_id}`), { code: 'RULE_CONCEPT_MISSING' });
  const node = toLawNode({ concept, bundle, ruleMap, now });
  const outgoing = node.outgoing.map((edge) => `${edge.rawTarget} (${edge.state})`);
  const incoming = node.incoming.map((edge) => `${edge.from} -> ${edge.rawTarget}`);
  return [
    `# Rule ${ruleId}`,
    '',
    '| Field | Value |',
    '|---|---|',
    `| Rule | ${ruleId} |`,
    `| Concept | \`${node.concept_id}\` |`,
    `| Class | ${concept.frontmatter['x-rule-class'] ?? 'unknown'} |`,
    `| Applies to | ${node.applies_to} |`,
    `| Parent | ${concept.frontmatter['x-parent'] ?? 'unknown'} |`,
    `| Verification | ${concept.frontmatter['x-verification'] ?? 'unknown'} |`,
    `| Enforcement | ${concept.frontmatter['x-enforcement'] ?? 'unknown'} |`,
    `| Trust | ${node.trustTier} |`,
    `| Stale | ${node.freshness.stale} |`,
    '',
    '## Requirement',
    '',
    String(concept.description ?? '').trim(),
    '',
    '## Outgoing',
    '',
    ...(outgoing.length > 0 ? outgoing.map((line) => `- ${line}`) : ['- none']),
    '',
    '## Incoming',
    '',
    ...(incoming.length > 0 ? incoming.map((line) => `- ${line}`) : ['- none']),
    '',
    '## Sources',
    '',
    ...((node.sources ?? []).length > 0
      ? node.sources.map((source) => `- ${source.resource} (${source.id})`)
      : ['- none']),
    '',
    ...(implementation ? [
      '## Implementation contract',
      '',
      '| Field | Value |',
      '|---|---|',
      `| Effective pin | \`${implementation.version ?? 'unresolved'}\` |`,
      `| Template | \`${implementation.template ?? 'none'}\` |`,
      `| Detector | \`${implementation.detector ?? 'none'}\` |`,
      `| Test | \`${implementation.test ?? 'none'}\` |`,
      '',
    ] : []),
    '## Body',
    '',
    node.body.trim(),
    '',
  ].join('\n');
}

export { loadBundle, getOutgoing, getIncoming, conceptBody, sha256 };
