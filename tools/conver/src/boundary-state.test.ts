// boundary-state.test.ts — durable boundary records and the endpoint predicate.
//
// The endpoint predicate is the skip decision: a false positive silently drops the
// boundary for a package, so every "cannot prove it is complete" branch must return
// false. These tests pin that direction explicitly.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BOUNDARY_STATE_FILE,
  BOUNDARY_STATE_VERSION,
  computeTicketSetDigest,
  createBoundaryState,
  isPackageEndpoint,
  isTicketSetTerminal,
  markBoundaryCompleted,
  markBoundaryStarted,
  markFindSkipped,
  markResolved,
  markReviewed,
  nodeBoundaryStateIo,
  readBoundaryState,
  shouldTerminateWatcher,
  ticketKeysOf,
  writeBoundaryState,
} from "./boundary-state.js";
import type { BoundaryState, BoundaryStateIo } from "./boundary-state.js";
import type { TicketsJson } from "./tickets.js";
import type { WorkspacePackage } from "./workspace.js";

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
type FixtureTicket = { id: number; status: string; forNextRound?: boolean };

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
function tickets(
  phases: Array<{ id: number; tickets: FixtureTicket[] }>,
  round = 1,
): TicketsJson {
  return {
    round,
    phases: phases.map((phase) => ({
      id: phase.id,
      name: `P${phase.id}`,
      tickets: phase.tickets.map((ticket) => ({
        id: ticket.id,
        phaseId: phase.id,
        status: ticket.status,
        title: `ticket-${ticket.id}`,
        ...(ticket.forNextRound === undefined
          ? {}
          : { forNextRound: ticket.forNextRound }),
      })),
    })),
  };
}

const REVIEW_AT = "2026-11-13T00:00:00.000Z";

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
function endpointState(data: TicketsJson, packageId = "pkg-fixture"): BoundaryState {
  return {
    ...createBoundaryState(packageId),
    lastReviewedTicketKey: "P0-1",
    lastReviewedAt: REVIEW_AT,
    reviewedSinceResolve: 0,
    ticketSetDigest: computeTicketSetDigest(data),
    consolidate: {
      status: "COMPLETE",
      startedAt: REVIEW_AT,
      finishedAt: "2026-11-13T00:01:00.000Z",
      addedTicketKeys: [],
    },
    find: {
      status: "COMPLETE",
      startedAt: "2026-11-13T00:02:00.000Z",
      finishedAt: "2026-11-13T00:03:00.000Z",
      addedTicketKeys: [],
    },
  };
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
function workspacePackage(name: string): WorkspacePackage {
  return {
    id: `pkg-${name}`,
    name,
    path: `crates/${name}`,
    directory: `/ws/crates/${name}`,
    ticketsPath: `/ws/crates/${name}/Tickets.json`,
  };
}

describe("computeTicketSetDigest", () => {
  it("is stable across JSON formatting and object key order", () => {
    const compact = JSON.parse(
      JSON.stringify(tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }])),
    ) as TicketsJson;
    const formatted = tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }]);
    assert.equal(computeTicketSetDigest(compact), computeTicketSetDigest(formatted));
  });

  it("changes when a ticket is added, removed, or changes status", () => {
    const base = tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }]);
    const added = tickets([
      { id: 0, tickets: [{ id: 1, status: "reviewed" }, { id: 2, status: "todo" }] },
    ]);
    const status = tickets([{ id: 0, tickets: [{ id: 1, status: "todo" }] }]);
    assert.notEqual(computeTicketSetDigest(base), computeTicketSetDigest(added));
    assert.notEqual(computeTicketSetDigest(base), computeTicketSetDigest(status));
  });

  it("ignores the top-level round value", () => {
    const first = tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }], 3);
    const second = tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }], 41);
    assert.equal(computeTicketSetDigest(first), computeTicketSetDigest(second));
  });
});

