// [::TICKET::] PX-458 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-458 --for-spec --no-implementation-order`.
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
'use strict';

/**
 * criteria.js — the single taxonomy for conver update candidates.
 *
 * The command document, the validator, and the renderer all read this module.
 * A second copy of these values is a second authority, so every consumer imports
 * from here and the document-parity test proves the two have not drifted.
 */

const SCHEMA_VERSION = 1;
const CRITERIA_VERSION = '1.0.0';

/** Hard gates: a change must satisfy every gate before it can become a candidate. */
const ADMISSION_GATES = Object.freeze([
  Object.freeze({ id: 'G1', name: 'scope', rule: 'The change target is under CLAUDE_DIR; anything outside is not evaluated.' }),
  Object.freeze({ id: 'G2', name: 'non-destructive', rule: 'Existing command roles, functions, and contracts are not broken.' }),
  Object.freeze({ id: 'G3', name: 'no-project-residue', rule: 'No project-specific name, path, stack branch, ticket id, business rule, or credential enters conver behavior.' }),
  Object.freeze({ id: 'G4', name: 'real-evidence', rule: 'The change answers a need observed in real project use, not speculation.' }),
  Object.freeze({ id: 'G5', name: 'testability', rule: 'The absorbed change can be machine-verified by conver tests.' }),
  Object.freeze({ id: 'G6', name: 'no-gate-weakening', rule: 'Safety, fail-closed, and TDD gates are never weakened.' }),
]);

/** Why a qualifying change is worth absorbing upstream. */
const VALUE_CATEGORIES = Object.freeze([
  'correctness',
  'safety',
  'efficiency',
  'generality',
  'density',
  'clarity',
  'consistency',
  'testability',
  'observability',
  'evolvability',
]);

/** Reasons a change must not be recorded at all. */
const EXCLUSION_CODES = Object.freeze([
  Object.freeze({ id: 'X1', rule: 'Project-specific optimization or embedded project value.' }),
  Object.freeze({ id: 'X2', rule: 'One-off workaround that does not reduce to a general rule.' }),
  Object.freeze({ id: 'X3', rule: 'Environment dependency: OS, local path, credential, or machine state.' }),
  Object.freeze({ id: 'X4', rule: 'Duplicate of an existing conver capability.' }),
  Object.freeze({ id: 'X5', rule: 'Cosmetic churn with no measurable behavior, cost, or safety difference.' }),
  Object.freeze({ id: 'X6', rule: 'Low confidence: no reproduction, regression test, or independent occurrence.' }),
  Object.freeze({ id: 'X7', rule: 'Contains a secret, personal data, or project identifier.' }),
  Object.freeze({ id: 'X8', rule: 'Weakens a safety, fail-closed, or TDD gate.' }),
]);

/** The only statuses a persisted candidate may carry. */
const STATUSES = Object.freeze(['candidate', 'accepted', 'absorbed']);
const IMPACTS = Object.freeze(['high', 'medium', 'low']);
const CONFIDENCES = Object.freeze(['high', 'medium', 'low']);
const RISK_LEVELS = Object.freeze(['low', 'medium', 'high']);
const GENERALIZATIONS = Object.freeze(['direct', 'adapt']);
const CHANGE_TYPES = Object.freeze(['added', 'modified', 'deleted', 'renamed']);

/** The five facts a candidate must state; one missing fact means it is unspecified. */
const REQUIRED_CANDIDATE_FIELDS = Object.freeze(['symptom', 'remedy', 'scope', 'risk', 'verification']);

/** The only fields update may change; location and evidence require delete and recreate. */
const UPDATABLE_FIELDS = Object.freeze([
  'primaryCriterion',
  'secondaryCriteria',
  'generalization',
  'adaptationPlan',
  'impact',
  'confidence',
  'riskLevel',
  'status',
  'note',
  'symptom',
  'remedy',
  'scope',
  'risk',
  'verification',
]);

/** How many candidates the Markdown view shows before the explicit remainder. */
const DISPLAY_LIMIT = 50;

module.exports = {
  SCHEMA_VERSION,
  CRITERIA_VERSION,
  ADMISSION_GATES,
  VALUE_CATEGORIES,
  EXCLUSION_CODES,
  STATUSES,
  IMPACTS,
  CONFIDENCES,
  RISK_LEVELS,
  GENERALIZATIONS,
  CHANGE_TYPES,
  REQUIRED_CANDIDATE_FIELDS,
  UPDATABLE_FIELDS,
  DISPLAY_LIMIT,
};
