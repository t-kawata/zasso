// model.test.ts — progress snapshot, status symbols and floor percent.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  packagePercent,
  ProgressReadError,
  readProgressSnapshot,
  symbolForStatus,
} from "./model.js";
import type { ProgressPackage, ProgressTicket } from "./model.js";
import type { WorkspaceModel } from "../workspace.js";

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function pkg(name: string, path: string): WorkspaceModel["packages"][number] {
  return {
    id: `pkg-${name}`,
    name,
    path,
    directory: `/ws/${path}`,
    ticketsPath: `/ws/${path}/Tickets.json`,
  };
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function ticket(id: number, status: string): ProgressTicket {
  return { id, status };
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function workspace(): WorkspaceModel {
  return {
    root: "/ws",
    name: "doors",
    packages: [pkg("pjsip-prebuilt", "crates/pjsip-prebuilt"), pkg("doors-core", "crates/doors-core")],
  };
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function readTickets(contents: Record<string, string>) {
  return (path: string): string => {
    const body = contents[path];
    if (body === undefined) throw new Error(`missing ${path}`);
    return body;
  };
}

describe("symbolForStatus", () => {
  it("maps terminal and pipeline statuses to the four symbols and uses the id for todo", () => {
    assert.strictEqual(symbolForStatus(ticket(1, "reviewed")), "x");
    assert.strictEqual(symbolForStatus(ticket(1, "R2")), "x");
    assert.strictEqual(symbolForStatus(ticket(1, "made")), "_");
    assert.strictEqual(symbolForStatus(ticket(1, "planned")), "|");
    assert.strictEqual(symbolForStatus(ticket(1, "done")), "/");
    assert.strictEqual(symbolForStatus(ticket(7, "todo")), "7");
    assert.strictEqual(symbolForStatus(ticket(7, "mystery")), "?");
  });
});

describe("packagePercent", () => {
  it("floors reviewed over total and returns zero for an empty package", () => {
    const packageEntry: ProgressPackage = {
      name: "pjsip-prebuilt",
      path: "crates/pjsip-prebuilt",
      phases: [{ id: 0, tickets: [ticket(1, "reviewed"), ticket(2, "done"), ticket(3, "todo")] }],
    };
    assert.strictEqual(packagePercent(packageEntry), 33);
    assert.strictEqual(
      packagePercent({ name: "empty", path: ".", phases: [] }),
      0,
    );
    assert.strictEqual(
      packagePercent({
        name: "done",
        path: "crates/done",
        phases: [{ id: 0, tickets: [ticket(1, "reviewed")] }],
      }),
      100,
    );
  });
});

describe("readProgressSnapshot", () => {
  it("reads packages in implementation order and preserves phase order", () => {
    const snapshot = readProgressSnapshot(
      workspace(),
      readTickets({
        "/ws/crates/pjsip-prebuilt/Tickets.json": JSON.stringify({
          phases: [{ id: 0, tickets: [ticket(1, "reviewed"), ticket(2, "todo")] }],
        }),
        "/ws/crates/doors-core/Tickets.json": JSON.stringify({
          phases: [
            { id: 1, tickets: [ticket(1, "made")] },
            { id: 0, tickets: [ticket(2, "done")] },
          ],
        }),
      }),
    );
    assert.deepStrictEqual(snapshot.packages.map((entry) => entry.name), [
      "pjsip-prebuilt",
      "doors-core",
    ]);
    assert.deepStrictEqual(snapshot.packages[1]?.phases.map((phase) => phase.id), [1, 0]);
  });

  it("keeps zero-ticket packages and reports zero percent", () => {
    const snapshot = readProgressSnapshot(
      workspace(),
      readTickets({
        "/ws/crates/pjsip-prebuilt/Tickets.json": JSON.stringify({ phases: [] }),
        "/ws/crates/doors-core/Tickets.json": JSON.stringify({
          phases: [{ id: 0, tickets: [ticket(1, "todo")] }],
        }),
      }),
    );
    assert.strictEqual(packagePercent(snapshot.packages[0]!), 0);
  });

  it("throws ProgressReadError when a Tickets.json is malformed", () => {
    assert.throws(
      () =>
        readProgressSnapshot(
          workspace(),
          readTickets({
            "/ws/crates/pjsip-prebuilt/Tickets.json": "{not json",
            "/ws/crates/doors-core/Tickets.json": JSON.stringify({ phases: [] }),
          }),
        ),
      (error: unknown) => error instanceof ProgressReadError,
    );
  });
});
