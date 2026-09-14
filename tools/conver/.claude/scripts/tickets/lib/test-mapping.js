'use strict';

/**
 * test-mapping.js — S1 and S2 of the reverse branch of `/split-to-tickets` (§6.8, §6.14.6).
 *
 * The forward split creates the tickets and the tests that will prove them. In reverse
 * mode both already exist: the tests are in the tree and the implementation is already
 * green. The question therefore changes from "what should be built" to "what is already
 * here, and which of it was ever proved".
 *
 * Two judgements live here, and both are judgements over text rather than over the
 * filesystem, so nothing in this module touches disk:
 *
 *   S1  every existing test maps to a ticket, or is reported with its path
 *   S2  every contract without a Red is recorded — either detected, or explicitly
 *       unclassified
 *
 * Neither returns a verdict. S2 in particular never says "these tests have no Red": no
 * syntactic rule recovers that population from a subject tree, because a design-derived
 * test still calls the public API. What S2 returns is the evidence it read, a candidate
 * carrying `requires_human_approval`, and an explicit unclassified remainder. The
 * measurement is made by `run.mjs oracle compare`, which lists disagreements for a human
 * to classify — never a score, and never a pass.
 *
 * The whole module is a total function with an explicit remainder, so "everything was
 * accounted for" is proved by arithmetic rather than by inspection.
 */

/** The gates this module judges, named once so report, tests and design cannot disagree. */
const GATE_IDS = Object.freeze({ S1: 'S1', S2: 'S2', S3: 'S3', S4: 'S4', S5: 'S5', S6: 'S6' });

/** A gate is a predicate over a measured population, so it is proved or not proved. */
const GATE_STATUS = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL' });

/** The stage name `run.mjs oracle compare --stage mapping` reads. */
const MAPPING_STAGE = 'mapping';

/** A reconstruction ticket starts as work that has not been done, like any other. */
const RECONSTRUCTION_STATUS = 'todo';

/** The origin vocabulary §6.12 declares. A reconstruction ticket says where it came from. */
const ORIGIN_KINDS = Object.freeze(['reverse', 'forward', 'evolution', 'omission', 'residue']);

/**
 * How a Red came to be absent. The two differ in what can be checked, and the difference
 * is why one carries `requires_human_approval` and the other does not: an absence that no
 * test contradicts is re-derivable, while a test that exists but never had a Red is a
 * candidate only a human can settle.
 */
const RED_ABSENCE = Object.freeze({
  NO_TEST_NAMES_THE_SURFACE: 'no_test_names_the_surface',
  TEST_DERIVED_FROM_DESIGN: 'test_derived_from_design',
});

/** What a test file's text says about whether it could ever have failed for its contract. */
const RED_EVIDENCE = Object.freeze({
  EXERCISES: 'exercises_public_api',
  READS_SPEC: 'reads_specification',
  READS_SOURCE: 'reads_implementation_source',
  UNDECIDED: 'undecided',
});

/**
 * The plan association that is read rather than derived. Every other basis names a rule
 * that was applied, and a rule-based association stays a candidate.
 */
const RECORDED_PLAN_BASIS = 'recorded_in_plan';

/** A `PX-` key names internal tooling work and can never be a reconstruction target. */
const OMITTED_KEY_PREFIX = 'PX-';

const TICKET_KEY_RE = /\bP(\d{1,2})-(\d{1,3})\b/g;
const TICKET_KEY_SHAPE = /^P\d{1,2}-\d{1,3}$/;
const SPEC_REFERENCE_RE = /specs\/([A-Za-z0-9_-]+)\.md/g;
const CONTRACT_ID_RE = /\bC(\d{3})\b/g;
const PX_KEY_RE = /\bPX-\d+\b/g;
const TEST_ATTRIBUTE_RE = /#\[(?:tokio::)?test\]/g;

const READS_SPEC_RE = /read_to_string\([^)]*\.md|include_str!\([^)]*\.md|specs\/[A-Za-z0-9_-]+\.md/;
const READS_SOURCE_RE = /read_to_string\([^)]*\.rs|include_str!\([^)]*\.rs/;
const PUBLIC_API_RE = /\bsiprs::|use siprs/;

