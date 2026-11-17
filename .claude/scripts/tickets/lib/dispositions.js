'use strict';

/**
 * PX-440 — per-clause applicability disposition ledger.
 *
 * A clause is resolved by a verified, structured disposition, never by free
 * prose. Every non-testable status carries the fields its evidence needs, the
 * ruleId resolves to a declared rule, and the evidence digest makes the
 * disposition expire when its evidence changes.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const DISPOSITIONS_FILE_NAME = 'OMISSION-DISPOSITIONS.json';
const DISPOSITION_VERSION = 1;

/** The statuses a validated disposition may carry. */
const DISPOSITION_STATUS = Object.freeze({
  TESTABLE: 'TESTABLE',
  DESIGN_PREDICATE_VERIFIED: 'DESIGN_PREDICATE_VERIFIED',
  PROCESS_VERIFIED: 'PROCESS_VERIFIED',
  EXTERNAL_VERIFIED: 'EXTERNAL_VERIFIED',
  NOT_APPLICABLE_VERIFIED: 'NOT_APPLICABLE_VERIFIED',
  DEFERRED: 'DEFERRED',
});

/** The declared rule kind each non-testable status requires. */
const STATUS_RULE_KIND = Object.freeze({
  DESIGN_PREDICATE_VERIFIED: 'design-predicate',
  PROCESS_VERIFIED: 'process',
  EXTERNAL_VERIFIED: 'external',
  NOT_APPLICABLE_VERIFIED: 'not-applicable',
});

/** The fields each status requires. */
const REQUIRED_FIELDS = Object.freeze({
  TESTABLE: Object.freeze([]),
  DESIGN_PREDICATE_VERIFIED: Object.freeze(['ruleId', 'normativeSource', 'predicate', 'command', 'evidence', 'evidenceDigest']),
  PROCESS_VERIFIED: Object.freeze(['ruleId', 'normativeSource', 'command', 'evidence', 'evidenceDigest']),
  EXTERNAL_VERIFIED: Object.freeze(['ruleId', 'normativeSource', 'owner', 'reason', 'command', 'evidence', 'evidenceDigest']),
  NOT_APPLICABLE_VERIFIED: Object.freeze(['ruleId', 'normativeSource', 'evidence', 'evidenceDigest']),
  DEFERRED: Object.freeze([]),
});

const STATUS_VALUES = new Set(Object.values(DISPOSITION_STATUS));
const RULE_KINDS = new Set(['not-applicable', 'design-predicate', 'process', 'external']);
const TICKET_OWNER = /^(PX-\d+|P-?\d+-\d+)$/;

/** Whether a value is a non-empty string. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/** Whether a value is a valid date string. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function isDate(value) {
  return isNonEmptyString(value) && !Number.isNaN(new Date(value).getTime());
}

/** Sort object keys recursively so the digest is stable. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
    return sorted;
  }
  return value;
}

/** The digest of the evidence a disposition cites. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function evidenceDigestOf(evidence) {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(canonicalize(evidence))).digest('hex');
}

/** One validation finding. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function findingOf(code, record, problem, field = null) {
  return { code, key: record?.key ?? null, field, problem };
}

/** Validate the declared rules. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function validateRules(rules) {
  const findings = [];
  const byId = new Map();
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!isNonEmptyString(rule?.id) || !RULE_KINDS.has(rule?.kind)) {
      findings.push(findingOf('DISPOSITION_RULE_INVALID', rule, 'a rule needs id and kind'));
      continue;
    }
    if (byId.has(rule.id)) {
      findings.push(findingOf('DISPOSITION_RULE_DUPLICATE', rule, 'rule ' + rule.id + ' is declared twice', 'id'));
      continue;
    }
    byId.set(rule.id, rule);
  }
  return { byId, findings };
}

/**
 * Validate an optional TESTABLE proof plan.
 *
 * The plan supplies the mutation and runner command when no earlier proof
 * exists. The harness never invents either, so a malformed plan is a finding.
 */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function validateProofPlan(record) {
  if (record?.proof === undefined) return [];
  const plan = record.proof;
  if (plan === null || typeof plan !== 'object' || Array.isArray(plan)) {
    return [findingOf('DISPOSITION_PROOF_INVALID', record, 'proof must be an object', 'proof')];
  }
  const mutation = plan.mutation;
  if (mutation === null || typeof mutation !== 'object' || Array.isArray(mutation)) {
    return [findingOf('DISPOSITION_PROOF_INVALID', record, 'proof.mutation must be an object', 'proof')];
  }
  if (!isNonEmptyString(mutation.file) || !isNonEmptyString(mutation.find)) {
    return [findingOf('DISPOSITION_PROOF_INVALID', record, 'proof.mutation requires file and find', 'proof')];
  }
  if (mutation.replace !== undefined && typeof mutation.replace !== 'string') {
    return [findingOf('DISPOSITION_PROOF_INVALID', record, 'proof.mutation.replace must be a string', 'proof')];
  }
  if (!isNonEmptyString(plan.command)) {
    return [findingOf('DISPOSITION_PROOF_INVALID', record, 'proof.command is required', 'proof')];
  }
  return [];
}

