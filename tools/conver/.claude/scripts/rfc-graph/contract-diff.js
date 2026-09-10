#!/usr/bin/env node
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.

/**
 * contract-diff.js — GF2, reconciling contract candidates against the RFC's contracts (§6.6, §6.14.4).
 *
 * The failure this gate exists to prevent is the ratification RFC (ABOUT-REVERSE
 * 3.4, failure mode F1): an RFC written from an existing implementation that
 * restates the code in the language of a specification. It satisfies the five
 * consistencies on its surface while proving nothing, because the implementation,
 * its tests and its comments all descend from one design and corroborate each
 * other instead of the design.
 *
 * The defence is not a similarity score. It is that every difference between what
 * the code does (R3's candidates) and what the RFC says (the contracts annotated
 * on graph edges) is *recorded*, so the difference survives as evidence instead
 * of being smoothed away. A gate that reports nothing is therefore not a clean
 * result: zero differences is F1's signature, and the record has to say that the
 * comparison was made rather than merely that nothing was found.
 *
 * The judgement of whether a recorded difference is a genuine specification gap
 * or an artefact of the extraction depends on intent, which the source does not
 * encode, so no assertion can decide it. That judgement is left to the human at
 * the grill — which is the whole purpose of recording the difference rather than
 * classifying it here. This module decides only what is mechanical: what the two
 * lists are, what is unmatched, and that nothing went missing.
 *
 * The classification vocabulary and the record targets are declared once, here,
 * so P22-17 (which returns the differences to their origin) writes the omission
 * and RESIDUE structures against the same words rather than a second spelling
 * invented later in a session that cannot see this one.
 *
 * Usage:
 *   node contract-diff.js --graph=<path> --candidates=<path> --out=<dir> [--correspondences=<path>] [--recorded=<path>]
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** The gate vocabulary, declared locally for the reason `grounding-check.js` gives. */
const GATE_STATUS = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL' });

/** The gate identifier, named once so report, tests and design cannot disagree. */
const GF2_GATE_ID = 'GF2';

/** Which way a difference runs. Both directions are recorded; neither is a verdict. */
const DIFFERENCE_DIRECTIONS = Object.freeze({
  /** The code does it and the RFC does not say it — the unexplained existing behaviour. */
  UNEXPLAINED: 'unexplained_by_rfc',
  /** The RFC says it and the implementation shows nothing for it. */
  UNIMPLEMENTED: 'not_in_implementation',
});

/** The artefact a recorded difference becomes. These are ABOUT-REVERSE 6.12.3's layer B kinds. */
const RECORD_TARGETS = Object.freeze({ OMISSION: 'omission', RESIDUE: 'residue' });

/** The value a difference carries when no rule could classify it. It is recorded, never dropped. */
const UNCLASSIFIED_DIFFERENCE = 'unclassified';

/** The kind an unimplemented RFC contract is recorded under, in the omission vocabulary already in use. */
const MISSING_IMPLEMENTATION_TYPE = 'missing_implementation';

/** Where an unexplained behaviour goes next: the question of whether it is intended or accidental. */
const UNEXPLAINED_NEXT_ROUTE = 'grill';

/**
 * The reading a zero-difference result carries.
 *
 * F1 is a ratification document that found nothing to disagree with, and it is
 * the failure that looks most like success. A run with no differences has to say
 * which of the two it is, so the sentence is a constant rather than composed per
 * run: a caveat that varies with the data invites reading it as a finding.
 */
const ZERO_DIFFERENCES_INTERPRETATION =
  'Zero differences is not a pass. It is the signature of the ratification RFC (F1): an RFC written from '
  + 'the implementation agrees with it by construction, so an exact match is the outcome to scrutinise '
  + 'rather than the outcome to trust. Check the extraction population, the pairing, and whether the '
  + 'candidates could have disagreed at all.';

/** Exit codes, matching the convention the other `rfc-graph/` CLIs use. */
const EXIT_CODES = Object.freeze({ OK: 0, FAIL: 1, USAGE: 2 });

const GRAPH_ARG_PREFIX = '--graph=';
const CANDIDATES_ARG_PREFIX = '--candidates=';
const CORRESPONDENCES_ARG_PREFIX = '--correspondences=';
const RECORDED_ARG_PREFIX = '--recorded=';
const OUT_ARG_PREFIX = '--out=';

/** The document GF2 writes beside the graph, holding the comparison and what it recorded. */
const CONTRACT_DIFF_FILE_NAME = 'CONTRACT-DIFF.json';

