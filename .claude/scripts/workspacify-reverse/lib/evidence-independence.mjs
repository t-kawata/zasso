// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
/**
 * Evidence independence — the fold that stops a count of records being read as
 * a count of support.
 *
 * A unit test, the comment above it and the README that names it are three
 * artefacts and one derivation. Counting them as three is the reverse-rotation
 * form of a false green (F11), and the defence is structural rather than
 * editorial: evidence is graphed by the *observable* relations that join it, and
 * the number a claim reports is the number of connected components reached
 * through the relations that fold.
 *
 * Two things this module refuses to do. It will not fold a weak relation, so a
 * resemblance between a comment and a test name stays a candidate for a human
 * rather than becoming a machine's conclusion. And it will not guess: whether
 * two artefacts descend from one human design decision is not computable from
 * file contents, so an item no consulted channel can settle is recorded as
 * `unknown`, which is a legal answer and not a failure.
 *
 * The fold is a pure function of the evidence list, deliberately separable from
 * extraction, so it can be tested without standing up the pipeline.
 */
import { spawnSync } from 'node:child_process';

import {
  GROUP_KEY_SEPARATOR,
  INDEPENDENCE_ASSESSMENTS,
  INDEPENDENCE_POLICY,
  foldsIndependence,
  relationStrength,
} from './provenance.mjs';

/** The evidence mode a fact read from source text or its syntax tree carries. */
export const SOURCE_STATIC = 'source_static';

/** The relation derived from two records naming the same syntax span. */
const SAME_SYNTAX_SPAN = 'same_syntax_span';

/** The relation derived from two records introduced by the same commit. */
const SAME_COMMIT = 'same_commit';

/**
 * One evidence record, in the shape the design's schema names.
 *
 * The evidence id is derived from what the record points at rather than from a
 * counter, so two runs over the same tree produce the same ids and a lineage
 * edge written in one run still names its target in the next.
 */
export function buildEvidence(span, sourceKind, evidenceId) {
  const id = evidenceId ?? `ev-${sourceKind}-${span.file.split('/').join('_')}-${span.line}`;
  return {
    evidence_id: id,
    source_kind: sourceKind,
    evidence_mode: SOURCE_STATIC,
    source_span: { file: span.file, line: span.line },
    lineage_edges: [],
  };
}

/** The key that identifies a syntax span for the purpose of joining two records. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function spanKey(span) {
  return `${span.file}${GROUP_KEY_SEPARATOR}${span.line}`;
}

/**
 * The relations two records' own contents establish, with no external channel.
 *
 * Only `same_syntax_span` is derived here. `same_generator`, `same_guard` and
 * `same_error_path` need artefacts this stage does not hold — a generator hash,
 * a resolved guard identity, a shared failure path — and inventing them from
 * text similarity is exactly the inference the design forbids. A caller that has
 * them declares them on the edge.
 */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function relationsFromSpans(evidence) {
  const byKey = new Map();
  for (const item of evidence) {
    const key = spanKey(item.source_span);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(item.evidence_id);
  }

  const edges = [];
  for (const ids of byKey.values()) {
    if (ids.length < 2) continue;
    for (let index = 1; index < ids.length; index += 1) {
      edges.push({
        relation: SAME_SYNTAX_SPAN,
        target: ids[0],
        source: ids[index],
        confidence: 'high',
        basis: [ids[index], ids[0]],
      });
    }
  }
  return edges;
}

/**
 * The commits the evidence's files were last touched by, read from the tree.
 *
 * Co-introduction is real evidence that two artefacts derive from one change,
 * and it is medium confidence rather than high: sharing a commit does not prove
 * sharing an intent. The reading is one `git log` per distinct file, memoised,
 * because this stage needs commit and blame ranges and not the full history
 * reconstruction that R4 performs.
 *
 * A tree that is not a repository yields null, and every assessment that would
 * have rested on this channel is then recorded as unknown rather than assumed.
 */
