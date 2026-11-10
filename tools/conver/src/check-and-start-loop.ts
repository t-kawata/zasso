// check-and-start-loop.ts — reentrancy-guarded workspace loop trigger.
//
// Retained for the watcher-style callers that want the guard separated from
// the scheduler. The workspace loop itself resolves the package selection.
import { runWorkspaceLoop } from "./runner.js";
import type { WorkspaceLoopOptions } from "./runner.js";

let isLoopRunning = false;

/** Run the workspace loop unless a previous invocation is still active. */
export async function checkAndStartLoop(
// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
// [::TICKET::] PX-403 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-403 --for-spec --no-implementation-order`.
  loopOptions: WorkspaceLoopOptions,
): Promise<void> {
  if (isLoopRunning) {
    console.warn("[Watcher] ループ実行中のためスキップします。");
    return;
  }

  isLoopRunning = true;
  try {
    await runWorkspaceLoop(loopOptions);
  } finally {
    isLoopRunning = false;
  }
}
