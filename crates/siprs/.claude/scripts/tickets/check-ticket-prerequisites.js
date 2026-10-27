#!/usr/bin/env node

/**
 * check-ticket-prerequisites.js — the /make-ticket entry gate for the implementation order.
 *
 * A ticket that carries implementation prerequisites may not enter make -> plan -> start ->
 * review while one of them is unfinished. The list is written by /split-to-tickets, so a
 * ticket from an instant conversation (Case B) carries none and is skipped, never blocked.
 *
 * Usage:
 *   node check-ticket-prerequisites.js --ticket-key=PX-1 [--tickets=<Tickets.json>]
 *                                      [--workspace=<workspace-root>]
 *
 * Exit 0 when every implementation prerequisite is `done` or `reviewed`, or when the ticket
 * carries no prerequisites. Exit 1 with a named finding otherwise.
 */

const fs = require('fs');
const path = require('path');

const { findAllocateManifest } = require('../lib/package-artifacts');
const { parseTicketKey } = require('../lib/validate-tickets');
const { evaluatePrerequisites, ticketKeyOf } = require('../sequences-slice/lib/implementation-order.mjs');
const { verifyPackage } = require('../sequences-slice/verify-implementation-order.mjs');

const EXIT_OK = 0;
const EXIT_FAILURE = 1;

const TREE_MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
const TICKETS_FILE_NAME = 'Tickets.json';

/** Parse `--name=value` or `--name value`. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

/** Every ticket in a Tickets.json document, in phase order. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function flattenTickets(document) {
  return (document?.phases ?? []).flatMap((phase) => (phase?.tickets ?? []).map((ticket) => ({
    ...ticket,
    phaseId: ticket.phaseId ?? phase.id,
  })));
}

/** The ticket a key names, or null. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function findTicket(document, key) {
  const parsed = parseTicketKey(key);
  if (parsed === null) return null;
  return flattenTickets(document).find((ticket) => ticket.phaseId === parsed.phaseId && ticket.id === parsed.ticketId) ?? null;
}

/** Whether a ticket implements at least one operation. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function implementsOperation(ticket) {
  return (ticket?.distribution?.units ?? []).some((unit) => unit?.kind === 'operation' && unit?.obligation?.mode === 'implement');
}

/** Whether a ticket carries any distribution work, not only an operation implementation. */
// [::TICKET::] PX-325 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-325 --for-spec --no-implementation-order`.
function carriesDistributionWork(ticket) {
  return (ticket?.distribution?.units ?? []).some((unit) => unit?.obligation?.mode !== undefined);
}

/** The status of every ticket in one package, keyed by its public ticket key. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function statusesOf(document) {
  return new Map(flattenTickets(document).map((ticket) => [ticketKeyOf(ticket), ticket.status]));
}

/** The implementer statuses of one package, or null when its Tickets.json is unreadable. */
// [::TICKET::] PX-323, PX-325 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-323|PX-325) --for-spec --no-implementation-order`.
function packageStatusesOf(packagePath) {
  const ticketsPath = path.join(packagePath, TICKETS_FILE_NAME);
  if (!fs.existsSync(ticketsPath)) return null;
  try {
    const document = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
    return flattenTickets(document).map((ticket) => ({
      ticket: ticketKeyOf(ticket),
      status: ticket.status,
      implements: implementsOperation(ticket),
      carriesWork: carriesDistributionWork(ticket),
    }));
  } catch {
    return null;
  }
}

/** The package path named by the workspace tree manifest, or null. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function packagePathOf(treeManifest, packageId) {
  const pkg = (treeManifest?.workspace?.packages ?? []).find((candidate) => candidate?.id === packageId);
  return pkg?.path ?? null;
}

/** The workspace root from an explicit path or the nearest allocate manifest. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function resolveWorkspaceRoot(explicitRoot, ticketsPath) {
  if (explicitRoot !== null && explicitRoot !== '') return path.resolve(explicitRoot);
  const manifestPath = findAllocateManifest(path.dirname(path.resolve(ticketsPath)));
  return manifestPath === null ? null : path.dirname(manifestPath);
}

/** Read the statuses of every prerequisite package a ticket names. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function collectPackageStatuses({ prerequisites, workspaceRoot }) {
  const statuses = new Map();
  const packages = [...new Set((prerequisites ?? []).map((entry) => entry?.package).filter((value) => typeof value === 'string'))];
  if (packages.length === 0) return statuses;
  if (workspaceRoot === null) {
    for (const packageId of packages) statuses.set(packageId, null);
    return statuses;
  }
  const treePath = path.join(workspaceRoot, TREE_MANIFEST_FILE_NAME);
  const treeManifest = fs.existsSync(treePath) ? JSON.parse(fs.readFileSync(treePath, 'utf8')) : null;
  for (const packageId of packages) {
    const packagePath = packagePathOf(treeManifest, packageId);
    statuses.set(packageId, packagePath === null ? null : packageStatusesOf(path.join(workspaceRoot, packagePath)));
  }
  return statuses;
}

/**
 * Evaluate the gate without writing to the process streams.
 *
 * @returns {{ code: number, verdict: object, findings: Array<object> }}
 */
