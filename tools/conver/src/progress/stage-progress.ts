// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
// stage-progress.ts — the conver bridge to the shared workspacify-order pipeline cells.
//
// The header must not own a second presence probe or counter reader. This module builds
// the workspacify-order model with the same loaders its command uses, reads each package's
// cells through the shared `readPipelineCells`, and compacts them for one header row. A
// workspace that cannot be read yields no tokens, never a wrong bracket.
import {
  readManifestPackages,
  readPipelineCells,
  readPipelineStageMarks,
} from "../../.claude/scripts/workspacify-order/lib/pipeline-cells.mjs";
import type { PipelineCell, PipelineStageMarks } from "../../.claude/scripts/workspacify-order/lib/pipeline-cells.mjs";
import { loadWorkspace } from "../../.claude/scripts/workspacify-order/lib/workspace.mjs";

/** The workspace root and the package paths conver renders. */
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
export interface StageSource {
  readonly root: string;
  readonly packages: readonly { readonly path: string }[];
}

/** A field the package has not reached: distinct from a field that carries no count. */
const ABSENT_TOKEN = "-";
/** The suffix workspacify-order prints when a producer left the count unrecorded. */
const UNKNOWN_SUFFIX = "?";

/**
 * Compact one shared cell into its header token.
 *
 * The token is the first letter of the canonical label. A numeric count is appended; a
 * countless field stays a bare letter; an absent field is `-`; an unknown count is `<X>?`.
 */
export function formatStageToken(cell: PipelineCell): string {
  if (!cell.present) return ABSENT_TOKEN;
  const initial = cell.label.slice(0, 1);
  if (cell.unknownCount) return `${initial}${UNKNOWN_SUFFIX}`;
  return cell.count === null ? initial : `${initial}${cell.count}`;
}

/** Compact every cell of one package, preserving FIELD_SEQUENCE order. */
export function formatStageTokens(cells: readonly PipelineCell[]): string[] {
  return cells.map(formatStageToken);
}

/**
 * Forward only the first failure.
 *
 * The dashboard polls every few seconds; a workspace that cannot be read must not turn
 * one persistent condition into a line every poll.
 */
export function createOnceReporter(
  report: (message: string) => void,
): (message: string) => void {
  let reported = false;
  return (message: string): void => {
    if (reported) return;
    reported = true;
    report(message);
  };
}

/**
 * Read the ten compact stage tokens for every conver package.
 *
 * The workspacify-order model is built once per call with the same loaders its command
 * uses, so presence and counts have one source. A build failure is reported once by the
 * caller's reporter and yields no tokens; the caller's ticket phases still render.
 */
export function readStageTokens(
  workspace: StageSource,
  report: (message: string) => void = () => {},
): Map<string, string[]> {
  let marks: PipelineStageMarks;
  let packages: Array<{ id: string; path: string }>;
  try {
    const loaded = loadWorkspace(workspace.root);
    packages = readManifestPackages(loaded.treeManifest);
    marks = readPipelineStageMarks({ root: loaded.root, packages });
  } catch (error) {
    report(error instanceof Error ? error.message : String(error));
    return new Map();
  }

  try {
    const packageIdByPath = new Map(packages.map((pkg) => [pkg.path, pkg.id] as const));
    const tokensByPath = new Map<string, string[]>();
    for (const packageEntry of workspace.packages) {
      const id = packageIdByPath.get(packageEntry.path);
      if (id === undefined) continue;
      tokensByPath.set(packageEntry.path, formatStageTokens(readPipelineCells(marks, id)));
    }
    return tokensByPath;
  } catch (error) {
    report(error instanceof Error ? error.message : String(error));
    return new Map();
  }
}