describe("ticketKeysOf and isTicketSetTerminal", () => {
  it("lists keys in phase then ticket array order", () => {
    const data = tickets([
      { id: 1, tickets: [{ id: 2, status: "reviewed" }, { id: 3, status: "R1" }] },
      { id: 0, tickets: [{ id: 1, status: "reviewed" }] },
    ]);
    assert.deepEqual(ticketKeysOf(data), ["P1-2", "P1-3", "P0-1"]);
  });

  it("is true only when every ticket is terminal", () => {
    assert.equal(
      isTicketSetTerminal(tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }])),
      true,
    );
    assert.equal(
      isTicketSetTerminal(tickets([{ id: 0, tickets: [{ id: 1, status: "R2" }] }])),
      true,
    );
    assert.equal(
      isTicketSetTerminal(tickets([{ id: 0, tickets: [{ id: 1, status: "todo" }] }])),
      false,
    );
    assert.equal(isTicketSetTerminal(tickets([])), true);
  });

  it("does not treat a forNextRound ticket as absent", () => {
    const data = tickets([
      { id: 0, tickets: [{ id: 1, status: "todo", forNextRound: true }] },
    ]);
    assert.equal(isTicketSetTerminal(data), false);
  });
});

// @verifies C002 — durable COMPLETE records and atomic replacement
describe("readBoundaryState / writeBoundaryState", () => {
  it("round-trips every field", () => {
    const directory = mkdtempSync(join(tmpdir(), "conver-boundary-"));
    const state = endpointState(
      tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }]),
    );
    writeBoundaryState(directory, state);
    assert.deepEqual(readBoundaryState(directory), state);
  });

  it("returns null for a missing file without warning", () => {
    const directory = mkdtempSync(join(tmpdir(), "conver-boundary-"));
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    try {
      assert.equal(readBoundaryState(directory), null);
    } finally {
      console.warn = originalWarn;
    }
    assert.deepEqual(warnings, []);
  });

  it("returns null and warns for corrupt JSON, version mismatch, and invalid shape", () => {
    const directory = mkdtempSync(join(tmpdir(), "conver-boundary-"));
    const file = join(directory, BOUNDARY_STATE_FILE);
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    try {
      writeFileSync(file, "{broken");
      assert.equal(readBoundaryState(directory), null);
      writeFileSync(file, JSON.stringify({ version: BOUNDARY_STATE_VERSION + 1 }));
      assert.equal(readBoundaryState(directory), null);
      writeFileSync(file, JSON.stringify({ version: BOUNDARY_STATE_VERSION }));
      assert.equal(readBoundaryState(directory), null);
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(warnings.length, 3);
  });

  it("leaves the previous document readable when rename fails", () => {
    const directory = mkdtempSync(join(tmpdir(), "conver-boundary-"));
    const state = createBoundaryState("pkg-fixture");
    writeBoundaryState(directory, state);
    const failingIo: BoundaryStateIo = {
      ...nodeBoundaryStateIo,
      rename: () => {
        throw new Error("rename failed");
      },
    };
    assert.throws(
      () => writeBoundaryState(directory, { ...state, reviewedSinceResolve: 1 }, failingIo),
      /rename failed/,
    );
    assert.deepEqual(readBoundaryState(directory), state);
  });
});

// @verifies C001 — endpoint skip predicate
describe("isPackageEndpoint", () => {
  const data = tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }]);

  it("accepts a matching COMPLETE record", () => {
    assert.equal(isPackageEndpoint(data, endpointState(data)), true);
  });

  it("rejects every unproven condition", () => {
    const state = endpointState(data);
    assert.equal(isPackageEndpoint(data, null), false);
    assert.equal(
      isPackageEndpoint(
        tickets([{ id: 0, tickets: [{ id: 1, status: "todo" }] }]),
        state,
      ),
      false,
    );
    assert.equal(
      isPackageEndpoint(data, { ...state, reviewedSinceResolve: 1 }),
      false,
    );
    assert.equal(
      isPackageEndpoint(data, { ...state, ticketSetDigest: "sha256:stale" }),
      false,
    );
    assert.equal(isPackageEndpoint(data, { ...state, consolidate: null }), false);
    assert.equal(isPackageEndpoint(data, { ...state, find: null }), false);
    assert.equal(
      isPackageEndpoint(data, {
        ...state,
        consolidate: { ...state.consolidate!, status: "IN_PROGRESS" },
      }),
      false,
    );
    assert.equal(
      isPackageEndpoint(data, {
        ...state,
        find: { ...state.find!, status: "IN_PROGRESS" },
      }),
      false,
    );
    assert.equal(
      isPackageEndpoint(data, {
        ...state,
        lastReviewedAt: "2026-11-13T00:10:00.000Z",
      }),
      false,
    );
  });

  it("accepts a skipped find record and an empty ticket set", () => {
    assert.equal(
      isPackageEndpoint(data, { ...endpointState(data), find: {
        status: "SKIPPED",
        startedAt: REVIEW_AT,
        finishedAt: REVIEW_AT,
        addedTicketKeys: [],
      } }),
      true,
    );
    const empty = tickets([]);
    const emptyState: BoundaryState = {
      ...createBoundaryState("pkg-empty"),
      ticketSetDigest: computeTicketSetDigest(empty),
      consolidate: {
        status: "COMPLETE",
        startedAt: REVIEW_AT,
        finishedAt: "2026-11-13T00:01:00.000Z",
        addedTicketKeys: [],
      },
      find: {
        status: "COMPLETE",
        startedAt: REVIEW_AT,
        finishedAt: "2026-11-13T00:02:00.000Z",
        addedTicketKeys: [],
      },
    };
    assert.equal(isPackageEndpoint(empty, emptyState), true);
  });
});

