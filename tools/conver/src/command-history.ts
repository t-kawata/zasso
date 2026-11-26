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

/**
 * Appended to every command sent to the agent: how to report the finished work.
 * The operator reads the report, not the full transcript, so length and style
 * are part of the command's contract rather than a preference.
 */
export const COMPLETION_REPORT_DIRECTIVE =
  "On completion: brief telegraphic report, max 100 chars. No details.";

/**
 * The full non-interactive override, sent only to stages whose command document
 * still allows a human question (explain and grill). The other stages already
 * carry this block in their own command file, so re-sending it there would be a
 * duplicate rather than an override.
 */
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export const NON_INTERACTIVE_OVERRIDE = [
  "# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION",
  "This directive overrides any conflicting instruction in the command above.",
  "MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally.",
  "Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions.",
  "Do not address or consult a human; decide everything yourself and run to completion.",
].join("\n");

/** The targeted override for educe: its only conflict is the dynamic argument. */
export const EDUCE_FIXED_SPEC_OVERRIDE =
  "The specification is fixed at SYSTEM-DESIGN.md in the workspace root; the scripts resolve it and fail if it is absent. Do not ask for or refuse an argument; run with no argument.";

/** explain must answer its own direction questions and leave no placeholder open. */
export const EXPLAIN_OVERRIDE = [
  NON_INTERACTIVE_OVERRIDE,
  "Answer every direction question yourself using the command's answer mechanism. Leave no placeholder open; complete the explanation.",
].join("\n");

/**
 * grill must decide, not record a default. The command's chosen_default path is
 * a no-answer record, and recording it is not completion.
 */
export const GRILL_OVERRIDE = [
  NON_INTERACTIVE_OVERRIDE,
  "Do not use chosen_default or any recorded default to bypass a decision. Answer every open point yourself using the command's answer mechanism and complete the design.",
].join("\n");

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
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
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
 * cross-package directive, the completion report rule, an optional stage-specific
 * override, and an optional escalation message.
 *
 * The override is opt-in: an undefined or empty value produces exactly the
 * composition every existing caller already receives.
 */
export function composePrompt(
  command: string,
  escalationLevel: number,
  promptOverride?: string,
): string {
  if (!Number.isInteger(escalationLevel) || escalationLevel < 0 || escalationLevel > MAX_ESCALATIONS) {
    throw new RangeError(`escalation level must be 0..${MAX_ESCALATIONS}: ${escalationLevel}`);
  }
  const base = `${command}\n\n${CROSS_PACKAGE_DIRECTIVE}\n${COMPLETION_REPORT_DIRECTIVE}`;
  const withOverride =
    promptOverride === undefined || promptOverride === ""
      ? base
      : `${base}\n\n${promptOverride}`;
  if (escalationLevel === 0) return withOverride;
  return `${withOverride}\n\n${ESCALATION_MESSAGES[escalationLevel - 1]}`;
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