/** The 3-element template every `rfc-graph/` CLI uses, so a failure reads the same way. */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function formatError(problem, cause, remedy) {
  return `[ERROR] ${problem}\nCause: ${cause}\nAction: ${remedy}`;
}

/** A name is usable when it is a non-empty string. */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function asName(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Order two records by a string field, so two runs over one input cannot disagree. */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function byText(field) {
  return (left, right) => (left[field] < right[field] ? -1 : left[field] > right[field] ? 1 : 0);
}

/**
 * Read the contracts the RFC states, each with the edge it was annotated on.
 *
 * An edge carrying no contracts contributes none: the graphify procedure
 * annotates edges after they exist, so an unannotated edge is an unfinished step
 * rather than a contract that states nothing. A contract entry that *is* present
 * and empty is a different matter — it is an annotation that says nothing, and
 * dropping it would remove the only evidence that the RFC disagreed with itself,
 * so it is refused by name.
 *
 * @param {object} graph - a parsed GRAPH document
 * @returns {Array<{contractId: string, edge: object, precondition: string, postcondition: string, invariant: string}>}
 */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function extractRfcContracts(graph) {
  const edges = graph?.edges;
  if (!Array.isArray(edges)) {
    throw new Error(
      `the graph must carry an "edges" list for its RFC contracts to be read, but it is ${edges === null ? 'null' : typeof edges}`,
    );
  }

  const contracts = [];
  for (const edge of edges) {
    if (!Array.isArray(edge?.contracts)) {
      continue;
    }
    for (const contract of edge.contracts) {
      const contractId = asName(contract?.id);
      if (contractId === null) {
        throw new Error(
          `an edge (${edge.from} -> ${edge.to}, ${edge.type}) carries a contract with no id; `
          + 'a contract that cannot be named cannot be reconciled, and dropping it would record nothing',
        );
      }
      for (const field of ['precondition', 'postcondition', 'invariant']) {
        if (asName(contract[field]) === null) {
          throw new Error(
            `contract ${contractId} states no ${field}; a contract that states nothing is an incomplete `
            + 'annotation, and it is refused rather than read as satisfied',
          );
        }
      }
      contracts.push({
        contractId,
        edge: { from: edge.from, to: edge.to, type: edge.type },
        precondition: contract.precondition,
        postcondition: contract.postcondition,
        invariant: contract.invariant,
      });
    }
  }
  return contracts;
}

/**
 * Reconcile the candidates the analysis extracted against the contracts the RFC states.
 *
 * Pure: two lists in, the unmatched and the paired out. A pairing that names an
 * item neither list carries is refused rather than ignored, because a
 * correspondence is the one place a difference could be made to vanish — pairing
 * a candidate with a contract that does not exist would silently mark it
 * explained.
 *
 * @param {{candidates?: Array<object>, rfcContracts?: Array<object>, correspondences?: Array<object>}} input
 * @returns {{matched: Array<object>, differences: Array<object>, counts: object}}
 */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function reconcileContracts({ candidates = [], rfcContracts = [], correspondences = [] } = {}) {
  const candidateById = new Map(candidates.map((candidate) => [asName(candidate?.candidate_id), candidate]));
  const contractById = new Map(rfcContracts.map((contract) => [contract.contractId, contract]));

  const pairedCandidates = new Set();
  const pairedContracts = new Set();
  const matched = [];

  for (const correspondence of correspondences) {
    const candidateId = asName(correspondence?.candidateId);
    const contractId = asName(correspondence?.contractId);
    if (!candidateById.has(candidateId)) {
      throw new Error(`the pairing names candidate "${correspondence?.candidateId}", which the analysis did not produce`);
    }
    if (!contractById.has(contractId)) {
      throw new Error(`the pairing names contract "${correspondence?.contractId}", which the RFC does not carry`);
    }
    if (pairedCandidates.has(candidateId)) {
      throw new Error(`candidate ${candidateId} is paired more than once; a candidate is reconciled once or not at all`);
    }
    if (pairedContracts.has(contractId)) {
      throw new Error(`contract ${contractId} is paired more than once; a contract is reconciled once or not at all`);
    }
    pairedCandidates.add(candidateId);
    pairedContracts.add(contractId);
    matched.push({ candidateId, contractId });
  }

  const differences = [];

  for (const candidate of candidates) {
    const candidateId = asName(candidate?.candidate_id);
    if (pairedCandidates.has(candidateId)) {
      continue;
    }
    differences.push({
      direction: DIFFERENCE_DIRECTIONS.UNEXPLAINED,
      candidateId,
      sourceSpan: candidate?.source_span ?? null,
      proposition: asName(candidate?.proposition),
      claimType: asName(candidate?.claim_type),
    });
  }

  for (const contract of rfcContracts) {
    if (pairedContracts.has(contract.contractId)) {
      continue;
    }
    differences.push({
      direction: DIFFERENCE_DIRECTIONS.UNIMPLEMENTED,
      contractId: contract.contractId,
      edge: contract.edge,
      precondition: contract.precondition,
      postcondition: contract.postcondition,
      invariant: contract.invariant,
    });
  }

  const unexplained = differences.filter((entry) => entry.direction === DIFFERENCE_DIRECTIONS.UNEXPLAINED);
  const unimplemented = differences.filter((entry) => entry.direction === DIFFERENCE_DIRECTIONS.UNIMPLEMENTED);

  return {
    matched: matched.sort(byText('candidateId')),
    differences: [
      ...unexplained.sort(byText('candidateId')),
      ...unimplemented.sort(byText('contractId')),
    ],
    counts: {
      candidates: candidates.length,
      rfcContracts: rfcContracts.length,
      matched: matched.length,
      differences: differences.length,
      unexplained: unexplained.length,
      unimplemented: unimplemented.length,
    },
  };
}

/** The key a difference and its record share, so the two can be matched without relying on order. */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function differenceKey(difference) {
  const name = difference?.direction === DIFFERENCE_DIRECTIONS.UNIMPLEMENTED
    ? difference?.contractId
    : difference?.candidateId;
  return `${difference?.direction}:${name}`;
}

/** A classification is a human's word; anything that is not one leaves the entry unclassified. */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function classificationOf(value) {
  return asName(value) ?? UNCLASSIFIED_DIFFERENCE;
}

/** An optional list of identifiers, copied so a later writer cannot reach back into the caller's array. */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function identifierList(value) {
  if (value === null || value === undefined) {
    return [];
  }
  return Array.isArray(value) ? [...value] : [value];
}

/**
 * Turn one difference into the candidate that carries it back to its origin.
 *
 * The field names are ABOUT-REVERSE 6.12.3's layer B names for the omission and
 * RESIDUE artefacts — the same names P22-10 declared in `REVERSE_FIELD_NAMES` —
 * so the return path reads one vocabulary. A missing or unusable classification
 * becomes `unclassified` rather than an absent field: a difference that cannot be
 * classified is still a difference, and an absent field would read as one that
 * was never found.
 *
 * @param {object} difference - an entry of `reconcileContracts`'s `differences`
 * @param {object} [options]
 * @returns {object} the omission or RESIDUE candidate
 */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function recordDifference(difference, options = {}) {
  const {
    classification,
    affectedClaimIds,
    originResidualIds,
    scopeRef = null,
    oracleGapRef = null,
  } = options;

  const shared = {
    direction: difference?.direction,
    classification: classificationOf(classification),
    affected_claim_ids: identifierList(affectedClaimIds),
    origin_residual_ids: identifierList(originResidualIds),
    scope_ref: asName(scopeRef),
  };

  if (difference?.direction === DIFFERENCE_DIRECTIONS.UNEXPLAINED) {
    const candidateId = asName(difference.candidateId);
    if (candidateId === null) {
      throw new Error('a difference recorded as unexplained must name the candidate it came from');
    }
    return {
      kind: RECORD_TARGETS.RESIDUE,
      ...shared,
      candidate_id: candidateId,
      source_span: difference.sourceSpan ?? null,
      topic: difference.proposition ?? candidateId,
      next_route: UNEXPLAINED_NEXT_ROUTE,
    };
  }

  if (difference?.direction === DIFFERENCE_DIRECTIONS.UNIMPLEMENTED) {
    const contractId = asName(difference.contractId);
    if (contractId === null) {
      throw new Error('a difference recorded as unimplemented must name the RFC contract it came from');
    }
    return {
      kind: RECORD_TARGETS.OMISSION,
      ...shared,
      type: MISSING_IMPLEMENTATION_TYPE,
      contract_id: contractId,
      edge: difference.edge ?? null,
      statement: difference.invariant ?? null,
      oracle_gap_ref: asName(oracleGapRef),
    };
  }

  throw new Error(
    `a difference carries the direction "${difference?.direction}", which is neither `
    + `"${DIFFERENCE_DIRECTIONS.UNEXPLAINED}" nor "${DIFFERENCE_DIRECTIONS.UNIMPLEMENTED}"`,
  );
}

/**
 * GF2 — every difference is recorded, and a run with none still records the comparison.
 *
 * Agreement is deliberately not the pass condition. If it were, an RFC written
 * from the implementation would pass by construction — failure mode F1 — and the
 * gate would ratify exactly what it exists to question (the same shape T5 takes
 * for the logical and physical layers).
 *
 * @param {{differences?: Array<object>, recorded?: Array<object>, comparisonExists?: boolean}} input
 * @returns {{gateId: string, status: string, counts: object, reasons: string[], unrecorded: string[]}}
 */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function assertEveryDifferenceRecorded({ differences = [], recorded = [], comparisonExists = false } = {}) {
  const recordedKeys = new Set(recorded.map((entry) => differenceKey({
    direction: entry?.direction,
    candidateId: entry?.candidate_id,
    contractId: entry?.contract_id,
  })));
  const unrecorded = differences.filter((difference) => !recordedKeys.has(differenceKey(difference)));
  const counts = { differences: differences.length, recorded: recorded.length, unrecorded: unrecorded.length };

  if (!comparisonExists) {
    return gateRecord(GATE_STATUS.FAIL, counts, [
      `no comparison was recorded. A run with zero differences still requires the record, because the record `
      + `is the artefact that says the candidate set was compared against the RFC at all`,
    ], unrecorded.map(differenceKey));
  }

  if (unrecorded.length > 0) {
    return gateRecord(
      GATE_STATUS.FAIL,
      counts,
      unrecorded.map((difference) => {
        const name = differenceKey(difference);
        return `${name} is a difference that ${CONTRACT_DIFF_FILE_NAME} does not record, so it would be ratified rather than recorded`;
      }),
      unrecorded.map(differenceKey),
    );
  }

  return gateRecord(
    GATE_STATUS.PASS,
    counts,
    [
      counts.differences === 0
        ? 'the comparison was made and no difference was found between the contract candidates and the RFC contracts'
        : `all ${counts.differences} difference(s) are recorded, and none was removed rather than recorded`,
      ...(counts.differences === 0 ? [ZERO_DIFFERENCES_INTERPRETATION] : []),
    ],
    [],
  );
}

/** One GF2 gate record, in the shape the reverse-rotation gates already report. */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function gateRecord(status, counts, reasons, unrecorded) {
  return { gateId: GF2_GATE_ID, status, counts, reasons, unrecorded };
}

/** The comparison as the Markdown a human or an AI reads before deciding anything. */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function renderContractDiffReport(record, { differences = [], recorded = [] } = {}) {
  const lines = [
    '# GF2 — contract reconciliation',
    '',
    `**${record.status}** — ${record.counts.candidates ?? differences.length} candidate(s) and `
    + `${record.counts.rfcContracts ?? 0} RFC contract(s) compared, ${record.counts.differences} difference(s), `
    + `${record.counts.unrecorded} unrecorded.`,
    '',
  ];

  lines.push('## Reasons', '');
  for (const reason of record.reasons) {
    lines.push(`- ${reason}`);
  }

  lines.push('', `## Differences (${differences.length})`, '');
  if (differences.length === 0) {
    lines.push('None.', '');
  } else {
    for (const difference of differences) {
      const name = difference.direction === DIFFERENCE_DIRECTIONS.UNIMPLEMENTED
        ? difference.contractId
        : difference.candidateId;
      lines.push(`- \`${difference.direction}\` ${name}`);
    }
    lines.push('');
  }

  lines.push(`## Recorded (${recorded.length})`, '');
  if (recorded.length === 0) {
    lines.push('None.', '');
  } else {
    for (const entry of recorded) {
      lines.push(`- \`${entry.kind}\` ${entry.candidate_id ?? entry.contract_id} — ${entry.classification}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Read a JSON document, naming the path when it cannot be read. */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function readJson(documentPath, description) {
  try {
    return JSON.parse(fs.readFileSync(documentPath, 'utf8'));
  } catch (error) {
    throw new Error(`the ${description} ${documentPath} could not be read as JSON: ${error.message}`);
  }
}

/** Parse the CLI arguments. */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const read = (prefix) => argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? null;

  return {
    graphPath: read(GRAPH_ARG_PREFIX),
    candidatesPath: read(CANDIDATES_ARG_PREFIX),
    correspondencesPath: read(CORRESPONDENCES_ARG_PREFIX),
    recordedPath: read(RECORDED_ARG_PREFIX),
    outPath: read(OUT_ARG_PREFIX),
  };
}

// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function printUsage() {
  process.stderr.write(
    'Usage: node contract-diff.js --graph=<path> --candidates=<path> --out=<dir> '
    + '[--correspondences=<path>] [--recorded=<path>]\n',
  );
}

/** The candidates an R3 run produced, from the ledger or from a candidate document. */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function readCandidates(document) {
  if (Array.isArray(document)) {
    return document;
  }
  if (Array.isArray(document?.candidates)) {
    return document.candidates;
  }
  throw new Error('the candidate document must be a list, or carry a "candidates" list');
}

// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.graphPath || !options.candidatesPath || !options.outPath) {
    printUsage();
    process.exit(EXIT_CODES.USAGE);
  }

  const outDirectory = path.resolve(options.outPath);
  const diffPath = path.join(outDirectory, CONTRACT_DIFF_FILE_NAME);

  let graph;
  let candidates;
  let correspondences = [];
  try {
    graph = readJson(path.resolve(options.graphPath), 'graph');
    candidates = readCandidates(readJson(path.resolve(options.candidatesPath), 'candidate document'));
    if (options.correspondencesPath) {
      const document = readJson(path.resolve(options.correspondencesPath), 'correspondence document');
      correspondences = Array.isArray(document) ? document : (document?.correspondences ?? []);
    }
  } catch (error) {
    process.stderr.write(formatError(
      `the input could not be read: ${error.message}`,
      'GF2 reconciles two lists and was not given both of them',
      'check --graph and --candidates point at readable JSON documents, then re-run',
    ));
    process.stderr.write('\n');
    process.exit(EXIT_CODES.FAIL);
  }

  let reconciled;
  try {
    reconciled = reconcileContracts({ candidates, rfcContracts: extractRfcContracts(graph), correspondences });
  } catch (error) {
    process.stderr.write(formatError(
      `the reconciliation could not run: ${error.message}`,
      'the candidates and the RFC contracts could not be paired as given',
      'fix the correspondence document, or omit --correspondences to leave every item unmatched, then re-run',
    ));
    process.stderr.write('\n');
    process.exit(EXIT_CODES.FAIL);
  }

  // A record supplied by a previous step is judged; otherwise this run records
  // every difference itself, so the comparison exists whether or not one was found.
  let recorded;
  let comparisonExists;
  try {
    if (options.recordedPath) {
      const document = readJson(path.resolve(options.recordedPath), 'recorded difference document');
      recorded = Array.isArray(document) ? document : (document?.recorded ?? []);
      comparisonExists = true;
    } else {
      recorded = reconciled.differences.map((difference) => recordDifference(difference, {}));
      comparisonExists = true;
    }
  } catch (error) {
    process.stderr.write(formatError(
      `the recorded differences could not be read: ${error.message}`,
      'the record a previous step wrote is unreadable, so nothing can be proven to be in it',
      'fix or remove --recorded and re-run',
    ));
    process.stderr.write('\n');
    process.exit(EXIT_CODES.FAIL);
  }

  const gate = assertEveryDifferenceRecorded({ differences: reconciled.differences, recorded, comparisonExists });

  fs.mkdirSync(outDirectory, { recursive: true });
  fs.writeFileSync(diffPath, `${JSON.stringify({
    comparison: reconciled.counts,
    matched: reconciled.matched,
    differences: reconciled.differences,
    recorded,
  }, null, 2)}\n`);

  process.stdout.write(`${renderContractDiffReport(gate, { differences: reconciled.differences, recorded })}\n`);
  process.stdout.write(`Comparison written to \`${diffPath}\`.\n\n`);

  process.exit(gate.status === GATE_STATUS.PASS ? EXIT_CODES.OK : EXIT_CODES.FAIL);
}

if (require.main === module) {
  main();
}

module.exports = {
  CONTRACT_DIFF_FILE_NAME,
  DIFFERENCE_DIRECTIONS,
  EXIT_CODES,
  GATE_STATUS,
  GF2_GATE_ID,
  MISSING_IMPLEMENTATION_TYPE,
  RECORD_TARGETS,
  UNCLASSIFIED_DIFFERENCE,
  ZERO_DIFFERENCES_INTERPRETATION,
  assertEveryDifferenceRecorded,
  differenceKey,
  extractRfcContracts,
  formatError,
  parseArguments,
  reconcileContracts,
  recordDifference,
  renderContractDiffReport,
};
