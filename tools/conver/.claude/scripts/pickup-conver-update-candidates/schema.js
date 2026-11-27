'use strict';

/**
 * schema.js — candidate validation and content identity.
 *
 * The AI decides whether a change is generalizable. This module enforces the
 * parts that must not depend on judgment: scope containment, completeness,
 * closed enums, and a fingerprint computed from the change itself.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const criteria = require('./criteria.js');

const CLAUDE_DIR_ESCAPE = 'CLAUDE_DIR';

/** Whether target sits at or below root, using path semantics rather than prefixes. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === ''
    || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

/** Build one validation finding with a concrete repair action. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function buildFinding(code, field, cause, action, verify) {
  return {
    code,
    field,
    cause,
    action,
    verify: verify || 'node .claude/scripts/pickup-conver-update-candidates/cli.js list --workspace .',
  };
}

/** Validate the five completeness facts that make a candidate specified. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function validateCompleteness(candidate) {
  const findings = [];
  for (const field of criteria.REQUIRED_CANDIDATE_FIELDS) {
    const value = candidate[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      findings.push(buildFinding(
        'ERROR:missing-field',
        field,
        `${field} is required but missing or empty`,
        `Add ${field} to the candidate JSON and rerun create with --candidate=<file>.`
      ));
    }
  }
  return findings;
}

/** Validate one enum field against its closed set. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function validateEnum(candidate, field, allowed) {
  if (!allowed.includes(candidate[field])) {
    return buildFinding(
      'ERROR:invalid-enum',
      field,
      `${field} must be one of ${allowed.join(', ')}`,
      `Set ${field} to one of ${allowed.join(', ')} in the candidate JSON and rerun create with --candidate=<file>.`
    );
  }
  return null;
}

/** Validate every closed enum in a fixed order. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function validateEnums(candidate) {
  const findings = [];
  const checks = [
    ['primaryCriterion', criteria.VALUE_CATEGORIES],
    ['status', criteria.STATUSES],
    ['impact', criteria.IMPACTS],
    ['confidence', criteria.CONFIDENCES],
    ['riskLevel', criteria.RISK_LEVELS],
    ['generalization', criteria.GENERALIZATIONS],
    ['changeType', criteria.CHANGE_TYPES],
  ];
  for (const [field, allowed] of checks) {
    const invalid = validateEnum(candidate, field, allowed);
    if (invalid) findings.push(invalid);
  }
  if (Array.isArray(candidate.secondaryCriteria)) {
    for (const category of candidate.secondaryCriteria) {
      if (!criteria.VALUE_CATEGORIES.includes(category)) {
        findings.push(buildFinding(
          'ERROR:invalid-enum',
          'secondaryCriteria',
          `secondaryCriteria must contain only ${criteria.VALUE_CATEGORIES.join(', ')}`,
          'Remove the unknown value from secondaryCriteria and rerun create with --candidate=<file>.'
        ));
        break;
      }
    }
  } else {
    findings.push(buildFinding(
      'ERROR:invalid-enum',
      'secondaryCriteria',
      'secondaryCriteria must be an array of value categories',
      'Set secondaryCriteria to an array and rerun create with --candidate=<file>.'
    ));
  }
  return findings;
}

/** An adapt candidate must say how project-specific residue will be removed. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function validateAdaptation(candidate) {
  if (candidate.generalization !== 'adapt') return [];
  if (typeof candidate.adaptationPlan === 'string' && candidate.adaptationPlan.trim().length > 0) return [];
  return [buildFinding(
    'ERROR:missing-adaptation-plan',
    'adaptationPlan',
    'generalization=adapt requires a concrete adaptation plan',
    `Describe how project-specific residue is removed in adaptationPlan, then rerun create with --candidate=<file>.`,
    'node .claude/scripts/pickup-conver-update-candidates/cli.js create --candidate=<file>'
  )];
}

/** Resolve a change location inside the claudeDir trust boundary. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function validateLocation(candidate, { workspace, claudeDir }) {
  const location = candidate.location;
  if (!location || typeof location !== 'object' || typeof location.file !== 'string' || location.file.length === 0) {
    return [buildFinding(
      'ERROR:invalid-location',
      'location.file',
      'location.file must be a non-empty workspace-relative path',
      `Set location.file to a path under CLAUDE_DIR and rerun create with --candidate=<file>.`
    )];
  }

  const findings = [];
  if (typeof location.hunkHeader !== 'string' || location.hunkHeader.length === 0) {
    findings.push(buildFinding(
      'ERROR:invalid-location',
      'location.hunkHeader',
      'location.hunkHeader must be the hunk header text',
      `Set location.hunkHeader to the hunk header and rerun create with --candidate=<file>.`
    ));
  }
  for (const field of ['lineStart', 'lineEnd']) {
    if (!Number.isInteger(location[field]) || location[field] < 0) {
      findings.push(buildFinding(
        'ERROR:invalid-location',
        'location.' + field,
        `location.${field} must be a non-negative integer`,
        `Set location.${field} to a non-negative integer and rerun create with --candidate=<file>.`
      ));
    }
  }

  if (path.isAbsolute(location.file)) {
    findings.push(buildFinding(
      'ERROR:path-outside-claude-dir',
      'location.file',
      'location.file must be relative to the workspace, not absolute',
      `Use a workspace-relative path under ${CLAUDE_DIR_ESCAPE} and rerun create with --candidate=<file>.`
    ));
    return findings;
  }

  const claudeRoot = path.resolve(claudeDir);
  const target = path.resolve(workspace, location.file);
  if (!isInside(claudeRoot, target)) {
    findings.push(buildFinding(
      'ERROR:path-outside-claude-dir',
      'location.file',
      `location.file resolves outside ${CLAUDE_DIR_ESCAPE}`,
      `Restrict the change to ${CLAUDE_DIR_ESCAPE} and rerun create with --candidate=<file>.`
    ));
    return findings;
  }

  // A symlink can be syntactically inside and physically outside; resolve both sides.
  if (fs.existsSync(target) && fs.existsSync(claudeRoot)) {
    const realTarget = fs.realpathSync(target);
    const realRoot = fs.realpathSync(claudeRoot);
    if (!isInside(realRoot, realTarget)) {
      findings.push(buildFinding(
        'ERROR:path-outside-claude-dir',
        'location.file',
        `location.file resolves outside ${CLAUDE_DIR_ESCAPE} through a symlink`,
        `Replace the symlink with a real file under ${CLAUDE_DIR_ESCAPE} and rerun create with --candidate=<file>.`
      ));
    }
  }

  return findings;
}

/** Validate the evidence object that carries the reproducible patch. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function validateEvidence(candidate) {
  const evidence = candidate.evidence;
  if (!evidence || typeof evidence !== 'object') {
    return [buildFinding(
      'ERROR:missing-field',
      'evidence',
      'evidence is required and must carry the patch',
      'Add evidence.patch and the observed ref to the candidate JSON, then rerun create with --candidate=<file>.'
    )];
  }

  const findings = [];
  if (typeof evidence.patch !== 'string' || evidence.patch.length === 0) {
    findings.push(buildFinding(
      'ERROR:missing-field',
      'evidence.patch',
      'evidence.patch is required so the candidate can be re-read upstream',
      'Add the hunk text to evidence.patch and rerun create with --candidate=<file>.'
    ));
  }
  for (const field of ['upstreamRef', 'upstreamCommit', 'diffStat', 'extractCommand', 'observedAt']) {
    if (typeof evidence[field] !== 'string' || evidence[field].trim().length === 0) {
      findings.push(buildFinding(
        'ERROR:missing-field',
        'evidence.' + field,
        `evidence.${field} is required for a reproducible candidate`,
        `Add evidence.${field} to the candidate JSON and rerun create with --candidate=<file>.`
      ));
    }
  }
  return findings;
}

/**
 * Validate a candidate against the criteria taxonomy and the claudeDir boundary.
 *
 * @param {object} candidate
 * @param {{workspace: string, claudeDir: string}} options
 * @returns {{ok: true} | {ok: false, findings: object[]}}
 */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function validateCandidate(candidate, options) {
  if (!candidate || typeof candidate !== 'object') {
    return {
      ok: false,
      findings: [buildFinding('ERROR:invalid-candidate', 'candidate', 'candidate must be an object', 'Pass a candidate object with --candidate=<file>.')],
    };
  }

  const findings = [
    ...validateCompleteness(candidate),
    ...validateEnums(candidate),
    ...validateAdaptation(candidate),
    ...validateEvidence(candidate),
    ...validateLocation(candidate, options),
  ];

  return findings.length === 0 ? { ok: true } : { ok: false, findings };
}

