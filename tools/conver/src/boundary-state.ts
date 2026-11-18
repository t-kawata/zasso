// boundary-state.ts — durable package boundary completion and the endpoint predicate.
//
// A package boundary (/consolidate-stubs -> /find-omissions) belongs to one ticket
// set, not to one watcher tick. The watcher recreates its in-memory progress on every
// tick, so the completion is persisted beside Tickets.json and read before any command
// runs.
//
// The absence of a record is not evidence that the boundary is pending: a package may
// have been completed before this state existed, on another working tree, or outside
// conver. When every ticket is terminal and no readable record exists, the package is
// adopted as a legacy completion and no boundary command runs. A readable record still
// governs: a stale or partial one means the boundary is pending.
// [::TICKET::] PX-446 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-446 --for-spec --no-implementation-order`.
import { createHash } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { TicketsJson } from "./tickets.js";
import { isTerminalStatus, ticketKeyOf } from "./ticket-status.js";
import type { WorkspacePackage } from "./workspace.js";

/** The state file sits beside Tickets.json so a package carries its own completion. */
export const BOUNDARY_STATE_FILE = ".conver-boundary.json";

// A breaking schema change must invalidate old records rather than reinterpret
// them. An additive optional field does not: an older record's meaning is
// unchanged, so PX-446 did not bump this version.
/** The record shape version. */
export const BOUNDARY_STATE_VERSION = 1;

export const BOUNDARY_STATUS_IN_PROGRESS = "IN_PROGRESS";
export const BOUNDARY_STATUS_COMPLETE = "COMPLETE";
export const BOUNDARY_STATUS_SKIPPED = "SKIPPED";

/** conver observed the boundary and ran its commands. */
// [::TICKET::] PX-446 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-446 --for-spec --no-implementation-order`.
export const BOUNDARY_COMPLETION_BOUNDARY = "boundary";

/** conver adopted a ticket set that was already terminal when it first read it. */
// [::TICKET::] PX-446 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-446 --for-spec --no-implementation-order`.
export const BOUNDARY_COMPLETION_LEGACY = "legacy";

/**
 * How the record was established. An absent value on an older record means
 * BOUNDARY_COMPLETION_BOUNDARY.
 */
// [::TICKET::] PX-446 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-446 --for-spec --no-implementation-order`.
export type BoundaryCompletionSource =
  | typeof BOUNDARY_COMPLETION_BOUNDARY
  | typeof BOUNDARY_COMPLETION_LEGACY;

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
export type BoundaryCommandStatus =
  | typeof BOUNDARY_STATUS_IN_PROGRESS
  | typeof BOUNDARY_STATUS_COMPLETE
  | typeof BOUNDARY_STATUS_SKIPPED;

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
export type BoundaryKind = "consolidate" | "find";

/** One boundary command's lifecycle. */
// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
export interface BoundaryCommandRecord {
  status: BoundaryCommandStatus;
  startedAt: string;
  finishedAt: string | null;
  addedTicketKeys: string[];
}

/** The durable completion record for one package. */
// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
export interface BoundaryState {
  version: number;
  packageId: string;
  lastReviewedTicketKey: string | null;
  lastReviewedAt: string | null;
  reviewedSinceResolve: number;
  ticketSetDigest: string | null;
  consolidate: BoundaryCommandRecord | null;
  find: BoundaryCommandRecord | null;
  /** Absent on records written before PX-446; those mean "boundary". */
  // [::TICKET::] PX-446 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-446 --for-spec --no-implementation-order`.
  completionSource?: BoundaryCompletionSource;
  /** When conver adopted a pre-existing terminal ticket set. */
  // [::TICKET::] PX-446 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-446 --for-spec --no-implementation-order`.
  adoptedAt?: string | null;
}

/** File-system seam so write failures and corrupt reads remain unit-testable. */
// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
export interface BoundaryStateIo {
  readFile(file: string): string;
  writeFile(file: string, content: string): void;
  rename(from: string, to: string): void;
}

