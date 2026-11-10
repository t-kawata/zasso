// package-selection.ts — unique partial package names and order-crossing safety.
//
// A selection may skip a package only when that package has no pending work.
// Otherwise a later package would be implemented while an earlier dependency
// still has tickets, which the safe implementation order forbids. The check
// happens at startup, before any session is opened.
import type { WorkspacePackage } from "./workspace.js";

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export type SelectionErrorCode = "UNKNOWN" | "AMBIGUOUS" | "ORDER_CROSSING";

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export class PackageSelectionError extends Error {
  constructor(
    readonly code: SelectionErrorCode,
    message: string,
    readonly candidates: string[] = [],
  ) {
    super(message);
    this.name = "PackageSelectionError";
  }
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface SelectionInput {
  /** Packages in implementation order. */
  packages: readonly WorkspacePackage[];
  /** Package names as given on the command line or in the watcher config. */
  requested: readonly string[];
  /** Whether the package still has a non-terminal ticket. */
  hasPending: (pkg: WorkspacePackage) => boolean;
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function normalizeRequested(requested: readonly string[]): string[] {
  const names = requested
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(names)];
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function resolveOne(
  packages: readonly WorkspacePackage[],
  requestedName: string,
): WorkspacePackage {
  const exact = packages.find((pkg) => pkg.name === requestedName);
  if (exact !== undefined) return exact;

  const matches = packages.filter((pkg) => pkg.name.includes(requestedName));
  if (matches.length === 0) {
    throw new PackageSelectionError(
      "UNKNOWN",
      `package "${requestedName}" does not match any package`,
    );
  }
  if (matches.length > 1) {
    throw new PackageSelectionError(
      "AMBIGUOUS",
      `package "${requestedName}" is ambiguous: ${matches.map((pkg) => pkg.name).join(", ")}`,
      matches.map((pkg) => pkg.name),
    );
  }
  return matches[0]!;
}

/**
 * Resolve the requested names to packages and reject a selection that would
 * skip an earlier pending package. An empty request selects every package.
 */
export function resolvePackageSelection(input: SelectionInput): WorkspacePackage[] {
  const requested = normalizeRequested(input.requested);
  if (requested.length === 0) return [...input.packages];

  const selectedIds = new Set(
    requested.map((name) => resolveOne(input.packages, name).id),
  );
  const selected = input.packages.filter((pkg) => selectedIds.has(pkg.id));

  let lastPendingIndex = -1;
  input.packages.forEach((pkg, index) => {
    if (selectedIds.has(pkg.id) && input.hasPending(pkg)) {
      lastPendingIndex = index;
    }
  });

  if (lastPendingIndex >= 0) {
    const skipped = input.packages
      .slice(0, lastPendingIndex)
      .filter((pkg) => input.hasPending(pkg) && !selectedIds.has(pkg.id))
      .map((pkg) => pkg.name);
    if (skipped.length > 0) {
      throw new PackageSelectionError(
        "ORDER_CROSSING",
        `selection would skip pending package(s): ${skipped.join(", ")}`,
        skipped,
      );
    }
  }

  return selected;
}