/**
 * Hash the file plus the patch after stripping trailing whitespace per line.
 *
 * Trailing whitespace is invisible in review and differs between editors, so it
 * is removed before hashing. The file is part of the hash because the same hunk
 * in two files is two different changes.
 *
 * @param {string} file
 * @param {string} patch
 * @returns {string} 'sha256:<64 hex>'
 */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function computeContentFingerprint(file, patch) {
  const normalizedPatch = String(patch)
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n');
  const digest = crypto
    .createHash('sha256')
    .update(String(file) + '\n' + normalizedPatch)
    .digest('hex');
  return 'sha256:' + digest;
}

/**
 * Describe the candidate contract for humans and machines.
 *
 * The description is derived from criteria.js so a taxonomy change needs no
 * second edit. It is the only source an AI needs before writing a candidate.
 *
 * @returns {object}
 */
// [::TICKET::] PX-458 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-458 --for-spec --no-implementation-order`.
function describeSchema() {
  return {
    schemaVersion: criteria.SCHEMA_VERSION,
    criteriaVersion: criteria.CRITERIA_VERSION,
    gates: criteria.ADMISSION_GATES.map((gate) => ({ id: gate.id, rule: gate.rule })),
    exclusions: criteria.EXCLUSION_CODES.map((exclusion) => ({ id: exclusion.id, rule: exclusion.rule })),
    categories: [...criteria.VALUE_CATEGORIES],
    required: [...criteria.REQUIRED_CANDIDATE_FIELDS],
    locationRequired: ['file', 'hunkHeader', 'lineStart', 'lineEnd'],
    evidenceRequired: ['patch', 'upstreamRef', 'upstreamCommit', 'diffStat', 'extractCommand', 'observedAt'],
    enums: {
      changeType: [...criteria.CHANGE_TYPES],
      status: [...criteria.STATUSES],
      impact: [...criteria.IMPACTS],
      confidence: [...criteria.CONFIDENCES],
      riskLevel: [...criteria.RISK_LEVELS],
      generalization: [...criteria.GENERALIZATIONS],
    },
    computed: [
      'id',
      'evidence.contentFingerprint',
      'evidence.observedAt',
      'evidence.upstreamRef',
      'status',
      'note',
      'adaptationPlan',
    ],
    updateWhitelist: [...criteria.UPDATABLE_FIELDS],
  };
}

module.exports = {
  isInside,
  validateCandidate,
  computeContentFingerprint,
  describeSchema,
};
