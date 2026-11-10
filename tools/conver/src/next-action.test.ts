// next-action.test.ts — strict next-command derivation from Tickets.json.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveNextAction,
  firstNonTerminalTicket,
  FindRoundLimitError,
  InvalidTicketStatusError,
} from "./next-action.js";
import type { PackageProgress } from "./next-action.js";
import type { Ticket, TicketsJson } from "./tickets.js";

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function ticket(id: number, status: string): Ticket {
  return { id, phaseId: 0, status, title: `ticket-${id}` };
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function ticketsDocument(
  phases: Array<{ id: number; tickets: Array<Ticket> }>,
): TicketsJson {
  return {
    round: 1,
    phases: phases.map((phase) => ({ id: phase.id, name: `P${phase.id}`, tickets: phase.tickets })),
  };
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function progress(overrides: Partial<PackageProgress> = {}): PackageProgress {
  return {
    reviewedSinceResolve: 0,
    resolveEvery: 3,
    consolidateDone: false,
    findDone: false,
    findRounds: 0,
    maxFindRounds: 3,
    noFind: false,
    ...overrides,
  };
}

describe("firstNonTerminalTicket", () => {
  it("returns the first non-terminal ticket in phase then ticket array order", () => {
    const data = ticketsDocument([
      { id: 0, tickets: [ticket(1, "reviewed"), ticket(2, "done")] },
      { id: 1, tickets: [ticket(1, "todo")] },
    ]);
    const found = firstNonTerminalTicket(data);
    assert.deepStrictEqual(found, { phaseId: 0, ticket: ticket(2, "done") });
  });

  it("treats reviewed and R<n> as terminal and returns null when all are terminal", () => {
    const data = ticketsDocument([
      { id: 0, tickets: [ticket(1, "reviewed"), ticket(2, "R1")] },
    ]);
    assert.strictEqual(firstNonTerminalTicket(data), null);
  });
});

describe("deriveNextAction — command mapping", () => {
  const cases: Array<[string, string]> = [
    ["todo", "/make-ticket"],
    ["made", "/plan-ticket"],
    ["planned", "/start-ticket"],
    ["done", "/review-ticket"],
  ];

  for (const [status, command] of cases) {
    it(`maps ${status} to ${command}`, () => {
      const data = ticketsDocument([{ id: 0, tickets: [ticket(1, status)] }]);
      const action = deriveNextAction(data, progress());
      assert.deepStrictEqual(action, {
        kind: "command",
        command,
        ticketKey: "P0-1",
        phaseId: 0,
        status,
      });
    });
  }

  it("maps the PX phase to PX-<id>", () => {
    const data = ticketsDocument([{ id: -1, tickets: [ticket(7, "made")] }]);
    const action = deriveNextAction(data, progress());
    assert.strictEqual(action.kind, "command");
    if (action.kind === "command") assert.strictEqual(action.ticketKey, "PX-7");
  });

  it("never selects a later ticket while an earlier ticket is non-terminal", () => {
    const data = ticketsDocument([
      { id: 0, tickets: [ticket(1, "done"), ticket(2, "todo")] },
    ]);
    const action = deriveNextAction(data, progress());
    assert.strictEqual(action.kind, "command");
    if (action.kind === "command") assert.strictEqual(action.ticketKey, "P0-1");
  });

  it("throws InvalidTicketStatusError for remanded and unknown statuses", () => {
    for (const status of ["remanded", "mystery"]) {
      const data = ticketsDocument([{ id: 0, tickets: [ticket(1, status)] }]);
      assert.throws(
        () => deriveNextAction(data, progress()),
        (error: unknown) => error instanceof InvalidTicketStatusError,
      );
    }
  });
});

describe("deriveNextAction — package boundary", () => {
  const allReviewed = ticketsDocument([
    { id: 0, tickets: [ticket(1, "reviewed"), ticket(2, "R2")] },
  ]);

  it("returns resolve before consolidate when the resolve cadence is reached", () => {
    const action = deriveNextAction(allReviewed, progress({ reviewedSinceResolve: 3 }));
    assert.deepStrictEqual(action, { kind: "resolve", ticketKey: "P0-2" });
  });

  it("returns consolidate before find", () => {
    const action = deriveNextAction(allReviewed, progress());
    assert.deepStrictEqual(action, { kind: "consolidate" });
  });

  it("returns find after consolidate", () => {
    const action = deriveNextAction(allReviewed, progress({ consolidateDone: true }));
    assert.deepStrictEqual(action, { kind: "find" });
  });

  it("returns complete after find", () => {
    const action = deriveNextAction(
      allReviewed,
      progress({ consolidateDone: true, findDone: true }),
    );
    assert.deepStrictEqual(action, { kind: "complete" });
  });

  it("skips find when noFind is set", () => {
    const action = deriveNextAction(
      allReviewed,
      progress({ consolidateDone: true, noFind: true }),
    );
    assert.deepStrictEqual(action, { kind: "complete" });
  });

  it("throws FindRoundLimitError when the find round cap is reached", () => {
    assert.throws(
      () =>
        deriveNextAction(
          allReviewed,
          progress({ consolidateDone: true, findRounds: 3, maxFindRounds: 3 }),
        ),
      (error: unknown) => error instanceof FindRoundLimitError,
    );
  });
});
