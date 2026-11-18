'use strict';

/**
 * PX-442 — migrate v1 omission artifacts into the input-bound v2 model.
 *
 * A proof is adopted only when its recorded source, test and command digests
 * still match the current bytes and its lockfile predates the proof. A v1
 * judgment is bound only when its evidence predates the ledger enumeration. A
 * harness artifact is never a stable mutation target. Every decision is
 * idempotent and named, so a second run changes nothing.
 */

const fs = require('node:fs');
const path = require('node:path');

const { writeTemporaryThenRename } = require('./atomic-write.js');
const { blockerEntriesOf } = require('./blocker-plan.js');
const { planOmissionTickets } = require('../apply-omission-findings.js');
const {
  evidenceDigestOf,
  evidenceRecordsOf,
  judgmentKey,
  LEDGER_FILE_NAME,
} = require('./judgment-ledger.js');
const {
  LOCKFILE_NAMES,
  UNSTABLE_PROOF_TARGET,
  classifyMutationTarget,
  computeProofInputs,
  isHarnessArtifact,
  packageSourceFiles,
} = require('./proof-inputs.js');
const { discoverExternalInputs } = require('./proof-workspace.js');
const { ticketStatusOf } = require('./repair-status.js');
const { isCompletedStatus } = require('./ticket-status.js');

const COVERAGE_FILE_NAME = 'CONTRACT-COVERAGE.json';
const REPAIRS_FILE_NAME = 'OMISSION-REPAIRS.json';
const TICKETS_FILE_NAME = 'Tickets.json';
const SUPPORTED_VERSION = 1;

const LEGACY_PROOF_ABSENT = 'LEGACY_PROOF_ABSENT';
const LEGACY_PROOF_NOT_PROVEN = 'LEGACY_PROOF_NOT_PROVEN';
const LEGACY_RESTORE_FAILED = 'LEGACY_RESTORE_FAILED';
const LEGACY_VERIFIED_AT_MISSING = 'LEGACY_VERIFIED_AT_MISSING';
const LEGACY_CLAUSE_MISMATCH = 'LEGACY_CLAUSE_MISMATCH';
const LEGACY_MUTATION_MISSING = 'LEGACY_MUTATION_MISSING';
const LEGACY_COMMAND_MISSING = 'LEGACY_COMMAND_MISSING';
const LEGACY_SOURCE_CHANGED = 'LEGACY_SOURCE_CHANGED';
const LEGACY_TEST_CHANGED = 'LEGACY_TEST_CHANGED';
const LEGACY_COMMAND_CHANGED = 'LEGACY_COMMAND_CHANGED';
const LEGACY_TOOLCHAIN_CHANGED = 'LEGACY_TOOLCHAIN_CHANGED';
const LEGACY_INPUTS_UNKNOWN = 'LEGACY_INPUTS_UNKNOWN';
const LEGACY_EVIDENCE_MISSING = 'LEGACY_EVIDENCE_MISSING';
const LEGACY_EVIDENCE_NEWER = 'LEGACY_EVIDENCE_NEWER';
const LEGACY_ENUMERATION_UNKNOWN = 'LEGACY_ENUMERATION_UNKNOWN';

