#!/usr/bin/env node
'use strict';

/**
 * reverify-ticket.js — one ticket, one ordered gate set, one repair plan.
 *
 * The report gates answer "what is missing". This runner asks all of them in a
 * fixed order, collapses the answers into the PX-397 repair plan, and records a
 * completion certificate beside the ticket record. A gate failure is a finding,
 * never a stop.
 */

const fs = require('node:fs');
const path = require('node:path');

const { buildRepairPlan } = require('./repair-plan.js');
const { findingsDigest } = require('./lib/gate-finding.js');
const {
  gateFinding,
  gateRerun,
  inputRoute,
  loadTicketDocument,
  findTicketByKey,
  argumentValue,
} = require('./lib/gate-report.js');
const {
  findPlanTestCodeGaps,
  findPlanContractElementGaps,
} = require('./verify-plan-contracts.js');
const {
  findMakeContractIdGaps,
  findMakeContractElementGaps,
} = require('./verify-make-contracts.js');
const { findContractDeliveryGaps } = require('./verify-contract-delivery.js');
const { findOperationDeliveryGaps } = require('./verify-operation-delivery.js');
const { findAcceptanceGaps } = require('./verify-acceptance-coverage.js');
const { findReviewRecordGaps } = require('./verify-review-record.js');
const { formulaResultToFindings } = require('./verify-formula-delivery.js');
const { validateTargets, staleCloneFindings } = require('./validate-ticket-targets.js');
const { buildCertificate, writeCertificate } = require('./completion-certificate.js');
const { SOURCE_EXTENSIONS } = require('./lib/scope-detection-constants.js');
const {
  discoverChangedTickets,
  parseAnnotationTicketKeys,
  targetFiles,
} = require('./discover-changed-tickets.js');
const { mergeFormulasToTickets } = require('./merge-formulas-to-tickets.js');

const GATE = 'reverify-ticket';
const REVIEWED_STATUS = 'reviewed';

/** Read the certificate for one ticket, or null when it is missing or invalid. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function readCertificate(certificatePath) {
  try {
    return JSON.parse(fs.readFileSync(certificatePath, 'utf8'));
  } catch {
    return null;
  }
}

/** The certificate path beside the ticket record. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function certificatePathFor(ticketsPath, ticketKey) {
  return path.join(path.dirname(path.resolve(ticketsPath)), 'certificates', ticketKey + '.json');
}

/**
 * Whether a reviewed ticket lacks fresh verification evidence.
 *
 * reviewed status is not a certificate: after a code change the finding digest
 * differs from the one the certificate recorded, and a missing certificate is
 * treated the same way. A clean run writes a new certificate, which is the
 * fresh evidence that clears the state.
 *
 * @param {{ ticketKey: string, status: string, certificate: object|null, currentDigest: string }} input
 * @returns {boolean}
 */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function isStaleReviewed({ ticketKey, status, certificate, currentDigest }) {
  if (status !== REVIEWED_STATUS) return false;
  if (!certificate) return true;
  return certificate.finalDigest !== currentDigest;
}

