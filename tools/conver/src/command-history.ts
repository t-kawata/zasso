// command-history.ts — the last ten command executions and the fail-stop rule.
//
// The loop re-reads Tickets.json before every execution, so an unchanged
// status derives the same command again. Three repeated executions escalate
// with stronger instructions; a fourth repetition stops conver instead of
// silently skipping the ticket. The history is a process-wide singleton so a
// session boundary cannot reset the count.

/** The number of executions retained for repetition detection. */
export const COMMAND_HISTORY_LIMIT = 10;

/** The number of escalated resends allowed before the loop stops. */
export const MAX_ESCALATIONS = 3;

/**
 * Appended to every command sent to the agent. It names the cross-package
 * obligation and forbids delegating the decision to a human.
 */
export const CROSS_PACKAGE_DIRECTIVE =
  "Complete the work across other packages whenever doing so is required to prevent " +
  "omissions, contradictions, deficiencies, or hazards involving other packages or " +
  "other tickets, or any possibility of them. The design and information required " +
  "for accurate and safe work already exist in full. Never ask a human for a " +
  "judgment. Do not address or consult a human; decide everything yourself and run " +
  "to completion.";

/** Escalation texts, from a direct restatement to a final warning. */
export const ESCALATION_MESSAGES: readonly [string, string, string] = Object.freeze([
  "The same command has already been sent for this ticket and the status has not " +
    "advanced. Complete the work across other packages whenever doing so is required " +
    "to prevent omissions, contradictions, deficiencies, or hazards involving other " +
    "packages or other tickets, or any possibility of them. The design and information " +
    "required for accurate and safe work already exist in full. Never ask a human for " +
    "a judgment. Do not address or consult a human; decide everything yourself and " +
    "finish this command now.",
  "This is a repeated execution. You must not stop, defer, or ask a human. " +
    "Cross-package work is mandatory wherever any omission, contradiction, deficiency, " +
    "or hazard could arise. All necessary design and information already exist. Decide " +
    "and complete the command now, and emit the required status transition.",
  "FINAL ATTEMPT. If the status does not advance after this execution, conver will " +
    "stop and report the failure. Do not ask a human. Do not defer. Complete the work " +
    "across packages wherever required, using the design and information that already " +
    "exist, and emit the required status transition immediately.",
]);

/** The location and reason recorded when the loop must stop. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface StopContext {
  workspace: string;
  packageName: string;
  phaseId: number | null;
  ticketKey: string | null;
  command: string | null;
  reason: string;
}

/** One executed command, retained for repetition detection. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface CommandExecution {
  workspace: string;
  packageName: string;
  ticketKey: string;
  command: string;
  statusBefore: string;
  at: number;
}

/** Raised when a repeated command exhausts its escalations. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export class StopRequestedError extends Error {
  constructor(
    readonly reason: "escalation-exhausted" | "find-round-limit",
    readonly ticketKey: string,
    readonly command: string,
  ) {
    super(`conver must stop: ${reason} (${ticketKey} ${command})`);
    this.name = "StopRequestedError";
  }
}

/**
 * Compose the text actually sent to the agent: the command, two newlines, the
 * cross-package directive, and an optional escalation message.
 */
export function composePrompt(command: string, escalationLevel: number): string {
  if (!Number.isInteger(escalationLevel) || escalationLevel < 0 || escalationLevel > MAX_ESCALATIONS) {
    throw new RangeError(`escalation level must be 0..${MAX_ESCALATIONS}: ${escalationLevel}`);
  }
  const base = `${command}\n\n${CROSS_PACKAGE_DIRECTIVE}`;
  if (escalationLevel === 0) return base;
  return `${base}\n\n${ESCALATION_MESSAGES[escalationLevel - 1]}`;
}

/**
 * A bounded FIFO of executions plus the per-ticket escalation counters.
 * `record` is called after every send; `resetTicket` is called when the
 * ticket's status advances.
 */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export class CommandHistory {
  #entries: CommandExecution[] = [];
  #escalations = new Map<string, number>();

  record(execution: CommandExecution): void {
    this.#entries.push(execution);
    if (this.#entries.length > COMMAND_HISTORY_LIMIT) {
      this.#entries.shift();
    }
  }

  hasRepeated(ticketKey: string, command: string): boolean {
    return this.#entries.some(
      (entry) => entry.ticketKey === ticketKey && entry.command === command,
    );
  }

  /**
   * Return the next escalation level (1..MAX_ESCALATIONS).
   * The call after the last allowed level throws StopRequestedError.
   */
  nextEscalation(ticketKey: string, command: string): number {
    const key = `${ticketKey}\u0000${command}`;
    const next = (this.#escalations.get(key) ?? 0) + 1;
    if (next > MAX_ESCALATIONS) {
      throw new StopRequestedError("escalation-exhausted", ticketKey, command);
    }
    this.#escalations.set(key, next);
    return next;
  }

  /** Clear every escalation counter for a ticket after its status advanced. */
  resetTicket(ticketKey: string): void {
    for (const key of this.#escalations.keys()) {
      if (key.startsWith(`${ticketKey}\u0000`)) {
        this.#escalations.delete(key);
      }
    }
  }

  snapshot(): readonly CommandExecution[] {
    return [...this.#entries];
  }

  /** Test seam: drop all retained state. */
  clear(): void {
    this.#entries = [];
    this.#escalations.clear();
  }
}

/** Process-wide history shared by every package and session. */
export const commandHistory = new CommandHistory();
