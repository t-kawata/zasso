#!/usr/bin/env node
'use strict';

/**
 * reverse-split.js — S1 through S6, the reverse branch of `/split-to-tickets` (§6.8, §6.14.6).
 *
 * The forward flow decides what to build and writes the tickets that say so. In reverse
 * mode the tree already contains an implementation and a test suite, so the same step has
 * to describe what is there instead of declaring what should be:
 *
 *   S1  map every existing test to a ticket, or report it with its path
 *   S2  record every contract whose test never had a Red
 *   S3  embed the implementation file measured for each ticket
 *   S4  generate exactly one reconstruction ticket per absent-Red contract
 *   S5  make the `counterexample_plan_id` mandatory on every one of them
 *   S6  attach the driving references that resolved, and record the ones that did not
 *
 * The judgements live in `test-mapping.js`, which touches no disk. This module is the part
 * that reads, measures and reports.
 *
 * Two properties are load-bearing. The mapping is total, so it returns an explicit
 * remainder rather than a list of successes. And a reconstruction ticket without a plan
 * identifier is refused rather than emitted: the plan identifier names what the ticket
 * will confirm or refute, and without it the reconstruction decays into ordinary
 * test-writing and the uncertainty the plan encoded disappears (§6.14.6, §3.5).
 *
 * Nothing here executes a reconstruction ticket. That is P22-19.
 *
 * Usage:
 *   node reverse-split.js --root=<path> --tickets=<path> [--test-dir=<path>]
 *                         [--gaps=<path>] [--ledger=<path>]
 *                         [--language=<name>] [--out=<dir>] [--candidate=<path>] [--json]
 */

const fs = require('fs');
const path = require('path');

const {
  GATE_IDS,
  GATE_STATUS,
  MAPPING_STAGE,
  ReconstructionTicketRefused,
  assertPlanIdPresent,
  buildMappingCandidate,
  detectAbsentRed,
  drivingReferencesFor,
  generateReconstructionTicket,
  mapTestsToTickets,
  measureTestInventory,
  measuredFilesFor,
  summarizeMappingGates,
} = require('./test-mapping.js');

/** Exit codes, matching the convention the other `rfc-graph/` CLIs use. */
const EXIT_CODES = Object.freeze({ OK: 0, FAIL: 1, USAGE: 2 });

/** The project root, which is where the P22 analysis artefacts are looked for by default. */
const PROJECT_ROOT = path.resolve(__dirname, '../../../..');

/** Where each input lives when the caller names none. */
const DEFAULT_ANALYSIS_DIR = 'tests/workspacify-reverse/analysis';
const DEFAULT_GAPS_FILE = 'GAPS.json';
const DEFAULT_LEDGER_FILE = 'CLAIM-LEDGER.json';
const DEFAULT_TEST_DIR = 'tests';

/** The artefact names this stage writes. */
const TICKETS_FILE_NAME = 'reverse-split-tickets.json';
const REPORT_FILE_NAME = 'reverse-split-mapping.md';

/** The rule by which a contract is associated with a plan, recorded on every ticket. */
const NEAREST_CARRIER_BASIS = 'nearest_carrier_line_in_same_file';

/**
 * How many entries the Markdown report lists before summarising the rest.
 *
 * A tree this size produces 700 contracts, and a report that prints all of them cannot be
 * read. The remainder is always announced, so a truncated report never reads as a complete one.
 */
const REPORT_SAMPLE_LIMIT = 50;

/** The Red technique vocabulary's gap class for a surface no test could fail for. */
const ABSENT_RED_GAP_KIND = 'absent_red';

/** The Rust test file extension the subject tree's suite uses. */
const TEST_FILE_EXTENSION = '.rs';

/**
 * The statuses that mean a ticket's work is finished.
 *
 * Frozen so the count and the assertion that reads it cannot drift, and
 * deliberately not "everything else is terminal": an unrecognised status is
 * unknown, and defaulting an unknown to finished is how §3.3's loss goes
 * unrecorded. A ticket whose status is absent is reported as absent rather than
 * added to this set.
 */
const TERMINAL_TICKET_STATUSES = Object.freeze(['done', 'reviewed']);

/** What the report says of a ticket whose document declared no status. */
const STATUS_NOT_DECLARED = 'status not declared';

/** Why a non-terminal ticket has no package: three reasons, three sentences. */
const NO_IMPLEMENTATION_FILE_REASON = 'the ticket names no implementation file';
const NO_DECLARED_TICKET_SET_REASON = 'no declared ticket set was present to read';
const NO_PARTITION_REASON = 'no partition was offered, so no ticket could be re-homed to one';
const ALL_TICKETS_TERMINAL_REASON = 'every ticket is terminal, so nothing is in flight';
const EMPTY_DECLARED_TICKET_SET_REASON = 'the ticket set declares no ticket, so nothing is in flight';

/** The two outcomes a non-terminal ticket can have. */
const REHOMING_OUTCOMES = Object.freeze({ REHOMED: 'rehomed', REHOMED_NOWHERE: 'rehomed_nowhere' });

/**
 * The package path that owns the whole tree.
 *
 * `structure-parity.mjs` measures the same root as `.` (its `measureDirectoryTree`),
 * and the two must agree: the attribution below is T2's ownership question — "which
 * package holds this file?" — asked of a ticket's files rather than of the tree.
 */