/** Wrap one gate so an exception becomes a finding instead of a stop. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function runGateSafely(name, run, ticketKey, ticketsPath) {
  try {
    return { name, findings: run() };
  } catch (error) {
    return {
      name,
      findings: [gateFinding({
        code: 'GATE_DEFECT',
        asset: ticketKey + '/' + name,
        problem: error.message,
        rerun: gateRerun(GATE, ticketKey, ticketsPath),
        fix: inputRoute({
          asset: ticketKey + '/' + name,
          instruction: 'Repair the gate input named in the error and rerun the reverify gate set',
        }),
      })],
    };
  }
}

/** The formula gate reuses the existing merge dry-run. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function findFormulaGaps(ticketKey, ticketsPath, options) {
  if (!options.sidecarPath) return [];
  const rerun = gateRerun(GATE, ticketKey, ticketsPath);

  let result;
  try {
    result = mergeFormulasToTickets({
      ticketsPath,
      dirsTreePath: options.dirsTreePath,
      sidecarPath: options.sidecarPath,
      specPath: options.specPath,
      cwd: options.cwd || process.cwd(),
      write: false,
    });
  } catch (error) {
    return [gateFinding({
      code: 'FORMULA_GATE_FAILED',
      asset: ticketKey + '/formula',
      problem: error.message,
      rerun,
      fix: inputRoute({
        asset: ticketKey + '/formula',
        instruction: 'Repair the formula inputs named in the error and rerun the formula gate',
      }),
    })];
  }

  return formulaResultToFindings(result, { ticketKey, ticketsPath, rerun });
}

/** The target gate reports validation errors and stale deferral clones. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function findTargetGaps(ticket, ticketKey, ticketsPath, ticketsDocument) {
  const rerun = gateRerun('validate-ticket-targets', ticketKey, ticketsPath);
  const result = validateTargets(ticketsDocument, ticketKey);
  const findings = (result.errors || []).map((error) => gateFinding({
    code: 'TARGET_VALIDATION_FAILED',
    asset: ticketKey + '/targets',
    problem: error,
    rerun,
    fix: inputRoute({ asset: ticketKey + '/targets', instruction: error }),
  }));

  findings.push(...staleCloneFindings(ticket, ticketsDocument, ticketsPath));
  return findings;
}

/** Whether a file carries this ticket's provenance annotation. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function carriesTicketAnnotation(filePath, ticketKey) {
  try {
    return parseAnnotationTicketKeys(fs.readFileSync(filePath, 'utf8')).includes(ticketKey);
  } catch {
    return false;
  }
}

/** The annotation gate checks only the ticket's own changed files. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function findAnnotationGaps(ticketKey, ticket, options) {
  const changedFiles = options.changedFiles || [];
  if (changedFiles.length === 0) return [];

  const cwd = options.cwd || process.cwd();
  const candidates = new Set([
    ...(Array.isArray(ticket.default_files) ? ticket.default_files : []),
    ...targetFiles(ticket),
  ]);
  for (const file of changedFiles) {
    if (carriesTicketAnnotation(path.resolve(cwd, file), ticketKey)) candidates.add(file);
  }

  const rerun = gateRerun(GATE, ticketKey, options.ticketsPath);
  const findings = [];
  for (const file of candidates) {
    if (!SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    const absolute = path.resolve(cwd, file);
    const changed = changedFiles.some((entry) => path.resolve(cwd, entry) === absolute);
    if (!changed || !fs.existsSync(absolute)) continue;
    if (carriesTicketAnnotation(absolute, ticketKey)) continue;
    findings.push(gateFinding({
      code: 'ANNOTATION_MISSING',
      asset: ticketKey + '/' + file,
      problem: 'changed file ' + file + ' carries no [::TICKET::] ' + ticketKey + ' annotation',
      rerun,
      fix: {
        tool: 'annotate-ticket-context',
        input: { ticketKey, file },
      },
    }));
  }

  return findings;
}

/**
 * The ordered gate set start, review and resolve share.
 *
 * @param {object} ticket
 * @param {string} ticketKey
 * @param {object} options
 * @returns {Array<{ name: string, findings: object[] }>}
 */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function ticketGateSet(ticket, ticketKey, options) {
  const ticketsPath = options.ticketsPath;
  const ticketsDocument = options.ticketsDocument;
  const gates = [
    ['plan-contracts', () => findPlanTestCodeGaps(ticket, ticketKey, ticketsPath)],
    ['plan-elements', () => findPlanContractElementGaps(ticket, ticketKey, ticketsPath)],
    ['make-contracts', () => findMakeContractIdGaps(ticket, ticketKey, ticketsPath)],
    ['make-elements', () => findMakeContractElementGaps(ticket, ticketKey, ticketsPath)],
    ['contract-delivery', () => findContractDeliveryGaps(ticket, ticketKey, ticketsPath)],
    ['operation-delivery', () => findOperationDeliveryGaps(ticket, ticketKey, ticketsPath)],
    ['acceptance-coverage', () => findAcceptanceGaps(ticket, ticketKey, ticketsPath)],
    ['formula-delivery', () => findFormulaGaps(ticketKey, ticketsPath, options)],
    ['annotation', () => findAnnotationGaps(ticketKey, ticket, options)],
    ['targets', () => findTargetGaps(ticket, ticketKey, ticketsPath, ticketsDocument)],
    ['review-record', () => findReviewRecordGaps(ticket, ticketKey, ticketsPath)],
  ];

  return gates.map(([name, run]) => runGateSafely(name, run, ticketKey, ticketsPath));
}

