// lifecycle.ts — one ordering for stopping the display and resizing it.
//
// The renderer and the dashboard share the terminal: the renderer appends log
// text below the fixed header, and the dashboard owns the scroll region and the
// saved cursor. A shutdown that stops the dashboard before the renderer flushes
// leaves an open line, so the shell prompt joins it; a resize that reaches only
// the dashboard leaves the thought writer wrapping at the old width. Both orders
// are data here, injectable and testable without a terminal.
// [::TICKET::] PX-408 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-408 --for-spec --no-implementation-order`.
export interface DisplayLifecycleDeps {
  renderer: { flush(): void; resize(width: number): void } | null;
  dashboard: { stop(): void; handleResize(): void } | null;
  detachInput: () => void;
  terminalWidth: () => number;
  exit: (code: number) => never;
}

// [::TICKET::] PX-408 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-408 --for-spec --no-implementation-order`.
export class DisplayLifecycle {
  readonly #deps: DisplayLifecycleDeps;
  #stopped = false;

// [::TICKET::] PX-408 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-408 --for-spec --no-implementation-order`.
  constructor(deps: DisplayLifecycleDeps) {
    this.#deps = deps;
  }

  /** Flush the renderer, then stop the dashboard. Idempotent. */
  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#deps.renderer?.flush();
    this.#deps.dashboard?.stop();
  }

  /** Stop the display, release input listeners, then exit. */
  shutdown(code: number): never {
    const firstStop = !this.#stopped;
    this.stop();
    if (firstStop) this.#deps.detachInput();
    return this.#deps.exit(code);
  }

  /** Forward the current width before the dashboard recomputes its header. */
  resize(): void {
    this.#deps.renderer?.resize(this.#deps.terminalWidth());
    this.#deps.dashboard?.handleResize();
  }
}