/** Whether a value is a non-empty string. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/** Deep-clone a JSON artifact so report-only cannot mutate the caller. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function clone(value) {
  return value === null || value === undefined ? null : JSON.parse(JSON.stringify(value));
}

/** Read JSON, or null when absent. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Whether an artifact is the supported version. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function isSupported(artifact) {
  return Number.isInteger(artifact?.version) && artifact.version === SUPPORTED_VERSION;
}

/** The first existing lockfile with its modification time. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function lockfileOf(cwd) {
  for (const name of LOCKFILE_NAMES) {
    const filePath = path.join(cwd, name);
    if (!fs.existsSync(filePath)) continue;
    return { file: name, mtimeMs: fs.statSync(filePath).mtimeMs };
  }
  return null;
}

/** An empty migration report. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function emptyReport() {
  return {
    adopted: 0,
    reproved: 0,
    dropped: 0,
    workspaceRoots: [],
    workspaceFindings: [],
    judgmentsBound: 0,
    judgmentsUnbound: 0,
    repairsClosed: 0,
    repairsOpenDiagnostic: 0,
    ticketsCreated: 0,
    ticketsReused: 0,
    ticketsRefused: [],
    unsupported: [],
    changed: { coverage: false, ledger: false, repairs: false, tickets: false },
    findings: [],
  };
}

/**
 * Adopt one v1 proof.
 *
 * @returns {{ok:boolean, proof?:object, alreadyAdopted?:boolean, code?:string, path?:string, field?:string}}
 */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function adoptLegacyProof({ cwd, clauseKey, coverageEntry, proof, adapter, testEntry = null, now = new Date().toISOString() }) {
  if (proof === null || typeof proof !== 'object') return { ok: false, code: LEGACY_PROOF_ABSENT };
  if (isNonEmptyString(proof.inputsDigest)) return { ok: true, alreadyAdopted: true, proof };
  if (proof.status !== 'PROVEN') return { ok: false, code: LEGACY_PROOF_NOT_PROVEN };
  if (proof.restored !== true) return { ok: false, code: LEGACY_RESTORE_FAILED };
  if (!isNonEmptyString(proof.verifiedAt) || Number.isNaN(Date.parse(proof.verifiedAt))) {
    return { ok: false, code: LEGACY_VERIFIED_AT_MISSING };
  }
  if (isNonEmptyString(proof.clauseKey) && proof.clauseKey !== clauseKey) {
    return { ok: false, code: LEGACY_CLAUSE_MISMATCH };
  }
  if (!isNonEmptyString(proof.mutation?.file)) return { ok: false, code: LEGACY_MUTATION_MISSING };
  if (!isNonEmptyString(proof.command)) return { ok: false, code: LEGACY_COMMAND_MISSING };
  if (classifyMutationTarget({ file: proof.mutation.file }) === UNSTABLE_PROOF_TARGET) {
    return { ok: false, code: UNSTABLE_PROOF_TARGET, path: proof.mutation.file };
  }

  const computed = computeProofInputs({
    cwd,
    clauseKey,
    coverageEntry,
    testEntry,
    mutation: proof.mutation,
    commandTemplate: proof.inputs?.commandTemplate ?? proof.command,
    adapter,
  });
  if (!computed.ok) return { ok: false, code: LEGACY_INPUTS_UNKNOWN, field: computed.field ?? null };
  if (proof.digests?.source !== computed.inputs.mutationFileDigest) return { ok: false, code: LEGACY_SOURCE_CHANGED };
  if (proof.digests?.test !== computed.inputs.testDigest) return { ok: false, code: LEGACY_TEST_CHANGED };
  if (proof.digests?.command !== computed.inputs.commandDigest) return { ok: false, code: LEGACY_COMMAND_CHANGED };

  const lockfile = lockfileOf(cwd);
  if (lockfile !== null && lockfile.mtimeMs > Date.parse(proof.verifiedAt)) {
    return { ok: false, code: LEGACY_TOOLCHAIN_CHANGED, path: lockfile.file };
  }

  return {
    ok: true,
    proof: {
      ...proof,
      inputsVersion: computed.inputs.version,
      inputsDigest: computed.inputsDigest,
      inputs: computed.inputs,
      closureScope: computed.inputs.closureScope,
      engineVersion: computed.inputs.engineVersion,
      adapterVersion: computed.inputs.adapterVersion,
      toolchainDigest: computed.inputs.toolchainDigest,
      legacyAdoptedAt: now,
    },
  };
}