// @verifies C005 — review tracking invalidates the prior boundary
describe("boundary transitions", () => {
  const data = tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }]);
  const completed = endpointState(data);

  it("markReviewed records the key and invalidates the boundary", () => {
    const reviewed = markReviewed(completed, "P0-1", "2026-11-13T00:10:00.000Z");
    assert.equal(reviewed.lastReviewedTicketKey, "P0-1");
    assert.equal(reviewed.lastReviewedAt, "2026-11-13T00:10:00.000Z");
    assert.equal(reviewed.reviewedSinceResolve, 1);
    assert.equal(reviewed.consolidate, null);
    assert.equal(reviewed.find, null);
    assert.equal(reviewed.ticketSetDigest, null);
    assert.equal(isPackageEndpoint(data, reviewed), false);
  });

  it("markResolved clears the pending resolve count", () => {
    const reviewed = markReviewed(completed, "P0-1", REVIEW_AT);
    assert.equal(markResolved(reviewed).reviewedSinceResolve, 0);
  });

  it("marks consolidate and find in order", () => {
    const started = markBoundaryStarted(createBoundaryState("pkg-fixture"), "consolidate", REVIEW_AT);
    assert.equal(started.consolidate?.status, "IN_PROGRESS");
    assert.equal(started.find, null);
    const consolidated = markBoundaryCompleted(started, "consolidate", "2026-11-13T00:01:00.000Z");
    assert.equal(consolidated.consolidate?.status, "COMPLETE");
    const found = markBoundaryStarted(consolidated, "find", "2026-11-13T00:02:00.000Z");
    assert.equal(found.consolidate?.status, "COMPLETE");
    assert.equal(found.find?.status, "IN_PROGRESS");
    const finished = markBoundaryCompleted(found, "find", "2026-11-13T00:03:00.000Z", {
      digest: "sha256:abc",
      addedTicketKeys: ["P1-1"],
    });
    assert.equal(finished.find?.status, "COMPLETE");
    assert.equal(finished.ticketSetDigest, "sha256:abc");
    assert.deepEqual(finished.find?.addedTicketKeys, ["P1-1"]);
  });

  it("rejects a completion without a start or a find without a digest", () => {
    assert.throws(
      () => markBoundaryCompleted(createBoundaryState("pkg-fixture"), "consolidate", REVIEW_AT),
      /without a start record/,
    );
    const started = markBoundaryStarted(createBoundaryState("pkg-fixture"), "find", REVIEW_AT);
    assert.throws(() => markBoundaryCompleted(started, "find", REVIEW_AT), /digest/);
  });

  it("marks a skipped find and keeps the digest", () => {
    const started = markBoundaryStarted(createBoundaryState("pkg-fixture"), "consolidate", REVIEW_AT);
    const consolidated = markBoundaryCompleted(started, "consolidate", REVIEW_AT);
    const skipped = markFindSkipped(consolidated, REVIEW_AT, "sha256:empty");
    assert.equal(skipped.find?.status, "SKIPPED");
    assert.equal(skipped.ticketSetDigest, "sha256:empty");
  });
});

// @verifies C003 — watcher termination decision
describe("shouldTerminateWatcher", () => {
  it("is true only when every selected package is endpoint", () => {
    const terminal = tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }]);
    const pending = tickets([{ id: 0, tickets: [{ id: 2, status: "todo" }] }]);
    const first = workspacePackage("first");
    const second = workspacePackage("second");
    const readTickets = (path: string) =>
      path === first.ticketsPath ? terminal : pending;
    const readState = () => endpointState(terminal);
    assert.equal(
      shouldTerminateWatcher([first, second], readTickets, readState),
      false,
    );
    assert.equal(shouldTerminateWatcher([first], readTickets, readState), true);
  });
});