export const nodeBoundaryStateIo: BoundaryStateIo = {
  readFile: (file) => readFileSync(file, "utf8"),
  writeFile: (file, content) => writeFileSync(file, content, "utf8"),
  rename: (from, to) => renameSync(from, to),
};

/** Absolute path of the state file for a package directory. */
export function boundaryStatePath(packageDirectory: string): string {
  return path.join(packageDirectory, BOUNDARY_STATE_FILE);
}

/** A digest of the ticket set that ignores formatting, key order and the round. */
export function computeTicketSetDigest(ticketsData: TicketsJson): string {
  const lines = ticketsData.phases.flatMap((phase) =>
    phase.tickets.map((ticket) => `${phase.id}:${ticket.id}:${ticket.status}`),
  );
  return "sha256:" + createHash("sha256").update(lines.join("\n")).digest("hex");
}

/** Ticket keys in phase-array then ticket-array order, the declared implementation order. */
export function ticketKeysOf(ticketsData: TicketsJson): string[] {
  return ticketsData.phases.flatMap((phase) =>
    phase.tickets.map((ticket) => ticketKeyOf(phase.id, ticket.id)),
  );
}

/** True when every ticket is terminal. A non-terminal forNextRound ticket still blocks. */
export function isTicketSetTerminal(ticketsData: TicketsJson): boolean {
  return ticketsData.phases.every((phase) =>
    phase.tickets.every((ticket) => isTerminalStatus(ticket.status)),
  );
}

/**
 * True only when the record proves the current ticket set completed its boundary.
 * Every branch that cannot prove completion returns false; a false positive would
 * silently skip the boundary for a package.
 */
export function isPackageEndpoint(
  ticketsData: TicketsJson,
  state: BoundaryState | null,
): boolean {
  if (state === null) return false;
  if (state.version !== BOUNDARY_STATE_VERSION) return false;
  if (!isTicketSetTerminal(ticketsData)) return false;
  if (state.reviewedSinceResolve !== 0) return false;
  if (state.ticketSetDigest === null) return false;
  if (state.ticketSetDigest !== computeTicketSetDigest(ticketsData)) return false;
  if (totalTickets(ticketsData) > 0 && state.lastReviewedAt === null) return false;
  if (
    state.completionSource === BOUNDARY_COMPLETION_LEGACY &&
    state.consolidate === null &&
    state.find === null
  ) {
    return typeof state.adoptedAt === "string";
  }
  if (state.consolidate?.status !== BOUNDARY_STATUS_COMPLETE) return false;
  if (state.find === null) return false;
  if (
    state.find.status !== BOUNDARY_STATUS_COMPLETE &&
    state.find.status !== BOUNDARY_STATUS_SKIPPED
  ) {
    return false;
  }
  return boundaryFinishedAfterLastReview(state);
}

/** True when every selected package has a complete boundary record. */
export function shouldTerminateWatcher(
  packages: readonly WorkspacePackage[],
  readTickets: (ticketsPath: string) => TicketsJson,
  readState: (packageDirectory: string) => BoundaryState | null,
): boolean {
  return packages.every((pkg) =>
    isPackageEndpoint(readTickets(pkg.ticketsPath), readState(pkg.directory)),
  );
}

export function createBoundaryState(packageId: string): BoundaryState {
  return {
    version: BOUNDARY_STATE_VERSION,
    packageId,
    lastReviewedTicketKey: null,
    lastReviewedAt: null,
    reviewedSinceResolve: 0,
    ticketSetDigest: null,
    consolidate: null,
    find: null,
    completionSource: BOUNDARY_COMPLETION_BOUNDARY,
    adoptedAt: null,
  };
}

/**
 * Record a ticket set that was already terminal when conver first read it.
 *
 * The record carries the current digest so a later ticket-set change invalidates
 * it, and no command records because no boundary ran. `completionSource` keeps
 * the adoption distinguishable from a boundary that completed normally.
 */