/** The finding a reviewed ticket carries until fresh evidence exists. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function staleReviewedFinding(ticketKey, ticketsPath) {
  return gateFinding({
    code: 'REVIEWED_TICKET_STALE',
    asset: ticketKey + '/reviewed',
    problem: 'reviewed ticket ' + ticketKey + ' has no fresh verification evidence',
    rerun: gateRerun(GATE, ticketKey, ticketsPath),
    fix: {
      tool: 'reverify-ticket',
      input: { ticketKey, ticketsPath, writeCertificate: true, runCount: 2 },
    },
  });
}

/** The result for a ticket key that is absent from the document. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function notFoundResult(ticketKey, ticketsPath) {
  const finding = gateFinding({
    code: 'TICKET_NOT_FOUND',
    asset: ticketKey,
    problem: 'ticket ' + ticketKey + ' is not present in ' + ticketsPath,
    rerun: gateRerun(GATE, ticketKey, ticketsPath),
    fix: inputRoute({
      asset: ticketKey,
      instruction: 'Run reverify against an existing ticket key or repair the Tickets.json path',
    }),
  });
  return {
    ticketKey,
    status: null,
    findings: [finding],
    plan: buildRepairPlan([finding]),
    gates: [],
    staleReviewed: false,
    certificateWritten: false,
    certificateError: null,
  };
}

/**
 * Run the gate set once and build the repair plan.
 *
 * @param {object} input
 * @returns {object}
 */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function runReverify({
  ticketKey,
  ticketsPath,
  ticketsDocument,
  changedFiles,
  cwd,
  sidecarPath,
  dirsTreePath,
  specPath,
  writeCertificate: shouldWrite = false,
  runCount = 2,
}) {
  let document;
  try {
    document = ticketsDocument ?? loadTicketDocument(ticketsPath);
  } catch {
    return notFoundResult(ticketKey, ticketsPath);
  }

  const ticket = findTicketByKey(document, ticketKey);
  if (!ticket) return notFoundResult(ticketKey, ticketsPath);

  const gates = ticketGateSet(ticket, ticketKey, {
    ticketsPath,
    ticketsDocument: document,
    changedFiles,
    cwd,
    sidecarPath,
    dirsTreePath,
    specPath,
  });

  let findings = gates.flatMap((gate) => gate.findings);
  const certificate = readCertificate(certificatePathFor(ticketsPath, ticketKey));
  let staleReviewed = isStaleReviewed({
    ticketKey,
    status: ticket.status,
    certificate,
    currentDigest: findingsDigest(findings),
  });

  let certificateWritten = false;
  let certificateError = null;

  // A clean fresh run is the evidence the certificate records. Writing it is
  // what turns a missing or old certificate into fresh evidence.
  if (shouldWrite && findings.length === 0) {
    try {
      const newCertificate = buildCertificate({
        ticketKey,
        gates: gates.map((gate) => ({ name: gate.name, digest: findingsDigest(gate.findings) })),
        runCount,
        finalFindings: [],
        finalDigest: findingsDigest([]),
      });
      const certificatePath = certificatePathFor(ticketsPath, ticketKey);
      fs.mkdirSync(path.dirname(certificatePath), { recursive: true });
      writeCertificate(certificatePath, newCertificate);
      certificateWritten = true;
      staleReviewed = false;
    } catch (error) {
      certificateError = {
        code: error.code ?? 'CERTIFICATE_INCOMPLETE',
        message: error.message,
      };
    }
  }

  if (staleReviewed) findings = [...findings, staleReviewedFinding(ticketKey, ticketsPath)];

  return {
    ticketKey,
    status: ticket.status,
    findings,
    plan: buildRepairPlan(findings),
    gates: gates.map((gate) => ({ name: gate.name, digest: findingsDigest(gate.findings) })),
    staleReviewed,
    certificateWritten,
    certificateError,
  };
}

// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const ticketKey = argumentValue(args, 'ticket-key');
  const ticketsPath = path.resolve(argumentValue(args, 'tickets') || 'Tickets.json');
  if (!ticketKey) {
    process.stdout.write(JSON.stringify({
      ticketKey: null,
      status: null,
      findings: [],
      plan: buildRepairPlan([]),
      gates: [],
      staleReviewed: false,
      certificateWritten: false,
      certificateError: { code: 'GATE_INPUT_MISSING', message: '--ticket-key is required' },
    }) + '\n');
    process.exit(0);
  }

  const filesArgument = argumentValue(args, 'files');
  let changedFiles;
  if (filesArgument !== undefined) {
    changedFiles = filesArgument.split(',').map((file) => file.trim()).filter((file) => file.length > 0);
  } else {
    try {
      changedFiles = discoverChangedTickets({ cwd: process.cwd(), ticketsPath }).files;
    } catch {
      changedFiles = [];
    }
  }

  const result = runReverify({
    ticketKey,
    ticketsPath,
    changedFiles,
    cwd: process.cwd(),
    sidecarPath: argumentValue(args, 'sidecar'),
    dirsTreePath: argumentValue(args, 'dirs-tree'),
    specPath: argumentValue(args, 'spec'),
    writeCertificate: args.includes('--write-certificate'),
    runCount: Number(argumentValue(args, 'run-count') ?? 2),
  });

  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  GATE,
  ticketGateSet,
  runGateSafely,
  findAnnotationGaps,
  findFormulaGaps,
  findTargetGaps,
  isStaleReviewed,
  certificatePathFor,
  readCertificate,
  runReverify,
};
