#!/usr/bin/env node
// PX-362 @verifies C001
// [::TICKET::] PX-362 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-362 --for-spec --no-implementation-order`.
/**
 * merge-formulas-to-tickets.js --tickets=<Tickets.json> --dirs-tree=<Dirs-Tree.json>
 *   --sidecar=<RFC-FORMULAS.json> --spec=<original specification>
 *   [--tree-manifest=<WORKSPACIFY-TREE-MANIFEST.json>] [--write]
 *
 * Project each Dirs-Tree formula onto the one ticket that implements its node or file.
 * The obligation carries the original specification location, never RFC.md, and the
 * ticket digest is the RFC formula digest. Any missing or duplicated formula is refused
 * before Tickets.json is written.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// [::TICKET::] PX-362 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-362) --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

// [::TICKET::] PX-362 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-362) --for-spec --no-implementation-order`.
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// [::TICKET::] PX-362 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-362) --for-spec --no-implementation-order`.
function allTickets(tickets) {
  return (tickets?.phases ?? []).flatMap((phase) => phase?.tickets ?? []);
}

// [::TICKET::] PX-362, PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-362|PX-365) --for-spec --no-implementation-order`.
function finding(code, subject, message) {
  return { code, subject, message, severity: 'blocking' };
}

/** A ticket whose workflow is already complete still accepts an obligation, without a status change. */
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function isCompletedStatus(status) {
  return status === 'reviewed' || status === 'done' || /^R\d+$/.test(status ?? '');
}

/** An advisory for an obligation that lands on a completed ticket. */
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function completedTicketAdvisory(ticket, formulaId) {
  const ticketKey = `${ticket.phaseId}-${ticket.id}`;
  return {
    code: 'FORMULA_OBLIGATION_ON_COMPLETED_TICKET',
    severity: 'advisory',
    subject: formulaId,
    ticketId: ticket.id,
    ticketKey,
    status: ticket.status,
    message: `ticket ${ticketKey} is ${ticket.status} and receives ${formulaId}; its status is unchanged`,
    action: `review the obligation with: node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=${ticketKey} --for-spec`,
    verify: 'node "$(git rev-parse --show-toplevel)/.claude/scripts/sequences-slice/verify-chain.mjs" --formula-only',
  };
}

// [::TICKET::] PX-362 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-362) --for-spec --no-implementation-order`.
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The ticket that owns the formula's node or file. */
// [::TICKET::] PX-362 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-362) --for-spec --no-implementation-order`.
function ticketCarries(ticket, entry) {
  const nodeIds = new Set(ticket?.nodeIds ?? []);
  if ((entry.nodeIds ?? []).some((nodeId) => nodeIds.has(nodeId))) return true;
  const files = new Set(ticket?.default_files ?? []);
  return (entry.filePaths ?? []).some((filePath) => files.has(filePath));
}

/** The segment id whose line range contains the formula line. */
// [::TICKET::] PX-362 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-362) --for-spec --no-implementation-order`.
function segmentAt(treeManifest, line) {
  const segment = (treeManifest?.structure?.segments ?? [])
    .find((candidate) => candidate.line_start <= line && line <= candidate.line_end);
  return segment?.id ?? '';
}

/** Build one obligation, or the findings that make it impossible. */
// [::TICKET::] PX-362 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-362) --for-spec --no-implementation-order`.
function buildObligation({ formula, entry, specText, specRelative, treeManifest }) {
  const findings = [];
  if (specRelative.endsWith('RFC.md') || path.basename(specRelative) === 'RFC.md') {
    findings.push(finding('ORIGIN_IS_RFC', formula.id, 'origin.path must name the original specification, not RFC.md'));
  }
  const line = formula.specLocation?.lineStart ?? null;
  if (!Number.isInteger(line)) {
    findings.push(finding('ORIGIN_LINE_MISSING', formula.id, 'the formula records no specification line'));
  }
  const quote = Number.isInteger(line) ? (specText.split('\n')[line - 1] ?? '').trim() : '';
  if (quote.length === 0) {
    findings.push(finding('ORIGIN_QUOTE_MISSING', formula.id, 'the specification line is empty or unreadable'));
  }
  const implementationPath = entry.filePaths?.[0] ?? '';
  const implementationSymbol = entry.symbols?.[0] ?? '';
  if (implementationPath.length === 0 && formula.implementation?.class !== 'notation') {
    findings.push(finding('IMPLEMENTATION_PATH_MISSING', formula.id, 'the formula resolves to no implementation file'));
  }
  if (implementationSymbol.length === 0) {
    findings.push(finding('IMPLEMENTATION_SYMBOL_MISSING', formula.id, 'the formula names no implementation symbol'));
  }
  if ((formula.tests ?? []).length === 0) {
    findings.push(finding('TEST_OBLIGATION_MISSING', formula.id, 'the formula names no verification test'));
  }
  if (findings.length > 0) return { findings };

  return {
    findings: [],
    obligation: {
      id: formula.id,
      digest: formula.digest,
      body: formula.body,
      origin: {
        path: specRelative,
        line,
        segment: segmentAt(treeManifest, line),
        quote,
      },
      implementation: {
        path: implementationPath,
        symbol: implementationSymbol,
        kind: formula.implementation?.class ?? '',
      },
      design: {
        class: formula.implementation?.class ?? '',
        how: formula.implementation?.design ?? '',
        types: [],
        errors: [],
        edgeCases: [],
      },
      theory: {
        symbols: formula.theory?.symbols ?? [],
        norms: formula.theory?.normative ?? [],
      },
      tests: [...(formula.tests ?? [])],
    },
  };
}