// [::TICKET::] PX-323, PX-325 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-323|PX-325) --for-spec --no-implementation-order`.
function run(argv = process.argv.slice(2)) {
  const ticketKey = argumentFor(argv, 'ticket-key');
  if (ticketKey === null) {
    return { code: EXIT_FAILURE, verdict: { ok: false, findings: [] }, findings: [{ code: 'MISSING_TICKET_KEY', subject: null, message: '--ticket-key=<key> is required' }] };
  }
  const ticketsPath = argumentFor(argv, 'tickets') ?? 'Tickets.json';
  if (!fs.existsSync(ticketsPath)) {
    return { code: EXIT_FAILURE, verdict: { ok: false, findings: [] }, findings: [{ code: 'MISSING_TICKETS', subject: ticketsPath, message: 'Tickets.json is not readable' }] };
  }
  const document = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const ticket = findTicket(document, ticketKey);
  if (ticket === null) {
    // Case B/C: the ticket is created from the conversation in Step 2, so it has no
    // prerequisites to check. The gate is a skip, not a failure; Step 1 still reports
    // Not Found to the command.
    return { code: EXIT_OK, verdict: { ok: true, skipped: 'ticket-not-found', findings: [] }, findings: [] };
  }

  const prerequisites = Array.isArray(ticket.prerequisites) ? ticket.prerequisites : [];
  const hasOwnDistribution = (ticket.distribution?.units ?? []).length > 0;
  if (!hasOwnDistribution && prerequisites.length === 0) {
    // Case B or a pre-split ticket: there is no distribution to re-derive. The gate is a
    // skip, not a pass; the command's Step 1 still reports the ticket's actual state.
    return { code: EXIT_OK, verdict: { ok: true, skipped: 'no-prerequisites', findings: [] }, findings: [] };
  }

  // The field is a cache. Re-derive it from the graph, artifact, view, registry and tree
  // manifest so an edited or stale prerequisites array cannot pass the entry gate.
  let orderGate;
  try {
    orderGate = verifyPackage({ packageDir: path.dirname(path.resolve(ticketsPath)), write: false });
  } catch (error) {
    const finding = { code: 'PREREQUISITE_ORDER_UNREADABLE', subject: ticketsPath, message: error.message };
    return { code: EXIT_FAILURE, verdict: { ok: false, findings: [finding] }, findings: [finding] };
  }
  if (orderGate.code !== EXIT_OK) {
    return { code: EXIT_FAILURE, verdict: { ok: false, findings: orderGate.findings ?? [] }, findings: orderGate.findings ?? [] };
  }

  const workspaceRoot = resolveWorkspaceRoot(argumentFor(argv, 'workspace'), ticketsPath);
  const result = evaluatePrerequisites({
    prerequisites,
    samePackageStatuses: statusesOf(document),
    packageStatuses: collectPackageStatuses({ prerequisites, workspaceRoot }),
  });
  return {
    code: result.ok ? EXIT_OK : EXIT_FAILURE,
    verdict: result,
    findings: result.findings ?? [],
  };
}

/** The CLI entry point. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const result = run(argv);
  for (const finding of result.findings) {
    console.error(`${finding.code}: ${finding.subject ?? ''} ${finding.message}`);
  }
  process.stdout.write(`${JSON.stringify(result.verdict)}\n`);
  return result.code;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  argumentFor,
  collectPackageStatuses,
  findTicket,
  flattenTickets,
  implementsOperation,
  main,
  packagePathOf,
  resolveWorkspaceRoot,
  run,
  statusesOf,
};
