// runner.test.ts — strict package loop, cwd, escalation, boundaries and Slack.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LoopStoppedError,
  runPackageLoop,
  runWorkspaceLoop,
} from "./runner.js";
import type { PackageLoopDeps, WorkspaceLoopOptions } from "./runner.js";
import {
  computeTicketSetDigest,
  createBoundaryState,
  readBoundaryState,
  writeBoundaryState,
} from "./boundary-state.js";
import type { BoundaryState } from "./boundary-state.js";
import type { WorkspacePackage } from "./workspace.js";
import type {
  BoundaryCompleteContext,
  PhaseCompleteContext,
  StopContext,
} from "./notifier.js";
import type { AcpSession } from "./session.js";
import type { RunCommandOptions, SessionConfig } from "./session.js";
import type { TicketsJson } from "./tickets.js";
import { commandHistory } from "./command-history.js";

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
interface Fixture {
  directory: string;
  ticketsPath: string;
  packageEntry: WorkspacePackage;
  data: TicketsJson;
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function writeFixture(data: TicketsJson): Fixture {
  const directory = mkdtempSync(join(tmpdir(), "conver-runner-"));
  const ticketsPath = join(directory, "Tickets.json");
  writeFileSync(ticketsPath, JSON.stringify(data, null, 2));
  return {
    directory,
    ticketsPath,
    packageEntry: {
      id: "pkg-fixture",
      name: "fixture",
      path: ".",
      directory,
      ticketsPath,
    },
    data,
  };
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function tickets(
  phases: Array<{ id: number; tickets: Array<{ id: number; status: string }> }>,
): TicketsJson {
  return {
    round: 1,
    phases: phases.map((phase) => ({
      id: phase.id,
      name: `P${phase.id}`,
      tickets: phase.tickets.map((ticket) => ({
        id: ticket.id,
        phaseId: phase.id,
        status: ticket.status,
        title: `ticket-${ticket.id}`,
      })),
    })),
  };
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function options(overrides: Partial<WorkspaceLoopOptions> = {}): WorkspaceLoopOptions {
  return {
    apiKey: "",
    model: "test-model",
    baseUrl: "http://localhost",
    packages: [],
    maxCount: 999,
    resolveEvery: 3,
    pushEnabled: false,
    slackWebhookUrl: "https://example.invalid",
    verbose: false,
    timeoutMs: 1000,
    bindReviewInOneSession: true,
    noFind: false,
    workspace: { root: "/ws", name: "ws", packages: [] },
    ...overrides,
  };
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
function endpointStateFor(data: TicketsJson, packageId = "pkg-fixture"): BoundaryState {
  const at = "1970-01-01T00:00:00.000Z";
  return {
    ...createBoundaryState(packageId),
    lastReviewedTicketKey: "P0-1",
    lastReviewedAt: at,
    reviewedSinceResolve: 0,
    ticketSetDigest: computeTicketSetDigest(data),
    consolidate: {
      status: "COMPLETE",
      startedAt: at,
      finishedAt: at,
      addedTicketKeys: [],
    },
    find: {
      status: "COMPLETE",
      startedAt: at,
      finishedAt: at,
      addedTicketKeys: [],
    },
  };
}

// [::TICKET::] PX-403, PX-404, PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-413) --for-spec --no-implementation-order`.
interface Recorded {
  sessions: string[];
  commands: Array<{ command: string; escalationLevel: number }>;
  phases: PhaseCompleteContext[];
  stops: StopContext[];
  boundaries: BoundaryCompleteContext[];
}

// [::TICKET::] PX-403, PX-404, PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-413) --for-spec --no-implementation-order`.
function deps(
  fixture: Fixture,
  recorded: Recorded,
  advance: (command: string, fixture: Fixture) => void,
): PackageLoopDeps {
  return {
    withSession: async <T>(
      cwd: string,
      _config: SessionConfig,
      run: (session: AcpSession) => Promise<T>,
    ): Promise<T> => {
      recorded.sessions.push(cwd);
      return run({} as AcpSession);
    },
    runCommand: async (
      _session: AcpSession,
      command: string,
      runOptions: RunCommandOptions,
    ): Promise<string> => {
      recorded.commands.push({
        command,
        escalationLevel: runOptions.escalationLevel ?? 0,
      });
      advance(command, fixture);
      return "";
    },
    sendSlackPhaseComplete: async (_url: string, context: PhaseCompleteContext) => {
      recorded.phases.push(context);
    },
    sendSlackStop: async (_url: string, context: StopContext) => {
      recorded.stops.push(context);
    },
    sendSlackBoundaryComplete: async (
      _url: string,
      context: BoundaryCompleteContext,
    ) => {
      recorded.boundaries.push(context);
    },
    now: () => 0,
  };
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function advanceStatus(command: string, fixture: Fixture): void {
  const data = JSON.parse(readFileSync(fixture.ticketsPath, "utf-8")) as TicketsJson;
  const match = /^\/(make|plan|start|review)-ticket (P(?:X|\d+)-(\d+))$/.exec(command);
  if (match === null) return;
  const phasePart = match[2]?.split("-")[0] ?? "";
  const phaseId = phasePart === "PX" ? -1 : parseInt(phasePart.slice(1), 10);
  const ticketId = parseInt(match[2]?.split("-")[1] ?? "0", 10);
  const phase = data.phases.find((candidate) => candidate.id === phaseId);
  const ticket = phase?.tickets.find((candidate) => candidate.id === ticketId);
  if (ticket === undefined) return;
  const next: Record<string, string> = {
    make: "made",
    plan: "planned",
    start: "done",
    review: "reviewed",
  };
  ticket.status = next[match[1] ?? ""] ?? ticket.status;
  writeFileSync(fixture.ticketsPath, JSON.stringify(data, null, 2));
}

let originalWrite: typeof process.stdout.write;
beforeEach(() => {
  commandHistory.clear();
  originalWrite = process.stdout.write;
  process.stdout.write = (() => true) as typeof process.stdout.write;
});
afterEach(() => {
  process.stdout.write = originalWrite;
});

describe("runPackageLoop — strict order and cwd", () => {
  it("runs make, plan, start and review in order with the package cwd", async () => {
    const fixture = writeFixture(tickets([{ id: 0, tickets: [{ id: 1, status: "todo" }] }]));
    const recorded: Recorded = { sessions: [], commands: [], phases: [], stops: [], boundaries: [] };
    const processed = await runPackageLoop(
      fixture.packageEntry,
      options(),
      deps(fixture, recorded, advanceStatus),
    );
    assert.strictEqual(processed, 1);
    const commands = recorded.commands.map((entry) => entry.command);
    assert.deepStrictEqual(commands.slice(0, 4), [
      "/make-ticket P0-1",
      "/plan-ticket P0-1",
      "/start-ticket P0-1",
      "/review-ticket P0-1",
    ]);
    assert.ok(commands.some((command) => command.startsWith("/resolve-ticket")));
    assert.deepStrictEqual(commands.slice(-2), ["/consolidate-stubs", "/find-omissions"]);
    assert.ok(recorded.sessions.length > 0);
    assert.ok(recorded.sessions.every((cwd) => cwd === fixture.directory));
    assert.strictEqual(recorded.phases.length, 1);
    assert.strictEqual(recorded.phases[0]?.packageComplete, true);
    assert.strictEqual(recorded.stops.length, 0);
  });

  it("does not move to the next ticket before the first is reviewed", async () => {
    const fixture = writeFixture(
      tickets([{ id: 0, tickets: [{ id: 1, status: "done" }, { id: 2, status: "todo" }] }]),
    );
    const recorded: Recorded = { sessions: [], commands: [], phases: [], stops: [], boundaries: [] };
    const processed = await runPackageLoop(
      fixture.packageEntry,
      options(),
      deps(fixture, recorded, advanceStatus),
    );
    assert.strictEqual(processed, 2);
    const ticketCommands = recorded.commands.filter((entry) =>
      entry.command.startsWith("/"),
    );
    assert.strictEqual(ticketCommands[0]?.command, "/review-ticket P0-1");
    assert.strictEqual(ticketCommands[1]?.command, "/make-ticket P0-2");
    assert.ok(
      ticketCommands.findIndex((entry) => entry.command === "/review-ticket P0-1") <
        ticketCommands.findIndex((entry) => entry.command === "/make-ticket P0-2"),
    );
  });

  it("runs resolve after the cadence is reached, before the next ticket", async () => {
    const fixture = writeFixture(
      tickets([{ id: 0, tickets: [{ id: 1, status: "todo" }, { id: 2, status: "todo" }] }]),
    );
    const recorded: Recorded = { sessions: [], commands: [], phases: [], stops: [], boundaries: [] };
    process.chdir(fixture.directory);
    await runPackageLoop(
      fixture.packageEntry,
      options({ resolveEvery: 1 }),
      deps(fixture, recorded, advanceStatus),
    );
    const reviewIndex = recorded.commands.findIndex(
      (entry) => entry.command === "/review-ticket P0-1",
    );
    const resolveIndex = recorded.commands.findIndex(
      (entry) => entry.command.startsWith("/resolve-ticket"),
    );
    assert.ok(reviewIndex >= 0);
    assert.ok(resolveIndex > reviewIndex);
    assert.ok(resolveIndex < recorded.commands.findIndex((entry) => entry.command === "/make-ticket P0-2"));
  });

  it("continues in the same package when find adds a ticket", async () => {
    const fixture = writeFixture(tickets([{ id: 0, tickets: [{ id: 1, status: "todo" }] }]));
    const recorded: Recorded = { sessions: [], commands: [], phases: [], stops: [], boundaries: [] };
    let findRounds = 0;
    const advance = (command: string, current: Fixture): void => {
      if (command === "/find-omissions") {
        findRounds++;
        if (findRounds === 1) {
          const data = JSON.parse(readFileSync(current.ticketsPath, "utf-8")) as TicketsJson;
          data.phases[0]?.tickets.push({
            id: 2,
            phaseId: 0,
            status: "todo",
            title: "added",
          });
          writeFileSync(current.ticketsPath, JSON.stringify(data, null, 2));
          return;
        }
        return;
      }
      advanceStatus(command, current);
    };
    const processed = await runPackageLoop(
      fixture.packageEntry,
      options(),
      deps(fixture, recorded, advance),
    );
    assert.strictEqual(processed, 2);
    assert.strictEqual(findRounds, 2);
    assert.ok(recorded.commands.some((entry) => entry.command === "/make-ticket P0-2"));
  });

  it("stops after three escalations and sends a Slack stop message", async () => {
    const fixture = writeFixture(tickets([{ id: 0, tickets: [{ id: 1, status: "todo" }] }]));
    const recorded: Recorded = { sessions: [], commands: [], phases: [], stops: [], boundaries: [] };
    await assert.rejects(
      () =>
        runPackageLoop(
          fixture.packageEntry,
          options(),
          deps(fixture, recorded, () => {}),
        ),
      (error: unknown) => error instanceof LoopStoppedError,
    );
    assert.deepStrictEqual(
      recorded.commands.map((entry) => entry.escalationLevel),
      [0, 1, 2, 3],
    );
    assert.strictEqual(recorded.stops.length, 1);
    assert.match(recorded.stops[0]?.reason ?? "", /three escalations/);
  });

  it("restores the previous cwd when the loop stops", async () => {
    const fixture = writeFixture(tickets([{ id: 0, tickets: [{ id: 1, status: "todo" }] }]));
    const recorded: Recorded = { sessions: [], commands: [], phases: [], stops: [], boundaries: [] };
    const previous = process.cwd();
    await assert.rejects(() =>
      runPackageLoop(
        fixture.packageEntry,
        options(),
        deps(fixture, recorded, () => {}),
      ),
    );
    assert.strictEqual(process.cwd(), previous);
  });
});

// @verifies C001, C002, C004, C005, C006
describe("runPackageLoop — durable boundary completion", () => {
  it("skips an endpoint package without touching Tickets.json", async () => {
    const data = tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }]);
    const fixture = writeFixture(data);
    const before = readFileSync(fixture.ticketsPath, "utf-8");
    writeBoundaryState(fixture.directory, endpointStateFor(data));
    const recorded: Recorded = {
      sessions: [],
      commands: [],
      phases: [],
      stops: [],
      boundaries: [],
    };

    const processed = await runPackageLoop(
      fixture.packageEntry,
      options(),
      deps(fixture, recorded, advanceStatus),
    );

    assert.strictEqual(processed, 0);
    assert.deepStrictEqual(recorded.commands, []);
    assert.strictEqual(recorded.boundaries.length, 0);
    assert.strictEqual(readFileSync(fixture.ticketsPath, "utf-8"), before);
  });

  it("runs the boundary once, notifies once, and skips the next tick", async () => {
    const data = tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }]);
    const fixture = writeFixture(data);
    const recorded: Recorded = {
      sessions: [],
      commands: [],
      phases: [],
      stops: [],
      boundaries: [],
    };

    await runPackageLoop(
      fixture.packageEntry,
      options(),
      deps(fixture, recorded, advanceStatus),
    );

    assert.deepStrictEqual(
      recorded.commands.map((entry) => entry.command),
      ["/consolidate-stubs", "/find-omissions"],
    );
    assert.strictEqual(recorded.boundaries.length, 1);
    assert.strictEqual(
      recorded.boundaries[0]?.lastReviewedTicketKey,
      "P0-1",
    );
    assert.strictEqual(recorded.boundaries[0]?.addedTicketCount, 0);
    assert.notStrictEqual(recorded.boundaries[0]?.findFinishedAt, null);

    const state = readBoundaryState(fixture.directory);
    assert.strictEqual(state?.consolidate?.status, "COMPLETE");
    assert.strictEqual(state?.find?.status, "COMPLETE");
    assert.strictEqual(state?.ticketSetDigest, computeTicketSetDigest(data));

    recorded.commands.length = 0;
    const processed = await runPackageLoop(
      fixture.packageEntry,
      options(),
      deps(fixture, recorded, advanceStatus),
    );
    assert.strictEqual(processed, 0);
    assert.deepStrictEqual(recorded.commands, []);
    assert.strictEqual(recorded.boundaries.length, 1);
  });

