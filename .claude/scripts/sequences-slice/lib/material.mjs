/**
 * Whether a package has sequences material, decided from records the caller supplies.
 *
 * Two commands need this answer: `/grill-me-for-rfc`, which records the material it was
 * handed and refuses to run when a recorded path is gone, and `/drill-rfc-down`, whose
 * session record carries no material list of its own. The drill's Step 1 is contractually
 * self-contained — it may call only its own directory's scripts and may not name the
 * grill — so the rule is written once here and each command owns a thin entry point onto it.
 *
 * The file system is injected rather than imported, the way question-gate/prior-decisions.mjs
 * already does it, so the decision is testable without a tree and neither command's entry
 * point can quietly grow a second policy.
 */

/** The field current runs write into a session record. */
export const MATERIAL_LIST_FIELD = 'materialPaths';

/** The field a Status.json written before `materialPaths` existed carries. */
export const LEGACY_MATERIAL_FIELD = 'researchPath';

/** The suffix the artifact `/educe-sequences` writes carries. */
export const SOURCE_ARTIFACT_SUFFIX = '-sequences.json';

export const STATUS_FILENAME = 'Status.json';
export const SESSION_DIR_NAME = 'drills';
export const VIEW_MARKDOWN_NAME = 'SEQUENCES.md';
export const VIEW_JSON_NAME = 'SEQUENCES.json';

/** The arrays a document must carry to be usable as a source artifact. */
const REQUIRED_SOURCE_ARRAY_FIELDS = ['sequences', 'steps', 'operations'];

/**
 * The material a session record holds.
 *
 * `materialPaths` is what current runs write. `researchPath` is the single path a record
 * written before that field existed carries, and is read only when the list is absent, so
 * an older session still reports its material instead of appearing to have none. This is
 * the rule init.js and list-files.js apply; it is restated here because a reader that
 * disagreed with them would answer about a different session than the one they read.
 *
 * @param {object} record
 * @returns {string[]}
 */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
export function materialPathsOf(record) {
  if (Array.isArray(record?.[MATERIAL_LIST_FIELD])) return [...record[MATERIAL_LIST_FIELD]];
  return record?.[LEGACY_MATERIAL_FIELD] ? [record[LEGACY_MATERIAL_FIELD]] : [];
}

/** Whether a name is one of the two generated view files. */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
export function isViewName(basename) {
  return basename === VIEW_MARKDOWN_NAME || basename === VIEW_JSON_NAME;
}

/**
 * Whether a path is a usable sequences artifact.
 *
 * The suffix alone is not enough: a recorded path may since have been replaced by an
 * unrelated file, and treating that as the source would build a view from the wrong
 * document. The text is parsed and its three arrays checked, which is the same gate the
 * projection applies, so the two cannot disagree about what a source is.
 *
 * @param {{ readFile: (path: string) => string|null }} io
 * @param {string} materialPath
 * @returns {boolean}
 */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
export function isUsableSourceArtifact({ readFile }, materialPath) {
  if (!materialPath.endsWith(SOURCE_ARTIFACT_SUFFIX)) return false;
  const text = readFile(materialPath);
  if (text === null) return false;

  let document;
  try {
    document = JSON.parse(text);
  } catch {
    return false;
  }
  if (document === null || typeof document !== 'object' || Array.isArray(document)) return false;
  if (typeof document.schema_version !== 'number') return false;
  return REQUIRED_SOURCE_ARRAY_FIELDS.every((field) => Array.isArray(document[field]));
}

/**
 * Read one session record, reporting whether it could be read and why not.
 *
 * A record that cannot be read is reported rather than skipped: a caller reading
 * `searched` must be able to tell "there was no record" from "there was a record I could
 * not understand", and the two call for different actions.
 *
 * @param {{ readFile: (path: string) => string|null }} io
 * @param {string} statusPath
 */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
function readSessionRecord({ readFile }, statusPath) {
  const text = readFile(statusPath);
  if (text === null) {
    return { path: statusPath, readable: false, reason: 'unreadable', materialPaths: [] };
  }
  try {
    return { path: statusPath, readable: true, reason: null, materialPaths: materialPathsOf(JSON.parse(text)) };
  } catch (error) {
    return { path: statusPath, readable: false, reason: `not JSON: ${error.message}`, materialPaths: [] };
  }
}

/**
 * The answer: what was searched, what was found, and what is recorded but gone.
 *
 * The session record is searched before the package record because a drill keeps its own
 * session under the package and that record is the first place the answer can come from.
 * The view is then looked for where it deterministically lives rather than only where it
 * was recorded, which is what lets a package that never recorded it — and a drill session
 * that carries no list at all — still find it.
 *
 * The file system arrives as one bundle rather than as four separate readers, so a caller
 * that wanted to change one of them would have to say so rather than pass three of the
 * four and silently take the default for the rest.
 *
 * @param {{
 *   rfcDir: string,
 *   sessionDir?: string|null,
 *   io: {
 *     readFile: (path: string) => string|null,
 *     fileExists: (path: string) => boolean,
 *     basename: (path: string) => string,
 *     join: (...parts: string[]) => string,
 *   },
 * }} input
 * @returns {object}
 */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
export function findSequenceMaterial({ rfcDir, sessionDir = null, io }) {
  const { readFile, fileExists, basename, join } = io;
  const candidateRecords = [
    ...(sessionDir === null ? [] : [join(sessionDir, STATUS_FILENAME)]),
    join(rfcDir, STATUS_FILENAME),
  ];

  const searched = [];
  const materialPaths = [];
  for (const statusPath of candidateRecords) {
    const record = readSessionRecord({ readFile }, statusPath);
    searched.push({ path: record.path, readable: record.readable, reason: record.reason });
    // The first readable record is this session's list. A later record is a different
    // session and must not silently extend it.
    if (record.readable && materialPaths.length === 0) materialPaths.push(...record.materialPaths);
  }

  const staleMaterialPaths = materialPaths.filter((materialPath) => !fileExists(materialPath));
  const source = materialPaths.find((materialPath) => isUsableSourceArtifact({ readFile }, materialPath)) ?? null;

  const viewPath = join(rfcDir, VIEW_MARKDOWN_NAME);
  const view = fileExists(viewPath) ? viewPath : null;

  return {
    present: source !== null || view !== null,
    source,
    view,
    viewExists: view !== null,
    materialPaths,
    staleMaterialPaths,
    recordedViewNames: materialPaths.filter((materialPath) => isViewName(basename(materialPath))),
    searched,
    rfcDir,
    sessionDir,
  };
}

/** The session directory a drill keeps under the package. */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
export function defaultSessionDirFor(join, rfcDir) {
  return join(rfcDir, SESSION_DIR_NAME);
}

/** The node:fs calls the two entry points supply, so the rule above stays free of them. */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
export function nodeFileSystem(fs) {
  return {
    readFile: (filePath) => {
      try {
        return fs.readFileSync(filePath, 'utf8');
      } catch {
        return null;
      }
    },
    fileExists: (filePath) => fs.existsSync(filePath),
  };
}
