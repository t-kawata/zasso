// workspace.ts — the 5-layer entry gate and the package model.
//
// conver runs at a workspacify workspace root. Before any ACP session starts,
// this module proves three things: the root owns the three workspacify
// manifests, the order tool accepts the published implementation order, and
// every package directory carries its own Tickets.json. The returned package
// list is in the exact order run.mjs displays, so the loop never invents one.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { resolveStageGate } from "./stage-plan.js";
import type { StageName, StagePlan } from "./stage-plan.js";

export const TREE_MANIFEST = "WORKSPACIFY-TREE-MANIFEST.json";
export const ALLOCATE_MANIFEST = "WORKSPACIFY-ALLOCATE-MANIFEST.json";
export const ORDER_MANIFEST = "WORKSPACIFY-IMPLEMENTATION-ORDER.json";
export const ORDER_TOOL = ".claude/scripts/workspacify-order/run.mjs";

/**
 * The fixed specification the forward workspacify and educe stages read.
 *
 * The path is always this name in the workspace root; the stage command does not
 * take a specification argument, so the same workspace cannot be processed under
 * two different specs by two different invocations.
 */
export const SYSTEM_DESIGN_FILE_NAME = "SYSTEM-DESIGN.md";

const ROOT_MANIFESTS = [TREE_MANIFEST, ALLOCATE_MANIFEST, ORDER_MANIFEST] as const;
const COMPLETE_STATUS = "COMPLETE";

/** A named gate failure. The code is part of the operator-facing contract. */
// [::TICKET::] PX-403, PX-404, PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-454) --for-spec --no-implementation-order`.
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export type WorkspaceGateCode =
  | "NOT_WORKSPACE_ROOT"
  | "MISSING_MANIFEST"
  | "MISSING_SYSTEM_DESIGN"
  | "INCOMPLETE_MANIFEST"
  | "ORDER_TOOL_FAILED"
  | "ORDER_MISMATCH"
  | "MISSING_TICKETS";

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export class WorkspaceGateError extends Error {
  constructor(
    readonly code: WorkspaceGateCode,
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "WorkspaceGateError";
  }
}

/** One package directory in implementation order. */
// [::TICKET::] PX-403, PX-404, PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-454) --for-spec --no-implementation-order`.
export interface WorkspacePackage {
  id: string;
  name: string;
  /** Path relative to the workspace root; "." for the root package. */
  path: string;
  /** Absolute package directory. */
  directory: string;
  /** Absolute path to the package Tickets.json. */
  ticketsPath: string;
  /** False only when the stage-one manifest explicitly says the package has no seed. */
  seedRequired?: boolean;
}

/** The validated workspace and its packages in implementation order. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface WorkspaceModel {
  root: string;
  name: string;
  packages: WorkspacePackage[];
}

/** File-system and order-tool seam, injected by tests. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface WorkspaceIo {
  readJson(file: string): unknown;
  exists(file: string): boolean;
  runOrderTool(root: string): { status: number | null; stderr: string };
}

const nodeIo: WorkspaceIo = {
  readJson(file: string): unknown {
    return JSON.parse(readFileSync(file, "utf8")) as unknown;
  },
  exists(file: string): boolean {
    return existsSync(file);
  },
  runOrderTool(root: string): { status: number | null; stderr: string } {
    const result = spawnSync(process.execPath, [path.join(root, ORDER_TOOL)], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: result.status, stderr: result.stderr ?? "" };
  },
};

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function hasRootManifests(directory: string, io: Pick<WorkspaceIo, "exists">): boolean {
  return ROOT_MANIFESTS.every((name) => io.exists(path.join(directory, name)));
}

/**
 * Resolve the workspace root from the current directory.
 *
 * Running inside a package directory is refused rather than silently walking
 * up: the user explicitly asked for workspace-root execution, and an implicit
 * parent search would make the same command process a different tree.
 */