const ROOT_PACKAGE_PATH = '.';

/** The 3-element template every `rfc-graph/` CLI uses, so a failure reads the same way. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function formatError(problem, cause, remedy) {
  return `[ERROR] ${problem}\nCause: ${cause}\nAction: ${remedy}`;
}

const USAGE = [
  'Usage:',
  '  node reverse-split.js --root=<path> --tickets=<path> [--test-dir=<path>]',
  '                        [--gaps=<path>] [--ledger=<path>] [--partition=<path>]',
  '                        [--language=<name>] [--out=<dir>] [--candidate=<path>] [--json]',
  '',
  '  --root        The subject tree the reverse rotation measures. Required.',
  '  --tickets     Declared ticket keys, from a Tickets.json or a frozen oracle bundle.',
  '                Required: S1 maps tests onto this set, so it has no safe default.',
  '  --test-dir    Where its tests live. Defaults to <root>/tests.',
  '  --gaps        The measured gaps. Defaults to the analysis directory under the project.',
  '  --ledger      The claim ledger the Red plans are built from.',
  '  --partition   The new partition, as { packages: [...] } or an allocate manifest.',
  '                Without it the in-flight work is named as re-homed-nowhere, because',
  '                there is no package to follow a ticket to — which is a state this',
  '                report states rather than a zero it invents.',
  '  --out         Write the ticket set and the Markdown report here.',
  '  --candidate   Write the oracle candidate document here for `run.mjs oracle compare`.',
].join('\n');

/** Read a file as JSON, naming the path when it is not there or not JSON. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function readJson(filePath, what) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${what} is not at ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${what} at ${filePath} is not readable as JSON: ${error.message}`);
  }
}

/** The value of `--name=value`, or null when the argument was not given. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function flagValue(args, prefix) {
  const found = args.find((argument) => argument.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
}

/** The CLI arguments as one object, with only `root` required. */
// [::TICKET::] P22-16, P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-16|P23-9) --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const root = flagValue(args, '--root=');
  const analysisDir = path.join(PROJECT_ROOT, DEFAULT_ANALYSIS_DIR);

  const testDir = flagValue(args, '--test-dir=');
  const ticketsPath = flagValue(args, '--tickets=');

  return {
    root: root === null ? null : path.resolve(root),
    testDir: testDir === null ? null : path.resolve(testDir),
    // Required rather than defaulted: a mapping needs the key set it maps onto, and a
    // default would silently attribute a subject tree's tests to whatever backlog happened
    // to sit at that path. A mapping against the wrong keys is worse than no mapping.
    ticketsPath: ticketsPath === null ? null : path.resolve(ticketsPath),
    gapsPath: resolveInput(flagValue(args, '--gaps='), analysisDir, DEFAULT_GAPS_FILE),
    ledgerPath: resolveInput(flagValue(args, '--ledger='), analysisDir, DEFAULT_LEDGER_FILE),
    language: flagValue(args, '--language=') ?? 'unknown',
    partitionPath: flagValue(args, '--partition=') === null ? null : path.resolve(flagValue(args, '--partition=')),
    outDir: flagValue(args, '--out='),
    candidatePath: flagValue(args, '--candidate='),
    json: args.includes('--json'),
  };
}

/** An explicit path, resolved; or the default file under its directory. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function resolveInput(given, directory, fileName) {
  return given === null ? path.join(directory, fileName) : path.resolve(given);
}

/**
 * The declared ticket keys, from either source an experiment can offer.
 *
 * A forward `Tickets.json` carries phases of tickets; a frozen oracle bundle carries the
 * same keys already extracted. Both name the set a test may be attributed to, and
 * accepting both avoids a conversion step that would itself need testing.
 */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function readDeclaredTicketKeys(filePath) {
  const document = readJson(filePath, 'the declared ticket keys');

  if (Array.isArray(document?.artefacts?.tickets?.ticketKeys)) {
    return [...document.artefacts.tickets.ticketKeys];
  }
  if (Array.isArray(document?.phases)) {
    return document.phases.flatMap((phase) => (phase.tickets ?? []).map((ticket) => `P${phase.id}-${ticket.id}`));
  }
  throw new Error(
    `${filePath} carries neither a "phases" array nor an "artefacts.tickets.ticketKeys" array, `
    + 'so no declared ticket key could be read from it',
  );
}

/**
 * The ticket lifecycles, from the same document `readDeclaredTicketKeys` reads.
 *
 * Two populations live in this one file and only one of them had a gate (§7.2). The
 * declared key set answers "which tickets exist"; this answers "which of them still
 * have work". They are read by two functions rather than one returning both, because a
 * caller that passed the lifecycle data where the key set was expected would reproduce
 * exactly the confusion §7.2 records.
 *
 * An absent document is reported as absent rather than as an empty list: "nobody read a
 * ticket set" and "the ticket set is empty" are different facts, and the second reads as
 * "no work in flight" while the first reads as "nobody looked".
 */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function readTicketLifecycles(filePath) {
  if (!fs.existsSync(filePath)) {
    return { present: false, source: filePath, reason: NO_DECLARED_TICKET_SET_REASON, tickets: [] };
  }
  return {
    present: true,
    source: filePath,
    reason: null,
    tickets: ticketLifecyclesFrom(readJson(filePath, 'the declared ticket lifecycles')),
  };
}

