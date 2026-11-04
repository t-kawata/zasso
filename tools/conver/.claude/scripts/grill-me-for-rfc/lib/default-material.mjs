/**
 * The material a grill run discovers before it is given any argument.
 *
 * Discovery is unconditional: the five-layer loop fixes where a run starts and
 * `/educe-sequences` fixes where its artifact lives, so the operator must not have to
 * repeat either fact on every invocation. Arguments remain additions, never
 * replacements; the caller merges them after this answer.
 *
 * The file system is injected so the rule is testable without a tree, the way
 * `sequences-slice/lib/material.mjs` already decides its own question.
 */

/** The suffix `/educe-sequences` gives the artifact it writes. */
export const SOURCE_ARTIFACT_SUFFIX = '-sequences.json';

/** The suffix `backup-rfc.js` and the checklist writer give the copies they take. */
export const BACKUP_SUFFIX = '.bak.md';

/** The code an unreadable package directory is reported under. */
export const MATERIAL_UNREADABLE = 'MATERIAL_UNREADABLE';

/**
 * Entries this command writes. Reading them back as material would feed a run its own
 * outputs, and `RFC.md` is a record the run settles against, not material.
 */
export const EXCLUDED_ENTRY_NAMES = Object.freeze([
  'RFC.md',
  'Status.json',
  'DesignTree.json',
  'CheckList.md',
  'SEQUENCES.md',
  'SEQUENCES.json',
  'SEQUENCES-DISTRIBUTIONS.json',
]);

const HIDDEN_PREFIX = '.';

/** A package directory that cannot be read is a named failure, never an empty material set. */
// [::TICKET::] PX-357 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-357 --for-spec --no-implementation-order`.
export class MaterialUnreadableError extends Error {
  /**
   * @param {string} directory
   * @param {NodeJS.ErrnoException|undefined} cause
   */
// [::TICKET::] PX-357 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-357 --for-spec --no-implementation-order`.
  constructor(directory, cause) {
    super(`Cannot read material directory: ${directory} (${cause?.code ?? 'unknown'})`);
    this.name = 'MaterialUnreadableError';
    this.code = MATERIAL_UNREADABLE;
    this.directory = directory;
  }
}

/** Whether a directory entry is one discovery must not read back. */
// [::TICKET::] PX-357 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-357 --for-spec --no-implementation-order`.
function isExcludedEntry(name) {
  return name.startsWith(HIDDEN_PREFIX)
    || EXCLUDED_ENTRY_NAMES.includes(name)
    || name.endsWith(BACKUP_SUFFIX);
}

/** Read a directory, reporting an unreadable one by the name the caller can act on. */
// [::TICKET::] PX-357 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-357 --for-spec --no-implementation-order`.
function readDirectoryOrThrow(io, directory) {
  try {
    return io.readDirectory(directory);
  } catch (cause) {
    throw new MaterialUnreadableError(directory, cause);
  }
}

/**
 * The package directory entries a run reads.
 *
 * Hidden entries are excluded the way a shell glob excludes them, and the entries this
 * command writes are excluded because a run must not read its own outputs as material.
 * The sort makes two runs over one directory agree, which a raw `readdir` does not.
 *
 * @param {{ rfcDir: string, io: { readDirectory: Function, join: Function } }} input
 * @returns {{ materialPaths: string[], excluded: string[] }}
 */
export function enumerateMaterialEntries({ rfcDir, io }) {
  const names = readDirectoryOrThrow(io, rfcDir);
  const included = [];
  const excluded = [];

  for (const name of names) {
    if (isExcludedEntry(name)) excluded.push(name);
    else included.push(name);
  }

  return {
    materialPaths: included.sort().map((name) => io.join(rfcDir, name)),
    excluded: excluded.sort(),
  };
}

/**
 * The workspace root's one sequences artifact.
 *
 * The workspace root is the directory holding the manifests, not a guess from the
 * package path. Zero candidates means the run has no carriage; several mean the
 * workspace is inconsistent, and selecting one would hide that rather than report it.
 *
 * @param {{ workspaceRoot: string|null, io: { readDirectory: Function, join: Function } }} input
 * @returns {{ sequenceArtifact: string|null, ambiguousSequenceArtifacts: string[] }}
 */
export function selectSequenceArtifact({ workspaceRoot, io }) {
  if (workspaceRoot === null || workspaceRoot === undefined) {
    return { sequenceArtifact: null, ambiguousSequenceArtifacts: [] };
  }

  const candidates = readDirectoryOrThrow(io, workspaceRoot)
    .filter((name) => name.endsWith(SOURCE_ARTIFACT_SUFFIX))
    .sort();

  if (candidates.length === 1) {
    return {
      sequenceArtifact: io.join(workspaceRoot, candidates[0]),
      ambiguousSequenceArtifacts: [],
    };
  }

  return { sequenceArtifact: null, ambiguousSequenceArtifacts: candidates };
}

/**
 * The material list: discovered paths first, arguments after them.
 *
 * A path present twice keeps its first position, so an argument that repeats the
 * artifact does not read it twice. `addedArguments` names only the arguments that were
 * actually appended, which is what the run reports it was given beyond discovery.
 *
 * @param {{
 *   discovered: string[],
 *   argumentPaths: string[],
 *   resolvePath: (value: string) => string,
 * }} input
 * @returns {{ materialPaths: string[], addedArguments: string[] }}
 */
export function mergeDiscoveredWithArguments({ discovered, argumentPaths, resolvePath }) {
  const materialPaths = [];
  const seen = new Set();

  const append = (candidate) => {
    const resolved = resolvePath(candidate);
    if (seen.has(resolved)) return false;
    seen.add(resolved);
    materialPaths.push(resolved);
    return true;
  };

  for (const discoveredPath of discovered) append(discoveredPath);
  const addedArguments = argumentPaths.filter((argumentPath) => append(argumentPath));

  return { materialPaths, addedArguments };
}

/**
 * Everything a grill run reads before its arguments are added.
 *
 * @param {{ rfcDir: string, io: { readDirectory: Function, workspaceRootOf: Function, join: Function, resolvePath: Function } }} input
 * @returns {{
 *   materialPaths: string[],
 *   workspaceRoot: string|null,
 *   sequenceArtifact: string|null,
 *   ambiguousSequenceArtifacts: string[],
 *   excluded: string[],
 * }}
 */
export function resolveDefaultMaterial({ rfcDir, io }) {
  const { materialPaths, excluded } = enumerateMaterialEntries({ rfcDir, io });
  const workspaceRoot = io.workspaceRootOf(rfcDir);
  const { sequenceArtifact, ambiguousSequenceArtifacts } = selectSequenceArtifact({ workspaceRoot, io });

  const withArtifact = sequenceArtifact === null
    ? materialPaths
    : mergeDiscoveredWithArguments({
      discovered: [...materialPaths, sequenceArtifact],
      argumentPaths: [],
      resolvePath: io.resolvePath,
    }).materialPaths;

  return { materialPaths: withArtifact, workspaceRoot, sequenceArtifact, ambiguousSequenceArtifacts, excluded };
}
