// [::TICKET::] PX-176 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-176 --for-spec --no-implementation-order`.
/**
 * Alias normalization and collision detection (§8.3).
 *
 * Candidates whose canonical names share a normalized key (lowercase, without
 * underscores) are merged: the first name stays canonical, the others are
 * tracked as aliases, source refs are unioned, and conflicting classifications
 * degrade to REVIEW_REQUIRED. Object/claim name collisions are reported
 * explicitly rather than silently resolved.
 */

/** Normalize a canonical name into a case/underscore-insensitive key. */
export function normalizedKey(canonicalName) {
  return canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Merge duplicate candidates and detect collisions with a claim list.
 *
 * @param {Array<object>} candidates - object candidates
 * @param {{ collisionWith?: Array<object> }} [options] - claim candidates to check
 * @returns {{ candidates: Array<object>, decisions: Array<object>, collisions: Array<object> }}
 */
export function normalizeAliases(candidates, { collisionWith = [] } = {}) {
  const groups = new Map();
  for (const candidate of candidates) {
    const key = normalizedKey(candidate.canonical_name);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(candidate);
  }

  const merged = [];
  const decisions = [];
  for (const group of groups.values()) {
    const primary = normalizeCandidateShape(group[0]);
    for (let i = 1; i < group.length; i++) {
      const member = normalizeCandidateShape(group[i]);
      const aliasName = member.canonical_name;
      if (aliasName !== primary.canonical_name && !primary.aliases.includes(aliasName)) {
        primary.aliases.push(aliasName);
      }
      primary.source_refs = unionRefs(primary.source_refs, member.source_refs);
      decisions.push({ from: member.canonical_name, to: primary.canonical_name, reason: 'same-normalized-key' });
      mergeClassification(primary, member.classification, member.normalization_status);
    }
    if (group.some((member) => (member.normalization_status ?? 'CONFIRMED') === 'REVIEW_REQUIRED')) {
      primary.normalization_status = 'REVIEW_REQUIRED';
    }
    merged.push(primary);
  }

  const claimGroups = new Map();
  for (const claim of collisionWith) {
    const key = normalizedKey(claim.canonical_name);
    if (!claimGroups.has(key)) {
      claimGroups.set(key, []);
    }
    claimGroups.get(key).push(claim.canonical_name);
  }

  const collisions = [];
  for (const candidate of merged) {
    const key = normalizedKey(candidate.canonical_name);
    const claimNames = claimGroups.get(key);
    if (claimNames) {
      collisions.push({
        normalized_key: key,
        object_candidates: [candidate.canonical_name],
        claim_candidates: [...claimNames],
      });
    }
  }

  return { candidates: merged, decisions, collisions };
}

/**
 * Detect alias cycles in a name -> alias mapping.
 *
 * @param {Array<{ name: string, alias: string }>} pairs
 * @returns {Array<{ path: string[] }>} one entry per distinct cycle
 */
export function detectAliasCycles(pairs) {
  const nextAlias = new Map();
  for (const pair of pairs) {
    nextAlias.set(pair.name, pair.alias);
  }
  const visited = new Set();
  const cycles = [];
  for (const start of nextAlias.keys()) {
    if (visited.has(start)) {
      continue;
    }
    const path = [];
    const inPath = new Set();
    let current = start;
    while (current !== undefined) {
      if (inPath.has(current)) {
        const cycleStartIndex = path.indexOf(current);
        cycles.push({ path: path.slice(cycleStartIndex).concat(current) });
        break;
      }
      if (visited.has(current)) {
        break;
      }
      inPath.add(current);
      path.push(current);
      visited.add(current);
      current = nextAlias.get(current);
    }
  }
  return cycles;
}

function normalizeCandidateShape(candidate) {
  return {
    ...candidate,
    aliases: [...(candidate.aliases ?? [])],
    source_refs: [...(candidate.source_refs ?? [])],
    classification: candidate.classification ?? 'unknown',
    normalization_status: candidate.normalization_status ?? 'CONFIRMED',
  };
}

function unionRefs(leftRefs, rightRefs) {
  const seen = new Set(leftRefs.map((ref) => refKey(ref)));
  const result = [...leftRefs];
  for (const ref of rightRefs) {
    const key = refKey(ref);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(ref);
    }
  }
  return result;
}

function refKey(ref) {
  return `${ref.line_start ?? ''}:${ref.byte_start ?? ''}:${ref.byte_end ?? ''}`;
}

function mergeClassification(target, classification, status) {
  const current = target.classification;
  if (classification === 'unknown') {
    return;
  }
  if (current === 'unknown') {
    target.classification = classification;
    return;
  }
  if (classification !== current) {
    target.classification = 'unknown';
    target.normalization_status = 'REVIEW_REQUIRED';
    return;
  }
  if (status === 'REVIEW_REQUIRED') {
    target.normalization_status = 'REVIEW_REQUIRED';
  }
}
