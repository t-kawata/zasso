// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
/**
 * The transaction every post-split Tickets.json write passes through.
 *
 * A resolving ticket deep-clones its source and a phasified omission clones the whole
 * ticket record. Both are legitimate additions, and both can silently claim a unit the
 * source already owns. The gate snapshots the file, verifies the candidate against the
 * same split-stage chain, and promotes it only when the mutation introduces no new
 * finding. A failed verification restores the snapshot byte for byte.
 *
 * Contracts are the obligation an omission re-implements, not ownership. Ownership is
 * nodeIds, operation implementers in distribution.units, and formulaObligations. The
 * gate never clears contracts because tickets-schema.json requires at least one.
 */
'use strict';

const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { diffFindings } = require('../lib/finding-delta.js');
const { STAGE_STATUS_FILES, digestFile } = require('../rfc-graph/lib/stage-receipt.js');
const { ticketIdentity } = require('./lib/ticket-identity.js');
const { writeTicketDistributionAggregate } = require('./add-tickets-for-phase.js');

const MUTATION_CODES = Object.freeze({
  ROLLED_BACK: 'MUTATION_ROLLED_BACK',
  MANIFEST_MISSING: 'MUTATION_MANIFEST_MISSING',
  OWNERSHIP_DUPLICATE: 'MUTATION_OWNERSHIP_DUPLICATE',
  INVENTED_UNIT: 'MUTATION_INVENTED_UNIT',
  TRANSFER_INVALID: 'MUTATION_TRANSFER_INVALID',
  NEW_FINDING: 'MUTATION_NEW_FINDING',
  CONTRACT_PROJECTION_PENDING: 'MUTATION_CONTRACT_PROJECTION_PENDING',
});

const GATE_DIRECTORY = __dirname;
const VERIFY_CHAIN = path.join(GATE_DIRECTORY, '../sequences-slice/verify-chain.mjs');
const TICKET_CLOSURE = path.join(GATE_DIRECTORY, 'verify-ticket-closure.js');
const MERGE_CONTRACTS = path.join(GATE_DIRECTORY, 'merge-contracts-to-tickets.js');
const MERGE_FORMULAS = path.join(GATE_DIRECTORY, 'merge-formulas-to-tickets.js');
const FORMULA_FILE_COVERAGE = path.join(GATE_DIRECTORY, '../rfc-graph/verify-formula-file-coverage.js');
const TICKET_PREREQUISITES = path.join(GATE_DIRECTORY, 'check-ticket-prerequisites.js');