/** Validate one disposition record. */
// [::TICKET::] PX-440, PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-440|PX-441) --for-spec --no-implementation-order`.
function validateDisposition({ record, rulesById, clauseKeys = null, openTicketKeys = new Set(), now = new Date() }) {
  const findings = [];
  if (!isNonEmptyString(record?.key) || !record.key.startsWith('clause|')) {
    return [findingOf('DISPOSITION_KEY_INVALID', record, 'a disposition key must be a canonical clause key', 'key')];
  }
  if (clauseKeys !== null && !clauseKeys.has(record.key)) {
    findings.push(findingOf('DISPOSITION_KEY_UNKNOWN', record, 'clause ' + record.key + ' is not in the inventory', 'key'));
  }
  if (!STATUS_VALUES.has(record.status)) {
    return [...findings, findingOf('DISPOSITION_STATUS_INVALID', record, 'unknown disposition status', 'status')];
  }

  if (record.status === DISPOSITION_STATUS.TESTABLE) {
    findings.push(...validateProofPlan(record));
  }

  for (const field of REQUIRED_FIELDS[record.status]) {
    const present = field === 'evidence'
      ? Array.isArray(record.evidence) && record.evidence.length > 0
      : isNonEmptyString(record[field]);
    if (!present) {
      findings.push(findingOf('DISPOSITION_FIELD_MISSING', record, record.status + ' requires ' + field, field));
    }
  }

  const requiredKind = STATUS_RULE_KIND[record.status];
  if (requiredKind !== undefined) {
    const rule = rulesById.get(record.ruleId);
    if (rule === undefined) {
      findings.push(findingOf('DISPOSITION_RULE_UNKNOWN', record, 'ruleId ' + String(record.ruleId) + ' is not declared', 'ruleId'));
    } else if (rule.kind !== requiredKind) {
      findings.push(findingOf('DISPOSITION_RULE_KIND_MISMATCH', record, 'rule ' + rule.id + ' is ' + rule.kind + ', not ' + requiredKind, 'ruleId'));
    }
  }

  if (isNonEmptyString(record.evidenceDigest) && Array.isArray(record.evidence)
    && record.evidenceDigest !== evidenceDigestOf(record.evidence)) {
    findings.push(findingOf('DISPOSITION_EVIDENCE_DIGEST_MISMATCH', record, 'evidence changed after the disposition was recorded', 'evidenceDigest'));
  }

  if (record.status === DISPOSITION_STATUS.DEFERRED) {
    const owner = record.owner;
    for (const field of ['owner', 'reason', 'normativeSource', 'createdAt', 'expiresAt']) {
      if (!isNonEmptyString(record[field])) {
        findings.push(findingOf('DEFERRED_INVALID', record, 'DEFERRED requires ' + field, field));
      }
    }
    if (isNonEmptyString(owner) && TICKET_OWNER.test(owner) && !openTicketKeys.has(owner)) {
      findings.push(findingOf('DEFERRED_OWNER_NOT_OPEN', record, 'owner ' + owner + ' is not an open ticket', 'owner'));
    }
    if (isDate(record.createdAt) && isDate(record.expiresAt)
      && new Date(record.expiresAt).getTime() <= new Date(record.createdAt).getTime()) {
      findings.push(findingOf('DEFERRED_INVALID', record, 'expiresAt must be after createdAt', 'expiresAt'));
    } else if ((isNonEmptyString(record.createdAt) && !isDate(record.createdAt))
      || (isNonEmptyString(record.expiresAt) && !isDate(record.expiresAt))) {
      findings.push(findingOf('DEFERRED_INVALID', record, 'createdAt and expiresAt must be dates', 'expiresAt'));
    }
  }

  return findings;
}

