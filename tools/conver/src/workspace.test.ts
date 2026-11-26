// workspace.test.ts — workspace root gate, manifests, readiness and order mapping.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOCATE_MANIFEST,
  ORDER_MANIFEST,
  SYSTEM_DESIGN_FILE_NAME,
  TREE_MANIFEST,
  WorkspaceGateError,
  readWorkspace,
  readWorkspaceForStagePlan,
  resolveStageOrderSource,
  resolveStageWorkspaceRoot,
  resolveWorkspaceRoot,
  validateImplementationOrder,
} from "./workspace.js";
import type { WorkspaceIo } from "./workspace.js";
import { parseStagePlan } from "./stage-plan.js";

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function tree(packages: Array<{ id: string; name: string; path: string }>): unknown {
  return {
    status: "COMPLETE",
    workspace: { packages },
  };
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function allocate(): unknown {
  return { status: "COMPLETE" };
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function order(levels: string[][]): unknown {
  return { implementationOrder: { levels, serial: levels.flat() } };
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function fakeIo(input: {
  files: Set<string>;
  manifests: Record<string, unknown>;
  missingTickets?: Set<string>;
  orderStatus?: number;
  orderStderr?: string;
}): WorkspaceIo {
  return {
    exists(file: string): boolean {
      if (file.endsWith("/Tickets.json")) {
        return !(input.missingTickets?.has(file) ?? false);
      }
      return input.files.has(file);
    },
    readJson(file: string): unknown {
      const manifest = input.manifests[file];
      if (manifest === undefined) throw new Error(`missing manifest: ${file}`);
      return manifest;
    },
    runOrderTool(): { status: number | null; stderr: string } {
      return { status: input.orderStatus ?? 0, stderr: input.orderStderr ?? "" };
    },
  };
}

const ROOT = "/ws";

describe("resolveWorkspaceRoot", () => {
  it("accepts a cwd that holds all three root manifests", () => {
    const io = {
      exists: (file: string) =>
        [TREE_MANIFEST, ALLOCATE_MANIFEST, ORDER_MANIFEST].some((name) => file === `${ROOT}/${name}`),
    };
    assert.strictEqual(resolveWorkspaceRoot(ROOT, io), ROOT);
  });

  it("rejects a cwd without the root manifests", () => {
    const io = { exists: () => false };
    assert.throws(
      () => resolveWorkspaceRoot(ROOT, io),
      (error: unknown) => error instanceof WorkspaceGateError && error.code === "MISSING_MANIFEST",
    );
  });

  it("rejects a package directory inside a workspace", () => {
    const io = {
      exists: (file: string) =>
        [TREE_MANIFEST, ALLOCATE_MANIFEST, ORDER_MANIFEST].some((name) => file === `${ROOT}/${name}`),
    };
    assert.throws(
      () => resolveWorkspaceRoot(`${ROOT}/crates/doors-core`, io),
      (error: unknown) => error instanceof WorkspaceGateError && error.code === "NOT_WORKSPACE_ROOT",
    );
  });
});

describe("readWorkspace", () => {
  it("maps implementation order to absolute package directories", () => {
    const io = fakeIo({
      files: new Set([ROOT]),
      manifests: {
        [`${ROOT}/${TREE_MANIFEST}`]: tree([
          { id: "pkg-2", name: "doors-operation", path: "crates/doors-operation" },
          { id: "pkg-1", name: "doors-core", path: "crates/doors-core" },
        ]),
        [`${ROOT}/${ALLOCATE_MANIFEST}`]: allocate(),
        [`${ROOT}/${ORDER_MANIFEST}`]: order([["pkg-1"], ["pkg-2"]]),
      },
    });
    const model = readWorkspace(ROOT, io);
    assert.deepStrictEqual(model.packages.map((entry) => entry.path), [
      "crates/doors-core",
      "crates/doors-operation",
    ]);
    assert.strictEqual(model.packages[0]?.directory, "/ws/crates/doors-core");
    assert.strictEqual(model.packages[0]?.ticketsPath, "/ws/crates/doors-core/Tickets.json");
  });

  it("keeps the root package path dot", () => {
    const io = fakeIo({
      files: new Set([ROOT]),
      manifests: {
        [`${ROOT}/${TREE_MANIFEST}`]: tree([{ id: "pkg-crystal", name: "crystal", path: "." }]),
        [`${ROOT}/${ALLOCATE_MANIFEST}`]: allocate(),
        [`${ROOT}/${ORDER_MANIFEST}`]: order([["pkg-crystal"]]),
      },
    });
    const model = readWorkspace(ROOT, io);
    assert.strictEqual(model.packages[0]?.directory, ROOT);
    assert.strictEqual(model.packages[0]?.ticketsPath, `${ROOT}/Tickets.json`);
  });

  it("reports every package without Tickets.json and returns no model", () => {
    const io = fakeIo({
      files: new Set([ROOT]),
      missingTickets: new Set([
        "/ws/crates/doors-core/Tickets.json",
        "/ws/crates/doors-operation/Tickets.json",
      ]),
      manifests: {
        [`${ROOT}/${TREE_MANIFEST}`]: tree([
          { id: "pkg-1", name: "doors-core", path: "crates/doors-core" },
          { id: "pkg-2", name: "doors-operation", path: "crates/doors-operation" },
        ]),
        [`${ROOT}/${ALLOCATE_MANIFEST}`]: allocate(),
        [`${ROOT}/${ORDER_MANIFEST}`]: order([["pkg-1"], ["pkg-2"]]),
      },
    });
    assert.throws(
      () => readWorkspace(ROOT, io),
      (error: unknown) =>
        error instanceof WorkspaceGateError &&
        error.code === "MISSING_TICKETS" &&
        error.details.length === 2,
    );
  });

  it("rejects an incomplete tree manifest", () => {
    const io = fakeIo({
      files: new Set([ROOT]),
      manifests: {
        [`${ROOT}/${TREE_MANIFEST}`]: { status: "BLOCKED", workspace: { packages: [] } },
        [`${ROOT}/${ALLOCATE_MANIFEST}`]: allocate(),
        [`${ROOT}/${ORDER_MANIFEST}`]: order([]),
      },
    });
    assert.throws(
      () => readWorkspace(ROOT, io),
      (error: unknown) => error instanceof WorkspaceGateError && error.code === "INCOMPLETE_MANIFEST",
    );
  });

  it("rejects an order that names an unknown package", () => {
    const io = fakeIo({
      files: new Set([ROOT]),
      manifests: {
        [`${ROOT}/${TREE_MANIFEST}`]: tree([
          { id: "pkg-1", name: "doors-core", path: "crates/doors-core" },
        ]),
        [`${ROOT}/${ALLOCATE_MANIFEST}`]: allocate(),
        [`${ROOT}/${ORDER_MANIFEST}`]: order([["pkg-1", "pkg-unknown"]]),
      },
    });
    assert.throws(
      () => readWorkspace(ROOT, io),
      (error: unknown) => error instanceof WorkspaceGateError && error.code === "ORDER_MISMATCH",
    );
  });
});

describe("validateImplementationOrder", () => {
  it("passes when the order tool exits zero", () => {
    const io = { runOrderTool: () => ({ status: 0, stderr: "" }) };
    assert.doesNotThrow(() => validateImplementationOrder(ROOT, io));
  });

  it("reports the order tool stderr when it fails", () => {
    const io = {
      runOrderTool: () => ({ status: 1, stderr: "STALE_IMPLEMENTATION_ORDER\n" }),
    };
    assert.throws(
      () => validateImplementationOrder(ROOT, io),
      (error: unknown) =>
        error instanceof WorkspaceGateError &&
        error.code === "ORDER_TOOL_FAILED" &&
        error.message.includes("STALE_IMPLEMENTATION_ORDER"),
    );
  });
});

// @verifies C008
describe("stage-aware workspace gate", () => {
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
  function allocateWithOrder(levels: string[][]): unknown {
    return { status: "COMPLETE", implementation_order: { levels, serial: levels.flat() } };
  }

  it("C008: a workspacify plan is anchored by SYSTEM-DESIGN.md", () => {
    const io = fakeIo({
      files: new Set([`${ROOT}/${SYSTEM_DESIGN_FILE_NAME}`]),
      manifests: {},
    });
    const plan = parseStagePlan("workspacify");
    assert.strictEqual(resolveStageWorkspaceRoot(`${ROOT}/crates/doors-core`, plan, io), ROOT);
    assert.throws(
      () => resolveStageWorkspaceRoot(ROOT, plan, fakeIo({ files: new Set(), manifests: {} })),
      (error: unknown) =>
        error instanceof WorkspaceGateError && error.code === "MISSING_SYSTEM_DESIGN",
    );
  });

  it("C008: an educe plan requires the tree and allocate manifests", () => {
    const io = fakeIo({
      files: new Set([`${ROOT}/${TREE_MANIFEST}`, `${ROOT}/${ALLOCATE_MANIFEST}`]),
      manifests: {},
    });
    assert.strictEqual(resolveStageWorkspaceRoot(ROOT, parseStagePlan("educe"), io), ROOT);
    assert.throws(
      () => resolveStageWorkspaceRoot(ROOT, parseStagePlan("educe"), fakeIo({ files: new Set(), manifests: {} })),
      (error: unknown) =>
        error instanceof WorkspaceGateError && error.code === "MISSING_MANIFEST",
    );
  });

  it("C008: an implementation plan keeps the existing three-manifest gate", () => {
    const io = fakeIo({
      files: new Set([
        `${ROOT}/${TREE_MANIFEST}`,
        `${ROOT}/${ALLOCATE_MANIFEST}`,
        `${ROOT}/${ORDER_MANIFEST}`,
      ]),
      manifests: {
        [`${ROOT}/${TREE_MANIFEST}`]: tree([{ id: "pkg-1", name: "doors-core", path: "crates/doors-core" }]),
        [`${ROOT}/${ALLOCATE_MANIFEST}`]: allocate(),
        [`${ROOT}/${ORDER_MANIFEST}`]: order([["pkg-1"]]),
      },
    });
    assert.strictEqual(resolveStageWorkspaceRoot(ROOT, parseStagePlan("make,plan"), io), ROOT);
  });

  it("C008: pre-split order comes from the allocate manifest and post-split order from the sidecar", () => {
    const manifests = {
      [`${ROOT}/${TREE_MANIFEST}`]: tree([]),
      [`${ROOT}/${ALLOCATE_MANIFEST}`]: allocateWithOrder([["pkg-1"], ["pkg-2"]]),
      [`${ROOT}/${ORDER_MANIFEST}`]: order([["pkg-2"], ["pkg-1"]]),
    };
    const io = fakeIo({ files: new Set([ROOT]), manifests });
    assert.deepStrictEqual(resolveStageOrderSource(ROOT, "educe", io), {
      source: "build",
      levels: [["pkg-1"], ["pkg-2"]],
    });
    assert.deepStrictEqual(resolveStageOrderSource(ROOT, "make", io), {
      source: "implementation",
      levels: [["pkg-2"], ["pkg-1"]],
    });
  });

  it("C008: an upstream plan does not require Tickets.json and exposes seed_required", () => {
    const io = fakeIo({
      files: new Set([ROOT]),
      manifests: {
        [`${ROOT}/${TREE_MANIFEST}`]: {
          status: "COMPLETE",
          workspace: {
            packages: [
              { id: "pkg-1", name: "doors-core", path: "crates/doors-core" },
              { id: "pkg-2", name: "doors-support", path: "crates/doors-support", seed_required: false },
            ],
          },
        },
        [`${ROOT}/${ALLOCATE_MANIFEST}`]: allocateWithOrder([["pkg-1"], ["pkg-2"]]),
      },
    });
    const model = readWorkspaceForStagePlan(ROOT, parseStagePlan("educe,explain"), io);
    assert.deepStrictEqual(model.packages.map((entry) => entry.path), [
      "crates/doors-core",
      "crates/doors-support",
    ]);
    assert.strictEqual(model.packages[0]?.seedRequired, true);
    assert.strictEqual(model.packages[1]?.seedRequired, false);
  });

  it("C008: an implementation plan still requires every package Tickets.json", () => {
    const io = fakeIo({
      files: new Set([ROOT]),
      manifests: {
        [`${ROOT}/${TREE_MANIFEST}`]: tree([{ id: "pkg-1", name: "doors-core", path: "crates/doors-core" }]),
        [`${ROOT}/${ALLOCATE_MANIFEST}`]: allocate(),
        [`${ROOT}/${ORDER_MANIFEST}`]: order([["pkg-1"]]),
      },
      missingTickets: new Set([`${ROOT}/crates/doors-core/Tickets.json`]),
    });
    assert.throws(
      () => readWorkspaceForStagePlan(ROOT, parseStagePlan("make,plan"), io),
      (error: unknown) =>
        error instanceof WorkspaceGateError && error.code === "MISSING_TICKETS",
    );
  });
});