/**
 * Bind one v1 judgment to the evidence it cites.
 *
 * @returns {{ok:boolean, judgment?:object, alreadyBound?:boolean, code?:string, path?:string}}
 */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function bindLegacyJudgment({ judgment, cwd, enumerationAt }) {
  if (judgment === null || typeof judgment !== 'object') return { ok: false, code: 'LEGACY_JUDGMENT_INVALID' };
  if (isNonEmptyString(judgment.evidenceDigest)) return { ok: true, alreadyBound: true, judgment };
  if (!isNonEmptyString(enumerationAt) || Number.isNaN(Date.parse(enumerationAt))) {
    return { ok: false, code: LEGACY_ENUMERATION_UNKNOWN };
  }
  const cutoff = Date.parse(enumerationAt);
  for (const entry of judgment.evidence ?? []) {
    if (!isNonEmptyString(entry?.file)) continue;
    const absolute = path.resolve(cwd, entry.file);
    let stat;
    try {
      stat = fs.statSync(absolute);
    } catch {
      return { ok: false, code: LEGACY_EVIDENCE_MISSING, path: entry.file };
    }
    if (stat.mtimeMs > cutoff) return { ok: false, code: LEGACY_EVIDENCE_NEWER, path: entry.file };
  }
  const evidence = evidenceRecordsOf(judgment, cwd);
  return {
    ok: true,
    judgment: {
      ...judgment,
      evidence,
      evidenceDigest: evidenceDigestOf({ ...judgment, evidence }, cwd),
      legacyBoundAt: new Date().toISOString(),
    },
  };
}

/** Drop an unstable-target proof and remember its clause. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function dropUnstableProof({ entry, report, droppedKeys }) {
  const target = entry.proof?.mutation?.file ?? entry.mutation?.file ?? null;
  entry.proof = null;
  entry.proofDropped = UNSTABLE_PROOF_TARGET;
  delete entry.mutation;
  droppedKeys.add(entry.key);
  report.dropped += 1;
  report.changed.coverage = true;
  report.workspaceFindings.push({ code: UNSTABLE_PROOF_TARGET, key: entry.key, path: target });
}

/** Migrate the coverage proofs. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function migrateProofs({ cwd, coverage, adapter, report }) {
  const droppedKeys = new Set();
  for (const entry of coverage?.clauses ?? []) {
    if (entry?.proof === null || entry?.proof === undefined) continue;
    const target = entry.proof.mutation?.file ?? entry.mutation?.file ?? null;
    if (isNonEmptyString(target) && classifyMutationTarget({ file: target }) === UNSTABLE_PROOF_TARGET) {
      dropUnstableProof({ entry, report, droppedKeys });
      continue;
    }
    if (isNonEmptyString(entry.proof.inputsDigest)) continue;
    const adopted = adoptLegacyProof({ cwd, clauseKey: entry.key, coverageEntry: entry, proof: entry.proof, adapter });
    if (adopted.ok && adopted.alreadyAdopted !== true) {
      entry.proof = adopted.proof;
      report.adopted += 1;
      report.changed.coverage = true;
      continue;
    }
    if (!adopted.ok) {
      report.reproved += 1;
      report.findings.push({ code: adopted.code, key: entry.key, path: adopted.path ?? null });
    }
  }
  return droppedKeys;
}

/** Bind the v1 judgments. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function migrateJudgments({ cwd, ledger, report }) {
  const enumerationAt = ledger?.enumeration?.at ?? null;
  const judgments = Array.isArray(ledger?.judgments) ? ledger.judgments : [];
  for (let index = 0; index < judgments.length; index += 1) {
    const judgment = judgments[index];
    if (isNonEmptyString(judgment.evidenceDigest)) continue;
    const bound = bindLegacyJudgment({ judgment, cwd, enumerationAt });
    if (bound.ok && bound.alreadyBound !== true) {
      judgments[index] = bound.judgment;
      report.judgmentsBound += 1;
      report.changed.ledger = true;
      continue;
    }
    if (!bound.ok) {
      report.judgmentsUnbound += 1;
      report.findings.push({ code: bound.code, obligationKey: judgmentKey(judgment), path: bound.path ?? null });
    }
  }
}

/** Close every unrepairable record whose diagnostic ticket is terminal or absent. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function closeUnrepairableRepairs({ repairs, ticketsData, report, now }) {
  for (const record of repairs?.records ?? []) {
    if (record?.status !== 'unrepairable') continue;
    const ticketStatus = ticketStatusOf({ ticketsData, ticketKey: record.ticketKey });
    const terminalOrAbsent = !isNonEmptyString(record.ticketKey) || ticketStatus === null || isCompletedStatus(ticketStatus);
    if (!terminalOrAbsent) {
      report.repairsOpenDiagnostic += 1;
      continue;
    }
    record.status = 'completed';
    record.closedAt = now;
    record.resolution = 'legacy unrepairable closed: diagnostic ticket is terminal or absent';
    report.repairsClosed += 1;
    report.changed.repairs = true;
  }
}

/** Report the external inputs the migrated proofs need. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function reportWorkspaceInputs({ cwd, coverage, adapter, report }) {
  const mutationFiles = (coverage?.clauses ?? [])
    .map((entry) => entry?.proof?.mutation?.file)
    .filter(isNonEmptyString);
  const sourceFiles = packageSourceFiles({ cwd, adapter });
  const discovery = discoverExternalInputs({ cwd, files: [...mutationFiles, ...sourceFiles] });
  report.workspaceRoots = discovery.externalPaths;
  report.workspaceFindings.push(...discovery.findings);
}

/**
 * Migrate every v1 artifact in one pass.
 *
 * @returns {{coverage:object|null, ledger:object|null, repairs:object|null, ticketsData:object|null, report:object, changed:object}}
 */