/**
 * Validate one ledger.
 *
 * @param {{ledger:object, clauseKeys?:Set<string>|null, openTicketKeys?:Set<string>, now?:Date}} input
 * @returns {{ok:boolean, findings:object[], dispositions:object[], rules:object[]}}
 */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function validateDispositionLedger({ ledger, clauseKeys = null, openTicketKeys = new Set(), now = new Date() }) {
  const findings = [];
  if (ledger?.version !== DISPOSITION_VERSION) {
    findings.push({ code: 'DISPOSITION_VERSION_UNSUPPORTED', key: null, field: 'version', problem: 'ledger version must be ' + DISPOSITION_VERSION });
  }
  const ruleResult = validateRules(ledger?.rules);
  findings.push(...ruleResult.findings);
  const records = Array.isArray(ledger?.dispositions) ? ledger.dispositions : [];
  const dispositions = [];
  const seen = new Set();
  for (const record of records) {
    if (isNonEmptyString(record?.key) && seen.has(record.key)) {
      findings.push(findingOf('DISPOSITION_KEY_DUPLICATE', record, 'clause ' + record.key + ' has more than one disposition', 'key'));
    }
    if (isNonEmptyString(record?.key)) seen.add(record.key);
    const recordFindings = validateDisposition({ record, rulesById: ruleResult.byId, clauseKeys, openTicketKeys, now });
    findings.push(...recordFindings);
    if (recordFindings.length === 0) dispositions.push(record);
  }
  return { ok: findings.length === 0, findings, dispositions, rules: [...ruleResult.byId.values()] };
}

/** Index the last record for each key. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function indexDispositions(records) {
  const byKey = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (isNonEmptyString(record?.key)) byKey.set(record.key, record);
  }
  return byKey;
}

/** Read a JSON file, or null. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Load the disposition ledger from a package directory.
 *
 * @param {{cwd:string, clauseKeys?:Set<string>|null, openTicketKeys?:Set<string>, now?:Date}} input
 * @returns {{ok:boolean, exists:boolean, ledger:object, byKey:Map, findings:object[]}}
 */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function loadDispositions({ cwd, filePath = null, clauseKeys = null, openTicketKeys = new Set(), now = new Date() }) {
  const empty = { version: DISPOSITION_VERSION, rules: [], dispositions: [] };
  const ledgerPath = filePath ?? path.join(cwd, DISPOSITIONS_FILE_NAME);
  if (!fs.existsSync(ledgerPath)) {
    return { ok: true, exists: false, ledger: empty, byKey: new Map(), findings: [] };
  }
  let ledger;
  try {
    ledger = readJsonIfPresent(ledgerPath);
  } catch (error) {
    return { ok: false, exists: true, ledger: empty, byKey: new Map(), findings: [{ code: 'DISPOSITION_FILE_INVALID', key: null, field: null, problem: error.message }] };
  }
  const result = validateDispositionLedger({ ledger, clauseKeys, openTicketKeys, now });
  return { ok: result.ok, exists: true, ledger: ledger ?? empty, byKey: indexDispositions(result.dispositions), findings: result.findings };
}

module.exports = {
  DISPOSITIONS_FILE_NAME,
  DISPOSITION_STATUS,
  DISPOSITION_VERSION,
  REQUIRED_FIELDS,
  STATUS_RULE_KIND,
  canonicalize,
  evidenceDigestOf,
  indexDispositions,
  loadDispositions,
  validateDisposition,
  validateDispositionLedger,
  validateProofPlan,
};