const NO_TESTS_MEASURED = Object.freeze({
  files: Object.freeze([]),
  implemented: false,
  reason: 'no implementation file was measured for this ticket',
});

/**
 * Raised when a reconstruction ticket would be emitted without the plan identifier that
 * preserves its uncertainty. A distinct type, so a caller can tell this refusal from any
 * other failure and so no call site has to re-check the field.
 */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
class ReconstructionTicketRefused extends Error {
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
  constructor(message) {
    super(message);
    this.name = 'ReconstructionTicketRefused';
  }
}

/** Compare two strings by Unicode code point, so ordering never depends on the locale. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function compareText(left, right) {
  const leftText = String(left ?? '');
  const rightText = String(right ?? '');
  if (leftText < rightText) return -1;
  if (leftText > rightText) return 1;
  return 0;
}

/** The last path segment, which is the name a report can be read by. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function basenameOf(filePath) {
  return String(filePath ?? '').split('/').pop();
}

/** A symbol is interpolated into a pattern, so its own metacharacters must be neutralised. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A declared key set, built once so every lookup is a set membership rather than a scan. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function toKeySet(ticketKeys) {
  if (ticketKeys instanceof Set) return ticketKeys;
  return new Set(Array.isArray(ticketKeys) ? ticketKeys : []);
}

/** A reference list as strings, or null when nothing was supplied — null and empty differ. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function asStringList(values) {
  if (!Array.isArray(values)) return null;
  return values.filter((value) => typeof value === 'string' && value.length > 0);
}

/** Every ticket key a test file names, whether in prose, in a path or as a tooling key. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function referencedTicketKeys(text) {
  const source = typeof text === 'string' ? text : '';
  const found = new Set();

  for (const match of source.matchAll(TICKET_KEY_RE)) found.add(`P${match[1]}-${match[2]}`);
  for (const match of source.matchAll(SPEC_REFERENCE_RE)) {
    if (TICKET_KEY_SHAPE.test(match[1])) found.add(match[1]);
  }
  for (const match of source.matchAll(PX_KEY_RE)) found.add(match[0]);

  return [...found].sort(compareText);
}

/** Every contract identifier a test file claims to verify. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function referencedContractIds(text) {
  const source = typeof text === 'string' ? text : '';
  const found = new Set();
  for (const match of source.matchAll(CONTRACT_ID_RE)) found.add(`C${match[1]}`);
  return [...found].sort(compareText);
}

/** How many test functions the file declares. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function countTestAttributes(text) {
  const source = typeof text === 'string' ? text : '';
  return (source.match(TEST_ATTRIBUTE_RE) ?? []).length;
}

/** S1 — the test population, measured from the text of each file. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function measureTestInventory({ testFiles }) {
  if (!Array.isArray(testFiles)) {
    throw new Error('measureTestInventory needs the list of test files it should measure; it was given none');
  }

  return testFiles
    .map((file) => ({
      path: file.path,
      basename: basenameOf(file.path),
      ticketKeys: referencedTicketKeys(file.text),
      contractIds: referencedContractIds(file.text),
      testCount: countTestAttributes(file.text),
      text: typeof file.text === 'string' ? file.text : '',
    }))
    .sort((left, right) => compareText(left.path, right.path));
}

/**
 * S1 — map every test to a ticket, and report the remainder.
 *
 * A test maps to a ticket when its text names a key that is declared and is not a tooling
 * key. A test that names none is reported with its path and with the keys it did name, so
 * the reason for the remainder is visible rather than inferred from an empty list.
 */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function mapTestsToTickets({ tests, ticketKeys }) {
  if (!Array.isArray(tests)) {
    throw new Error('mapTestsToTickets needs the measured tests to map; it was given none');
  }
  const declared = toKeySet(ticketKeys);
  const mapped = [];
  const unmapped = [];

  for (const test of tests) {
    const attributed = test.ticketKeys.filter((key) => declared.has(key) && !key.startsWith(OMITTED_KEY_PREFIX));

    if (attributed.length === 0) {
      unmapped.push({
        test: { path: test.path, basename: test.basename },
        reason: test.ticketKeys.length > 0 ? 'references_no_declared_ticket' : 'references_no_ticket',
        referencedKeys: [...test.ticketKeys],
      });
      continue;
    }

    for (const ticketKey of attributed) {
      mapped.push({ test: { path: test.path, basename: test.basename }, ticketKey });
    }
  }

  mapped.sort((left, right) => compareText(left.test.path, right.test.path) || compareText(left.ticketKey, right.ticketKey));
  unmapped.sort((left, right) => compareText(left.test.path, right.test.path));

  const mappedTestCount = new Set(mapped.map((row) => row.test.path)).size;
  return {
    mapped,
    unmapped,
    mappingCoverage: {
      tests: tests.length,
      mapped: mappedTestCount,
      unmapped: unmapped.length,
      total: mappedTestCount + unmapped.length === tests.length,
    },
  };
}

