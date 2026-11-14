/**
 * Build the one-hop traversal envelope.
 *
 * The envelope answers four questions without asking the caller to interpret
 * prose: what this concept is, which required facets are present, which hops
 * remain, and whether the caller must expand, go back, or stop.
 */

import { getConcept, getOutgoing, getIncoming, getDependents } from '../adapters/okforest.mjs';
import { conceptBody } from '../context/assemble.mjs';
import { loadProfile } from '../profiles/index.mjs';

export const PROTOCOL = 'okf-traversal/v1';
export const DEFAULT_MAX_HOPS = 3;
const CANDIDATE_LIMIT = 5;
const RELATED_PRIORITY = 2;
const DEPENDENT_LIMIT = 50;

export function buildTraversal({
  bundle,
  id,
  profile = 'default',
  hop = 0,
  stack = [],
  payloadIds = null,
  budgetBytes = null,
  now = new Date(),
} = {}) {
  const concept = getConcept(bundle, id);
  if (!concept) throw unknownConcept(bundle, id);
  const resolvedProfile = loadProfile(profile);
  const node = nodeOf(concept, now);
  const frontier = frontierFor({ bundle, concept, profile: resolvedProfile });
  const ids = new Set(payloadIds ?? [id]);
  const coverage = coverageFor({
    bundle,
    concept,
    profile: resolvedProfile,
    payloadIds: ids,
    frontier,
    budgetBytes,
  });
  const guidance = guidanceFor({
    concept,
    coverage,
    frontier,
    hop,
    profile: resolvedProfile,
    budgetBytes,
    stack,
  });
  return {
    protocol: PROTOCOL,
    node,
    coverage,
    frontier,
    guidance,
    backTo: stack.length > 0 ? stack[stack.length - 1] : null,
  };
}

export function unknownConcept(bundle, id) {
  const candidates = candidateIds(bundle, id);
  return Object.assign(
    new Error(`unknown concept: ${id}; candidates: ${candidates.join(', ') || 'none'}`),
    { code: 'UNKNOWN_CONCEPT', requested: id, candidates },
  );
}

export function candidateIds(bundle, id) {
  const requested = String(id ?? '');
  const directory = requested.includes('/') ? requested.slice(0, requested.lastIndexOf('/')) : '';
  const ids = bundle.concepts.map((concept) => concept.id);
  const sameDirectory = ids.filter((entry) => entry.startsWith(`${directory}/`));
  const pool = sameDirectory.length > 0 ? sameDirectory : ids;
  const leaf = requested.slice(requested.lastIndexOf('/') + 1);
  const ranked = pool
    .map((entry) => ({ entry, score: sharedPrefixLength(entry, requested) + (entry.includes(leaf) ? 2 : 0) }))
    .sort((left, right) => right.score - left.score || left.entry.localeCompare(right.entry));
  return ranked.slice(0, CANDIDATE_LIMIT).map((row) => row.entry);
}

function sharedPrefixLength(left, right) {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  return index;
}

function nodeOf(concept, now) {
  return {
    id: concept.id,
    path: concept.path,
    type: concept.type,
    title: concept.title,
    description: concept.description ?? '',
    body: conceptBody(concept),
    sources: concept.sources ?? [],
    trustTier: concept.trustTier,
    freshness: {
      status: concept.status,
      stale: concept.isStale(now),
      staleAfter: concept.staleAfter ?? null,
    },
  };
}