export function historyFromGit(root, { files } = {}) {
  const distinct = [...new Set(files ?? [])].sort();
  // A channel with nothing to consult is not a channel that was consulted. Had
  // this returned a history over an empty file list, every assessment resting on
  // it would have read `independent` — a conclusion drawn from no observation.
  if (distinct.length === 0) return null;

  const commits = new Map();
  for (const file of distinct) {
    const result = spawnSync('git', ['log', '-1', '--format=%H', '--', file], {
      cwd: root,
      encoding: 'utf8',
    });
    const sha = result.status === 0 ? result.stdout.trim() : '';
    commits.set(file, sha.length > 0 ? sha : null);
  }

  const inRepository = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (inRepository.status !== 0 || inRepository.stdout.trim() !== 'true') return null;

  return {
    /** The commit that last touched the file a span names, or null when unknown. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
    commitOf(span) {
      return commits.get(span.file) ?? null;
    },
  };
}

/** The relations the commit channel establishes between records. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function relationsFromHistory(evidence, history) {
  if (history === null || history === undefined) return [];

  const byCommit = new Map();
  for (const item of evidence) {
    const commit = history.commitOf(item.source_span);
    if (commit === null) continue;
    if (!byCommit.has(commit)) byCommit.set(commit, []);
    byCommit.get(commit).push(item.evidence_id);
  }

  const edges = [];
  for (const [commit, ids] of byCommit.entries()) {
    if (ids.length < 2) continue;
    for (let index = 1; index < ids.length; index += 1) {
      edges.push({
        relation: SAME_COMMIT,
        target: ids[0],
        source: ids[index],
        confidence: 'medium',
        basis: [`git:${commit}`],
      });
    }
  }
  return edges;
}

/**
 * What can be concluded about one record's independence.
 *
 * `folded` when a foldable relation reaches it, `independent` when a channel
 * that could have found a join was consulted and found none, and `unknown` when
 * no such channel was available. The third case is the honest one: a record the
 * analysis could not connect is not thereby a record the analysis proved
 * separate.
 */
export function assessIndependence(item, { history, anyRelationFound = false } = {}) {
  const folded = (item.lineage_edges ?? []).some((edge) => foldsIndependence(edge.relation));
  if (folded) return 'folded';
  // `independent` is a statement about the graph, not about the artefacts: it
  // says the relations that could have joined this record to another were
  // examined and none was found. Where no relation was found anywhere, nothing
  // was examined and the honest answer is that the question is open — the
  // design is explicit that co-introduction never proves independence, so
  // absence of evidence must not be recorded as evidence of it.
  return anyRelationFound ? 'independent' : 'unknown';
}

/**
 * How many *independent* pieces of support a set of records amounts to.
 *
 * Records joined by a foldable relation form one component; records joined only
 * by `similar_wording` do not. An edge naming an evidence id not present is
 * ignored rather than counted, because an edge with no other end is not a
 * relation.
 *
 * This is pure over the edges it is given: derivation happens in
 * `computeIndependence`, so a caller holding declared edges gets the fold those
 * edges imply and nothing else.
 */
export function countIndependentSupport(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) return 0;

  const positionOf = new Map(evidence.map((item, position) => [item.evidence_id, position]));
  const parent = evidence.map((_, position) => position);

  const rootOf = (position) => {
    let current = position;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  const join = (left, right) => {
    const leftRoot = rootOf(left);
    const rightRoot = rootOf(right);
    if (leftRoot !== rightRoot) parent[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };

  for (const item of evidence) {
    for (const edge of item.lineage_edges ?? []) {
      if (!foldsIndependence(edge.relation)) continue;
      const target = positionOf.get(edge.target);
      if (target === undefined) continue;
      join(positionOf.get(item.evidence_id), target);
    }
  }

  return new Set(evidence.map((_, position) => rootOf(position))).size;
}

/**
 * Annotate a list of records with the relations that join them and the
 * conclusion drawn about each, then report the independent count.
 *
 * The derived edges are merged into each record's own list before the fold, so
 * the ledger stores the edges the count was computed from. Storing the policy
 * and its inputs beside the result is what lets a human correct a grouping
 * later without re-running the extraction.
 */
export function computeIndependence(evidence, { root = null, history = null } = {}) {
  if (!Array.isArray(evidence)) {
    throw new Error('computeIndependence needs the evidence list it is to fold; it was given no list');
  }

  const derived = [...relationsFromSpans(evidence), ...relationsFromHistory(evidence, history)];
  const withDerived = evidence.map((item) => {
    const additions = derived
      .filter((edge) => edge.source === item.evidence_id)
      .map(({ source, ...edge }) => ({ ...edge, basis: [...edge.basis] }));
    return { ...item, lineage_edges: [...(item.lineage_edges ?? []), ...additions] };
  });

  const anyRelationFound = derived.length > 0
    || evidence.some((item) => (item.lineage_edges ?? []).length > 0);
  const annotated = withDerived.map((item) => ({
    ...item,
    independence_assessment: assessIndependence(item, { history, anyRelationFound }),
  }));

  return {
    root,
    evidence: annotated,
    independentCount: countIndependentSupport(annotated),
    policyInputs: {
      edges: annotated.flatMap((item) => (item.lineage_edges ?? []).map((edge) => ({ ...edge, from: item.evidence_id }))),
      strengths: Object.fromEntries(
        [...new Set(annotated.flatMap((item) => (item.lineage_edges ?? []).map((edge) => edge.relation)))]
          .map((relation) => [relation, relationStrength(relation)]),
      ),
      historyConsulted: history !== null && history !== undefined,
    },
    independence_policy: INDEPENDENCE_POLICY,
    assessments: INDEPENDENCE_ASSESSMENTS,
  };
}
