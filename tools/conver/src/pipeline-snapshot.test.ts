// pipeline-snapshot.test.ts — one immutable reading of the facts a step needs.
//
// The reader composes the ticket set, its endpoint record, and the shared stage
// counters. It never decides an action; the reducer does that from this snapshot.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { computeTicketSetDigest } from "./boundary-state.js";
import type { BoundaryState } from "./boundary-state.js";
import {
  PipelineSnapshotError,
  readPipelineSnapshot,
} from "./pipeline-snapshot.js";
import type { PipelineSnapshotIo } from "./pipeline-snapshot.js";
import type { StageName, StagePlan } from "./stage-plan.js";
import type { TicketsJson } from "./tickets.js";
import type { WorkspaceModel, WorkspacePackage } from "./workspace.js";

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function plan(...entries: Array<[StageName, number?]>): StagePlan {
  return { selections: entries.map(([name, count = 1]) => ({ name, count })) };
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function packageEntry(id: string): WorkspacePackage {
  return {
    id,
    name: id,
    path: id,
    directory: `/ws/${id}`,
    ticketsPath: `/ws/${id}/Tickets.json`,
    seedRequired: true,
  };
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function workspace(packages: WorkspacePackage[]): WorkspaceModel {
  return { root: "/ws", name: "ws", packages };
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function reviewedTickets(): TicketsJson {
  return { phases: [{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }] } as TicketsJson;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function endpointState(tickets: TicketsJson, packageId: string): BoundaryState {
  return {
    version: 1,
    packageId,
    lastReviewedTicketKey: "P0-1",
    lastReviewedAt: "2026-01-01T00:00:00.000Z",
    reviewedSinceResolve: 0,
    ticketSetDigest: computeTicketSetDigest(tickets),
    consolidate: {
      status: "COMPLETE",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:01:00.000Z",
      addedTicketKeys: [],
    },
    find: {
      status: "COMPLETE",
      startedAt: "2026-01-01T00:01:00.000Z",
      finishedAt: "2026-01-01T00:02:00.000Z",
      addedTicketKeys: [],
    },
  };
}

describe("readPipelineSnapshot", () => {
  it("composes the ticket set, digest, endpoint and package counters", () => {
    const tickets = reviewedTickets();
    const io: Partial<PipelineSnapshotIo> = {
      readTickets: () => tickets,
      readBoundary: () => endpointState(tickets, "pkg-a"),
      readCount: (stage) => (stage === "graphify" ? 2 : 0),
    };

    const snapshot = readPipelineSnapshot({
      root: "/ws",
      plan: plan(["graphify"], ["make"]),
      workspace: workspace([packageEntry("pkg-a")]),
      io,
    });

    const pkg = snapshot.packages[0];
    assert.equal(pkg?.id, "pkg-a");
    assert.equal(pkg?.tickets, tickets);
    assert.equal(pkg?.ticketSetDigest, computeTicketSetDigest(tickets));
    assert.equal(pkg?.endpoint, true);
    assert.equal(pkg?.counts.get("graphify"), 2);
  });

  it("keeps a package without Tickets.json non-endpoint", () => {
    const io: Partial<PipelineSnapshotIo> = {
      readTickets: () => null,
      readBoundary: () => null,
      readCount: () => null,
    };

    const snapshot = readPipelineSnapshot({
      root: "/ws",
      plan: plan(["explain"], ["make"]),
      workspace: workspace([packageEntry("pkg-a")]),
      io,
    });

    assert.equal(snapshot.packages[0]?.tickets, null);
    assert.equal(snapshot.packages[0]?.ticketSetDigest, "");
    assert.equal(snapshot.packages[0]?.endpoint, false);
  });

  it("reads workspace counters once at the root", () => {
    const seen: Array<{ stage: StageName; packagePath?: string }> = [];
    const io: Partial<PipelineSnapshotIo> = {
      readTickets: () => null,
      readBoundary: () => null,
      readCount: (stage, target) => {
        seen.push({ stage, packagePath: target.packagePath });
        return stage === "educe" ? 2 : null;
      },
    };

    const snapshot = readPipelineSnapshot({
      root: "/ws",
      plan: plan(["workspacify"], ["educe"], ["make"]),
      workspace: workspace([packageEntry("pkg-a")]),
      io,
    });

    assert.equal(snapshot.rootCounts.get("workspacify"), null);
    assert.equal(snapshot.rootCounts.get("educe"), 2);
    assert.equal(seen.some((entry) => entry.stage === "workspacify" && entry.packagePath === undefined), true);
  });

  it("passes the package path and directory to a package counter", () => {
    let received: { stage: StageName; packagePath?: string; directory?: string } | null = null;
    const io: Partial<PipelineSnapshotIo> = {
      readTickets: () => null,
      readBoundary: () => null,
      readCount: (stage, target) => {
        if (stage === "split") received = { stage, ...target };
        return null;
      },
    };

    readPipelineSnapshot({
      root: "/ws",
      plan: plan(["split"], ["make"]),
      workspace: workspace([packageEntry("pkg-a")]),
      io,
    });

    assert.deepEqual(received, {
      stage: "split",
      root: "/ws",
      packagePath: "pkg-a",
      directory: "/ws/pkg-a",
    });
  });

  it("carries the seed obligation of each package", () => {
    const noSeed: WorkspacePackage = { ...packageEntry("pkg-noseed"), seedRequired: false };
    const io: Partial<PipelineSnapshotIo> = {
      readTickets: () => null,
      readBoundary: () => null,
      readCount: () => null,
    };

    const snapshot = readPipelineSnapshot({
      root: "/ws",
      plan: plan(["explain"], ["make"]),
      workspace: workspace([noSeed]),
      io,
    });

    assert.equal(snapshot.packages[0]?.seedRequired, false);
  });

  it("handles a workspace with zero packages", () => {
    const io: Partial<PipelineSnapshotIo> = {
      readTickets: () => null,
      readBoundary: () => null,
      readCount: () => null,
    };
    const snapshot = readPipelineSnapshot({
      root: "/ws",
      plan: plan(["workspacify"]),
      workspace: workspace([]),
      io,
    });
    assert.deepEqual(snapshot.packages, []);
  });

  it("raises a named error for unreadable Tickets.json", () => {
    const root = mkdtempSync(join(tmpdir(), "px455-snapshot-"));
    try {
      const ticketsPath = join(root, "Tickets.json");
      writeFileSync(ticketsPath, "{not json", "utf8");
      const pkg: WorkspacePackage = {
        id: "pkg-a",
        name: "pkg-a",
        path: ".",
        directory: root,
        ticketsPath,
      };
      assert.throws(
        () =>
          readPipelineSnapshot({
            root,
            plan: plan(["make"]),
            workspace: workspace([pkg]),
          }),
        (error: unknown) =>
          error instanceof PipelineSnapshotError && error.code === "TICKETS_UNREADABLE",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