  it("seeds a pending final resolve from the durable record", async () => {
    const data = tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }]);
    const fixture = writeFixture(data);
    writeBoundaryState(fixture.directory, {
      ...createBoundaryState("pkg-fixture"),
      lastReviewedTicketKey: "P0-1",
      lastReviewedAt: "1970-01-01T00:00:00.000Z",
      reviewedSinceResolve: 1,
    });
    const recorded: Recorded = {
      sessions: [],
      commands: [],
      phases: [],
      stops: [],
      boundaries: [],
    };

    await runPackageLoop(
      fixture.packageEntry,
      options(),
      deps(fixture, recorded, advanceStatus),
    );

    assert.ok(recorded.commands[0]?.command.startsWith("/resolve-ticket"));
    assert.deepStrictEqual(
      recorded.commands.slice(-2).map((entry) => entry.command),
      ["/consolidate-stubs", "/find-omissions"],
    );
  });

  it("continues the package when find adds a forNextRound ticket", async () => {
    const fixture = writeFixture(
      tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }]),
    );
    const recorded: Recorded = {
      sessions: [],
      commands: [],
      phases: [],
      stops: [],
      boundaries: [],
    };
    let findRounds = 0;
    const advance = (command: string, current: Fixture): void => {
      if (command === "/find-omissions") {
        findRounds++;
        if (findRounds === 1) {
          const data = JSON.parse(
            readFileSync(current.ticketsPath, "utf-8"),
          ) as TicketsJson;
          data.phases[0]?.tickets.push({
            id: 2,
            phaseId: 0,
            status: "todo",
            title: "added",
            forNextRound: true,
          });
          writeFileSync(current.ticketsPath, JSON.stringify(data, null, 2));
          return;
        }
        return;
      }
      advanceStatus(command, current);
    };

    await runPackageLoop(
      fixture.packageEntry,
      options(),
      deps(fixture, recorded, advance),
    );

    assert.strictEqual(findRounds, 2);
    assert.ok(recorded.commands.some((entry) => entry.command === "/make-ticket P0-2"));
  });

  it("does not complete the boundary when find throws", async () => {
    const fixture = writeFixture(
      tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }]),
    );
    const recorded: Recorded = {
      sessions: [],
      commands: [],
      phases: [],
      stops: [],
      boundaries: [],
    };
    const advance = (command: string): void => {
      if (command === "/find-omissions") throw new Error("find failed");
    };

    await assert.rejects(
      () =>
        runPackageLoop(
          fixture.packageEntry,
          options(),
          deps(fixture, recorded, advance),
        ),
      (error: unknown) => error instanceof LoopStoppedError,
    );

    const state = readBoundaryState(fixture.directory);
    assert.strictEqual(state?.consolidate?.status, "COMPLETE");
    assert.strictEqual(state?.find?.status, "IN_PROGRESS");
    assert.strictEqual(recorded.boundaries.length, 0);
    assert.strictEqual(recorded.stops.length, 1);
  });

  it("records a skipped find when noFind is set and reaches the endpoint", async () => {
    const data = tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }]);
    const fixture = writeFixture(data);
    const recorded: Recorded = {
      sessions: [],
      commands: [],
      phases: [],
      stops: [],
      boundaries: [],
    };

    await runPackageLoop(
      fixture.packageEntry,
      options({ noFind: true }),
      deps(fixture, recorded, advanceStatus),
    );

    assert.deepStrictEqual(
      recorded.commands.map((entry) => entry.command),
      ["/consolidate-stubs"],
    );
    const state = readBoundaryState(fixture.directory);
    assert.strictEqual(state?.find?.status, "SKIPPED");
    assert.strictEqual(recorded.boundaries.length, 1);
    assert.strictEqual(recorded.boundaries[0]?.findFinishedAt, null);

    recorded.commands.length = 0;
    const processed = await runPackageLoop(
      fixture.packageEntry,
      options({ noFind: true }),
      deps(fixture, recorded, advanceStatus),
    );
    assert.strictEqual(processed, 0);
    assert.deepStrictEqual(recorded.commands, []);
  });

  it("runs the boundary once for an empty ticket set and then skips", async () => {
    const fixture = writeFixture(tickets([]));
    const recorded: Recorded = {
      sessions: [],
      commands: [],
      phases: [],
      stops: [],
      boundaries: [],
    };

    await runPackageLoop(
      fixture.packageEntry,
      options(),
      deps(fixture, recorded, advanceStatus),
    );
    assert.deepStrictEqual(
      recorded.commands.map((entry) => entry.command),
      ["/consolidate-stubs", "/find-omissions"],
    );

    recorded.commands.length = 0;
    const processed = await runPackageLoop(
      fixture.packageEntry,
      options(),
      deps(fixture, recorded, advanceStatus),
    );
    assert.strictEqual(processed, 0);
    assert.deepStrictEqual(recorded.commands, []);
  });

  it("exits when an explicit endpoint selection skips an earlier pending package", async () => {
    const firstData = tickets([{ id: 0, tickets: [{ id: 1, status: "todo" }] }]);
    const secondData = tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }]);
    const first = writeFixture(firstData);
    const second = writeFixture(secondData);
    const secondEntry = {
      ...second.packageEntry,
      id: "pkg-second",
      name: "second",
    };
    writeBoundaryState(second.directory, endpointStateFor(secondData, "pkg-second"));
    const recorded: Recorded = {
      sessions: [],
      commands: [],
      phases: [],
      stops: [],
      boundaries: [],
    };

    const result = await runWorkspaceLoop(
      options({
        packages: ["second"],
        workspace: {
          root: "/ws",
          name: "ws",
          packages: [first.packageEntry, secondEntry],
        },
      }),
      deps(second, recorded, advanceStatus),
    );

    assert.strictEqual(result.processed, 0);
    assert.strictEqual(result.allSelectedComplete, true);
    assert.deepStrictEqual(recorded.commands, []);
  });

  it("skips an endpoint package and starts the next package", async () => {
    const firstData = tickets([{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }]);
    const secondData = tickets([{ id: 0, tickets: [{ id: 1, status: "todo" }] }]);
    const first = writeFixture(firstData);
    const second = writeFixture(secondData);
    writeBoundaryState(first.directory, endpointStateFor(firstData));
    const beforeFirst = readFileSync(first.ticketsPath, "utf-8");
    const recorded: Recorded = {
      sessions: [],
      commands: [],
      phases: [],
      stops: [],
      boundaries: [],
    };
    let active = first;
    const workspaceDeps: PackageLoopDeps = {
      withSession: async <T>(
        cwd: string,
        _config: SessionConfig,
        run: (session: AcpSession) => Promise<T>,
      ): Promise<T> => {
        active = cwd === first.directory ? first : second;
        return run({} as AcpSession);
      },
      runCommand: async (_session: AcpSession, command: string) => {
        recorded.commands.push({ command, escalationLevel: 0 });
        advanceStatus(command, active);
        return "";
      },
      sendSlackPhaseComplete: async () => {},
      sendSlackStop: async () => {},
      sendSlackBoundaryComplete: async () => {},
      now: () => 0,
    };

    const result = await runWorkspaceLoop(
      options({
        packages: [],
        workspace: {
          root: "/ws",
          name: "ws",
          packages: [first.packageEntry, second.packageEntry],
        },
      }),
      workspaceDeps,
    );

    assert.strictEqual(result.processed, 1);
    assert.strictEqual(result.allSelectedComplete, true);
    assert.strictEqual(recorded.commands[0]?.command, "/make-ticket P0-1");
    assert.strictEqual(readFileSync(first.ticketsPath, "utf-8"), beforeFirst);
    assert.strictEqual(
      recorded.commands.filter((entry) => entry.command === "/consolidate-stubs").length,
      1,
    );
  });
});