// [::TICKET::] PX-442, PX-444 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-442|PX-444) --for-spec --no-implementation-order`.
function migrateArtifacts({ cwd, coverage, ledger, repairs, ticketsData, inventory = null, testIndex = null, adapters = [], reportOnly = false, now = new Date().toISOString() }) {
  const report = emptyReport();
  const coverageDoc = clone(coverage === undefined ? readJsonIfPresent(path.join(cwd, COVERAGE_FILE_NAME)) : coverage);
  const ledgerDoc = clone(ledger === undefined ? readJsonIfPresent(path.join(cwd, LEDGER_FILE_NAME)) : ledger);
  const repairsDoc = clone(repairs === undefined ? readJsonIfPresent(path.join(cwd, REPAIRS_FILE_NAME)) : repairs);
  let ticketsDoc = clone(ticketsData === undefined ? readJsonIfPresent(path.join(cwd, TICKETS_FILE_NAME)) : ticketsData);

  let usableCoverage = coverageDoc;
  let usableLedger = ledgerDoc;
  let usableRepairs = repairsDoc;

  if (coverageDoc !== null && !isSupported(coverageDoc)) {
    report.unsupported.push({ artifact: COVERAGE_FILE_NAME, version: coverageDoc.version ?? null });
    usableCoverage = null;
  }
  if (ledgerDoc !== null && !isSupported(ledgerDoc)) {
    report.unsupported.push({ artifact: LEDGER_FILE_NAME, version: ledgerDoc.version ?? null });
    usableLedger = null;
  }
  if (repairsDoc !== null && !isSupported(repairsDoc)) {
    report.unsupported.push({ artifact: REPAIRS_FILE_NAME, version: repairsDoc.version ?? null });
    usableRepairs = null;
  }

  const adapter = adapters?.[0] ?? null;
  const droppedKeys = migrateProofs({ cwd, coverage: usableCoverage, adapter, report });
  migrateJudgments({ cwd, ledger: usableLedger, report });
  closeUnrepairableRepairs({ repairs: usableRepairs, ticketsData: ticketsDoc, report, now });
  if (usableCoverage !== null) reportWorkspaceInputs({ cwd, coverage: usableCoverage, adapter, report });

  if (droppedKeys.size > 0) {
    const entries = blockerEntriesOf({ inventory, coverage: usableCoverage, testIndex, classes: ['unstable-target'] })
      .filter((entry) => droppedKeys.has(entry.key));
    if (inventory === null) {
      // The legacy planner creates one zero-work ticket per entry. Without an
      // inventory there is no measured atom to partition, so the migration
      // names the refusal instead of reintroducing the evidence-ticket set.
      report.ticketsRefused = entries.map((entry) => ({
        code: 'OMISSION_MIGRATION_INVENTORY_MISSING',
        subject: entry.key,
        message: 'the unstable target needs a rebuilt inventory before a ticket can be planned',
      }));
    } else {
      // PX-442 C003: an unstable target must still become one remediation
      // ticket. The measured planner routes this class to a repair sink, so the
      // migration uses the per-entry legacy plan that emits omissionStableKey.
      const plan = planOmissionTickets({
        remainder: entries,
        ticketsData: ticketsDoc ?? { phases: [] },
        phases: ticketsDoc?.phases ?? [],
      });
      ticketsDoc = plan.ticketsData;
      report.ticketsCreated = plan.created.length;
      report.ticketsReused = plan.reusedTickets;
      if (report.ticketsCreated > 0) report.changed.tickets = true;
    }
  }

  if (reportOnly) {
    report.changed = { coverage: false, ledger: false, repairs: false, tickets: false };
  }

  return {
    coverage: usableCoverage,
    ledger: usableLedger,
    repairs: usableRepairs,
    ticketsData: ticketsDoc,
    report,
    changed: report.changed,
  };
}