function frontierFor({ bundle, concept, profile }) {
  const entries = [];
  const push = (target, kind, why, priority) => {
    if (!target || target.id === concept.id) return;
    entries.push({
      id: target.id,
      title: target.title,
      type: target.type,
      kind,
      why,
      command: commandFor(profile, kind, target),
      estBytes: Buffer.byteLength(conceptBody(target), 'utf8'),
      priority,
    });
  };

  const frontmatter = concept.frontmatter ?? {};
  for (const requiredId of frontmatter['x-requires'] ?? []) {
    push(getConcept(bundle, requiredId), 'prerequisite', 'x-requires', 0);
  }
  for (const dependent of getDependents(bundle, concept.id).slice(0, DEPENDENT_LIMIT)) {
    push(dependent, 'dependent', 'requires this concept', 1);
  }
  for (const edge of getOutgoing(bundle, concept.id)) {
    if (edge.state !== 'resolved' || !edge.to) continue;
    const target = bundle.byId.get(edge.to);
    if (!target) continue;
    push(target, edgeKind(target), 'body link', edgeKind(target) === 'source-section' ? 1 : RELATED_PRIORITY);
  }
  for (const edge of getIncoming(bundle, concept.id)) {
    push(bundle.byId.get(edge.from), 'backlink', 'body backlink', RELATED_PRIORITY);
  }
  for (const sibling of directorySiblings(bundle, concept, entries)) {
    push(sibling, 'sibling-rule', 'same directory', RELATED_PRIORITY + 1);
  }
  for (const source of concept.sources ?? []) {
    const resource = String(source.resource ?? '').replace(/\.md$/, '');
    push(bundle.byId.get(resource), 'source', 'sources[]', 3);
  }
  const parentId = parentOf(concept.id);
  if (parentId) {
    const parentConcept = bundle.byId.get(parentId);
    if (parentConcept) push(parentConcept, 'parent', 'path parent', 3);
    else {
      entries.push({
        id: parentId,
        title: parentId,
        type: 'Directory',
        kind: 'directory',
        why: 'parent directory holds sibling concepts',
        command: `${profile.commandPrefix ?? 'node "$OKF"'} list --path ${parentId}`,
        estBytes: 0,
        priority: 3,
      });
    }
  }
  const appliesTo = String(concept.frontmatter?.['x-applies-to'] ?? '');
  const templateInterfaces = new Set(['rest', 'websocket', 'cli', 'grpc', 'mcp', 'a2a']);
  for (const action of profile.actions ?? []) {
    // `template --rule` is not a valid command; the template command needs an
    // interface and a unit. Emit it only where an interface template exists.
    if (action.id === 'template' && !templateInterfaces.has(appliesTo)) continue;
    entries.push({
      id: `${concept.id}#${action.id}`,
      title: action.id,
      type: 'action',
      kind: 'action',
      why: action.why,
      command: fillCommand(action.command, profile, concept),
      estBytes: 0,
      priority: 4,
    });
  }
  return dedupe(entries);
}

function edgeKind(target) {
  if (target.type === 'Section') return 'source-section';
  if (target.type === 'Rule') return 'sibling-rule';
  return 'source';
}

function commandFor(profile, kind, target) {
  if (kind === 'action') return target.command ?? '';
  return fillCommand(profile.expandTemplate, profile, target);
}

function fillCommand(template, profile, concept) {
  const ruleId = concept.frontmatter?.['x-rule-id'] ?? concept.id;
  const interfaceName = String(concept.frontmatter?.['x-applies-to'] ?? '');
  return String(template ?? '{prefix} expand --id {id}')
    .replaceAll('{prefix}', profile.commandPrefix ?? 'node "$OKF"')
    .replaceAll('{id}', concept.id)
    .replaceAll('{ruleId}', ruleId)
    .replaceAll('{interface}', interfaceName);
}

function dedupe(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result.sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
}

function siblingsOf(bundle, concept) {
  const directory = concept.id.includes('/') ? concept.id.slice(0, concept.id.lastIndexOf('/')) : '';
  return bundle.concepts.filter((entry) => (
    entry.id !== concept.id
    && entry.type === concept.type
    && (entry.id.includes('/') ? entry.id.slice(0, entry.id.lastIndexOf('/')) : '') === directory
  ));
}

/**
 * Add a small directory fallback only when the body itself carries no sibling
 * link. Law rules already link their section siblings; listing a whole class
 * directory would drown the frontier in hundreds of weak candidates.
 */
function directorySiblings(bundle, concept, entries) {
  if (entries.some((entry) => entry.kind === 'sibling-rule')) return [];
  return siblingsOf(bundle, concept).slice(0, 5);
}

function parentOf(id) {
  const index = String(id).lastIndexOf('/');
  return index > 0 ? id.slice(0, index) : null;
}

function coverageFor({ bundle, concept, profile, payloadIds, frontier, budgetBytes }) {
  const requiredFacets = [...(profile.requiredFacets ?? [])];
  const present = requiredFacets.filter((facet) => facetPresent({ bundle, concept, facet, payloadIds }));
  const missing = requiredFacets.filter((facet) => !present.includes(facet));
  const estimatedBytes = estimateBytes(bundle, payloadIds);
  const insufficient = Boolean(budgetBytes && estimatedBytes > budgetBytes);
  const relevantKinds = new Set(missing.flatMap((facet) => profile.facetKinds?.[facet] ?? []));
  const relevant = frontier.filter((entry) => relevantKinds.has(entry.kind)).length;
  const overfetchRatio = frontier.length === 0
    ? 0
    : Number(((frontier.length - relevant) / frontier.length).toFixed(3));
  return {
    profile: profile.id,
    requiredFacets,
    present,
    missing,
    sufficient: missing.length === 0 && !insufficient,
    insufficient,
    estimatedBytes,
    overfetchRatio,
  };
}