/** The lifecycle of every ticket a document declares, in document order. */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function ticketLifecyclesFrom(document) {
  // A frozen oracle bundle declares keys and nothing else, so it declares no lifecycle:
  // reporting it as "every ticket is terminal" would be a statement the document never made.
  if (!Array.isArray(document?.phases)) {
    return [];
  }

  return document.phases.flatMap((phase) => (phase.tickets ?? []).map((ticket) => ({
    key: `P${phase.id}-${ticket.id}`,
    status: typeof ticket.status === 'string' && ticket.status.length > 0 ? ticket.status : null,
    title: typeof ticket.title === 'string' ? ticket.title : '',
    files: Array.isArray(ticket.default_files) ? [...ticket.default_files] : [],
  })));
}

/** Whether a package path holds a file, with `.` holding the whole tree. */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function packageOwnsFile(packagePath, file) {
  if (packagePath === ROOT_PACKAGE_PATH) return true;
  const normalized = String(packagePath).replace(/\/+$/, '');
  return normalized.length > 0 && file.startsWith(`${normalized}/`);
}

/**
 * The most specific package that holds a file.
 *
 * Most specific rather than first match, because the root package holds everything: a
 * ticket naming `src/a/lib.rs` under a partition of `.`, `src` and `src/a` belongs to
 * `src/a`, and attributing it to the root would hide which boundary it landed under.
 */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function owningPackageFor(file, packages) {
  let owner = null;
  for (const pkg of packages ?? []) {
    if (!packageOwnsFile(pkg.path, file)) continue;
    if (owner === null || String(pkg.path).length > String(owner.path).length) owner = pkg;
  }
  return owner;
}

/**
 * The files each package holds, measured from the tree rather than assumed.
 *
 * The measurement is `measureDirectoryTree`, which is the same one T1 and T2 judge the
 * partition with. A file the tree holds and no package claims is left out, so the
 * attribution reports it as belonging to nobody rather than to the nearest path.
 */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
async function measurePackageImplementations({ root, packages }) {
  const { measureDirectoryTree } = await import(
    path.join(PROJECT_ROOT, '.claude/scripts/workspacify-tree/lib/structure-parity.mjs')
  );

  const files = measureDirectoryTree(root).sourceFiles;
  const byPackage = new Map((packages ?? []).map((pkg) => [pkg.id, []]));

  for (const file of files) {
    const owner = owningPackageFor(file, packages);
    if (owner !== null && byPackage.has(owner.id)) byPackage.get(owner.id).push(file);
  }

  return byPackage;
}

/** The new partition a caller offers, in either of the two shapes that carry one. */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function readNewPartition(filePath) {
  const document = readJson(filePath, 'the new partition');
  const declared = Array.isArray(document?.packages) ? document.packages : document?.workspace?.packages;

  if (!Array.isArray(declared)) {
    throw new Error(
      `${filePath} carries neither a "packages" array nor a "workspace.packages" array, `
      + 'so the new partition could not be read from it',
    );
  }

  return {
    source: filePath,
    packages: declared.map((pkg) => ({
      id: typeof pkg?.id === 'string' ? pkg.id : String(pkg?.path ?? ''),
      path: typeof pkg?.path === 'string' ? pkg.path : '',
    })),
  };
}

/** One ticket's outcome, with the packages that own the files it names. */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function attributedEntry({ ticket, owningPackages, owningPaths, reason }) {
  return {
    key: ticket.key,
    status: ticket.status ?? STATUS_NOT_DECLARED,
    title: ticket.title,
    outcome: REHOMING_OUTCOMES.REHOMED,
    owningPackages,
    owningPaths,
    files: [...ticket.files],
    unattributedPaths: [],
    reason,
    unfiled: false,
  };
}

/** One ticket's outcome when no package can be followed to. */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function unattributedEntry({ ticket, unattributedPaths, reason, unfiled = false }) {
  return {
    key: ticket.key,
    status: ticket.status ?? STATUS_NOT_DECLARED,
    title: ticket.title,
    outcome: REHOMING_OUTCOMES.REHOMED_NOWHERE,
    owningPackages: [],
    owningPaths: [],
    files: [...ticket.files],
    unattributedPaths,
    reason,
    unfiled,
  };
}

/** Where one non-terminal ticket lands under the new partition. */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function attributeTicket({ ticket, packages, implementations }) {
  if (packages === null) {
    // The files are not unowned; they are unjudged. Counting them as unattributed would
    // report a missing partition as a set of losses.
    return unattributedEntry({ ticket, unattributedPaths: [], reason: NO_PARTITION_REASON });
  }
  if (ticket.files.length === 0) {
    return unattributedEntry({ ticket, unattributedPaths: [], reason: NO_IMPLEMENTATION_FILE_REASON, unfiled: true });
  }

  const owners = ticket.files.map((file) => ({ file, owner: owningPackageForIn(implementations, file) }));
  const unattributedPaths = owners.filter((entry) => entry.owner === null).map((entry) => entry.file);

  // A ticket naming any file no package holds is named as re-homed-nowhere with the path,
  // never partly re-homed: a loss half-attributed reads as a success, which is the one
  // outcome §3.3 exists to prevent.
  if (unattributedPaths.length > 0) {
    return unattributedEntry({
      ticket,
      unattributedPaths,
      reason: `${unattributedPaths.length} of the ${ticket.files.length} file(s) this ticket names is owned by no `
        + `package of the new partition: ${unattributedPaths.join(', ')}`,
    });
  }

  const owningPackages = [...new Set(owners.map((entry) => entry.owner.id))].sort();
  const owningPaths = owningPackages.map((id) => packages.find((pkg) => pkg.id === id)?.path ?? null);

  return attributedEntry({
    ticket,
    owningPackages,
    owningPaths,
    reason: owningPackages.length > 1
      ? `the work spans ${owningPackages.length} packages (${owningPaths.join(', ')}), so which one inherits it `
        + 'is a question for the operator rather than a fact this record can decide'
      : `the new partition owns every file this ticket names, under ${owningPaths[0]}`,
  });
}

