'use strict';

/**
 * /amend-rfc-up artifact changes.
 *
 * One change names exactly one artifact. RFC/SPEC changes are append claims;
 * GRAPH/Dirs-Tree/Tickets changes are owner rederives. The command never writes
 * an artifact itself.
 */

const ARTIFACT_ORDER = Object.freeze(['rfc', 'spec', 'graph', 'dirs-tree', 'tickets']);
const OWNER_BY_ARTIFACT = Object.freeze({
  graph: 'graphify',
  'dirs-tree': 'boundify',
  tickets: 'split',
});
const ALLOWED_OPERATIONS = Object.freeze({
  rfc: Object.freeze(['append']),
  spec: Object.freeze(['append']),
  graph: Object.freeze(['owner-rederive', 'mutate']),
  'dirs-tree': Object.freeze(['owner-rederive', 'mutate']),
  tickets: Object.freeze(['owner-rederive', 'mutate']),
});
const ALLOWED_OWNERS = Object.freeze(['graphify', 'boundify', 'split', 'mutationGate']);
const FORBIDDEN_CLAIM_TEXT = /\b(?:T[B]D|T[O]DO|F[I]XME|H[A]CK|X{3}|stub)\b/i;
const DELEGATION_TEXT = /\bdelegat(e|ion)\b/i;

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function assertRfcAppendClaim({ change }) {
  if (!change.target || typeof change.target.kind !== 'string' || typeof change.target.id !== 'string') {
    throw fail('CHANGE_INVALID', 'rfc/spec change needs target.kind and target.id');
  }
  for (const field of ['predicate', 'requiredTest', 'text']) {
    if (typeof change[field] !== 'string' || change[field].trim() === '') {
      throw fail('CHANGE_INVALID', `${change.artifact} change needs ${field}`);
    }
  }
  if (!/```/.test(change.text)) throw fail('CHANGE_INVALID', 'rfc/spec text needs a code example');
  if (FORBIDDEN_CLAIM_TEXT.test(change.text)) throw fail('CHANGE_INVALID', 'rfc/spec text carries a forbidden marker');
  if (DELEGATION_TEXT.test(change.text)) throw fail('CHANGE_INVALID', 'rfc/spec text delegates scope');
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function assertDerivedOwnerChange({ change }) {
  if (!ALLOWED_OWNERS.includes(change.owner)) {
    throw fail('CHANGE_INVALID', `${change.artifact} change needs a known owner`);
  }
  if (typeof change.reason !== 'string' || change.reason.trim() === '') {
    throw fail('CHANGE_INVALID', `${change.artifact} change needs a reason`);
  }
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function validateArtifactChange({ change }) {
  if (!change || typeof change !== 'object') throw fail('CHANGE_INVALID', 'change is required');
  if (typeof change.id !== 'string' || change.id.length === 0) throw fail('CHANGE_INVALID', 'change.id is required');
  if (!ARTIFACT_ORDER.includes(change.artifact)) {
    throw fail('CHANGE_INVALID', `unknown artifact: ${change.artifact}`);
  }
  const allowed = ALLOWED_OPERATIONS[change.artifact];
  if (!allowed.includes(change.operation)) {
    throw fail('CHANGE_INVALID', `operation ${change.operation} is not valid for ${change.artifact}`);
  }
  if (!Array.isArray(change.evidence) || change.evidence.length === 0) {
    throw fail('CHANGE_INVALID', `${change.id} needs evidence`);
  }
  if (change.artifact === 'rfc' || change.artifact === 'spec') assertRfcAppendClaim({ change });
  else assertDerivedOwnerChange({ change });
  return change;
}

/** Dependencies are a DAG; unknown dependencies and cycles are rejected. */
// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function assertChangeDag({ changes = [] }) {
  const byId = new Map(changes.map((change) => [change.id, change]));
  const state = new Map();
  const visit = (id, pathStack) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') throw fail('CHANGE_DAG_CYCLE', `change cycle: ${[...pathStack, id].join(' -> ')}`);
    const change = byId.get(id);
    if (!change) throw fail('CHANGE_INVALID', `unknown change dependency: ${id}`);
    state.set(id, 'visiting');
    for (const dependency of change.dependsOn || []) visit(dependency, [...pathStack, id]);
    state.set(id, 'done');
  };
  for (const change of changes) visit(change.id, []);
  return true;
}

/** Cross-package impacts name existing packages and existing changes. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function assertCrossPackageImpacts({ impacts = [], packageIds = [], changeIds = [] } = {}) {
  const packages = new Set(packageIds);
  const changes = new Set(changeIds);
  for (const impact of impacts) {
    if (!impact || typeof impact.from !== 'string' || typeof impact.to !== 'string') {
      throw fail('CHANGE_INVALID', 'every cross-package impact needs from and to');
    }
    if (!packages.has(impact.from) || !packages.has(impact.to)) {
      throw fail('CHANGE_INVALID', `cross-package impact names an unknown package: ${impact.from} -> ${impact.to}`);
    }
    if (typeof impact.reference !== 'string' || impact.reference.trim() === '') {
      throw fail('CHANGE_INVALID', `cross-package impact ${impact.from} -> ${impact.to} needs a reference`);
    }
    const ids = Array.isArray(impact.changeIds) ? impact.changeIds : [];
    if (ids.length === 0 || ids.some((id) => !changes.has(id))) {
      throw fail('CHANGE_INVALID', `cross-package impact ${impact.from} -> ${impact.to} names an unknown change`);
    }
  }
  return true;
}

module.exports = {
  ALLOWED_OPERATIONS,
  ALLOWED_OWNERS,
  ARTIFACT_ORDER,
  OWNER_BY_ARTIFACT,
  assertChangeDag,
  assertCrossPackageImpacts,
  assertDerivedOwnerChange,
  assertRfcAppendClaim,
  validateArtifactChange,
};
