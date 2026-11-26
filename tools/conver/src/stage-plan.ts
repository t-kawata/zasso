// stage-plan.ts — the -T grammar, the canonical stage table and the stage gates.
//
// The canonical order is the pipeline's own order. A concrete -T is a contiguous
// slice of it, so a gap or a reversal is refused at startup rather than becoming a
// silently skipped stage. Everything in this module is pure: it reads no file and
// opens no session, which is what makes the refusal deterministic.
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export type StageName =
  | "workspacify"
  | "educe"
  | "explain"
  | "grill"
  | "smooth"
  | "graphify"
  | "boundify"
  | "split"
  | "make"
  | "plan"
  | "start"
  | "review"
  | "resolve"
  | "consolidate"
  | "find"
  | "crystalize";

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export type StageScope = "workspace" | "package";

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export interface StageDefinition {
  readonly name: StageName;
  readonly scope: StageScope;
  readonly repeatable: boolean;
  readonly commands: readonly string[];
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export interface StageSelection {
  readonly name: StageName;
  readonly count: number;
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export interface StagePlan {
  readonly selections: readonly StageSelection[];
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export type StagePlanErrorCode =
  | "UNKNOWN_STAGE"
  | "DUPLICATE_STAGE"
  | "GAP"
  | "OUT_OF_ORDER"
  | "COUNT_NOT_ALLOWED"
  | "INVALID_COUNT";

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export class StagePlanError extends Error {
  constructor(
    readonly code: StagePlanErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StagePlanError";
  }
}

export const DEFAULT_STAGE_PLAN_RAW = "make,plan,start,review,resolve,consolidate,find";

// The order is the single authority: the engine, the CLI validator and the tests
// all read this array rather than repeating the sequence.
export const CANONICAL_STAGE_DEFINITIONS: readonly StageDefinition[] = Object.freeze([
  { name: "workspacify", scope: "workspace", repeatable: false, commands: ["/workspacify-tree", "/workspacify-allocate"] },
  { name: "educe", scope: "workspace", repeatable: true, commands: ["/educe-sequences"] },
  { name: "explain", scope: "package", repeatable: false, commands: ["/explain-seed"] },
  { name: "grill", scope: "package", repeatable: true, commands: ["/grill-me-for-rfc"] },
  { name: "smooth", scope: "workspace", repeatable: true, commands: ["/smooth-sequences"] },
  { name: "graphify", scope: "package", repeatable: true, commands: ["/graphify-rfc"] },
  { name: "boundify", scope: "package", repeatable: true, commands: ["/boundify-graph"] },
  { name: "split", scope: "package", repeatable: true, commands: ["/split-to-tickets"] },
  { name: "make", scope: "package", repeatable: false, commands: ["/make-ticket"] },
  { name: "plan", scope: "package", repeatable: false, commands: ["/plan-ticket"] },
  { name: "start", scope: "package", repeatable: false, commands: ["/start-ticket"] },
  { name: "review", scope: "package", repeatable: false, commands: ["/review-ticket"] },
  { name: "resolve", scope: "package", repeatable: false, commands: ["/resolve-ticket"] },
  { name: "consolidate", scope: "package", repeatable: false, commands: ["/consolidate-stubs"] },
  { name: "find", scope: "package", repeatable: false, commands: ["/find-omissions"] },
  { name: "crystalize", scope: "package", repeatable: true, commands: ["/crystalize-readme"] },
]);

const DEFINITION_BY_NAME = new Map<StageName, StageDefinition>(
  CANONICAL_STAGE_DEFINITIONS.map((definition) => [definition.name, definition]),
);

const STAGE_FOR_COMMAND = new Map<string, StageName>(
  CANONICAL_STAGE_DEFINITIONS.flatMap((definition) =>
    definition.commands.map((command) => [command, definition.name] as const),
  ),
);

const IMPLEMENTATION_STAGES: readonly StageName[] = Object.freeze([
  "make",
  "plan",
  "start",
  "review",
  "resolve",
  "consolidate",
  "find",
]);

const COUNTED_TOKEN = /^[1-9]\d*$/;

export function stageDefinition(name: StageName): StageDefinition {
  const definition = DEFINITION_BY_NAME.get(name);
  if (definition === undefined) {
    throw new StagePlanError("UNKNOWN_STAGE", `unknown stage: ${name}`);
  }
  return definition;
}

/** The stage a command belongs to, or null for a command outside the pipeline. */
export function stageForCommand(command: string): StageName | null {
  const base = command.trim().split(/\s+/, 1)[0] ?? "";
  return STAGE_FOR_COMMAND.get(base) ?? null;
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export interface StageGate {
  readonly requiresSystemDesign: boolean;
  readonly requiresTreeAndAllocate: boolean;
  readonly requiresExistingWorkspaceGate: boolean;
}

/** The entry gate a plan owes when it starts at this stage. */
export function resolveStageGate(name: StageName): StageGate {
  if (name === "workspacify") {
    return {
      requiresSystemDesign: true,
      requiresTreeAndAllocate: false,
      requiresExistingWorkspaceGate: false,
    };
  }
  if (name === "educe") {
    return {
      requiresSystemDesign: true,
      requiresTreeAndAllocate: true,
      requiresExistingWorkspaceGate: false,
    };
  }
  if (IMPLEMENTATION_STAGES.includes(name) || name === "crystalize") {
    return {
      requiresSystemDesign: false,
      requiresTreeAndAllocate: false,
      requiresExistingWorkspaceGate: true,
    };
  }
  return {
    requiresSystemDesign: false,
    requiresTreeAndAllocate: true,
    requiresExistingWorkspaceGate: false,
  };
}

/** True when the plan is exactly the implementation group with no repetition. */
export function isDefaultImplementationPlan(plan: StagePlan): boolean {
  if (plan.selections.length !== IMPLEMENTATION_STAGES.length) return false;
  return plan.selections.every(
    (selection, index) =>
      selection.name === IMPLEMENTATION_STAGES[index] && selection.count === 1,
  );
}

/**
 * Parse a -T value into a plan.
 *
 * An absent or empty value is the default implementation plan. Every other token
 * must name a stage, may carry a count only on a repeatable stage, and the whole
 * list must be a contiguous slice of the canonical order.
 */
export function parseStagePlan(raw: string | undefined): StagePlan {
  if (raw === undefined || raw.trim() === "") {
    return parseStagePlan(DEFAULT_STAGE_PLAN_RAW);
  }

  const tokens = raw.split(",");
  const selections: StageSelection[] = [];
  const seen = new Set<StageName>();

  for (const token of tokens) {
    const trimmed = token.trim();
    if (trimmed === "") {
      throw new StagePlanError(
        "UNKNOWN_STAGE",
        `empty stage token in -T: ${raw}`,
      );
    }

    const parts = trimmed.split(":");
    if (parts.length > 2) {
      throw new StagePlanError(
        "INVALID_COUNT",
        `a stage token carries at most one count: ${trimmed}`,
      );
    }

    const namePart = parts[0]?.trim() ?? "";
    const definition = CANONICAL_STAGE_DEFINITIONS.find(
      (candidate) => candidate.name === namePart,
    );
    if (definition === undefined) {
      throw new StagePlanError("UNKNOWN_STAGE", `unknown stage: ${namePart}`);
    }
    if (seen.has(definition.name)) {
      throw new StagePlanError(
        "DUPLICATE_STAGE",
        `stage is listed more than once: ${definition.name}`,
      );
    }
    seen.add(definition.name);

    let count = 1;
    if (parts.length === 2) {
      const countPart = parts[1] ?? "";
      if (!COUNTED_TOKEN.test(countPart)) {
        throw new StagePlanError(
          "INVALID_COUNT",
          `a stage count must be a positive integer: ${trimmed}`,
        );
      }
      if (!definition.repeatable) {
        throw new StagePlanError(
          "COUNT_NOT_ALLOWED",
          `stage does not accept a count: ${definition.name}`,
        );
      }
      count = Number.parseInt(countPart, 10);
    }

    selections.push({ name: definition.name, count });
  }

  const names = selections.map((selection) => selection.name);
  assertContiguousSlice(names);
  return { selections };
}

/**
 * Require the selected names to equal one contiguous slice of the canonical order.
 *
 * An increasing list with a gap is GAP; a list that moves backwards is
 * OUT_OF_ORDER. A single name is a slice of length one and is always contiguous.
 */
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function assertContiguousSlice(names: readonly StageName[]): void {
  const canonicalNames = CANONICAL_STAGE_DEFINITIONS.map(
    (definition) => definition.name,
  );
  const expected = canonicalNames.slice(
    canonicalNames.indexOf(names[0] as StageName),
    canonicalNames.indexOf(names[0] as StageName) + names.length,
  );
  if (expected.length === names.length && expected.every((name, index) => name === names[index])) {
    return;
  }

  const indices = names.map((name) => canonicalNames.indexOf(name));
  const increasing = indices.every(
    (index, position) => position === 0 || index > (indices[position - 1] ?? -1),
  );
  throw new StagePlanError(
    increasing ? "GAP" : "OUT_OF_ORDER",
    increasing
      ? `-T skips a stage between its selections: ${names.join(",")}`
      : `-T lists stages out of the canonical order: ${names.join(",")}`,
  );
}