/**
 * The package holding a file, from the measured implementation lists.
 *
 * The lists are a partition of the tree's source files — `measurePackageImplementations`
 * assigns each file to exactly one package — so the lookup is unambiguous. Ownership is
 * read from the measurement rather than from the path, because the path rule alone would
 * attribute every file that does not exist to the root package, and a ticket naming a
 * file the new partition no longer holds is exactly the loss §3.3 requires be named.
 */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function owningPackageForIn(implementations, file) {
  for (const [id, files] of implementations ?? []) {
    if (files.includes(file)) return { id };
  }
  return null;
}

/**
 * The in-flight accounting: every non-terminal ticket, re-homed or named as re-homed-nowhere.
 *
 * The two obligations are stated together because separating them would let one be
 * discharged and the other forgotten: the count of each outcome reconciles with the
 * number of non-terminal tickets, so no ticket can be dropped between them.
 *
 * `tickets` is `null` when no declared set was read, and `packages` is `null` when no
 * partition was offered. Both are absences with their own sentence, never zeroes.
 */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function planInFlightRehoming({
  tickets,
  packages,
  implementations,
  source = null,
  partitionSource = null,
} = {}) {
  const partitionPresent = Array.isArray(packages);

  if (!Array.isArray(tickets)) {
    return {
      declared: false,
      partitionPresent,
      source,
      partitionSource,
      reason: NO_DECLARED_TICKET_SET_REASON,
      rehomed: [],
      rehomedNowhere: [],
      counts: { nonTerminal: 0, rehomed: 0, rehomedNowhere: 0, unattributedPaths: 0, unfiled: 0, statusesNotDeclared: 0 },
    };
  }

  // A ticket that carries no file list names no file this record can read, which is the
  // same finding as declaring none. Normalising here keeps the attribution total: a
  // caller that omits the field gets a reported outcome, not a crash.
  const declared = tickets.map((ticket) => ({ ...ticket, files: Array.isArray(ticket.files) ? [...ticket.files] : [] }));
  const nonTerminal = declared.filter((ticket) => !TERMINAL_TICKET_STATUSES.includes(ticket.status));
  const entries = nonTerminal.map((ticket) => attributeTicket({
    ticket,
    packages: partitionPresent ? packages : null,
    implementations,
  }));

  const rehomed = entries.filter((entry) => entry.outcome === REHOMING_OUTCOMES.REHOMED);
  const rehomedNowhere = entries.filter((entry) => entry.outcome === REHOMING_OUTCOMES.REHOMED_NOWHERE);

  return {
    declared: true,
    partitionPresent,
    source,
    partitionSource,
    reason: zeroReasonFor({ tickets, nonTerminal, partitionPresent }),
    rehomed,
    rehomedNowhere,
    counts: {
      nonTerminal: nonTerminal.length,
      rehomed: rehomed.length,
      rehomedNowhere: rehomedNowhere.length,
      unattributedPaths: entries.reduce((total, entry) => total + entry.unattributedPaths.length, 0),
      unfiled: entries.filter((entry) => entry.unfiled).length,
      statusesNotDeclared: nonTerminal.filter((ticket) => ticket.status === null || ticket.status === undefined).length,
    },
  };
}

/**
 * Why the in-flight count is zero, when it is.
 *
 * A zero this block has to explain is about the population it counted. The partition's
 * absence is reported only when there is work that could not be re-homed to it, because
 * a missing partition over an empty population changed nothing.
 */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function zeroReasonFor({ tickets, nonTerminal, partitionPresent }) {
  if (nonTerminal.length > 0) {
    return partitionPresent ? null : NO_PARTITION_REASON;
  }
  return tickets.length === 0 ? EMPTY_DECLARED_TICKET_SET_REASON : ALL_TICKETS_TERMINAL_REASON;
}

