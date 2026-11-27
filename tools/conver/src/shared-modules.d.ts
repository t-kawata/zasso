// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
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
  export function loadWorkspace(root: string): {
    root: string;
    treeManifestPath: string;
    treeManifest: unknown;
    allocateManifestPath: string;
    allocateManifest: unknown;
  };
}

declare module "*workspacify-order/lib/levels.mjs" {
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
  export interface WorkspacifyOrderModelPackage {
    id: string;
    name: string;
    path: string;
  }

// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
  export interface WorkspacifyOrderModel {
    packages: WorkspacifyOrderModelPackage[];
    explainedIds: Set<string>;
    grilledIds: Set<string>;
    sequenceVerdicts: Map<string, { state: string; reason: string | null }>;
    rootCounters: { edu: number | null; smo: number | null };
    rootManifests: { tree: boolean; allocate: boolean };
    grillGenerations: Map<string, number | null>;
    distributionGenerations: Map<string, number | null>;
    graphifiedIds: Set<string>;
    boundifiedIds: Set<string>;
    splitIds: Set<string>;
    graphGenerations: Map<string, number | null>;
    boundifyGenerations: Map<string, number | null>;
    splitGenerations: Map<string, number | null>;
  }

  export function buildModel(input: {
    root: string;
    treeManifest: unknown;
    allocateManifest: unknown;
  }): WorkspacifyOrderModel;
}

declare module "*workspacify-order/lib/pipeline-cells.mjs" {
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
  export interface PipelineCell {
    key: string;
    label: string;
    glyph: string | null;
    count: number | null;
    present: boolean;
    unknownCount: boolean;
  }

// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
  export interface PipelineStageMarks {
    explainedIds: Set<string>;
    grilledIds: Set<string>;
    sequenceVerdicts: Map<string, { state: string; reason: string | null }>;
    rootCounters: { edu: number | null; smo: number | null };
    rootManifests: { tree: boolean; allocate: boolean };
    grillGenerations: Map<string, number | null>;
    distributionGenerations: Map<string, number | null>;
    graphifiedIds: Set<string>;
    boundifiedIds: Set<string>;
    splitIds: Set<string>;
    graphGenerations: Map<string, number | null>;
    boundifyGenerations: Map<string, number | null>;
    splitGenerations: Map<string, number | null>;
  }

  export const FIELD_SEQUENCE: readonly string[];
  export const PIPELINE_LABELS: Readonly<Record<string, string>>;
  export function readManifestPackages(
    treeManifest: unknown,
  ): Array<{ id: string; path: string }>;
  export function readPipelineStageMarks(input: {
    root: string;
    packages: Array<{ id: string; path: string }>;
  }): PipelineStageMarks;
  export function readPipelineCells(
    model: PipelineStageMarks,
    id: string,
  ): PipelineCell[];
}

declare module "*workspacify-order/helpers/order-workspace.mjs" {
  export function materializeOrderWorkspace(options?: {
    packages?: string[];
    edges?: Array<[string, string]>;
    levels?: string[][];
    paths?: Record<string, string>;
    documents?: { explained?: string[]; grilled?: string[]; carried?: string[] };
    rootCounters?: { educe?: number; smooth?: number };
    counters?: Record<
      string,
      {
        grillGeneration?: number;
        distributionGeneration?: number;
        completedSessions?: number;
        distributions?: unknown;
        digest?: string;
      }
    >;
  }): {
    root: string;
    treeManifestPath: string;
    allocateManifestPath: string;
    treeManifest: unknown;
    allocateManifest: unknown;
    pathOf: Map<string, string>;
    remove: () => void;
  };
}
