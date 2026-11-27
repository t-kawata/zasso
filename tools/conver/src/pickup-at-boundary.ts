// pickup-at-boundary.ts — run the reflection command at a pipeline boundary.
//
// /pickup-conver-update-candidates is an optional reflection step that must be
// anchored at the workspace root, because the command reads .claude from the
// repository that contains it. Neither an absent command nor a failed run may
// stop the pipeline that invoked it: this module reports and returns.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const PICKUP_COMMAND = "/pickup-conver-update-candidates";
export const PICKUP_COMMAND_RELATIVE_PATH = path.join(
  ".claude",
  "commands",
  "pickup-conver-update-candidates.md",
);

export type PickupAvailability =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export interface PickupBoundaryIo {
  exists(file: string): boolean;
  hasUpstream(root: string): boolean;
}

/** Ask git for the configured upstream without touching the network. */
function hasConfiguredUpstream(root: string): boolean {
  const result = spawnSync(
    "git",
    ["-C", root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  return result.status === 0 && result.stdout.trim() !== "";
}

const defaultIo: PickupBoundaryIo = {
  exists: (file) => existsSync(file),
  hasUpstream: hasConfiguredUpstream,
};

/**
 * The ledger's scan is fail-closed on a missing upstream. Running the command
 * where that precheck cannot pass would only spend a session to report the same
 * failure, so the boundary performs the same check before it asks the agent.
 */
export function checkPickupAvailability(
  root: string,
  io: PickupBoundaryIo = defaultIo,
): PickupAvailability {
  const commandPath = path.join(root, PICKUP_COMMAND_RELATIVE_PATH);
  if (!io.exists(commandPath)) {
    return { ok: false, reason: `command-not-installed: ${commandPath}` };
  }
  if (!io.hasUpstream(root)) {
    return { ok: false, reason: `upstream-not-configured: ${root}` };
  }
  return { ok: true };
}

export interface PickupBoundaryInput {
  /** The repository root that owns .claude; never the package directory. */
  root: string;
  execute: (cwd: string) => Promise<void>;
  isAvailable?: (root: string) => PickupAvailability;
  log?: (line: string) => void;
}

/** Run the command when available; every outcome is logged and none is thrown. */
export async function runPickupAtBoundary(
  input: PickupBoundaryInput,
): Promise<void> {
  const log = input.log ?? ((line: string) => process.stderr.write(`${line}\n`));

  let availability: PickupAvailability;
  try {
    availability = (input.isAvailable ?? checkPickupAvailability)(input.root);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[pickup] skipped: availability-check-failed: ${message}`);
    return;
  }
  if (!availability.ok) {
    log(`[pickup] skipped: ${availability.reason}`);
    return;
  }

  try {
    await input.execute(input.root);
    log("[pickup] complete");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[pickup] failed: ${message} (continuing)`);
  }
}