/** The in-flight section of the report, as prose a reader acts on. */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function renderInFlightReport(inFlight) {
  const lines = ['', `## In-flight work (${inFlight.counts.nonTerminal})`, ''];

  if (!inFlight.declared) {
    lines.push(`- ${inFlight.reason}.`);
    return lines.join('\n');
  }

  lines.push(
    `- declared ticket set: ${inFlight.source === null ? 'not recorded' : `\`${inFlight.source}\``}`,
    `- new partition: ${inFlight.partitionPresent ? `\`${inFlight.partitionSource ?? 'not recorded'}\`` : 'none offered'}`,
    `- re-homed: ${inFlight.counts.rehomed}`,
    `- named as re-homed-nowhere: ${inFlight.counts.rehomedNowhere}`,
    `- status not declared: ${inFlight.counts.statusesNotDeclared}`,
  );
  if (inFlight.reason !== null) lines.push(`- ${inFlight.reason}.`);

  lines.push('', `### Re-homed (${inFlight.counts.rehomed})`, '');
  if (inFlight.rehomed.length === 0) lines.push('None. A count of zero is a reading, never a pass.', '');
  for (const entry of inFlight.rehomed) {
    const homes = entry.owningPaths.map((packagePath, index) => `\`${packagePath}\` (${entry.owningPackages[index]})`);
    lines.push(`- \`${entry.key}\` (${entry.status}) → ${homes.join(', ')} — ${entry.reason}`);
  }

  lines.push('', `### Named as re-homed-nowhere (${inFlight.counts.rehomedNowhere})`, '');
  if (inFlight.rehomedNowhere.length === 0) {
    lines.push('None: every non-terminal ticket has a package to go to.', '');
  } else {
    lines.push('Each of these has no home under the new partition. The question to decide is stated with it.');
    for (const entry of inFlight.rehomedNowhere) {
      lines.push(`- \`${entry.key}\` (${entry.status}) — ${entry.reason}`);
    }
  }

  return lines.join('\n');
}

/** Every test file of the subject tree, with its text, as S1 measures them. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function readTestFiles({ root, testDir }) {
  if (!fs.existsSync(testDir)) {
    return [];
  }
  return fs
    .readdirSync(testDir)
    .filter((name) => name.endsWith(TEST_FILE_EXTENSION))
    .sort()
    .map((name) => ({
      path: toTreePath(path.relative(root, path.join(testDir, name))),
      text: fs.readFileSync(path.join(testDir, name), 'utf8'),
    }));
}

/** A path as the tree names it: forward slashes, and no leading `./`. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function toTreePath(relativePath) {
  return relativePath.split(path.sep).join('/').replace(/^\.\//, '');
}

/** The absent-Red population a gap document carries. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function readAbsentRedContracts(gapsPath) {
  const document = readJson(gapsPath, 'the measured gaps');
  const gaps = Array.isArray(document?.gaps) ? document.gaps : [];
  return gaps.filter((gap) => gap.kind === ABSENT_RED_GAP_KIND);
}

/**
 * Index the Red plans by the file they target, so a contract can be associated with the
 * plan whose carrier sits nearest it.
 *
 * The plan identifier is P22-7's, computed by its own `buildCounterexamplePlanId`, so the
 * reverse split reads that vocabulary rather than inventing a parallel one.
 */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function indexPlansByFile(entries) {
  const byFile = new Map();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const match = /^(.*):(\d+)$/.exec(entry?.target?.carrier ?? '');
    if (match === null) continue;
    const file = match[1].replace(/^\.\//, '');
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push({
      line: Number(match[2]),
      id: entry.counterexample_plan_id,
      claimId: typeof entry.claim_id === 'string' && entry.claim_id.length > 0 ? entry.claim_id : null,
    });
  }

  for (const list of byFile.values()) list.sort((left, right) => left.line - right.line);
  return byFile;
}

/** The plan whose carrier line sits nearest the contract, in the contract's own file. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function nearestPlanFor(contract, plansByFile) {
  const candidates = plansByFile.get(contract.file);
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const line = Number.isInteger(contract.line) ? contract.line : candidates[0].line;
  return candidates.reduce((best, candidate) => (
    Math.abs(candidate.line - line) < Math.abs(best.line - line) ? candidate : best
  ));
}

/**
 * The Red plans for this run.
 *
 * The planner is ESM and this module is CommonJS, so it is imported dynamically rather
 * than required: the two module systems cannot be mixed, and rewriting the planner would
 * be a change to P22-7's contract.
 */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
async function loadPlanEntries({ ledgerPath }) {
  const ledger = readJson(ledgerPath, 'the claim ledger');
  const { planRedReconstruction } = await import(
    path.join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/lib/red-reconstruction.mjs')
  );
  return planRedReconstruction({ ledger }).entries;
}

/** S3 — the measured implementation file for a contract, or the recorded fact that none exists. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function measureImplementationFor({ contract, root }) {
  return measuredFilesFor({
    contract,
    root,
    exists: (file) => fs.existsSync(path.join(root, file)),
  });
}

/** S4 and S5 — one guarded reconstruction ticket per absent-Red contract. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function buildReconstructionTickets({ absentRedContracts, plansByFile, root }) {
  const tickets = [];
  const refused = [];

  for (const contract of absentRedContracts) {
    const plan = nearestPlanFor(contract, plansByFile);

    if (plan === null) {
      refused.push({
        contract_id: contract.contract_id,
        file: contract.file,
        reason: 'no Red plan targets this file, so the ticket would carry no counterexample_plan_id',
      });
      continue;
    }

    try {
      tickets.push(generateReconstructionTicket({
        contract,
        counterexamplePlanId: plan.id,
        counterexamplePlanBasis: NEAREST_CARRIER_BASIS,
        measuredFiles: measureImplementationFor({ contract, root }),
        driving: drivingReferencesFor({
          contract,
          claimIds: plan.claimId === null ? null : [plan.claimId],
          residualIds: null,
        }),
      }));
    } catch (error) {
      if (!(error instanceof ReconstructionTicketRefused)) throw error;
      refused.push({ contract_id: contract.contract_id, file: contract.file, reason: error.message });
    }
  }

  return { tickets, refused };
}

/**
 * S3's gate, stated as §6.14.6 states it: a ticket whose implementation already exists but
 * whose file list is empty. A ticket that has no implementation yet is not failed for
 * carrying no file — that is a fact about the ticket, not a gap in it.
 */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function judgeMeasuredFilesGate(tickets) {
  const list = Array.isArray(tickets) ? tickets : [];
  const missingFiles = list.filter(
    (ticket) => ticket.measured_implementation === true && (ticket.default_files ?? []).length === 0,
  );

  return {
    gateId: GATE_IDS.S3,
    status: missingFiles.length === 0 ? GATE_STATUS.PASS : GATE_STATUS.FAIL,
    counts: {
      tickets: list.length,
      implemented: list.filter((ticket) => ticket.measured_implementation).length,
      missingFiles: missingFiles.length,
    },
    reasons: missingFiles.map(
      (ticket) => `${ticket.contract_id}: an implementation was measured but the ticket carries no file for it`,
    ),
  };
}