/**
 * Merge the formula obligations into the ticket set.
 *
 * @param {{ticketsPath: string, dirsTreePath: string, sidecarPath: string, specPath: string,
 *   treeManifestPath?: string|null, write?: boolean}} input
 * @returns {{ok: boolean, findings: Array<object>, obligations: Array<object>}}
 */
// [::TICKET::] PX-362, PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-362|PX-365) --for-spec --no-implementation-order`.
function mergeFormulasToTickets(input) {
  const { ticketsPath, dirsTreePath, sidecarPath, specPath, treeManifestPath = null, write = false, ticketsDocument = null } = input;
  const tickets = ticketsDocument ?? readJson(ticketsPath);
  const dirsTree = readJson(dirsTreePath);
  const sidecar = readJson(sidecarPath);
  const specBytes = fs.readFileSync(specPath);
  const specText = specBytes.toString('utf8');
  const treeManifest = treeManifestPath === null ? null : readJson(treeManifestPath);
  const findings = [];
  const advisories = [];

  if (sidecar.specDigest !== sha256(specBytes)) {
    findings.push(finding('STALE_SIDECAR', 'specDigest', 'the sidecar does not bind the original specification'));
  }
  if (findings.length > 0) return { ok: false, findings, advisories, obligations: [] };

  const sidecarIds = new Set((sidecar.formulas ?? []).map((formula) => formula.id));
  for (const ticket of allTickets(tickets)) {
    for (const existing of ticket.formulaObligations ?? []) {
      if (!sidecarIds.has(existing.id)) {
        findings.push(finding('FORMULA_INVENTED', existing.id, `ticket ${ticket.id} carries a formula absent from the sidecar`));
      }
    }
  }

  const obligations = [];
  for (const formula of sidecar.formulas ?? []) {
    const entry = dirsTree?.distribution?.formulas?.[formula.id];
    if (entry === undefined) {
      findings.push(finding('FORMULA_WITHOUT_INDEX', formula.id, 'the Dirs-Tree carries no formula index entry'));
      continue;
    }
    const candidates = allTickets(tickets).filter((ticket) => ticketCarries(ticket, entry));
    if (candidates.length === 0) {
      findings.push(finding('FORMULA_NO_TICKET', formula.id, 'no ticket implements the formula node or file'));
      continue;
    }
    if (candidates.length > 1) {
      findings.push(finding('FORMULA_DUPLICATE_TICKET', formula.id, `formulas must have one implementing ticket; found ${candidates.map((ticket) => ticket.id).join(', ')}`));
      continue;
    }
    const built = buildObligation({
      formula,
      entry,
      specText,
      specRelative: sidecar.specPath ?? path.basename(specPath),
      treeManifest,
    });
    if (built.findings.length > 0) {
      findings.push(...built.findings);
      continue;
    }
    obligations.push({ ticket: candidates[0], obligation: built.obligation });
    if (isCompletedStatus(candidates[0].status)) {
      advisories.push(completedTicketAdvisory(candidates[0], formula.id));
    }
  }

  if (findings.length > 0) return { ok: false, findings, advisories, obligations: obligations.map((entry) => entry.obligation) };

  const byTicket = new Map();
  for (const entry of obligations) {
    const rows = byTicket.get(entry.ticket) ?? [];
    rows.push(entry.obligation);
    byTicket.set(entry.ticket, rows);
  }
  for (const [ticket, rows] of byTicket) {
    const kept = (ticket.formulaObligations ?? []).filter((existing) => !sidecarIds.has(existing.id));
    ticket.formulaObligations = [...kept, ...rows].sort((left, right) => left.id.localeCompare(right.id));
  }
  if (write) fs.writeFileSync(ticketsPath, `${JSON.stringify(tickets, null, 2)}\n`);

  return { ok: true, findings: [], advisories, obligations: obligations.map((entry) => entry.obligation) };
}

// [::TICKET::] PX-362, PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-362|PX-365) --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const ticketsPath = argumentFor(argv, 'tickets');
  const dirsTreePath = argumentFor(argv, 'dirs-tree');
  const sidecarPath = argumentFor(argv, 'sidecar');
  const specPath = argumentFor(argv, 'spec');
  if ([ticketsPath, dirsTreePath, sidecarPath, specPath].some((value) => value === null)) {
    console.error('[ERROR] --tickets --dirs-tree --sidecar --spec are required');
    return 1;
  }
  const result = mergeFormulasToTickets({
    ticketsPath: path.resolve(ticketsPath),
    dirsTreePath: path.resolve(dirsTreePath),
    sidecarPath: path.resolve(sidecarPath),
    specPath: path.resolve(specPath),
    treeManifestPath: argumentFor(argv, 'tree-manifest') === null ? null : path.resolve(argumentFor(argv, 'tree-manifest')),
    write: argv.includes('--write'),
  });
  for (const entry of result.findings) console.error(`${entry.code}: ${entry.subject} ${entry.message}`);
  for (const entry of result.advisories) console.error(`advisory: ${entry.code}: ${entry.subject} ${entry.message}`);
  process.stdout.write(`${JSON.stringify({ ok: result.ok, obligations: result.obligations.length, findings: result.findings, advisories: result.advisories })}\n`);
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { mergeFormulasToTickets };