/**
 * S1's invariant, asserted rather than inspected: mapped and reported together account for
 * every measured test.
 */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function assertMappingTotal({ tests, mapped, unmapped }) {
  const measured = Array.isArray(tests) ? tests.length : 0;
  const mappedTestCount = new Set((mapped ?? []).map((row) => row.test.path)).size;
  const remainder = (unmapped ?? []).length;
  const accounted = mappedTestCount + remainder;

  if (accounted !== measured) {
    throw new Error(
      `the mapping leaves a remainder: ${measured} test(s) were measured but ${accounted} are accounted for `
      + `(${mappedTestCount} mapped, ${remainder} reported). Every test must be mapped or reported.`,
    );
  }
}

/**
 * S2 — what a test file's text says about its Red.
 *
 * Reading a specification is evidence that a test was written from the design; calling the
 * public API is evidence that it could have failed. Neither is proof that a Red ever
 * existed, so the reading is returned as evidence and never as a verdict.
 */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function measureRedEvidence({ text }) {
  const source = typeof text === 'string' ? text : '';
  const exercisesPublicApi = countTestAttributes(source) > 0 && PUBLIC_API_RE.test(source);
  const readsSpecification = READS_SPEC_RE.test(source);
  const readsImplementationSource = READS_SOURCE_RE.test(source);

  const evidence = [];
  if (exercisesPublicApi) evidence.push('the file declares a test and calls the public API');
  if (readsSpecification) evidence.push('the file reads a specification document');
  if (readsImplementationSource) evidence.push('the file reads implementation source text');
  if (evidence.length === 0) {
    evidence.push('the file names no ticket, reads no document and declares no test, so nothing about its Red is readable');
  }

  if (exercisesPublicApi) return { kind: RED_EVIDENCE.EXERCISES, evidence };
  if (readsSpecification) return { kind: RED_EVIDENCE.READS_SPEC, evidence };
  if (readsImplementationSource) return { kind: RED_EVIDENCE.READS_SOURCE, evidence };
  return { kind: RED_EVIDENCE.UNDECIDED, evidence };
}

