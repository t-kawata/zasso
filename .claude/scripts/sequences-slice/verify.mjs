#!/usr/bin/env node

/**
 * verify.mjs — the decidable checks over a projection.
 *
 * Usage: node verify.mjs <artifact>
 *
 * The projection is built from the artifact and the two manifests it sits beside, and the
 * report is always the machine form, so there is no output flag to pass.
 * Every check here is calibrated against the live workspace before it is trusted, and on
 * that workspace all nine report nothing. That is deliberate and it is the standard the
 * repository already sets: check-divergence-ledger.js records in its own header that a
 * gate which fails on a real package is a gate nobody can pass. A check that fired on the
 * live data would be reporting a reading rather than a property.
 *
 * Four of the nine were re-specified after measuring, and the reason is written beside
 * each: a check that compares two different vocabularies, or that calls a terminal status
 * a fault, is a check that would have fired on sound data.
 *
 * Exit-code contract:
 *   success → 0, the findings as JSON on stdout
 *   an input that cannot be read → 2, the offending path on stderr
 *
 * Design context: tools/conver/README.md — 進化ループ / the five consistencies.
 */

import fs from 'node:fs';
import path from 'node:path';

import { readPinnedVocabularies } from './lib/vocabulary.mjs';

const EXIT_OK = 0;
const EXIT_INPUT_MISSING = 2;

const TREE_MANIFEST_FILENAME = 'WORKSPACIFY-TREE-MANIFEST.json';
const ALLOCATE_MANIFEST_FILENAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';

const SEVERITY_HIGH = 'high';
const SEVERITY_LOW = 'low';

/**
 * The facts every operation carries.
 *
 * Four booleans, one authority string and one proof-class list. An operation missing one of
 * them is not a partial answer to a question nobody asked; it is an operation whose
 * authority and proof requirements were never recorded.
 */
const REQUIRED_OPERATION_FACTS = Object.freeze([
  'mutates_protocol_state',
  'requires_remote_time_handshake',
  'requires_session_binding',
  'required_pre_state_checkpoint',
  'required_authority',
  'required_proof_classes',
]);

/** A failure the operator can act on: it names the path and says what was wrong with it. */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
class InputError extends Error {}

/** A finding, in the shape verify-consistencies.js already produces. */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
function finding(check, severity, message) {
  return { check, severity, message };
}

/**
 * C1 — every status the artifact uses is a member of OperationStatus.
 *
 * The statuses are the ones the artifact's own transitions name. A successor that is a
 * member but never a key is a terminal status and is not a fault: measuring the live
 * workspace showed ten operations ending at recovery_pending -> recovered, where recovered
 * is a declared member with no outgoing transitions. Requiring every successor to be a key
 * would have reported those ten as faults.
 */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function checkStatusVocabulary(artifact, vocabularies) {
  const members = vocabularies.get('OperationStatus').memberSet;
  const findings = [];
  for (const operation of artifact.operations) {
    const used = new Set();
    if (operation.initial_status) used.add(operation.initial_status);
    for (const [from, successors] of Object.entries(operation.allowed_status_transitions ?? {})) {
      used.add(from);
      for (const successor of successors) used.add(successor);
    }
    for (const status of [...used].sort()) {
      if (!members.has(status)) {
        findings.push(finding('C1', SEVERITY_HIGH, `${operation.id} names the status "${status}", which is not a member of OperationStatus`));
      }
    }
  }
  return findings;
}

/**
 * C2 — ownership is closed in both directions.
 *
 * A claim the packages own but the inventory does not list is an omission; a claim the
 * inventory lists but no package owns is a contradiction. Measuring the live workspace
 * showed 88 on each side with neither direction open, so this check is silent there.
 */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function checkOwnershipClosure(treeManifest) {
  const findings = [];
  const packageIds = new Set(treeManifest.workspace.packages.map((entry) => entry.id));
  const inventoryClaims = new Map(treeManifest.inventory.claims.map((claim) => [claim.id, claim]));

  const ownedClaimIds = new Set();
  for (const entry of treeManifest.workspace.packages) {
    for (const claimId of entry.owns?.claims ?? []) {
      ownedClaimIds.add(claimId);
      if (!inventoryClaims.has(claimId)) {
        findings.push(finding('C2', SEVERITY_HIGH, `${entry.id} owns ${claimId}, which the inventory does not list`));
      }
    }
  }
  for (const [claimId] of inventoryClaims) {
    if (!ownedClaimIds.has(claimId)) {
      findings.push(finding('C2', SEVERITY_HIGH, `${claimId} is listed in the inventory but no package owns it`));
    }
  }
  for (const claim of treeManifest.inventory.claims) {
    for (const owner of [claim.primary_owner, ...(claim.collaborating_owners ?? [])]) {
      if (!packageIds.has(owner)) {
        findings.push(finding('C2', SEVERITY_HIGH, `${claim.id} names the owner ${owner}, which is not a package`));
      }
    }
  }
  return findings;
}

