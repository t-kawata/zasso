// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
// shared-modules.d.ts — the typed boundary to the shared .mjs pipeline modules.
//
// conver imports these modules at runtime; esbuild bundles them and tsc emits the
// same relative specifier. The declaration is the only thing that lets tsc check
// the call sites without allowJs or a second implementation of the readers.

declare module "*workspacify-order/lib/counters.mjs" {
  export function readRootEduceGeneration(root: string): number | null;
  export function readRootSmoothGeneration(root: string): number | null;
  export function readGrillGeneration(packageDirectory: string): number | null;
  export function readGraphRuns(packageDirectory: string, stem: string): number | null;
  export function readBoundifyRuns(packageDirectory: string, stem: string): number | null;
  export function readSplitRuns(packageDirectory: string, stem: string): number | null;
  export function readWorkspacifyRuns(root: string): number;
  export function readExplainRuns(packageDirectory: string): number;
}

declare module "*workspacify-order/lib/workspace.mjs" {
  export function artifactStem(input: { root: string; packagePath: string }): string | null;
}