/** The identifier a contract is recorded under, or null when it carries none. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function identifierOf(contract) {
  for (const field of ['contract_id', 'gap_id', 'id']) {
    const value = contract?.[field];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

/** True when the measured text names the symbol as a whole word. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function namesSymbol(text, symbol) {
  const source = typeof text === 'string' ? text : '';
  return new RegExp(`\\b${escapeRegExp(symbol)}\\b`).test(source);
}

/** Where the surface lives, said the way a report reads. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function locationOf(contract) {
  const file = typeof contract?.file === 'string' && contract.file.length > 0 ? contract.file : 'an unrecorded file';
  return Number.isInteger(contract?.line) ? `${file}:${contract.line}` : file;
}

/** One absent Red, with the evidence that supports it and whether a human must decide. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function buildAbsentRedRecord(contract, contractId, symbol, namedBy) {
  const nothingNamesIt = namedBy.length === 0;
  const location = locationOf(contract);

  return {
    contract_id: contractId,
    file: contract.file ?? null,
    line: Number.isInteger(contract.line) ? contract.line : null,
    symbol,
    visibility: contract.visibility ?? 'unknown',
    red_absence: nothingNamesIt ? RED_ABSENCE.NO_TEST_NAMES_THE_SURFACE : RED_ABSENCE.TEST_DERIVED_FROM_DESIGN,
    requires_human_approval: !nothingNamesIt,
    evidence: nothingNamesIt
      ? [`no test in the population names \`${symbol}\` at ${location}, so no test could fail for it`]
      : [`${namedBy.length} test file(s) name \`${symbol}\` at ${location}, and no Red for it is recorded`],
  };
}

/** S2's gate: every contract was looked at, and an absence of zero is never a pass. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function judgeAbsentRedGate({ population, classified, unclassified, absenceCount }) {
  const reasons = [];

  if (classified + unclassified !== population) {
    reasons.push(
      `the population is not fully accounted for: ${population} contract(s) were measured but `
      + `${classified + unclassified} were recorded`,
    );
  }
  if (absenceCount === 0) {
    reasons.push(
      'the absence count is zero. A count of zero is a comparison result, never a pass: '
      + 'it means either that no contract was measured or that the detection reads nothing',
    );
  }

  return {
    gateId: GATE_IDS.S2,
    status: reasons.length === 0 ? GATE_STATUS.PASS : GATE_STATUS.FAIL,
    counts: { population, classified, unclassified, absenceCount },
    reasons,
  };
}

/**
 * S2 — record every contract whose test never had a Red.
 *
 * A contract that names no identifier is left unclassified and reported, because an
 * absence nobody can name is not an absence anybody can reconstruct. Nothing is dropped:
 * classified and unclassified together are the whole population, and that sum is the gate.
 */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function detectAbsentRed({ contracts, inventory }) {
  if (!Array.isArray(contracts)) {
    throw new Error('detectAbsentRed needs the contract population to measure; it was given none');
  }
  const tests = Array.isArray(inventory) ? inventory : [];
  const absentRedContracts = [];
  const unclassified = [];

  for (const contract of contracts) {
    const contractId = identifierOf(contract);
    const symbol = typeof contract?.symbol === 'string' ? contract.symbol.trim() : '';

    if (contractId === null || symbol.length === 0) {
      unclassified.push({
        contract_id: contractId,
        reason: 'the contract names no identifier, so no absence can be recorded for it',
      });
      continue;
    }

    const namedBy = tests.filter((test) => namesSymbol(test.text, symbol));
    absentRedContracts.push(buildAbsentRedRecord(contract, contractId, symbol, namedBy));
  }

  const classified = absentRedContracts.length;
  const absenceCount = absentRedContracts.length;

  return {
    absentRedContracts,
    unclassified,
    classified,
    absenceCount,
    classificationCoverage: { population: contracts.length, classified, unclassified: unclassified.length },
    verdict: 'comparison',
    gate: judgeAbsentRedGate({
      population: contracts.length,
      classified,
      unclassified: unclassified.length,
      absenceCount,
    }),
  };
}

/**
 * S3 — the implementation files measured for a ticket.
 *
 * A ticket whose implementation already exists carries the file that was measured; a
 * ticket whose implementation does not exist yet is marked as having none. The second is
 * a fact about the ticket, not a gap in it, so it is recorded rather than omitted: the
 * implementation loop runs one ticket per session, and a session cannot tell the
 * difference between "no files" and "nobody looked".
 */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function measuredFilesFor({ contract, root, exists }) {
  const isPresent = typeof exists === 'function' ? exists : () => false;
  const file = typeof contract?.file === 'string' ? contract.file : '';
  const measuredRoot = root ?? 'the subject tree';

  if (file.length > 0 && isPresent(file)) {
    return {
      files: [file],
      implemented: true,
      reason: `the implementation file is present in the measured tree at ${measuredRoot}`,
    };
  }

  return {
    files: [],
    implemented: false,
    reason: `no implementation file was measured for this ticket in ${measuredRoot}`,
  };
}