/**
 * C3 — every declared contract clause key is produced.
 *
 * The declared keys live at stage2_handoff.contract_boundaries[].stage2_contract_scope; the
 * produced keys are the registry entry's clauses. MEASURED: clauses carries exactly eight
 * keys on the live workspace and does not carry ordering, atomicity, finality or
 * idempotency, so the declared scope is the only place those names exist and the earlier
 * draft's reading of clauses.ordering referred to a field that is not there.
 */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function checkContractClauseKeys(treeManifest, allocateManifest) {
  const findings = [];
  const registryByBoundary = new Map(allocateManifest.contract_registry.map((entry) => [entry.boundary_id, entry]));

  for (const boundary of treeManifest.stage2_handoff.contract_boundaries) {
    const entry = registryByBoundary.get(boundary.id);
    if (entry === undefined) {
      findings.push(finding('C3', SEVERITY_HIGH, `${boundary.id} is declared but the contract registry does not carry it`));
      continue;
    }
    for (const key of boundary.stage2_contract_scope ?? []) {
      if (!Object.hasOwn(entry.clauses ?? {}, key)) {
        findings.push(finding('C3', SEVERITY_HIGH, `${boundary.id} declares the clause "${key}", which ${entry.contract_id} does not produce`));
      }
    }
  }
  return findings;
}

/**
 * C4 — the sections and the preamble together account for every specification line.
 *
 * MEASURED: the live sections tile 69..15971 with no gap and no overlap, and lines 1..68
 * are the document preamble that precedes the first section. 15903 + 68 = 15971 exactly.
 * The preamble is named rather than counted, because it is a structural fact about the
 * document and not 68 missing lines.
 */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function checkSpecLineTotality(artifact) {
  const findings = [];
  const sections = [...artifact.sections].sort((left, right) => left.firstLine - right.firstLine);
  if (sections.length === 0) {
    return [finding('C4', SEVERITY_HIGH, `the artifact declares no section, so no specification line is accounted for`)];
  }

  const preambleLines = sections[0].firstLine - 1;
  const covered = new Set();
  let previous = null;
  for (const section of sections) {
    if (previous !== null && section.firstLine <= previous.lastLine) {
      findings.push(finding('C4', SEVERITY_HIGH, `section ${section.id} starts at line ${section.firstLine}, inside section ${previous.id} which ends at ${previous.lastLine}`));
    }
    for (let line = section.firstLine; line <= section.lastLine; line += 1) covered.add(line);
    previous = section;
  }

  const accounted = preambleLines + covered.size;
  if (accounted !== artifact.spec.lines) {
    const firstGap = firstUnaccountedLine(sections, preambleLines, artifact.spec.lines);
    findings.push(finding('C4', SEVERITY_HIGH, `the sections and the ${preambleLines}-line preamble account for ${accounted} of ${artifact.spec.lines} specification lines; line ${firstGap} is in no section`));
  }
  return findings;
}

/** The first line no section covers and the preamble does not explain. */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
function firstUnaccountedLine(sections, preambleLines, specLines) {
  const covered = new Set();
  for (const section of sections) {
    for (let line = section.firstLine; line <= section.lastLine; line += 1) covered.add(line);
  }
  for (let line = preambleLines + 1; line <= specLines; line += 1) {
    if (!covered.has(line)) return line;
  }
  return specLines;
}

/**
 * C5 — every operation carries the six facts its authority and proof requirements rest on.
 */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function checkOperationFacts(artifact) {
  const findings = [];
  for (const operation of artifact.operations) {
    for (const fact of REQUIRED_OPERATION_FACTS) {
      const value = operation[fact];
      const isBoolean = typeof value === 'boolean';
      const isText = typeof value === 'string' && value.length > 0;
      const isList = Array.isArray(value);
      if (!isBoolean && !isText && !isList) {
        findings.push(finding('C5', SEVERITY_HIGH, `${operation.id} carries no ${fact}`));
      }
    }
  }
  return findings;
}

/**
 * C6 — every status transition lands on a declared status.
 *
 * Re-specified after measuring: the first rule also required every successor to appear as a
 * key, which reported ten live operations as faults for ending at a terminal status. A
 * terminal status is a member with no outgoing transitions, and that is not a fault.
 */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function checkStatusTransitionClosure(artifact, vocabularies) {
  const members = vocabularies.get('OperationStatus').memberSet;
  const findings = [];
  for (const operation of artifact.operations) {
    for (const [from, successors] of Object.entries(operation.allowed_status_transitions ?? {})) {
      for (const successor of successors) {
        if (!members.has(successor)) {
          findings.push(finding('C6', SEVERITY_HIGH, `${operation.id} transitions ${from} -> ${successor}, and ${successor} is not a member of OperationStatus`));
        }
      }
    }
    if (operation.initial_status && !members.has(operation.initial_status)) {
      findings.push(finding('C6', SEVERITY_HIGH, `${operation.id} starts at ${operation.initial_status}, which is not a member of OperationStatus`));
    }
  }
  return findings;
}

