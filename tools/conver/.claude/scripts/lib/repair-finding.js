'use strict';

// PX-365 @verifies C004
/**
 * Shared repair record for every gate finding.
 *
 * A finding that carries only a code and a message leaves the AI to invent the
 * repair. This module makes the action and the verification command part of the
 * finding, so a gate can never end a run with an unactionable refusal.
 */

const SEVERITIES = Object.freeze(['blocking', 'advisory']);
const ROUTES = Object.freeze(['in-drill', 'upstream', 'advisory']);
const TERMINALS = Object.freeze(['none', 'COMPLETE', 'BLOCKED_PREREQUISITE', 'REPAIR_NO_PROGRESS']);
const REQUIRED_FIELDS = Object.freeze(['severity', 'code', 'layer', 'artifact', 'cause', 'action', 'verify', 'route']);

/** A generic phrase is not a repair; it names no tool, path, field or value. */
const GENERIC_ACTION = /^(fix|investigate|look into|handle|resolve|todo|tbd)\b/i;

/** @param {string} action */
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function assertConcreteAction(action) {
  if (typeof action !== 'string' || action.trim().length < 10) {
    throw new Error('repair action must be a concrete command or CRUD operation');
  }
  if (GENERIC_ACTION.test(action.trim())) {
    throw new Error('repair action is not concrete; name the tool, artifact path, field and value');
  }
  if (!/(node\s|\.claude\/|\s--|\.json|\.js|\.mjs|\.cjs|\.md)/.test(action)) {
    throw new Error('repair action must name a concrete tool, path or flag');
  }
}

/** @param {object} input */
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function createFinding(input) {
  for (const field of REQUIRED_FIELDS) {
    if (typeof input[field] !== 'string' || input[field].trim().length === 0) {
      throw new Error(`finding.${field} is required`);
    }
  }
  if (!SEVERITIES.includes(input.severity)) {
    throw new Error(`finding.severity must be one of ${SEVERITIES.join(', ')}`);
  }
  if (!ROUTES.includes(input.route)) {
    throw new Error(`finding.route must be one of ${ROUTES.join(', ')}`);
  }
  const terminal = input.terminal ?? 'none';
  if (!TERMINALS.includes(terminal)) {
    throw new Error(`finding.terminal must be one of ${TERMINALS.join(', ')}`);
  }
  assertConcreteAction(input.action);

  return Object.freeze({
    severity: input.severity,
    code: input.code,
    layer: input.layer,
    artifact: input.artifact,
    formulaId: input.formulaId ?? null,
    field: input.field ?? null,
    cause: input.cause,
    action: input.action,
    verify: input.verify,
    route: input.route,
    terminal,
  });
}

/** @param {object} finding */
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function renderFinding(finding) {
  const prefix = finding.severity === 'advisory' ? '[ADVISORY]' : '[ERROR]';
  const lines = [
    `${prefix} ${finding.code}`,
    `Cause: ${finding.cause}`,
    `Layer: ${finding.layer}`,
    `Artifact: ${finding.artifact}`,
  ];
  if (finding.formulaId) lines.push(`Formula: ${finding.formulaId}`);
  if (finding.field) lines.push(`Field: ${finding.field}`);
  lines.push(`Action: ${finding.action}`);
  lines.push(`Verify: ${finding.verify}`);
  lines.push(`Route: ${finding.route}`);
  if (finding.terminal !== 'none') lines.push(`Terminal: ${finding.terminal}`);
  return lines.join('\n');
}

/** @param {Array<object>} findings @param {{cap?: number}} options */
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function renderFindings(findings, options = {}) {
  const cap = Number.isInteger(options.cap) ? options.cap : 10;
  const visible = findings.slice(0, cap);
  const hidden = findings.length - visible.length;
  const blocks = visible.map(renderFinding);
  if (hidden > 0) blocks.push(`...and ${hidden} more`);
  return blocks.join('\n\n');
}

/** @param {object} finding */
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function toJson(finding) {
  return { ...finding };
}

module.exports = {
  SEVERITIES,
  ROUTES,
  TERMINALS,
  assertConcreteAction,
  createFinding,
  renderFinding,
  renderFindings,
  toJson,
};