/** S6 — the references a ticket drives, with the ones that would not resolve recorded. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function drivingReferencesFor({ contract, claimIds = null, residualIds = null }) {
  const claims = asStringList(claimIds);
  const residuals = asStringList(residualIds);
  const unresolved = [];

  if (claims === null) {
    unresolved.push({
      reference: 'driving_claim_ids',
      contract_id: contract?.contract_id ?? null,
      reason: 'no claim identifier resolved for this contract',
    });
  }
  if (residuals === null) {
    unresolved.push({
      reference: 'driving_residual_ids',
      contract_id: contract?.contract_id ?? null,
      reason: 'no residual identifier resolved for this contract',
    });
  }

  return {
    driving_claim_ids: claims ?? [],
    driving_residual_ids: residuals ?? [],
    origin_kind: ORIGIN_KINDS[0],
    unresolved,
  };
}

/**
 * S5's guard, in one place. Every reconstruction ticket is assembled through
 * `generateReconstructionTicket`, which ends here, so there is no path that emits one
 * without its plan identifier.
 */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function assertPlanIdPresent(ticket) {
  const planId = typeof ticket?.counterexample_plan_id === 'string' ? ticket.counterexample_plan_id.trim() : '';
  if (planId.length === 0) {
    throw new ReconstructionTicketRefused(
      `the reconstruction ticket for ${ticket?.contract_id ?? 'an unnamed contract'} carries no counterexample_plan_id. `
      + 'Without it the ticket would schedule work without preserving what the work is meant to confirm or refute, '
      + 'and the uncertainty the plan encoded would dissolve into ordinary test-writing (ABOUT-REVERSE 6.14.6).',
    );
  }
  return ticket;
}

/** S4 — one reconstruction ticket, assembled and then guarded. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function generateReconstructionTicket({
  contract,
  counterexamplePlanId,
  counterexamplePlanBasis = 'unrecorded',
  measuredFiles = NO_TESTS_MEASURED,
  driving = null,
  phaseId = null,
  id = null,
}) {
  const measured = measuredFiles ?? NO_TESTS_MEASURED;
  const references = driving ?? drivingReferencesFor({ contract });

  const ticket = {
    id,
    phaseId,
    title: `Reconstruct the Red for ${contract?.symbol ?? 'an unnamed surface'} in ${contract?.file ?? 'an unrecorded file'}`,
    status: RECONSTRUCTION_STATUS,
    origin_kind: ORIGIN_KINDS[0],
    contract_id: contract?.contract_id ?? null,
    counterexample_plan_id: counterexamplePlanId,
    counterexample_plan_basis: counterexamplePlanBasis,
    counterexample_plan_candidate: counterexamplePlanBasis !== RECORDED_PLAN_BASIS,
    default_files: [...(measured.files ?? [])],
    measured_implementation: measured.implemented === true,
    measured_implementation_reason: measured.reason ?? '',
    driving_claim_ids: references.driving_claim_ids,
    driving_residual_ids: references.driving_residual_ids,
    unresolved_driving_refs: references.unresolved,
  };

  return assertPlanIdPresent(ticket);
}

/** The oracle candidate document `run.mjs oracle compare --stage mapping` reads. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function buildMappingCandidate({ tickets, language = 'unknown' }) {
  const entries = (Array.isArray(tickets) ? tickets : [])
    .map((ticket, index) => ({
      name: ticket.key ?? ticket.contract_id ?? ticket.counterexample_plan_id ?? `unkeyed-${index}`,
      value: ticket.title ?? null,
    }))
    .sort((left, right) => compareText(left.name, right.name));

  return { stage: MAPPING_STAGE, corpus: { language }, entries, unobserved: [] };
}

/** Every gate's outcome as one line a report can lead with. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function summarizeMappingGates({ gates }) {
  const list = Array.isArray(gates) ? gates : [];
  const failed = list.filter((gate) => gate.status !== GATE_STATUS.PASS);

  return {
    status: list.length > 0 && failed.length === 0 ? GATE_STATUS.PASS : GATE_STATUS.FAIL,
    reasons: failed.flatMap((gate) => (gate.reasons ?? []).map((reason) => `${gate.gateId}: ${reason}`)),
    counts: { gates: list.length, failed: failed.length },
  };
}

module.exports = {
  GATE_IDS,
  GATE_STATUS,
  MAPPING_STAGE,
  OMITTED_KEY_PREFIX,
  ORIGIN_KINDS,
  RECONSTRUCTION_STATUS,
  RECORDED_PLAN_BASIS,
  RED_ABSENCE,
  RED_EVIDENCE,
  ReconstructionTicketRefused,
  assertMappingTotal,
  assertPlanIdPresent,
  buildMappingCandidate,
  detectAbsentRed,
  drivingReferencesFor,
  generateReconstructionTicket,
  mapTestsToTickets,
  measureRedEvidence,
  measureTestInventory,
  measuredFilesFor,
  summarizeMappingGates,
};