export function resolveWorkspaceRoot(
  cwd: string,
  io: Pick<WorkspaceIo, "exists"> = nodeIo,
): string {
  const resolved = path.resolve(cwd);
  if (hasRootManifests(resolved, io)) return resolved;

  let ancestor = path.dirname(resolved);
  while (ancestor !== path.dirname(ancestor)) {
    if (hasRootManifests(ancestor, io)) {
      throw new WorkspaceGateError(
        "NOT_WORKSPACE_ROOT",
        `run conver from the workspace root ${ancestor}, not from ${resolved}`,
        [ancestor],
      );
    }
    ancestor = path.dirname(ancestor);
  }
  throw new WorkspaceGateError(
    "MISSING_MANIFEST",
    `workspace root manifests are missing from ${resolved}: ${ROOT_MANIFESTS.join(", ")}`,
  );
}

/** Run the workspace's own order tool and require a zero exit. */
export function validateImplementationOrder(
  root: string,
  io: Pick<WorkspaceIo, "runOrderTool"> = nodeIo,
): void {
  const result = io.runOrderTool(root);
  if (result.status !== 0) {
    const detail = result.stderr.trim().split("\n")[0] ?? "";
    throw new WorkspaceGateError(
      "ORDER_TOOL_FAILED",
      `workspacify-order refused the workspace order${detail === "" ? "" : `: ${detail}`}`,
      detail === "" ? [] : [detail],
    );
  }
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkspaceGateError("INCOMPLETE_MANIFEST", `${label} is not an object`);
  }
  return value as Record<string, unknown>;
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function asCompleteManifest(value: unknown, label: string): Record<string, unknown> {
  const record = asRecord(value, label);
  if (record.status !== COMPLETE_STATUS) {
    throw new WorkspaceGateError(
      "INCOMPLETE_MANIFEST",
      `${label} status is ${String(record.status)}, expected ${COMPLETE_STATUS}`,
    );
  }
  return record;
}

// [::TICKET::] PX-403, PX-404, PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-454) --for-spec --no-implementation-order`.
interface PackageManifestEntry {
  id: string;
  name: string;
  path: string;
  /** Absent means required; only an explicit false excludes seed authoring. */
  seedRequired: boolean;
}

