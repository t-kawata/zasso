// termination.ts — the lifetime boundary of a watcher process.
//
// A watcher owns the terminal for as long as cron may fire: the progress
// dashboard must keep polling and repainting the current state. Returning from
// watcher mode early would let main()'s finally stop the dashboard while the
// scheduler is still alive, freezing the header and releasing the cursor.
//
// This module supplies the one wait that keeps watcher mode from returning
// until the operator (or the service manager) sends SIGINT or SIGTERM.
export function waitForTerminationSignal(): Promise<void> {
  return new Promise((resolve) => {
    const stop = (): void => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