/** The verification surfaces the gate reuses, in the order it runs them. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function listMutationGates() {
  return [
    'verify-chain:split',
    'ticket-closure',
    'merge-contracts:verify',
    'merge-formulas:verify',
    'formula-file-coverage',
    'ticket-prerequisites',
  ];
}

/** A deep clone of a JSON document. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function cloneDocument(document) {
  return JSON.parse(JSON.stringify(document));
}

/** Every ticket in the aggregate, with its phase id attached. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function collectTickets(document) {
  const tickets = [];
  for (const phase of document?.phases ?? []) {
    for (const ticket of phase?.tickets ?? []) {
      tickets.push({ ...ticket, phaseId: ticket.phaseId ?? phase.id ?? phase.phaseId });
    }
  }
  return tickets;
}

/** The public key of one ticket. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function resolveTicketKey(ticket) {
  return ticketIdentity(ticket);
}

/** The origin kind a ticket declares, defaulting to the pre-PX-378 shape. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function resolveOrigin(ticket) {
  return ticket?.origin?.kind ?? 'derived';
}

/** One blocking finding. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function createMutationFinding(code, subject, message) {
  return { code, subject, message, layer: 'ticket-mutation', severity: 'blocking' };
}

/** Write bytes through a temporary file, then rename. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function atomicWrite(filePath, contents) {
  const temporaryPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(temporaryPath, contents);
  fs.renameSync(temporaryPath, filePath);
}

/** The bytes and digest of the current Tickets.json. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function snapshotTickets(ticketsPath) {
  const bytes = fs.readFileSync(ticketsPath);
  return {
    path: ticketsPath,
    bytes,
    digest: createHash('sha256').update(bytes).digest('hex'),
  };
}

/** Restore a snapshot byte-for-byte. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function restoreTickets(snapshot) {
  atomicWrite(snapshot.path, snapshot.bytes);
}

/** A membership map for a list of unit ids, one entry per ticket. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function countClaimsByKey(tickets, keyOf) {
  const counts = new Map();
  for (const ticket of tickets) {
    for (const key of keyOf(ticket)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/** The operation units a ticket implements. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function collectImplementedOperationUnits(ticket) {
  return (ticket?.distribution?.units ?? [])
    .filter((unit) => unit?.kind === 'operation' && unit?.obligation?.mode === 'implement')
    .map((unit) => unit.unitId);
}

/** The formula ids a ticket carries. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function collectFormulaIds(ticket) {
  return (ticket?.formulaObligations ?? [])
    .map((obligation) => (typeof obligation === 'string' ? obligation : obligation?.id))
    .filter((id) => typeof id === 'string' && id.length > 0);
}

/** The node ids a ticket claims. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function collectClaimedNodes(ticket) {
  return Array.isArray(ticket?.nodeIds) ? ticket.nodeIds : [];
}

/**
 * The ownership findings a mutation introduces.
 *
 * Only changed tickets are judged, and duplicate claims are compared with the before
 * state: a package that already carries a duplicate keeps it until the mutation touches
 * that ticket, which is the same grandfather rule the completion gate uses.
 */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function evaluateOwnership({ before, after, manifest = {}, graph = null }) {
  const beforeTickets = collectTickets(before);
  const afterTickets = collectTickets(after);
  const beforeKeys = new Set(beforeTickets.map(resolveTicketKey));
  const changedKeys = new Set([
    ...(manifest.added ?? []),
    ...(manifest.updated ?? []),
    ...afterTickets.map(resolveTicketKey).filter((key) => !beforeKeys.has(key)),
  ]);
  const graphNodes = new Set((graph?.nodes ?? []).map((node) => node.id));
  const transfers = new Map((manifest.ownershipTransfers ?? []).map((entry) => [entry.to, entry]));
  const findings = [];

  const beforeNodes = countClaimsByKey(beforeTickets, collectClaimedNodes);
  const afterNodes = countClaimsByKey(afterTickets, collectClaimedNodes);
  const beforeOperations = countClaimsByKey(beforeTickets, collectImplementedOperationUnits);
  const afterOperations = countClaimsByKey(afterTickets, collectImplementedOperationUnits);
  const beforeFormulas = countClaimsByKey(beforeTickets, collectFormulaIds);
  const afterFormulas = countClaimsByKey(afterTickets, collectFormulaIds);

  for (const ticket of afterTickets) {
    const key = resolveTicketKey(ticket);
    if (!changedKeys.has(key)) continue;
    const kind = resolveOrigin(ticket);
    const nodes = collectClaimedNodes(ticket);
    const transfer = transfers.get(key);

    if ((kind === 'resolving' || kind === 'omission') && nodes.length > 0) {
      if (transfer === undefined) {
        findings.push(createMutationFinding(
          MUTATION_CODES.OWNERSHIP_DUPLICATE,
          key,
          `${kind} ticket claims ${nodes.join(', ')} without an ownership transfer`,
        ));
      } else {
        const transferNodes = new Set(transfer.nodeIds ?? []);
        if (!nodes.every((nodeId) => transferNodes.has(nodeId))) {
          findings.push(createMutationFinding(MUTATION_CODES.TRANSFER_INVALID, key, 'the transfer does not name every claimed node'));
        }
        const source = afterTickets.find((candidate) => resolveTicketKey(candidate) === transfer.from);
        if (source !== undefined && collectClaimedNodes(source).some((nodeId) => transferNodes.has(nodeId))) {
          findings.push(createMutationFinding(MUTATION_CODES.TRANSFER_INVALID, transfer.from, 'the source ticket still claims a transferred node'));
        }
      }
    }

    for (const nodeId of nodes) {
      if (graphNodes.size > 0 && !graphNodes.has(nodeId)) {
        findings.push(createMutationFinding(MUTATION_CODES.INVENTED_UNIT, key, `node ${nodeId} is absent from the graph`));
      }
      if ((afterNodes.get(nodeId) ?? 0) > 1 && (afterNodes.get(nodeId) ?? 0) > (beforeNodes.get(nodeId) ?? 0)) {
        findings.push(createMutationFinding(MUTATION_CODES.OWNERSHIP_DUPLICATE, key, `node ${nodeId} now has ${afterNodes.get(nodeId)} claiming tickets`));
      }
    }
    for (const unitId of collectImplementedOperationUnits(ticket)) {
      if ((afterOperations.get(unitId) ?? 0) > 1 && (afterOperations.get(unitId) ?? 0) > (beforeOperations.get(unitId) ?? 0)) {
        findings.push(createMutationFinding(MUTATION_CODES.OWNERSHIP_DUPLICATE, key, `operation ${unitId} now has ${afterOperations.get(unitId)} implementing tickets`));
      }
    }
    for (const formulaId of collectFormulaIds(ticket)) {
      if ((afterFormulas.get(formulaId) ?? 0) > 1 && (afterFormulas.get(formulaId) ?? 0) > (beforeFormulas.get(formulaId) ?? 0)) {
        findings.push(createMutationFinding(MUTATION_CODES.OWNERSHIP_DUPLICATE, key, `formula ${formulaId} now has ${afterFormulas.get(formulaId)} carrying tickets`));
      }
    }
  }
  return { findings };
}

