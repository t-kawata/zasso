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
 * Tickets.json; split owns that file. A gate with findings publishes neither answer: it
 * removes the sidecar, so a displayed order is always one a gate accepted.
 */
import { existsSync, readFileSync, writeFileSync, renameSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

import {
  activeOperationIdsOf,
  checkPlacement,
  derivePackagePrecedence,
  ownersFromViewsDetailed,
  PREREQUISITE_CODES,
  rolesFromTickets,
  rolesFromView,
  ticketKeyOf,
  ticketPrerequisites,
  topologicalOrder,
} from './lib/implementation-order.mjs';
import { digestValue } from './lib/digest.mjs';
import { readDistributionMap } from '../rfc-graph/lib/unit-ids.mjs';

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
// [::TICKET::] PX-323 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-323 --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

/** Read a JSON document, or null. */
// [::TICKET::] PX-323 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-323 --for-spec --no-implementation-order`.
function readJson(filePath) {
  if (filePath === null || filePath === undefined || !existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Write a JSON document by staging it beside its target and renaming it into place. */
// [::TICKET::] PX-323 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-323 --for-spec --no-implementation-order`.
function writeJsonAtomically(filePath, value) {
  const staged = `${filePath}.partial.${process.pid}`;
  writeFileSync(staged, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(staged, filePath);
}

/** Every ticket in a Tickets.json document, in phase order. */
// [::TICKET::] PX-323 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-323 --for-spec --no-implementation-order`.
function flattenTickets(document) {
  return (document?.phases ?? []).flatMap((phase) => (phase?.tickets ?? []).map((ticket) => ({
    ...ticket,
    phaseId: ticket.phaseId ?? phase.id,
  })));
}

/** The package ids and paths the tree manifest declares. */
// [::TICKET::] PX-323 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-323 --for-spec --no-implementation-order`.
function packagesOf(treeManifest) {
  return (treeManifest?.workspace?.packages ?? []).filter((pkg) => typeof pkg?.id === 'string');
}

/** The canonical comparison form of a prerequisite array. */
// [::TICKET::] PX-323 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-323 --for-spec --no-implementation-order`.
function canonicalPrerequisites(entries) {
  return JSON.stringify((entries ?? []).slice().sort((left, right) => {
    const leftKey = `${left.ticket ?? left.package ?? ''}|${left.kind ?? ''}|${left.source ?? ''}`;
    const rightKey = `${right.ticket ?? right.package ?? ''}|${right.kind ?? ''}|${right.source ?? ''}`;
    return leftKey.localeCompare(rightKey);
  }));
}

/** The implementation levels as a package → level index map. */
// [::TICKET::] PX-323 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-323 --for-spec --no-implementation-order`.
function levelIndex(levels) {
  const index = new Map();
  (levels ?? []).forEach((level, position) => {
    for (const packageId of level) index.set(packageId, position);
  });
  return index;
}

/** The unit ids a package directory's distribution map declares as residuals. */
// [::TICKET::] PX-328 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-328 --for-spec --no-implementation-order`.
function residualUnitsForDirectory(directory) {
  const residuals = new Set();
  const rfcPath = join(directory, 'RFC.md');
  if (!existsSync(rfcPath)) return residuals;
  try {
    const map = readDistributionMap(readFileSync(rfcPath, 'utf8'));
    for (const residual of map?.residuals ?? []) {
      if (typeof residual?.unit === 'string' && residual.unit.length > 0) residuals.add(residual.unit);
    }
  } catch {
    return residuals;
  }
  return residuals;
}

/** The residual units a workspace declares across every readable package. */
// [::TICKET::] PX-328 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-328 --for-spec --no-implementation-order`.
function residualUnitsForWorkspace({ workspaceRoot, treeManifest }) {
  const residuals = new Set();
  if (workspaceRoot === null || workspaceRoot === undefined) return residuals;
  for (const pkg of packagesOf(treeManifest)) {
    for (const unitId of residualUnitsForDirectory(join(workspaceRoot, pkg.path))) residuals.add(unitId);
  }
  return residuals;
}

/** The role each operation carries in one package, from its ledger, tickets and view. */
// [::TICKET::] PX-325 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-325 --for-spec --no-implementation-order`.
function rolesForPackage({ workspaceRoot, pkg, ticketsDocument }) {
  // The ledger is authoritative over the view candidate; the ticket unit is the most
  // concrete record of what split will implement, so it is applied last.
  const roles = rolesFromView(readJson(join(workspaceRoot, pkg.path, 'SEQUENCES.json')), new Map());
  const rfcPath = join(workspaceRoot, pkg.path, 'RFC.md');
  if (existsSync(rfcPath)) {
    const map = readDistributionMap(readFileSync(rfcPath, 'utf8'));
    for (const unit of map?.units ?? []) {
      if (unit?.role === 'implementer' || unit?.role === 'consumer') roles.set(unit.unitId, unit.role);
    }
  }
  rolesFromTickets(flattenTickets(ticketsDocument), roles);
  return roles;
}

/** Build the operation → implementer index from every readable package view. */
// [::TICKET::] PX-323, PX-325 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-325 --for-spec --no-implementation-order`.
// [::TICKET::] PX-325, PX-328 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-325|PX-328) --for-spec --no-implementation-order`.
function ownersFromWorkspace({ workspaceRoot, treeManifest, views = null, roles = null, activeOperationIds = null }) {
  const packages = packagesOf(treeManifest);
  const loadedViews = views ?? Object.fromEntries(
    packages.map((pkg) => [pkg.id, readJson(join(workspaceRoot, pkg.path, 'SEQUENCES.json'))]),
  );
  const loadedRoles = roles ?? Object.fromEntries(
    packages.map((pkg) => [pkg.id, rolesForPackage({
      workspaceRoot,
      pkg,
      ticketsDocument: readJson(join(workspaceRoot, pkg.path, 'Tickets.json')),
    })]),
  );
  return ownersFromViewsDetailed({ packages, views: loadedViews, roles: loadedRoles, activeOperationIds });
}

/** The derived package order for one workspace. */
// [::TICKET::] PX-323, PX-328 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-323|PX-328) --for-spec --no-implementation-order`.
function deriveWorkspaceOrder(context) {
  const { treeManifest, artifact, registry, operationOwners, activeOperationIds = null } = context;
  const packageIds = packagesOf(treeManifest).map((pkg) => pkg.id);
  const precedence = derivePackagePrecedence({ treeManifest, registry, artifact, operationOwners, activeOperationIds });
  const order = topologicalOrder({
    nodes: packageIds,
    edges: precedence.edges.map((edge) => ({ from: edge.fromPackage, to: edge.toPackage, source: edge.source })),
  });
  return { order, edges: precedence.edges, findings: [...precedence.findings, ...order.findings] };
}

/** The digests that bind a sidecar to the documents it was derived from. */
// [::TICKET::] PX-325 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-325 --for-spec --no-implementation-order`.
function sourceDigestsOf({ artifact = null, views = {}, graph = undefined, registry = [], treeManifest = null }) {
  return {
    artifact: artifact === null || artifact === undefined ? null : digestValue(artifact),
    views: Object.fromEntries(Object.entries(views ?? {}).map(([packageId, view]) => [
      packageId,
      view === null || view === undefined ? null : digestValue(view),
    ])),
    ...(graph === undefined ? {} : { graph: graph === null ? null : digestValue(graph) }),
    registry: digestValue(registry ?? []),
    treeManifest: treeManifest === null || treeManifest === undefined ? null : digestValue(treeManifest),
  };
}

/** Whether a recorded digest set still names the current documents. */
// [::TICKET::] PX-325 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-325 --for-spec --no-implementation-order`.
function sameSourceDigests(current, stored) {
  if (stored === null || stored === undefined) return false;
  if (current.artifact !== (stored.artifact ?? null)) return false;
  if (current.graph !== undefined && current.graph !== (stored.graph ?? null)) return false;
  if (current.registry !== stored.registry) return false;
  if (current.treeManifest !== (stored.treeManifest ?? null)) return false;
  const currentIds = Object.keys(current.views ?? {});
  const storedIds = Object.keys(stored.views ?? {});
  if (currentIds.length !== storedIds.length) return false;
  return currentIds.every((id) => current.views[id] === stored.views[id]);
}

/** The package order sidecar contents. */
// [::TICKET::] PX-323, PX-325 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-323|PX-325) --for-spec --no-implementation-order`.
function workspaceSidecar(input) {
  const { order, edges, allocateManifest, artifact, views, treeManifest } = input;
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
    sourceDigests: sourceDigestsOf({
      artifact,
      views,
      registry: allocateManifest?.contract_registry ?? [],
      treeManifest,
    }),
  };
}

/**
 * The prerequisite findings a package's recorded tickets must satisfy.
 *
 * The workspace gate and the package gate must apply one rule: an empty or edited
 * prerequisites array is not a satisfied prerequisite. This helper re-derives the set
 * with the same owner table and comparison the package gate uses, so the two layers
 * cannot disagree about whether a workspace is ready.
 *
 * @param {{ workspaceRoot: string, pkg: object, view: object, graph: object,
 *   document: object, artifact: object, registry: Array<object>, treeManifest: object }} packageDerivationInput
 * @returns {Array<object>} the named findings this package contributes
 */
// [::TICKET::] PX-327, PX-328 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-327|PX-328) --for-spec --no-implementation-order`.
function packagePrerequisiteFindings(packageDerivationInput) {
  const { workspaceRoot, pkg, view, graph, document, artifact, registry, treeManifest } = packageDerivationInput;
  const residualUnitIds = packageDerivationInput.residualUnitIds ?? new Set();
  const tickets = flattenTickets(document);
  const activeOperationIds = activeOperationIdsOf(artifact, { residualUnitIds });
  const operationOwners = buildOperationOwners({ view, workspaceRoot, tickets, activeOperationIds });
  const derivation = ticketPrerequisites({
    tickets,
    graph,
    artifact,
    operationOwners,
    registry,
    packageId: view.packageId ?? pkg.id,
    treeManifest,
    activeOperationIds,
  });
  const findings = [...derivation.findings];
  for (const ticket of tickets) {
    const expected = derivation.prerequisites.get(ticketKeyOf(ticket)) ?? [];
    const actual = Array.isArray(ticket.prerequisites) ? ticket.prerequisites : [];
    if (canonicalPrerequisites(expected) !== canonicalPrerequisites(actual)) {
      findings.push({
        code: PREREQUISITE_CODES.PREREQUISITE_SET_MISMATCH,
        subject: ticketKeyOf(ticket),
        message: `ticket ${ticketKeyOf(ticket)} carries ${actual.length} prerequisite(s) and the graph/artifact derive ${expected.length}`,
      });
    }
  }
  return findings;
}

/**
 * Retract a sidecar whose verdict failed.
 *
 * The sidecar is the display's source of truth. Leaving the previous answer in place
 * after a failed run would let /workspacify-order print an order this gate just
 * rejected, so the failed verdict removes it rather than writing a second answer.
 */
// [::TICKET::] PX-327, PX-328 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-327|PX-328) --for-spec --no-implementation-order`.
function removeSidecar(filePath) {
  if (existsSync(filePath)) rmSync(filePath, { force: true });
}

/** Run the workspace gate. */
// [::TICKET::] PX-323, PX-325, PX-327, PX-328 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-323|PX-325|PX-327|PX-328) --for-spec --no-implementation-order`.
// [::TICKET::] PX-330 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-330 --for-spec --no-implementation-order`.
function verifyWorkspace({ workspaceRoot, write }) {
  const treeManifest = readJson(join(workspaceRoot, TREE_MANIFEST_FILE_NAME));
  const allocateManifest = readJson(join(workspaceRoot, ALLOCATE_MANIFEST_FILE_NAME));
  if (treeManifest === null || allocateManifest === null) {
    return { code: EXIT_FAILURE, findings: [{ code: 'MISSING_WORKSPACE_MANIFEST', subject: workspaceRoot, message: 'the workspace root must hold both manifests' }] };
  }
  const artifact = readJson(findSingleSiblingPath(workspaceRoot, '-sequences.json'));
  const registry = allocateManifest.contract_registry ?? [];
  const views = Object.fromEntries(packagesOf(treeManifest).map((pkg) => [pkg.id, readJson(join(workspaceRoot, pkg.path, 'SEQUENCES.json'))]));
  const residualUnitIds = residualUnitsForWorkspace({ workspaceRoot, treeManifest });
  const activeOperationIds = activeOperationIdsOf(artifact, { residualUnitIds });
  const operationOwnersResult = ownersFromWorkspace({ workspaceRoot, treeManifest, views, activeOperationIds });
  const operationOwners = operationOwnersResult.owners;
  const { order, edges, findings: orderFindings } = deriveWorkspaceOrder({ workspaceRoot, treeManifest, allocateManifest, artifact, registry, operationOwners, activeOperationIds });
  const findings = [...operationOwnersResult.findings, ...orderFindings];

  const hasDistribution = artifact !== null
    && ((artifact.sequences?.length ?? 0) > 0
      || (artifact.steps?.length ?? 0) > 0
      || (artifact.operations?.length ?? 0) > 0);
  if (hasDistribution) {
    for (const pkg of packagesOf(treeManifest)) {
      if (views[pkg.id] === null) {
        findings.push({
          code: PREREQUISITE_CODES.MISSING_PACKAGE_VIEW,
          subject: pkg.id,
          message: `package ${pkg.id} has no SEQUENCES.json while the workspace artifact declares a distribution`,
        });
      }
    }
  }

  const packageTickets = Object.fromEntries(packagesOf(treeManifest).map((pkg) => [pkg.id, readJson(join(workspaceRoot, pkg.path, 'Tickets.json'))]));
  // The placement check trusts the array the ticket carries. Re-derive it first, with
  // the same rule the package gate applies, so an empty or edited field cannot pass the
  // workspace gate while the package gate would reject the same workspace.
  for (const pkg of packagesOf(treeManifest)) {
    const document = packageTickets[pkg.id];
    const view = views[pkg.id];
    if (document === null || view === null) continue;
    const graph = readJson(findSingleSiblingPath(join(workspaceRoot, pkg.path), '-GRAPH.json'));
    if (graph === null) {
      // The package gate refuses this state; the workspace gate must not trust the
      // ticket's prerequisite array in the same state and pass where the other fails.
      if (hasDistribution) {
        findings.push({
          code: 'MISSING_DISTRIBUTION_LAYER',
          subject: pkg.id,
          message: `package ${pkg.id} has a view and the workspace artifact declares a distribution, but its GRAPH.json is missing`,
        });
      }
      continue;
    }
    findings.push(...packagePrerequisiteFindings({
      workspaceRoot,
      pkg,
      view,
      graph,
      document,
      artifact,
      registry,
      treeManifest,
      residualUnitIds,
    }));
  }
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
    const sidecarPath = join(workspaceRoot, WORKSPACE_IMPLEMENTATION_ORDER_FILE_NAME);
    if (findings.length === 0) {
      writeJsonAtomically(sidecarPath, workspaceSidecar({
        order,
        edges,
        allocateManifest,
        artifact,
        views,
        treeManifest,
      }));
    } else {
      // A failed verdict publishes no order; see removeSidecar for the display contract.
      removeSidecar(sidecarPath);
    }
  }
  return { code: findings.length === 0 ? EXIT_OK : EXIT_FAILURE, findings, order, edges };
}

/** Run the package gate. */
// [::TICKET::] PX-323, PX-325, PX-327, PX-328 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-323|PX-325|PX-327|PX-328) --for-spec --no-implementation-order`.
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

  const hasDistribution = artifact !== null
    && ((artifact.sequences?.length ?? 0) > 0
      || (artifact.steps?.length ?? 0) > 0
      || (artifact.operations?.length ?? 0) > 0
      || (graph?.nodes ?? []).some((node) => (node.unitIds ?? []).length > 0));
  if (view === null || graph === null) {
    if (!hasDistribution) {
      // A package without a distribution keeps the old shape; the gate is a skip.
      return { code: EXIT_OK, findings: [], skipped: 'no-distribution' };
    }
    const findings = [];
    if (view === null) {
      findings.push({ code: PREREQUISITE_CODES.MISSING_PACKAGE_VIEW, subject: packageDir, message: 'the workspace artifact declares a distribution but this package has no SEQUENCES.json' });
    }
    if (graph === null) {
      findings.push({ code: 'MISSING_DISTRIBUTION_LAYER', subject: packageDir, message: 'the workspace artifact declares a distribution but this package has no GRAPH.json' });
    }
    return { code: EXIT_FAILURE, findings };
  }

  const residualUnitIds = workspaceRoot === null
    ? residualUnitsForDirectory(packageDir)
    : residualUnitsForWorkspace({ workspaceRoot, treeManifest });
  const activeOperationIds = activeOperationIdsOf(artifact, { residualUnitIds });
  const operationOwners = buildOperationOwners({ view, workspaceRoot, tickets, activeOperationIds });
  const derivation = ticketPrerequisites({
    tickets,
    graph,
    artifact,
    operationOwners,
    registry,
    packageId: view.packageId,
    treeManifest,
    activeOperationIds,
  });
  const prerequisites = derivation.prerequisites;
  const attached = tickets.map((ticket) => ({
    ...ticket,
    prerequisites: prerequisites.get(ticketKeyOf(ticket)) ?? [],
  }));

  const packages = packagesOf(treeManifest);
  const workspaceOwnersResult = workspaceRoot === null
    ? { owners: operationOwners, findings: [] }
    : ownersFromWorkspace({ workspaceRoot, treeManifest, activeOperationIds });
  const workspaceOrder = deriveWorkspaceOrder({
    workspaceRoot,
    treeManifest,
    allocateManifest,
    artifact,
    registry,
    operationOwners: workspaceOwnersResult.owners,
    activeOperationIds,
  });
  const order = workspaceOrder.order;
  const findings = [...derivation.findings, ...workspaceOwnersResult.findings, ...workspaceOrder.findings];
  if (!write) {
    const existingSidecar = readJson(join(packageDir, IMPLEMENTATION_ORDER_FILE_NAME));
    if (existingSidecar?.sourceDigests !== undefined) {
      const currentDigests = sourceDigestsOf({
        artifact,
        views: { [view.packageId]: view },
        graph,
        registry,
        treeManifest,
      });
      if (!sameSourceDigests(currentDigests, existingSidecar.sourceDigests)) {
        findings.push({
          code: PREREQUISITE_CODES.STALE_IMPLEMENTATION_ORDER,
          subject: packageDir,
          message: 'the package implementation-order sidecar no longer matches the artifact, view, graph, registry or tree manifest',
        });
      }
    }
  }
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
    const sidecarPath = join(packageDir, IMPLEMENTATION_ORDER_FILE_NAME);
    if (findings.length === 0) {
      writeJsonAtomically(sidecarPath, {
        schemaVersion: 1,
        packageId: view.packageId,
        buildOrder: allocateManifest?.implementation_order ?? { serial: [], levels: [] },
        implementationOrder: { serial: order.serial, levels: order.levels },
        tickets: attached.map((ticket) => ({ ticket: ticketKeyOf(ticket), prerequisites: ticket.prerequisites })),
        sourceDigests: sourceDigestsOf({
          artifact,
          views: { [view.packageId]: view },
          graph,
          registry,
          treeManifest,
        }),
      });
    } else {
      // A failed verdict publishes no order; see removeSidecar for the display contract.
      removeSidecar(sidecarPath);
    }
  }
  return { code: findings.length === 0 ? EXIT_OK : EXIT_FAILURE, findings, order };
}

/** The CLI entry point. */
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
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
    // No path argument means the invocation directory is the package under test.
    result = verifyPackage({ packageDir: resolve('.'), write });
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