// [::TICKET::] PX-446 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-446 --for-spec --no-implementation-order`.
export function createLegacyCompletionState(
  packageId: string,
  ticketsData: TicketsJson,
  at: string,
): BoundaryState {
  const keys = ticketKeysOf(ticketsData);
  const lastKey = keys[keys.length - 1] ?? null;
  return {
    ...createBoundaryState(packageId),
    lastReviewedTicketKey: lastKey,
    lastReviewedAt: lastCompletedAt(ticketsData) ?? at,
    ticketSetDigest: computeTicketSetDigest(ticketsData),
    completionSource: BOUNDARY_COMPLETION_LEGACY,
    adoptedAt: at,
  };
}

/** The completion time of the last ticket in array order, when it carries one. */
// [::TICKET::] PX-446 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-446 --for-spec --no-implementation-order`.
function lastCompletedAt(ticketsData: TicketsJson): string | null {
  for (
    let phaseIndex = ticketsData.phases.length - 1;
    phaseIndex >= 0;
    phaseIndex--
  ) {
    const phase = ticketsData.phases[phaseIndex];
    const lastTicket = phase?.tickets[phase.tickets.length - 1];
    if (lastTicket?.completedAt !== undefined) return lastTicket.completedAt;
  }
  return null;
}

/**
 * Record a terminal review. The prior boundary no longer describes this ticket set,
 * so both command records and the digest are cleared; the next boundary must rerun.
 */
export function markReviewed(
  state: BoundaryState,
  ticketKey: string,
  at: string,
): BoundaryState {
  return {
    ...state,
    lastReviewedTicketKey: ticketKey,
    lastReviewedAt: at,
    reviewedSinceResolve: state.reviewedSinceResolve + 1,
    ticketSetDigest: null,
    consolidate: null,
    find: null,
    completionSource: BOUNDARY_COMPLETION_BOUNDARY,
    adoptedAt: null,
  };
}

export function markResolved(state: BoundaryState): BoundaryState {
  return {
    ...state,
    reviewedSinceResolve: 0,
    completionSource: BOUNDARY_COMPLETION_BOUNDARY,
    adoptedAt: null,
  };
}

/**
 * Mark one boundary command as running. A fresh consolidate run invalidates every
 * earlier boundary record; find runs only after consolidate and keeps that record.
 */
export function markBoundaryStarted(
  state: BoundaryState,
  kind: BoundaryKind,
  at: string,
): BoundaryState {
  const started: BoundaryCommandRecord = {
    status: BOUNDARY_STATUS_IN_PROGRESS,
    startedAt: at,
    finishedAt: null,
    addedTicketKeys: [],
  };
  if (kind === "consolidate") {
    return {
      ...state,
      consolidate: started,
      find: null,
      ticketSetDigest: null,
      completionSource: BOUNDARY_COMPLETION_BOUNDARY,
      adoptedAt: null,
    };
  }
  return {
    ...state,
    find: started,
    completionSource: BOUNDARY_COMPLETION_BOUNDARY,
    adoptedAt: null,
  };
}

/**
 * Mark one boundary command complete. A find completion must carry the post-find
 * digest, because find can change ticket statuses and add tickets.
 */
export function markBoundaryCompleted(
  state: BoundaryState,
  kind: BoundaryKind,
  at: string,
  options: { digest?: string; addedTicketKeys?: string[] } = {},
): BoundaryState {
  const record = state[kind];
  if (record === null) {
    throw new Error(`boundary ${kind} completion without a start record`);
  }
  const completed: BoundaryCommandRecord = {
    ...record,
    status: BOUNDARY_STATUS_COMPLETE,
    finishedAt: at,
    addedTicketKeys: options.addedTicketKeys ?? [],
  };
  if (kind === "consolidate") {
    return { ...state, consolidate: completed };
  }
  if (options.digest === undefined) {
    throw new Error("find completion requires the post-find ticket-set digest");
  }
  return { ...state, find: completed, ticketSetDigest: options.digest };
}