/** Run one child process and return its output, without throwing on a non-zero exit. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function runNodeProcess(script, args) {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      status: Number.isInteger(error.status) ? error.status : 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? String(error.message ?? ''),
    };
  }
}

/** Parse the JSON line a verifier prints, or return a named finding. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function readVerifierFindings(processResult, code) {
  try {
    const parsed = JSON.parse(processResult.stdout.trim().split('\n').filter(Boolean).at(-1));
    if (Array.isArray(parsed.findings)) return parsed.findings;
  } catch {
    // fall through to the named finding
  }
  return [createMutationFinding(code, 'tickets', processResult.stderr.trim().split('\n')[0] || `${code} failed`)];
}

/**
 * Verify one candidate document against the split-stage chain.
 *
 * The callback is injectable so a unit test can prove the transaction without building
 * a workspace; the default is the same chain the split command runs.
 */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function verifyMutationDocument(_document, ticketsPath, context) {
  const findings = [];
  const packageDirectory = context.packageDirectory;

  const chain = runNodeProcess(VERIFY_CHAIN, [
    '--stage=split',
    `--package=${packageDirectory}`,
    `--tickets=${ticketsPath}`,
    '--require-tickets',
  ]);
  findings.push(...readVerifierFindings(chain, 'MUTATION_CHAIN_FAILED').map((entry) => ({ ...entry, layer: 'ticket-mutation' })));

  const closure = runNodeProcess(TICKET_CLOSURE, [
    `--tickets=${ticketsPath}`,
    `--graph=${context.graphPath}`,
    ...(context.viewPath === null ? [] : [`--view=${context.viewPath}`]),
  ]);
  if (closure.status !== 0) {
    findings.push(createMutationFinding('MUTATION_CLOSURE_FAILED', 'tickets', closure.stderr.trim().split('\n')[0] || 'contract closure failed'));
  }

  const contracts = runNodeProcess(MERGE_CONTRACTS, [ticketsPath, context.graphPath, '--check']);
  if (contracts.status !== 0) {
    findings.push(createMutationFinding(MUTATION_CODES.CONTRACT_PROJECTION_PENDING, 'tickets', contracts.stderr.trim().split('\n')[0] || 'contract projection is incomplete'));
  }

  if (context.sidecarPath !== null && context.specPath !== null && fs.existsSync(context.sidecarPath)) {
    const formulas = runNodeProcess(MERGE_FORMULAS, [
      `--tickets=${ticketsPath}`,
      `--dirs-tree=${context.dirsTreePath}`,
      `--sidecar=${context.sidecarPath}`,
      `--spec=${context.specPath}`,
      ...(context.treeManifestPath === null ? [] : [`--tree-manifest=${context.treeManifestPath}`]),
    ]);
    findings.push(...readVerifierFindings(formulas, 'MUTATION_FORMULA_PROJECTION_FAILED'));
  }

  if (context.filesChanged === true && context.sidecarPath !== null) {
    const coverage = runNodeProcess(FORMULA_FILE_COVERAGE, [
      `--graph=${context.graphPath}`,
      `--dirs-tree=${context.dirsTreePath}`,
      `--sidecar=${context.sidecarPath}`,
    ]);
    findings.push(...readVerifierFindings(coverage, 'MUTATION_FORMULA_FILE_COVERAGE_FAILED'));
  }

  for (const key of [...(context.manifest.added ?? []), ...(context.manifest.updated ?? [])]) {
    const prerequisites = runNodeProcess(TICKET_PREREQUISITES, [`--ticket-key=${key}`, `--tickets=${ticketsPath}`]);
    if (prerequisites.status !== 0) {
      findings.push(createMutationFinding('MUTATION_PREREQUISITE_FAILED', key, prerequisites.stderr.trim().split('\n')[0] || 'prerequisite gate failed'));
    }
  }

  return findings;
}