/** S4's gate: one reconstruction ticket per absent-Red contract, and no other relation. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function judgeOneToOneGate({ tickets, refused, absentRedContracts }) {
  const accounted = tickets.length + refused.length;
  const reasons = [];

  if (accounted !== absentRedContracts.length) {
    reasons.push(
      `${absentRedContracts.length} absent-Red contract(s) were detected but ${accounted} were accounted for`,
    );
  }
  if (refused.length > 0) {
    reasons.push(`${refused.length} contract(s) produced no ticket: ${refused.map((entry) => entry.contract_id).join(', ')}`);
  }

  return {
    gateId: GATE_IDS.S4,
    status: reasons.length === 0 ? GATE_STATUS.PASS : GATE_STATUS.FAIL,
    counts: { detected: absentRedContracts.length, tickets: tickets.length, refused: refused.length },
    reasons,
  };
}

/** S5's gate: every ticket carries a plan identifier, and none was withheld. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function judgePlanIdGate({ tickets, refused }) {
  const reasons = [];

  for (const ticket of tickets) {
    try {
      assertPlanIdPresent(ticket);
    } catch (error) {
      reasons.push(error.message);
    }
  }
  reasons.push(...refused.map((entry) => `${entry.contract_id}: ${entry.reason}`));

  return {
    gateId: GATE_IDS.S5,
    status: reasons.length === 0 ? GATE_STATUS.PASS : GATE_STATUS.FAIL,
    counts: { tickets: tickets.length, refused: refused.length },
    reasons,
  };
}

/**
 * S6's gate. Driving references are an optional field, so an unresolved one is recorded
 * and never fails the stage — but the count is reported rather than hidden.
 */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function judgeDrivingRefsGate(tickets) {
  const unresolved = tickets.flatMap((ticket) => ticket.unresolved_driving_refs ?? []);

  return {
    gateId: GATE_IDS.S6,
    status: GATE_STATUS.PASS,
    counts: { tickets: tickets.length, unresolved: unresolved.length },
    reasons: unresolved.length === 0
      ? []
      : [`${unresolved.length} driving reference(s) did not resolve and are recorded on their tickets`],
  };
}

/** S1's gate: the mapping is proved only when nothing was left unattributed. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function judgeMappingGate(mappingCoverage, unmapped) {
  return {
    gateId: GATE_IDS.S1,
    status: mappingCoverage.unmapped === 0 ? GATE_STATUS.PASS : GATE_STATUS.FAIL,
    counts: mappingCoverage,
    reasons: unmapped.map((row) => `${row.test.path}: ${row.reason}`),
  };
}

/**
 * The whole reverse split for one run: measure, map, detect, generate, judge, account.
 *
 * The in-flight accounting is the second population, and it is deliberately not folded
 * into the mapping: S1-S6 count *tests without tickets*, this counts *tickets with work
 * in flight*, and a run that merged them would answer neither question. The flight block
 * is absent when no lifecycle was offered, which is a different state from a zero.
 */
// [::TICKET::] P22-16, P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-16|P23-9) --for-spec --no-implementation-order`.
function planReverseSplit({
  root,
  testDir,
  declaredTicketKeys,
  absentRedContracts,
  planEntries,
  language = 'unknown',
  ticketLifecycles = null,
  packages = null,
  implementations = null,
  partitionSource = null,
}) {
  const tests = measureTestInventory({ testFiles: readTestFiles({ root, testDir }) });
  const { mapped, unmapped, mappingCoverage } = mapTestsToTickets({ tests, ticketKeys: declaredTicketKeys });
  const absence = detectAbsentRed({ contracts: absentRedContracts, inventory: tests });
  const plansByFile = indexPlansByFile(planEntries);
  const { tickets, refused } = buildReconstructionTickets({
    absentRedContracts: absence.absentRedContracts,
    plansByFile,
    root,
  });

  const gates = [
    judgeMappingGate(mappingCoverage, unmapped),
    absence.gate,
    judgeMeasuredFilesGate(tickets),
    judgeOneToOneGate({ tickets, refused, absentRedContracts: absence.absentRedContracts }),
    judgePlanIdGate({ tickets, refused }),
    judgeDrivingRefsGate(tickets),
  ];

  const inFlight = planInFlightRehoming({
    tickets: ticketLifecycles === null ? null : ticketLifecycles.tickets,
    packages,
    implementations,
    source: ticketLifecycles === null ? null : ticketLifecycles.source,
    partitionSource,
  });

  return {
    root,
    stage: MAPPING_STAGE,
    language,
    tests,
    mapped,
    unmapped,
    mappingCoverage,
    absence,
    tickets,
    refused,
    gates,
    inFlight,
  };
}