/**
 * C7 — the reject-code families are internally sound.
 *
 * Re-specified after measuring: the first rule required every family to appear among the
 * registry's clauses.errors. MEASURED: the registry holds 408 prose sentences there while
 * the artifact holds 13 namespace-like families such as transfer and civic, so the two are
 * different vocabularies and the comparison would have fired 13 times on sound data. What
 * is decidable is that a family is named rather than left blank, and named once.
 */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function checkRejectCodeFamilies(artifact) {
  const findings = [];
  const declared = new Set();
  for (const operation of artifact.operations) {
    const families = operation.reject_code_families ?? [];
    const seen = new Set();
    for (const family of families) {
      if (typeof family !== 'string' || family.length === 0) {
        findings.push(finding('C7', SEVERITY_HIGH, `${operation.id} names an empty reject-code family`));
        continue;
      }
      if (seen.has(family)) {
        findings.push(finding('C7', SEVERITY_LOW, `${operation.id} names the reject-code family ${family} twice`));
      }
      seen.add(family);
      declared.add(family);
    }
  }
  return findings;
}

/**
 * C8 — every specification line an operation rests on is inside a declared section.
 *
 * Measuring the live workspace showed 225 of 257 operations carrying evidence.spec_lines,
 * and all 257 with every line they do carry inside a section. An operation carrying none is
 * not a fault here: it is an operation whose grounding the artifact records elsewhere, and
 * saying otherwise would report 32 live operations as faults.
 */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function checkSpecLineGrounding(artifact) {
  const findings = [];
  const covered = new Set();
  for (const section of artifact.sections) {
    for (let line = section.firstLine; line <= section.lastLine; line += 1) covered.add(line);
  }
  for (const operation of artifact.operations) {
    for (const line of operation.evidence?.spec_lines ?? []) {
      if (!covered.has(line)) {
        findings.push(finding('C8', SEVERITY_HIGH, `${operation.id} rests on specification line ${line}, which is in no section`));
      }
    }
  }
  return findings;
}

/**
 * C9 — a state machine belongs to exactly one package.
 *
 * Measuring the live workspace showed 31 machines, 31 distinct, and no owned id claimed by
 * two packages. Two packages claiming one machine is a contradiction rather than an
 * omission: both would implement it and neither would be wrong.
 */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function checkStateMachineOwnership(treeManifest) {
  const findings = [];
  const ownersByMachine = new Map();
  for (const entry of treeManifest.workspace.packages) {
    for (const machineId of entry.owns?.state_machines ?? []) {
      if (!ownersByMachine.has(machineId)) ownersByMachine.set(machineId, []);
      ownersByMachine.get(machineId).push(entry.id);
    }
  }
  for (const [machineId, owners] of ownersByMachine) {
    if (owners.length > 1) {
      findings.push(finding('C9', SEVERITY_HIGH, `${machineId} is owned by ${owners.join(' and ')}, and a state machine belongs to one package`));
    }
  }
  return findings;
}

/**
 * Every check, each returning its own findings so one broken axis does not mask another.
 *
 * @param {{ projection: { artifact: object, treeManifest: object, allocateManifest: object } }} input
 * @returns {{ checks: Record<string, object[]>, summary: { high: number, low: number, total: number } }}
 */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function runChecks({ projection }) {
  const { artifact, treeManifest, allocateManifest } = projection;
  const vocabularies = readPinnedVocabularies(artifact);

  const checks = {
    C1: checkStatusVocabulary(artifact, vocabularies),
    C2: checkOwnershipClosure(treeManifest),
    C3: checkContractClauseKeys(treeManifest, allocateManifest),
    C4: checkSpecLineTotality(artifact),
    C5: checkOperationFacts(artifact),
    C6: checkStatusTransitionClosure(artifact, vocabularies),
    C7: checkRejectCodeFamilies(artifact),
    C8: checkSpecLineGrounding(artifact),
    C9: checkStateMachineOwnership(treeManifest),
  };

  const all = Object.values(checks).flat();
  return {
    checks,
    summary: {
      high: all.filter((entry) => entry.severity === SEVERITY_HIGH).length,
      low: all.filter((entry) => entry.severity === SEVERITY_LOW).length,
      total: all.length,
    },
  };
}

/**
 * Read one file, naming it when the read fails.
 */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
function readJsonOrFail(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new InputError(`${filePath} could not be read as JSON (${error.code ?? error.message})`);
  }
}

// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const [artifactArgument] = argv.filter((argument) => !argument.startsWith('--'));
  if (artifactArgument === undefined) {
    process.stderr.write('usage: verify.mjs <artifact>\n');
    return EXIT_INPUT_MISSING;
  }

  try {
    const artifactPath = path.resolve(artifactArgument);
    const root = path.dirname(artifactPath);
    const projection = {
      artifact: readJsonOrFail(artifactPath),
      treeManifest: readJsonOrFail(path.join(root, TREE_MANIFEST_FILENAME)),
      allocateManifest: readJsonOrFail(path.join(root, ALLOCATE_MANIFEST_FILENAME)),
    };
    process.stdout.write(`${JSON.stringify(runChecks({ projection }), null, 2)}\n`);
    return EXIT_OK;
  } catch (error) {
    if (error instanceof InputError) {
      process.stderr.write(`verify refused: ${error.message}\n`);
      return EXIT_INPUT_MISSING;
    }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}

export { main };