/** Write the migrated artifacts that changed. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function writeMigratedArtifacts({ cwd, artifacts, reportOnly = false }) {
  if (reportOnly) return [];
  const written = [];
  const { coverage, ledger, repairs, ticketsData, changed } = artifacts;
  if (changed.coverage && coverage !== null) {
    writeTemporaryThenRename(path.join(cwd, COVERAGE_FILE_NAME), JSON.stringify(coverage, null, 2) + '\n');
    written.push(COVERAGE_FILE_NAME);
  }
  if (changed.ledger && ledger !== null) {
    writeTemporaryThenRename(path.join(cwd, LEDGER_FILE_NAME), JSON.stringify(ledger, null, 2) + '\n');
    written.push(LEDGER_FILE_NAME);
  }
  if (changed.repairs && repairs !== null) {
    writeTemporaryThenRename(path.join(cwd, REPAIRS_FILE_NAME), JSON.stringify(repairs, null, 2) + '\n');
    written.push(REPAIRS_FILE_NAME);
  }
  if (changed.tickets && ticketsData !== null) {
    writeTemporaryThenRename(path.join(cwd, TICKETS_FILE_NAME), JSON.stringify(ticketsData, null, 2) + '\n');
    written.push(TICKETS_FILE_NAME);
  }
  return written;
}

module.exports = {
  COVERAGE_FILE_NAME,
  LEGACY_COMMAND_CHANGED,
  LEGACY_EVIDENCE_MISSING,
  LEGACY_EVIDENCE_NEWER,
  LEGACY_ENUMERATION_UNKNOWN,
  LEGACY_INPUTS_UNKNOWN,
  LEGACY_PROOF_NOT_PROVEN,
  LEGACY_RESTORE_FAILED,
  LEGACY_SOURCE_CHANGED,
  LEGACY_TEST_CHANGED,
  LEGACY_TOOLCHAIN_CHANGED,
  UNSTABLE_PROOF_TARGET,
  adoptLegacyProof,
  bindLegacyJudgment,
  classifyMutationTarget,
  isHarnessArtifact,
  migrateArtifacts,
  writeMigratedArtifacts,
};