function facetPresent({ bundle, concept, facet, payloadIds }) {
  const frontmatter = concept.frontmatter ?? {};
  const body = conceptBody(concept);
  if (facet === 'body' || facet === 'requirement') return body.trim().length > 0;
  if (facet === 'applies_to') return frontmatter['x-applies-to'] !== undefined;
  if (facet === 'verification') return frontmatter['x-verification'] !== undefined;
  if (facet === 'enforcement') return frontmatter['x-enforcement'] !== undefined;
  if (facet === 'provenance') return (concept.sources ?? []).length > 0;
  if (facet === 'hierarchy') return concept.id.includes('/');
  if (facet === 'index') return concept.id === 'index' || concept.id.endsWith('/index');
  if (facet === 'siblings') return siblingsOf(bundle, concept).length > 0 || false;
  if (facet === 'source') {
    const targets = sourceTargetIds(bundle, concept);
    if (targets.length === 0) return (concept.sources ?? []).length > 0;
    return targets.every((id) => payloadIds.has(id));
  }
  if (facet === 'prerequisites') {
    const required = frontmatter['x-requires'] ?? [];
    return required.every((id) => payloadIds.has(id));
  }
  if (facet === 'actions') return true;
  return true;
}

function sourceTargetIds(bundle, concept) {
  return getOutgoing(bundle, concept.id)
    .filter((edge) => edge.state === 'resolved'
      && edge.to
      && !edge.to.startsWith('sources/15-rule-registry/')
      && bundle.byId.get(edge.to)?.type === 'Section')
    .map((edge) => edge.to);
}

function estimateBytes(bundle, payloadIds) {
  let bytes = 0;
  for (const id of payloadIds) {
    const concept = getConcept(bundle, id);
    if (concept) bytes += Buffer.byteLength(conceptBody(concept), 'utf8');
  }
  return bytes;
}

function guidanceFor({ concept, coverage, frontier, hop, profile, budgetBytes, stack }) {
  const maxHops = profile.maxHops ?? DEFAULT_MAX_HOPS;
  const base = {
    decideAfter: 'this response',
    mustRun: null,
    stopWhen: 'coverage.missing is empty',
    hop,
    maxHops,
    budget: { bytesUsed: coverage.estimatedBytes, bytesLimit: budgetBytes ?? null },
  };
  const ifBack = backCommand(profile, stack);

  if (coverage.insufficient) {
    return {
      ...base,
      state: 'expand',
      reason: 'BUDGET_INSUFFICIENT',
      mustRun: contextCommand(profile, concept, coverage.estimatedBytes),
      ifBack,
      stopWhen: 'after the required facets fit the budget',
    };
  }
  if (coverage.missing.length === 0) {
    return { ...base, state: 'stop', reason: 'every required facet is present', stopWhen: 'now', ifBack };
  }
  if (hop >= maxHops) {
    return { ...base, state: 'back', reason: 'maximum hop reached', ifBack };
  }
  if (profile.completeTemplate) {
    return {
      ...base,
      state: 'expand',
      reason: `missing facet: ${coverage.missing.join(',')}`,
      mustRun: fillCommand(profile.completeTemplate, profile, concept),
      ifBack,
    };
  }
  const missingKinds = new Set(coverage.missing.flatMap((facet) => profile.facetKinds?.[facet] ?? []));
  const candidate = frontier.find((entry) => missingKinds.has(entry.kind));
  if (candidate) {
    return {
      ...base,
      state: 'expand',
      reason: `missing facet: ${coverage.missing.join(',')}`,
      mustRun: candidate.command,
      ifBack,
    };
  }
  return { ...base, state: 'back', reason: `no frontier entry fills ${coverage.missing.join(',')}`, ifBack };
}

function backCommand(profile, stack) {
  const prefix = profile.commandPrefix ?? 'node "$OKF"';
  const previous = stack.length > 0 ? stack[stack.length - 1] : null;
  return previous ? `${prefix} expand --id ${previous}` : `${prefix} list`;
}

function contextCommand(profile, concept, neededBytes) {
  const template = profile.contextTemplate ?? '{prefix} context --entry {id}';
  const filled = fillCommand(template, profile, concept);
  return `${filled} --budget ${neededBytes}`;
}
