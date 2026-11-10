'use strict';

/**
 * PX-406 — detection coverage and calibration.
 *
 * A clean run is not a measurement unless the detector has been shown to fire.
 * Calibration copies a synthetic workspace, seeds one defect per family, and runs
 * the real detector. A missing detector is a meta-control finding; an applicable
 * undetected seed is CALIBRATION_FAILED; an inapplicable seed is notMeasured.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const {
  createSyntheticFixture,
  enumerateSurfaces,
  evaluateCoverage,
  loadRegistry,
  removeSyntheticFixture,
} = require('./lib/omission-detectors.js');

const MINIMUM_SEEDS = 4;
const CALIBRATION_VERSION = 1;

/** Read `--name=value` from the argument list. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

/** The sha256 of a value, used for the calibration digest. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function digestValue(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Read Tickets.json from a fixture root. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function readTickets(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'Tickets.json'), 'utf8'));
}

/** Write Tickets.json back to a fixture root. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function writeTickets(root, document) {
  fs.writeFileSync(path.join(root, 'Tickets.json'), JSON.stringify(document, null, 2) + '\n');
}

/** The source files a detector reads. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function sourceFiles(root) {
  const files = [];
  const sourceRoot = path.join(root, 'src');
  if (!fs.existsSync(sourceRoot)) return files;
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (/\.(js|cjs|mjs|ts|rs|py|go|java)$/.test(entry.name)) files.push(fullPath);
    }
  };
  walk(sourceRoot);
  return files;
}

/** The test entries a ticket carries. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function testEntries(ticket) {
  return [...(ticket.testUnit ?? []), ...(ticket.testIntegration ?? [])];
}

/** Whether a text names a term at a word boundary. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function mentions(text, term) {
  if (typeof text !== 'string' || typeof term !== 'string' || term.length === 0) return false;
  return new RegExp('(^|[^A-Za-z0-9_])' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z0-9_]|$)').test(text);
}

/** The content words of a clause. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function significantTerms(text) {
  return [...new Set(String(text ?? '').toLowerCase().split(/[^a-z0-9_]+/).filter((term) => term.length > 3))];
}

/** Detect a contract id absent from the ticket's test plan. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function detectContractDelivery(root) {
  const findings = [];
  for (const phase of readTickets(root).phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      const entries = testEntries(ticket);
      for (const contract of ticket.contracts ?? []) {
        if (!entries.some((entry) => mentions(entry, contract.id))) {
          findings.push({ code: 'CONTRACT_CLAUSE_UNTESTED', surface: 'contract', assetId: contract.id, problem: 'no test entry names ' + contract.id, severity: 'high' });
        }
      }
    }
  }
  return findings;
}

/** Detect an acceptance criterion no test entry carries. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function detectAcceptanceCoverage(root) {
  const findings = [];
  for (const phase of readTickets(root).phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      const entries = testEntries(ticket);
      for (const criterion of ticket.acceptanceCriteria ?? []) {
        const terms = significantTerms(criterion);
        const required = Math.ceil(terms.length / 2);
        const covered = entries.some((entry) => {
          const lower = entry.toLowerCase();
          return terms.filter((term) => lower.includes(term)).length >= required;
        });
        if (!covered) {
          findings.push({ code: 'ACCEPTANCE_CRITERIA_UNTESTED', surface: 'acceptance', assetId: criterion, problem: 'no test entry names the criterion', severity: 'high' });
        }
      }
    }
  }
  return findings;
}

/** Detect an unmarked incomplete implementation. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function detectIncompleteImplementation(root) {
  const findings = [];
  for (const file of sourceFiles(root)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (/todo!\(\)|unimplemented!\(\)|panic!\(/.test(line) && !/\[::STUB::\]/.test(line)) {
        findings.push({ code: 'INCOMPLETE_IMPLEMENTATION_UNMARKED', surface: 'file', assetId: path.relative(root, file) + ':' + (index + 1), problem: line.trim(), severity: 'high' });
      }
    });
  }
  return findings;
}

/** Detect an unresolvable stub key. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function detectStubMarker(root) {
  const findings = [];
  for (const file of sourceFiles(root)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (/\[::STUB::\]/.test(line) && /MUST RESOLVE|PX-\d+/.test(line)) {
        findings.push({ code: 'STUB_KEY_UNRESOLVABLE', surface: 'stub', assetId: path.relative(root, file) + ':' + (index + 1), problem: line.trim(), severity: 'high' });
      }
    });
  }
  return findings;
}

/** Detect a ticket with no contracts or no units. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function detectTicketClosure(root) {
  const findings = [];
  for (const phase of readTickets(root).phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      if ((ticket.contracts ?? []).length === 0) {
        findings.push({ code: 'TICKET_CONTRACT_EMPTY', surface: 'ticket', assetId: 'P' + phase.id + '-' + ticket.id, problem: 'ticket carries no contract', severity: 'high' });
      }
      if ((ticket.nodeIds ?? []).length === 0) {
        findings.push({ code: 'TICKET_UNIT_EMPTY', surface: 'unit', assetId: 'P' + phase.id + '-' + ticket.id, problem: 'ticket carries no unit', severity: 'high' });
      }
    }
  }
  return findings;
}

/** Remove the C002 test entries from P0-2. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function seedContractDelivery(root) {
  const document = readTickets(root);
  const ticket = document.phases[0].tickets[1];
  ticket.testUnit = ticket.testUnit.filter((entry) => !mentions(entry, 'C002') && !entry.includes('the error is returned'));
  writeTickets(root, document);
  return true;
}

/** Remove every test entry that could name the acceptance criterion. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function seedAcceptanceCoverage(root) {
  const document = readTickets(root);
  const ticket = document.phases[0].tickets[1];
  ticket.testUnit = [];
  writeTickets(root, document);
  return true;
}

/** Add an unmarked incomplete implementation. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function seedIncompleteImplementation(root) {
  fs.appendFileSync(path.join(root, 'src/a.js'), '\nfunction unfinished() { todo!() }\n');
  return true;
}

/** Add an unresolvable stub key. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function seedStubMarker(root) {
  fs.appendFileSync(path.join(root, 'src/a.js'), '\n// [::STUB::] MUST RESOLVE: calibration seed\n');
  return true;
}

/** Remove a ticket's contracts. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function seedTicketClosure(root) {
  const document = readTickets(root);
  document.phases[0].tickets[1].contracts = [];
  writeTickets(root, document);
  return true;
}

const SEEDS = Object.freeze([
  { checkId: 'contract-delivery', seededDefect: 'remove the contract id from the test plan', apply: seedContractDelivery, detect: detectContractDelivery },
  { checkId: 'acceptance-coverage', seededDefect: 'remove the acceptance criterion from the test plan', apply: seedAcceptanceCoverage, detect: detectAcceptanceCoverage },
  { checkId: 'incomplete-implementation', seededDefect: 'add an unmarked todo!()', apply: seedIncompleteImplementation, detect: detectIncompleteImplementation },
  { checkId: 'stub-marker', seededDefect: 'add a MUST RESOLVE stub key', apply: seedStubMarker, detect: detectStubMarker },
  { checkId: 'ticket-closure', seededDefect: 'remove the contract list from a ticket', apply: seedTicketClosure, detect: detectTicketClosure },
]);

/** Run every seed against a fresh copy of the fixture. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function runCalibration({ fixtureRoot }) {
  const seeds = SEEDS.map((seed) => {
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'px406-seed-'));
    fs.cpSync(fixtureRoot, copy, { recursive: true });
    try {
      const applicable = seed.apply(copy) !== false;
      const findings = applicable ? seed.detect(copy) : [];
      return {
        checkId: seed.checkId,
        seededDefect: seed.seededDefect,
        applicable,
        detected: findings.length > 0,
        findings,
      };
    } finally {
      fs.rmSync(copy, { recursive: true, force: true });
    }
  });
  return { version: CALIBRATION_VERSION, seeds, digest: digestValue({ seeds }) };
}

/** The calibration verdict. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function calibrationVerdict(calibration) {
  const seeds = Array.isArray(calibration?.seeds) ? calibration.seeds : [];
  const applicable = seeds.filter((seed) => seed.applicable !== false);
  const notMeasured = seeds.filter((seed) => seed.applicable === false).map((seed) => seed.checkId);
  if (applicable.length < MINIMUM_SEEDS || applicable.some((seed) => seed.detected !== true)) {
    return notMeasured.length === 0
      ? { ok: false, code: 'CALIBRATION_FAILED' }
      : { ok: false, code: 'CALIBRATION_FAILED', notMeasured };
  }
  return { ok: true, notMeasured };
}

/** The negative control: a clean fixture must report no finding. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function runNegativeControl({ fixtureRoot }) {
  const findings = SEEDS.flatMap((seed) => seed.detect(fixtureRoot));
  return { findings };
}

/** The meta control: removing a detector must expose its surface. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function runMetaControl({ registry, surfaces }) {
  const mechanical = registry.detectors.filter((detector) => detector.kind === 'mechanical');
  const target = mechanical.find((detector) => detector.surfaces.includes('contract')) ?? mechanical[0];
  const reduced = {
    ...registry,
    detectors: registry.detectors.filter((detector) => detector.id !== target.id),
  };
  return evaluateCoverage({ registry: reduced, surfaces });
}

/** Run coverage, calibration and the negative control together. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function runDetectionGate({ cwd, ticketsPath = null, registry = null, surfaces = null, fixtureRoot = null }) {
  const loaded = registry ?? loadRegistry({ cwd });
  const enumerated = surfaces ?? enumerateSurfaces({ cwd, ticketsPath: ticketsPath || path.join(cwd, 'Tickets.json') });
  const coverage = evaluateCoverage({ registry: loaded, surfaces: enumerated });
  const fixture = fixtureRoot ?? createSyntheticFixture();
  const removeFixture = fixtureRoot === null;
  try {
    const calibration = runCalibration({ fixtureRoot: fixture });
    const negative = runNegativeControl({ fixtureRoot: fixture });
    const verdict = calibrationVerdict(calibration);
    const findings = [
      ...coverage.findings,
      ...(verdict.ok ? [] : [{ code: 'CALIBRATION_FAILED', surface: 'calibration', assetId: 'calibration', problem: 'a detector family did not fire', fixes: [], rerun: 'repair the detector and re-run omission-detection-gate.js' }]),
      ...negative.findings.map((finding) => ({ ...finding, code: 'NEGATIVE_CONTROL_FAILED' })),
    ];
    return { version: loaded.version, coverage, calibration, verdict, findings };
  } finally {
    if (removeFixture) removeSyntheticFixture(fixture);
  }
}

/** CLI entry point. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const cwd = path.resolve(argumentValue(args, 'cwd') || process.cwd());
  const fixture = argumentValue(args, 'fixture');
  const tickets = argumentValue(args, 'tickets');
  const result = args.includes('--calibrate')
    ? runCalibration({ fixtureRoot: fixture ? path.resolve(fixture) : createSyntheticFixture() })
    : runDetectionGate({
      cwd,
      ticketsPath: tickets ? path.resolve(cwd, tickets) : null,
      fixtureRoot: fixture ? path.resolve(fixture) : null,
    });
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  MINIMUM_SEEDS,
  SEEDS,
  calibrationVerdict,
  detectAcceptanceCoverage,
  detectContractDelivery,
  detectIncompleteImplementation,
  detectStubMarker,
  detectTicketClosure,
  runCalibration,
  runDetectionGate,
  runMetaControl,
  runNegativeControl,
};