/**
 * The split as the Markdown a human or an AI reads before deciding anything.
 *
 * The counts lead, then one line per test and per contract, because a reader acts on a
 * named file or a named contract and not on a total. Nothing here is a verdict: the
 * gates say whether a property holds, and the disagreements are left for a human.
 */
// [::TICKET::] P22-16, P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-16|P23-9) --for-spec --no-implementation-order`.
function renderMappingReport(plan) {
  const summary = summarizeMappingGates({ gates: plan.gates });
  const lines = [
    '# S1 through S6 — reverse split',
    '',
    `**${summary.status}** — ${plan.mappingCoverage.tests} test(s) measured, ${plan.mappingCoverage.mapped} mapped, `
    + `${plan.mappingCoverage.unmapped} reported; ${plan.absence.absenceCount} contract(s) without a Red, `
    + `${plan.tickets.length} reconstruction ticket(s) generated, ${plan.refused.length} refused.`,
    '',
    `Measured tree: \`${plan.root}\``,
    '',
    '## Gates',
    '',
  ];

  for (const gate of plan.gates) {
    lines.push(`- **${gate.gateId}: ${gate.status}** — ${JSON.stringify(gate.counts)}`);
    for (const reason of gate.reasons) lines.push(`  - ${reason}`);
  }

  if (plan.inFlight) {
    lines.push(renderInFlightReport(plan.inFlight));
  }

  lines.push('', `## Tests (${plan.mappingCoverage.tests})`, '');
  for (const test of plan.tests) {
    const attributed = plan.mapped.filter((row) => row.test.path === test.path).map((row) => row.ticketKey);
    const reported = plan.unmapped.find((row) => row.test.path === test.path);
    const destination = attributed.length > 0 ? attributed.join(', ') : `${reported.reason} (reported, not mapped)`;
    lines.push(`- \`${test.path}\` — ${test.testCount} test(s), ${test.ticketKeys.length} key(s) named → ${destination}`);
  }

  lines.push('', `## Contracts without a Red (${plan.absence.absenceCount})`, '');
  if (plan.absence.absenceCount === 0) {
    lines.push('None recorded. A count of zero is a comparison result, never a pass.', '');
  } else {
    for (const record of plan.absence.absentRedContracts.slice(0, REPORT_SAMPLE_LIMIT)) {
      lines.push(`- \`${record.contract_id}\` — ${record.evidence[0]}`);
    }
    if (plan.absence.absenceCount > REPORT_SAMPLE_LIMIT) {
      lines.push(`- … and ${plan.absence.absenceCount - REPORT_SAMPLE_LIMIT} more, all recorded in the ticket set.`);
    }
  }

  if (plan.absence.unclassified.length > 0) {
    lines.push('', `## Unclassified (${plan.absence.unclassified.length})`, '');
    for (const entry of plan.absence.unclassified) lines.push(`- \`${entry.contract_id}\` — ${entry.reason}`);
  }

  if (plan.refused.length > 0) {
    lines.push('', `## Refused (${plan.refused.length})`, '');
    lines.push('A contract these could not be given a plan identifier is not reconstructed at all.', '');
    for (const entry of plan.refused) lines.push(`- \`${entry.contract_id}\` — ${entry.reason}`);
  }

  lines.push('', `## Reconstruction tickets (${plan.tickets.length})`, '');
  for (const ticket of plan.tickets.slice(0, REPORT_SAMPLE_LIMIT)) {
    lines.push(
      `- \`${ticket.contract_id}\` → ${ticket.counterexample_plan_id} `
      + `(${ticket.counterexample_plan_basis}${ticket.counterexample_plan_candidate ? ', a candidate' : ''}), `
      + `${ticket.default_files.length} measured file(s)`,
    );
  }
  if (plan.tickets.length > REPORT_SAMPLE_LIMIT) {
    lines.push(`- … and ${plan.tickets.length - REPORT_SAMPLE_LIMIT} more, all in the ticket set.`);
  }

  return `${lines.join('\n')}\n`;
}

