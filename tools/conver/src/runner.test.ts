// runner.test.ts — strict package loop, cwd, escalation, boundaries and Slack.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LoopStoppedError,
  runPackageLoop,
} from "./runner.js";
import type { PackageLoopDeps, WorkspaceLoopOptions } from "./runner.js";
import type { WorkspacePackage } from "./workspace.js";
import type { PhaseCompleteContext, StopContext } from "./notifier.js";
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

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
interface Recorded {
  sessions: string[];
  commands: Array<{ command: string; escalationLevel: number }>;
  phases: PhaseCompleteContext[];
  stops: StopContext[];
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
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
    const recorded: Recorded = { sessions: [], commands: [], phases: [], stops: [] };
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
    const recorded: Recorded = { sessions: [], commands: [], phases: [], stops: [] };
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
    const recorded: Recorded = { sessions: [], commands: [], phases: [], stops: [] };
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
    const recorded: Recorded = { sessions: [], commands: [], phases: [], stops: [] };
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
    const recorded: Recorded = { sessions: [], commands: [], phases: [], stops: [] };
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
    const recorded: Recorded = { sessions: [], commands: [], phases: [], stops: [] };
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
