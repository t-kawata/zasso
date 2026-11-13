// termination.ts — the lifetime boundary of a watcher process.
//
// A watcher owns the terminal for as long as cron may fire: the progress dashboard
// must keep polling and repainting the current state. The wait ends on SIGINT/SIGTERM
// or on an explicit completion request from the cron callback when every selected
// package reached its endpoint.
// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
export interface TerminationHandle {
  wait(): Promise<void>;
  stop(): void;
}

/** Create the one wait that keeps watcher mode alive until a signal or completion. */
export function createTerminationHandle(): TerminationHandle {
  let resolveWait: (() => void) | null = null;
  const wait = new Promise<void>((resolve) => {
    resolveWait = resolve;
  });
  const stop = (): void => {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    resolveWait?.();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return { wait: () => wait, stop };
}

export function waitForTerminationSignal(): Promise<void> {
  return createTerminationHandle().wait();
}