/** Record that noFind explicitly skipped the find command for this ticket set. */
export function markFindSkipped(
  state: BoundaryState,
  at: string,
  digest: string,
): BoundaryState {
  return {
    ...state,
    find: {
      status: BOUNDARY_STATUS_SKIPPED,
      startedAt: at,
      finishedAt: at,
      addedTicketKeys: [],
    },
    ticketSetDigest: digest,
    completionSource: BOUNDARY_COMPLETION_BOUNDARY,
    adoptedAt: null,
  };
}

/** Read a complete record, or null when it is missing, corrupt, or from another schema. */
export function readBoundaryState(
  packageDirectory: string,
  io: BoundaryStateIo = nodeBoundaryStateIo,
): BoundaryState | null {
  const file = boundaryStatePath(packageDirectory);
  let raw: string;
  try {
    raw = io.readFile(file);
  } catch (error) {
    if (!isMissingFileError(error)) {
      console.warn(`[boundary] cannot read ${file}: ${errorMessage(error)}`);
    }
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isBoundaryState(parsed)) {
      console.warn(`[boundary] ignoring invalid boundary state in ${file}`);
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn(`[boundary] cannot parse ${file}: ${errorMessage(error)}`);
    return null;
  }
}

/** Atomically replace the record; a reader sees the old or the new document. */
export function writeBoundaryState(
  packageDirectory: string,
  state: BoundaryState,
  io: BoundaryStateIo = nodeBoundaryStateIo,
): void {
  const file = boundaryStatePath(packageDirectory);
  const temporary = `${file}.tmp-${process.pid}`;
  io.writeFile(temporary, JSON.stringify(state, null, 2) + "\n");
  io.rename(temporary, file);
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
function totalTickets(ticketsData: TicketsJson): number {
  return ticketsData.phases.reduce(
    (count, phase) => count + phase.tickets.length,
    0,
  );
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
function boundaryFinishedAfterLastReview(state: BoundaryState): boolean {
  if (state.lastReviewedAt === null) return true;
  const lastReviewed = Date.parse(state.lastReviewedAt);
  if (Number.isNaN(lastReviewed)) return false;

  const consolidateFinished = parseFinishedAt(state.consolidate);
  if (consolidateFinished === null || consolidateFinished < lastReviewed) return false;
  if (state.find?.status === BOUNDARY_STATUS_SKIPPED) return true;

  const findFinished = parseFinishedAt(state.find);
  return findFinished !== null && findFinished >= lastReviewed;
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
function parseFinishedAt(record: BoundaryCommandRecord | null): number | null {
  if (record?.finishedAt === null || record?.finishedAt === undefined) return null;
  const parsed = Date.parse(record.finishedAt);
  return Number.isNaN(parsed) ? null : parsed;
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
function isBoundaryState(value: unknown): value is BoundaryState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === BOUNDARY_STATE_VERSION &&
    typeof candidate.packageId === "string" &&
    isNullableString(candidate.lastReviewedTicketKey) &&
    isNullableString(candidate.lastReviewedAt) &&
    typeof candidate.reviewedSinceResolve === "number" &&
    Number.isInteger(candidate.reviewedSinceResolve) &&
    candidate.reviewedSinceResolve >= 0 &&
    isNullableString(candidate.ticketSetDigest) &&
    (candidate.consolidate === null || isCommandRecord(candidate.consolidate)) &&
    (candidate.find === null || isCommandRecord(candidate.find)) &&
    (candidate.completionSource === undefined ||
      candidate.completionSource === BOUNDARY_COMPLETION_BOUNDARY ||
      candidate.completionSource === BOUNDARY_COMPLETION_LEGACY) &&
    (candidate.adoptedAt === undefined || isNullableString(candidate.adoptedAt))
  );
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
function isCommandRecord(value: unknown): value is BoundaryCommandRecord {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.status === BOUNDARY_STATUS_IN_PROGRESS ||
      candidate.status === BOUNDARY_STATUS_COMPLETE ||
      candidate.status === BOUNDARY_STATUS_SKIPPED) &&
    typeof candidate.startedAt === "string" &&
    isNullableString(candidate.finishedAt) &&
    Array.isArray(candidate.addedTicketKeys) &&
    candidate.addedTicketKeys.every((key) => typeof key === "string")
  );
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}
