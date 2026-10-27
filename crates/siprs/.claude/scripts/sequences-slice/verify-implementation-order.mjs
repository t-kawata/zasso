#!/usr/bin/env node
/**
 * verify-implementation-order.mjs — prove the order the pipeline uses is safe to implement.
 *
 * The build order (the stage-1 tree DAG) is preserved. The implementation order is the
 * topological order of the union of the build edges and the artifact-derived sequence and
 * boundary prerequisites. A package or ticket placed before something it needs is a named
 * failure, never a silent assumption.
 *
 * Usage:
 *   node verify-implementation-order.mjs --package=<dir> [--write]
 *   node verify-implementation-order.mjs --workspace=<root> [--write]
 *
 * The package gate writes IMPLEMENTATION-ORDER.json beside Tickets.json. The workspace gate
 * writes WORKSPACIFY-IMPLEMENTATION-ORDER.json at the workspace root. Neither writes
 * Tickets.json; split owns that file.
 */
import { existsSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

import {
  checkPlacement,
  derivePackagePrecedence,
  PREREQUISITE_CODES,
  ticketKeyOf,
  ticketPrerequisites,
  topologicalOrder,
} from './lib/implementation-order.mjs';
import { digestValue } from './lib/digest.mjs';

const require = createRequire(import.meta.url);
const { findAllocateManifest, findSingleSiblingPath } = require('../lib/package-artifacts');
const { buildOperationOwners } = require('../tickets/add-tickets-for-phase.js');

const EXIT_OK = 0;
const EXIT_FAILURE = 1;

const IMPLEMENTATION_ORDER_FILE_NAME = 'IMPLEMENTATION-ORDER.json';
const WORKSPACE_IMPLEMENTATION_ORDER_FILE_NAME = 'WORKSPACIFY-IMPLEMENTATION-ORDER.json';
const TREE_MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
const ALLOCATE_MANIFEST_FILE_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';

/** Parse `--name=value` or `--name value`. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

/** Read a JSON document, or null. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function readJson(filePath) {
  if (filePath === null || filePath === undefined || !existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Write a JSON document by staging it beside its target and renaming it into place. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function writeJsonAtomically(filePath, value) {
  const staged = `${filePath}.partial.${process.pid}`;
  writeFileSync(staged, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(staged, filePath);
}

/** Every ticket in a Tickets.json document, in phase order. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function flattenTickets(document) {
  return (document?.phases ?? []).flatMap((phase) => (phase?.tickets ?? []).map((ticket) => ({
    ...ticket,
    phaseId: ticket.phaseId ?? phase.id,
  })));
}

/** The package ids and paths the tree manifest declares. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function packagesOf(treeManifest) {
  return (treeManifest?.workspace?.packages ?? []).filter((pkg) => typeof pkg?.id === 'string');
}

/** The canonical comparison form of a prerequisite array. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function canonicalPrerequisites(entries) {
  return JSON.stringify((entries ?? []).slice().sort((left, right) => {
    const leftKey = `${left.ticket ?? left.package ?? ''}|${left.kind ?? ''}|${left.source ?? ''}`;
    const rightKey = `${right.ticket ?? right.package ?? ''}|${right.kind ?? ''}|${right.source ?? ''}`;
    return leftKey.localeCompare(rightKey);
  }));
}

/** The implementation levels as a package → level index map. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function levelIndex(levels) {
  const index = new Map();
  (levels ?? []).forEach((level, position) => {
    for (const packageId of level) index.set(packageId, position);
  });
  return index;
}

/** Build the operation → package index from every readable package view. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function ownersFromWorkspace({ workspaceRoot, treeManifest }) {
  const owners = new Map();
  for (const pkg of packagesOf(treeManifest)) {
    const view = readJson(join(workspaceRoot, pkg.path, 'SEQUENCES.json'));
    for (const unit of view?.ownedOperationUnits ?? []) {
      const operationId = unit?.operationId;
      if (typeof operationId !== 'string') continue;
      const existing = owners.get(operationId);
      if (existing === undefined) owners.set(operationId, { packageId: pkg.id });
      else if (existing.packageId !== pkg.id) owners.set(operationId, { packageId: pkg.id, ambiguous: true });
    }
    for (const unit of view?.obligationUnits ?? []) {
      if (typeof unit?.unitId !== 'string' || !unit.unitId.startsWith('op-')) continue;
      const operationId = unit.unitId.slice(3);
      const existing = owners.get(operationId);
      if (existing === undefined) owners.set(operationId, { packageId: pkg.id });
      else if (existing.packageId !== pkg.id) owners.set(operationId, { packageId: pkg.id, ambiguous: true });
    }
  }
  return owners;
}

/** The derived package order for one workspace. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function deriveWorkspaceOrder(context) {
  const { treeManifest, artifact, registry, operationOwners } = context;
  const packageIds = packagesOf(treeManifest).map((pkg) => pkg.id);
  const { edges } = derivePackagePrecedence({ treeManifest, registry, artifact, operationOwners });
  const order = topologicalOrder({
    nodes: packageIds,
    edges: edges.map((edge) => ({ from: edge.fromPackage, to: edge.toPackage, source: edge.source })),
  });
  return { order, edges };
}

/** The package order sidecar contents. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function workspaceSidecar({ order, edges, allocateManifest, artifact, views }) {
  return {
    schemaVersion: 1,
    buildOrder: allocateManifest?.implementation_order ?? { serial: [], levels: [] },
    implementationOrder: { serial: order.serial, levels: order.levels },
    prerequisites: edges.map((edge) => ({
      from: edge.fromPackage,
      to: edge.toPackage,
      kind: edge.kind,
      source: edge.source,
      ...(edge.boundaryId === undefined || edge.boundaryId === null ? {} : { boundary: edge.boundaryId }),
    })),
    sourceDigests: {
      artifact: artifact === null ? null : digestValue(artifact),
      views: Object.fromEntries(Object.entries(views).map(([packageId, view]) => [packageId, view === null ? null : digestValue(view)])),
    },
  };
}

/** Run the workspace gate. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function verifyWorkspace({ workspaceRoot, write }) {
  const treeManifest = readJson(join(workspaceRoot, TREE_MANIFEST_FILE_NAME));
  const allocateManifest = readJson(join(workspaceRoot, ALLOCATE_MANIFEST_FILE_NAME));
  if (treeManifest === null || allocateManifest === null) {
    return { code: EXIT_FAILURE, findings: [{ code: 'MISSING_WORKSPACE_MANIFEST', subject: workspaceRoot, message: 'the workspace root must hold both manifests' }] };
  }
  const artifact = readJson(findSingleSiblingPath(workspaceRoot, '-sequences.json'));
  const registry = allocateManifest.contract_registry ?? [];
  const views = Object.fromEntries(packagesOf(treeManifest).map((pkg) => [pkg.id, readJson(join(workspaceRoot, pkg.path, 'SEQUENCES.json'))]));
  const operationOwners = ownersFromWorkspace({ workspaceRoot, treeManifest });
  const { order, edges } = deriveWorkspaceOrder({ workspaceRoot, treeManifest, allocateManifest, artifact, registry, operationOwners });
  const findings = [...order.findings];

  const packageTickets = Object.fromEntries(packagesOf(treeManifest).map((pkg) => [pkg.id, readJson(join(workspaceRoot, pkg.path, 'Tickets.json'))]));
  const orderIndex = levelIndex(order.levels);
  for (const pkg of packagesOf(treeManifest)) {
    const document = packageTickets[pkg.id];
    if (document === null) continue;
    const placement = checkPlacement({
      tickets: flattenTickets(document),
      packageId: pkg.id,
      packageOrder: Object.fromEntries(orderIndex),
      packageTickets,
    });
    findings.push(...placement.findings);
  }

  if (write) {
    writeJsonAtomically(join(workspaceRoot, WORKSPACE_IMPLEMENTATION_ORDER_FILE_NAME), workspaceSidecar({
      order,
      edges,
      allocateManifest,
      artifact,
      views,
    }));
  }
  return { code: findings.length === 0 ? EXIT_OK : EXIT_FAILURE, findings, order, edges };
}

/** Run the package gate. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function verifyPackage({ packageDir, write }) {
  const ticketsPath = join(packageDir, 'Tickets.json');
  const document = readJson(ticketsPath);
  if (document === null) return { code: EXIT_FAILURE, findings: [{ code: 'MISSING_TICKETS', subject: ticketsPath, message: 'Tickets.json is not readable' }] };
  const graphPath = findSingleSiblingPath(packageDir, '-GRAPH.json');
  const graph = readJson(graphPath);
  const view = readJson(join(packageDir, 'SEQUENCES.json'));
  const allocatePath = findAllocateManifest(packageDir);
  const workspaceRoot = allocatePath === null ? null : dirname(allocatePath);
  const allocateManifest = readJson(allocatePath);
  const treeManifest = workspaceRoot === null ? null : readJson(join(workspaceRoot, TREE_MANIFEST_FILE_NAME));
  const artifact = workspaceRoot === null ? null : readJson(findSingleSiblingPath(workspaceRoot, '-sequences.json'));
  const registry = allocateManifest?.contract_registry ?? [];
  const tickets = flattenTickets(document);

  if (view === null || graph === null) {
    // A package without a distribution keeps the old shape; the gate is a skip.
    return { code: EXIT_OK, findings: [], skipped: 'no-distribution' };
  }

  const operationOwners = buildOperationOwners({ view, workspaceRoot, tickets });
  const { prerequisites } = ticketPrerequisites({ tickets, graph, artifact, operationOwners, registry, packageId: view.packageId });
  const attached = tickets.map((ticket) => ({
    ...ticket,
    prerequisites: prerequisites.get(ticketKeyOf(ticket)) ?? [],
  }));

  const packages = packagesOf(treeManifest);
  const workspaceOwners = workspaceRoot === null ? operationOwners : ownersFromWorkspace({ workspaceRoot, treeManifest });
  const { order } = deriveWorkspaceOrder({ workspaceRoot, treeManifest, allocateManifest, artifact, registry, operationOwners: workspaceOwners });
  const findings = [...order.findings];
  for (const ticket of tickets) {
    const derived = prerequisites.get(ticketKeyOf(ticket)) ?? [];
    const actual = Array.isArray(ticket.prerequisites) ? ticket.prerequisites : [];
    if (canonicalPrerequisites(derived) !== canonicalPrerequisites(actual)) {
      findings.push({
        code: PREREQUISITE_CODES.PREREQUISITE_SET_MISMATCH,
        subject: ticketKeyOf(ticket),
        message: `ticket ${ticketKeyOf(ticket)} carries ${actual.length} prerequisite(s) and the graph/artifact derive ${derived.length}`,
      });
    }
  }
  const packageTickets = workspaceRoot === null
    ? {}
    : Object.fromEntries(packages.map((pkg) => [pkg.id, readJson(join(workspaceRoot, pkg.path, 'Tickets.json'))]));
  const placement = checkPlacement({
    tickets: attached,
    packageId: view.packageId,
    packageOrder: Object.fromEntries(levelIndex(order.levels)),
    packageTickets,
  });
  findings.push(...placement.findings);

  if (write) {
    writeJsonAtomically(join(packageDir, IMPLEMENTATION_ORDER_FILE_NAME), {
      schemaVersion: 1,
      packageId: view.packageId,
      buildOrder: allocateManifest?.implementation_order ?? { serial: [], levels: [] },
      implementationOrder: { serial: order.serial, levels: order.levels },
      tickets: attached.map((ticket) => ({ ticket: ticketKeyOf(ticket), prerequisites: ticket.prerequisites })),
    });
  }
  return { code: findings.length === 0 ? EXIT_OK : EXIT_FAILURE, findings, order };
}

/** The CLI entry point. */
export function main(argv = process.argv.slice(2)) {
  const write = argv.includes('--write');
  const workspaceArg = argumentFor(argv, 'workspace');
  const packageArg = argumentFor(argv, 'package');
  let result;
  if (workspaceArg !== null && workspaceArg !== '') {
    result = verifyWorkspace({ workspaceRoot: resolve(workspaceArg), write });
  } else if (packageArg !== null && packageArg !== '') {
    result = verifyPackage({ packageDir: resolve(packageArg), write });
  } else {
    console.error('[ERROR] MISSING_ARGUMENT: --package=<dir> or --workspace=<root> is required');
    console.error('Cause: the gate needs one layer to check');
    console.error('Action: pass --package=<dir> for the ticket order or --workspace=<root> for the package order');
    return 2;
  }
  for (const entry of result.findings ?? []) {
    console.error(`${entry.code}: ${entry.subject ?? ''} ${entry.message}`);
  }
  if (result.code === EXIT_OK && result.skipped !== undefined) {
    process.stdout.write(`${JSON.stringify({ ok: true, skipped: result.skipped })}\n`);
    return EXIT_OK;
  }
  process.stdout.write(`${JSON.stringify({ ok: result.code === EXIT_OK, findings: result.findings ?? [] })}\n`);
  return result.code;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}

export { deriveWorkspaceOrder, flattenTickets, levelIndex, packagesOf, readJson, verifyPackage, verifyWorkspace };