// [::TICKET::] PX-403, PX-404, PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-454) --for-spec --no-implementation-order`.
function readPackages(tree: Record<string, unknown>): PackageManifestEntry[] {
  const workspace = asRecord(tree.workspace, "workspace");
  const rawPackages = workspace.packages;
  if (!Array.isArray(rawPackages)) {
    throw new WorkspaceGateError("INCOMPLETE_MANIFEST", "workspace.packages is not an array");
  }
  return rawPackages.map((entry, index) => {
    const record = asRecord(entry, `workspace.packages[${index}]`);
    if (typeof record.id !== "string" || typeof record.name !== "string" || typeof record.path !== "string") {
      throw new WorkspaceGateError(
        "INCOMPLETE_MANIFEST",
        `workspace.packages[${index}] lacks id, name or path`,
      );
    }
    return {
      id: record.id,
      name: record.name,
      path: record.path,
      seedRequired: record.seed_required !== false,
    };
  });
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function readOrderLevels(order: Record<string, unknown>): string[][] {
  const implementationOrder = asRecord(order.implementationOrder, "implementationOrder");
  const levels = implementationOrder.levels;
  if (!Array.isArray(levels) || levels.some((level) => !Array.isArray(level))) {
    throw new WorkspaceGateError(
      "ORDER_MISMATCH",
      "implementationOrder.levels must be an array of arrays",
    );
  }
  return levels as string[][];
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function assertOrderMatchesPackages(levelIds: string[], packages: PackageManifestEntry[]): void {
  const packageIds = new Set(packages.map((pkg) => pkg.id));
  const seen = new Set<string>();
  for (const id of levelIds) {
    if (!packageIds.has(id)) {
      throw new WorkspaceGateError("ORDER_MISMATCH", `implementation order names unknown package ${id}`);
    }
    if (seen.has(id)) {
      throw new WorkspaceGateError("ORDER_MISMATCH", `implementation order lists ${id} more than once`);
    }
    seen.add(id);
  }
  const missing = packages.filter((pkg) => !seen.has(pkg.id)).map((pkg) => pkg.id);
  if (missing.length > 0) {
    throw new WorkspaceGateError(
      "ORDER_MISMATCH",
      `implementation order omits ${missing.join(", ")}`,
      missing,
    );
  }
}

/**
 * Build the package model from a tree manifest and one ordered id list.
 *
 * `requireTickets` is the one difference between the existing gate and the
 * stage-aware gate: an upstream stage starts before Tickets.json exists.
 */
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
interface WorkspaceModelInput {
  root: string;
  tree: Record<string, unknown>;
  orderedIds: string[];
  io: WorkspaceIo;
  requireTickets: boolean;
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function buildWorkspaceModel(input: WorkspaceModelInput): WorkspaceModel {
  const { root, tree, orderedIds, io, requireTickets } = input;
  const packages = readPackages(tree);
  assertOrderMatchesPackages(orderedIds, packages);

  const byId = new Map(packages.map((pkg) => [pkg.id, pkg]));
  const missingTickets: string[] = [];
  const modelPackages = orderedIds.map((id) => {
    const manifestEntry = byId.get(id);
    if (manifestEntry === undefined) {
      throw new WorkspaceGateError("ORDER_MISMATCH", `implementation order names unknown package ${id}`);
    }
    const directory = path.resolve(root, manifestEntry.path);
    const ticketsPath = path.join(directory, "Tickets.json");
    if (requireTickets && !io.exists(ticketsPath)) missingTickets.push(ticketsPath);
    return {
      id,
      name: manifestEntry.name,
      path: manifestEntry.path,
      directory,
      ticketsPath,
      seedRequired: manifestEntry.seedRequired,
    };
  });

  if (missingTickets.length > 0) {
    throw new WorkspaceGateError(
      "MISSING_TICKETS",
      `Tickets.json is missing for ${missingTickets.length} package(s): ${missingTickets.join(", ")}`,
      missingTickets,
    );
  }

  return { root, name: path.basename(root), packages: modelPackages };
}

/**
 * Read and validate the workspace manifests, then return the package list in
 * implementation order. A missing Tickets.json in any package is a gate
 * failure: /split-to-tickets has not completed for that package.
 */
export function readWorkspace(
  root: string,
  io: WorkspaceIo = nodeIo,
): WorkspaceModel {
  const tree = asCompleteManifest(io.readJson(path.join(root, TREE_MANIFEST)), TREE_MANIFEST);
  asCompleteManifest(io.readJson(path.join(root, ALLOCATE_MANIFEST)), ALLOCATE_MANIFEST);
  const order = asRecord(io.readJson(path.join(root, ORDER_MANIFEST)), ORDER_MANIFEST);

  return buildWorkspaceModel({
    root,
    tree,
    orderedIds: readOrderLevels(order).flat(),
    io,
    requireTickets: true,
  });
}

/** Walk up from `startDirectory` and return the first directory the predicate accepts. */
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function findAncestor(
  startDirectory: string,
  predicate: (directory: string) => boolean,
): string | null {
  let directory = path.resolve(startDirectory);
  for (;;) {
    if (predicate(directory)) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function hasTreeAndAllocate(directory: string, io: Pick<WorkspaceIo, "exists">): boolean {
  return io.exists(path.join(directory, TREE_MANIFEST))
    && io.exists(path.join(directory, ALLOCATE_MANIFEST));
}

/**
 * Resolve the workspace root for a -T plan.
 *
 * A workspacify start is anchored by SYSTEM-DESIGN.md, an educe start by the two
 * stage manifests, and the implementation group by the full existing gate. The
 * existing `resolveWorkspaceRoot` is not changed; this function chooses whether
 * to call it.
 */
export function resolveStageWorkspaceRoot(
  cwd: string,
  plan: StagePlan,
  io: WorkspaceIo = nodeIo,
): string {
  const first = plan.selections[0]?.name;
  if (first === undefined) {
    throw new WorkspaceGateError("MISSING_MANIFEST", "the stage plan selects no stage");
  }

  const gate = resolveStageGate(first);
  if (gate.requiresExistingWorkspaceGate) {
    return resolveWorkspaceRoot(cwd, io);
  }

  const resolved = path.resolve(cwd);
  if (gate.requiresTreeAndAllocate) {
    const found = findAncestor(resolved, (directory) => hasTreeAndAllocate(directory, io));
    if (found !== null) return found;
    throw new WorkspaceGateError(
      "MISSING_MANIFEST",
      `workspace root manifests are missing above ${resolved}: ${TREE_MANIFEST}, ${ALLOCATE_MANIFEST}`,
    );
  }

  const found = findAncestor(resolved, (directory) =>
    io.exists(path.join(directory, SYSTEM_DESIGN_FILE_NAME)),
  );
  if (found !== null) return found;
  throw new WorkspaceGateError(
    "MISSING_SYSTEM_DESIGN",
    `${SYSTEM_DESIGN_FILE_NAME} is missing above ${resolved}`,
  );
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export interface StageOrderSource {
  readonly source: "build" | "implementation";
  readonly levels: string[][];
}

/**
 * True when both stage-one manifests parse and declare COMPLETE.
 *
 * The initial model and the workspacify counter share this rule: a manifest
 * that exists but is incomplete is not a workspace the pipeline can process,
 * so workspacify still owes its run.
 */
// [::TICKET::] PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-456 --for-spec --no-implementation-order`.
export function hasCompleteStageManifests(
  root: string,
  io: Pick<WorkspaceIo, "readJson"> = nodeIo,
): boolean {
  try {
    asCompleteManifest(io.readJson(path.join(root, TREE_MANIFEST)), TREE_MANIFEST);
    asCompleteManifest(io.readJson(path.join(root, ALLOCATE_MANIFEST)), ALLOCATE_MANIFEST);
    return true;
  } catch {
    return false;
  }
}

/**
 * The initial model a -T plan runs against.
 *
 * A workspacify start may be a fresh workspace, so an absent or incomplete
 * manifest pair means workspacify still owes its run and the package list is
 * not available yet. A complete pair is the workspace the rest of the plan
 * processes; the educe gate is the first stage that can read it.
 */
// [::TICKET::] PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-456 --for-spec --no-implementation-order`.
export function readInitialWorkspaceForPlan(
  root: string,
  plan: StagePlan,
  io: WorkspaceIo = nodeIo,
): WorkspaceModel {
  const first = plan.selections[0]?.name ?? "make";
  if (first === "workspacify" && !hasCompleteStageManifests(root, io)) {
    return { root, name: path.basename(root), packages: [] };
  }
  const orderStartStage = first === "workspacify" ? "educe" : first;
  return readWorkspaceForStagePlan(root, plan, io, orderStartStage);
}

/**
 * The order the stage that is about to run must use.
 *
 * Before split the authority is the allocate manifest's recorded build order;
 * from make onward it is the published implementation sidecar. The two are kept
 * separate so a stage never silently inherits the other's order.
 */
export function resolveStageOrderSource(
  root: string,
  startStage: StageName,
  io: WorkspaceIo = nodeIo,
): StageOrderSource {
  if (resolveStageGate(startStage).requiresExistingWorkspaceGate) {
    const order = asRecord(io.readJson(path.join(root, ORDER_MANIFEST)), ORDER_MANIFEST);
    return { source: "implementation", levels: readOrderLevels(order) };
  }

  const allocate = asRecord(io.readJson(path.join(root, ALLOCATE_MANIFEST)), ALLOCATE_MANIFEST);
  const implementationOrder = asRecord(allocate.implementation_order, "implementation_order");
  const levels = implementationOrder.levels;
  if (!Array.isArray(levels) || levels.some((level) => !Array.isArray(level))) {
    throw new WorkspaceGateError(
      "ORDER_MISMATCH",
      "implementation_order.levels must be an array of arrays",
    );
  }
  return { source: "build", levels: levels as string[][] };
}

/**
 * Read the workspace model for a -T plan.
 *
 * `orderStartStage` is the stage the caller is about to run, not necessarily the
 * first stage of the plan: after split the engine re-reads with `make` so the
 * implementation group uses the sidecar order.
 */
export function readWorkspaceForStagePlan(
  root: string,
  plan: StagePlan,
  io: WorkspaceIo = nodeIo,
  orderStartStage: StageName = plan.selections[0]?.name ?? "make",
): WorkspaceModel {
  const tree = asCompleteManifest(io.readJson(path.join(root, TREE_MANIFEST)), TREE_MANIFEST);
  asCompleteManifest(io.readJson(path.join(root, ALLOCATE_MANIFEST)), ALLOCATE_MANIFEST);
  const order = resolveStageOrderSource(root, orderStartStage, io);
  const requireTickets = resolveStageGate(orderStartStage).requiresExistingWorkspaceGate;
  return buildWorkspaceModel({
    root,
    tree,
    orderedIds: order.levels.flat(),
    io,
    requireTickets,
  });
}