/** Write the ticket set, the report and the oracle candidate the caller asked for. */
// [::TICKET::] P22-16 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-16 --for-spec --no-implementation-order`.
function writeReverseSplit(plan, { outDir = null, candidatePath = null } = {}) {
  const written = [];

  if (outDir !== null) {
    fs.mkdirSync(outDir, { recursive: true });

    const ticketsPath = path.join(outDir, TICKETS_FILE_NAME);
    fs.writeFileSync(ticketsPath, `${JSON.stringify(serializeTicketSet(plan), null, 2)}\n`, 'utf8');
    written.push(ticketsPath);

    const reportPath = path.join(outDir, REPORT_FILE_NAME);
    fs.writeFileSync(reportPath, renderMappingReport(plan), 'utf8');
    written.push(reportPath);
  }

  if (candidatePath !== null) {
    fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
    const candidate = buildMappingCandidate({ tickets: plan.tickets, language: plan.language });
    fs.writeFileSync(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
    written.push(candidatePath);
  }

  return written;
}

/**
 * The ticket set as it is written, with the mapping and the gates that produced it.
 *
 * The keys read in five groups: the subject this run was taken over (`root`, `stage`,
 * `language`), the coverage it reached (`mappingCoverage`, `absenceCount`), the gates
 * that judged it, the ticket populations (`tickets`, `refused`, `unclassified`), and the
 * in-flight accounting (`inFlight`). Every key stays at its existing path, because the
 * reverse-split assertions pin them and a consumer reading `tickets` must keep finding it
 * where it was; `inFlight` is a new sibling of the counts it belongs beside.
 */
// [::TICKET::] P22-16, P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-16|P23-9) --for-spec --no-implementation-order`.
function serializeTicketSet(plan) {
  return {
    root: plan.root,
    stage: plan.stage,
    language: plan.language,
    mappingCoverage: plan.mappingCoverage,
    absenceCount: plan.absence.absenceCount,
    gates: plan.gates.map((gate) => ({ gateId: gate.gateId, status: gate.status, counts: gate.counts })),
    tickets: plan.tickets,
    refused: plan.refused,
    unclassified: plan.absence.unclassified,
    inFlight: plan.inFlight ?? null,
  };
}

// [::TICKET::] P22-16, P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-16|P23-9) --for-spec --no-implementation-order`.
async function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.root === null) {
    process.stderr.write(`${formatError('no subject tree was named', '--root was not supplied', USAGE)}\n`);
    return EXIT_CODES.USAGE;
  }
  if (options.ticketsPath === null) {
    process.stderr.write(`${formatError(
      'no declared ticket set was named',
      '--tickets was not supplied, and S1 maps tests onto a declared key set',
      'Name the set the mapping is onto, e.g. --tickets=<path to a Tickets.json or a frozen oracle bundle>. '
      + 'A mapping against an assumed key set would attribute every test to the wrong ticket.',
    )}\n`);
    return EXIT_CODES.USAGE;
  }
  if (!fs.existsSync(options.root)) {
    process.stderr.write(`${formatError(
      `the subject tree ${options.root} does not exist`,
      'the reverse split measures a tree that is already there',
      'Point --root at the tree the reverse rotation should describe, then re-run.',
    )}\n`);
    return EXIT_CODES.USAGE;
  }

  try {
    const newPartition = options.partitionPath === null ? null : readNewPartition(options.partitionPath);
    const plan = planReverseSplit({
      root: options.root,
      testDir: options.testDir ?? path.join(options.root, DEFAULT_TEST_DIR),
      declaredTicketKeys: readDeclaredTicketKeys(options.ticketsPath),
      absentRedContracts: readAbsentRedContracts(options.gapsPath),
      planEntries: await loadPlanEntries({ ledgerPath: options.ledgerPath }),
      language: options.language,
      ticketLifecycles: readTicketLifecycles(options.ticketsPath),
      packages: newPartition === null ? null : newPartition.packages,
      implementations: newPartition === null
        ? null
        : await measurePackageImplementations({ root: options.root, packages: newPartition.packages }),
      partitionSource: newPartition === null ? null : newPartition.source,
    });

    const written = writeReverseSplit(plan, { outDir: options.outDir, candidatePath: options.candidatePath });
    const summary = summarizeMappingGates({ gates: plan.gates });

    process.stdout.write(options.json ? `${JSON.stringify(serializeTicketSet(plan), null, 2)}\n` : renderMappingReport(plan));
    if (written.length > 0) {
      for (const filePath of written) process.stdout.write(`\nWrote \`${filePath}\`.\n`);
    }

    return summary.status === GATE_STATUS.PASS ? EXIT_CODES.OK : EXIT_CODES.FAIL;
  } catch (error) {
    process.stderr.write(`${formatError(
      'the reverse split could not be completed',
      error.message,
      'Fix the reported input and re-run. Nothing was written unless a path was named.',
    )}\n`);
    return EXIT_CODES.FAIL;
  }
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exit(EXIT_CODES.FAIL);
    });
}

module.exports = {
  ABSENT_RED_GAP_KIND,
  ALL_TICKETS_TERMINAL_REASON,
  EMPTY_DECLARED_TICKET_SET_REASON,
  EXIT_CODES,
  NEAREST_CARRIER_BASIS,
  NO_DECLARED_TICKET_SET_REASON,
  NO_IMPLEMENTATION_FILE_REASON,
  NO_PARTITION_REASON,
  REHOMING_OUTCOMES,
  REPORT_FILE_NAME,
  ROOT_PACKAGE_PATH,
  STATUS_NOT_DECLARED,
  TERMINAL_TICKET_STATUSES,
  TICKETS_FILE_NAME,
  USAGE,
  buildReconstructionTickets,
  formatError,
  indexPlansByFile,
  measurePackageImplementations,
  planInFlightRehoming,
  readNewPartition,
  readTicketLifecycles,
  renderInFlightReport,
  judgeDrivingRefsGate,
  judgeMappingGate,
  judgeMeasuredFilesGate,
  judgeOneToOneGate,
  judgePlanIdGate,
  loadPlanEntries,
  main,
  measureImplementationFor,
  nearestPlanFor,
  parseArguments,
  planReverseSplit,
  readAbsentRedContracts,
  readDeclaredTicketKeys,
  readTestFiles,
  renderMappingReport,
  serializeTicketSet,
  writeReverseSplit,
};