/** The package-relative paths the verifier needs, or null when absent. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function buildMutationContext({ packageDirectory, manifest = {}, graphPath = null, dirsTreePath = null, specPath = null, viewPath = null, treeManifestPath = null, filesChanged = false }) {
  const directory = packageDirectory;
  const candidate = (candidatePath, name) => {
    const absolute = candidatePath ?? path.join(directory, name);
    return fs.existsSync(absolute) ? absolute : null;
  };
  return {
    packageDirectory: directory,
    manifest,
    graphPath: candidate(graphPath, 'RFC-GRAPH.json'),
    dirsTreePath: candidate(dirsTreePath, 'RFC-Dirs-Tree.json'),
    specPath: specPath === null ? null : candidate(specPath, specPath),
    viewPath: candidate(viewPath, 'SEQUENCES.json'),
    treeManifestPath: treeManifestPath === null ? null : candidate(treeManifestPath, treeManifestPath),
    sidecarPath: candidate(null, 'RFC-FORMULAS.json'),
    filesChanged,
  };
}

/** Refresh the split receipt after a promoted mutation. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function updateSplitReceipt(packageDirectory, afterDigest, manifest) {
  const statusPath = path.join(packageDirectory, STAGE_STATUS_FILES.split);
  if (!fs.existsSync(statusPath)) return { updated: false };
  let status;
  try {
    status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  } catch {
    return { updated: false };
  }
  status.lastOutputDigest = afterDigest;
  status.receipt = status.receipt ?? {
    stage: 'split',
    sourceDigest: digestFile(path.join(packageDirectory, 'RFC.md')),
    inputDigests: {},
    outputDigest: afterDigest,
    gateVerdicts: [],
    recordedAt: new Date().toISOString(),
  };
  status.receipt.outputDigest = afterDigest;
  status.receipt.mutation = { digest: afterDigest, manifest, recordedAt: new Date().toISOString() };
  atomicWrite(statusPath, `${JSON.stringify(status, null, 2)}\n`);
  return { updated: true };
}

/**
 * Run one mutation as a transaction.
 *
 * @param {{ticketsPath: string, manifest: object, afterDocument?: object,
 *   mutate?: (document: object) => object, verify?: Function, packageDirectory?: string,
 *   graphPath?: string, dirsTreePath?: string, specPath?: string, viewPath?: string,
 *   treeManifestPath?: string, filesChanged?: boolean}} input
 */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function runMutationGate(input) {
  const {
    ticketsPath,
    manifest,
    afterDocument = null,
    mutate = null,
    verify = verifyMutationDocument,
    packageDirectory = path.dirname(ticketsPath),
    filesChanged = false,
  } = input;

  if (manifest === null || typeof manifest !== 'object' || !Array.isArray(manifest.added ?? [])) {
    return {
      ok: false,
      findings: [createMutationFinding(MUTATION_CODES.MANIFEST_MISSING, 'manifest', 'manifest.added must be an array')],
      manifest: manifest ?? null,
    };
  }

  const before = snapshotTickets(ticketsPath);
  const beforeDocument = JSON.parse(before.bytes.toString('utf8'));
  const after = afterDocument ?? (mutate === null ? cloneDocument(beforeDocument) : mutate(cloneDocument(beforeDocument)));
  if (JSON.stringify(after) !== JSON.stringify(beforeDocument)) {
    writeTicketDistributionAggregate(after);
  }
  const afterBytes = Buffer.from(`${JSON.stringify(after, null, 2)}\n`, 'utf8');
  const afterDigest = createHash('sha256').update(afterBytes).digest('hex');
  const stagingPath = `${ticketsPath}.staging.${process.pid}.${Date.now()}`;
  const beforePath = `${ticketsPath}.before.${process.pid}.${Date.now()}`;
  fs.writeFileSync(stagingPath, afterBytes);
  fs.writeFileSync(beforePath, before.bytes);

  const context = buildMutationContext({
    packageDirectory,
    manifest,
    graphPath: input.graphPath,
    dirsTreePath: input.dirsTreePath,
    specPath: input.specPath,
    viewPath: input.viewPath,
    treeManifestPath: input.treeManifestPath,
    filesChanged,
  });

  const ownership = evaluateOwnership({ before: beforeDocument, after, manifest, graph: context.graphPath === null ? null : JSON.parse(fs.readFileSync(context.graphPath, 'utf8')) });
  const beforeFindings = verify(beforeDocument, beforePath, context);
  const afterFindings = verify(after, stagingPath, context);
  const newFindings = diffFindings(beforeFindings, afterFindings);
  const findings = [...ownership.findings, ...newFindings];

  if (findings.length > 0) {
    fs.rmSync(stagingPath, { force: true });
    fs.rmSync(beforePath, { force: true });
    return {
      ok: false,
      findings,
      manifest: { ...manifest, beforeDigest: before.digest, afterDigest },
    };
  }

  atomicWrite(ticketsPath, afterBytes);
  fs.rmSync(stagingPath, { force: true });
  fs.rmSync(beforePath, { force: true });
  updateSplitReceipt(packageDirectory, afterDigest, manifest);
  return {
    ok: true,
    findings: [],
    manifest: { ...manifest, beforeDigest: before.digest, afterDigest },
  };
}

module.exports = {
  MUTATION_CODES,
  collectTickets,
  atomicWrite,
  evaluateOwnership,
  buildMutationContext,
  listMutationGates,
  resolveOrigin,
  restoreTickets,
  runMutationGate,
  snapshotTickets,
  resolveTicketKey,
  updateSplitReceipt,
  verifyMutationDocument,
};
