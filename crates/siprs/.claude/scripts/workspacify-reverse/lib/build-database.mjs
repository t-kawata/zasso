/**
 * C/C++'s build database: what a subject declares about how it is compiled.
 *
 * The design records a hard quality boundary for C/C++. With
 * `compile_commands.json`, per-translation-unit flags, working directory and
 * include conditions can be replayed; without it, a reading of C/C++ is an
 * approximation the analyser chose for itself. This module is the discovery
 * half of that boundary: it finds the database where a build system writes it,
 * reads one record per translation unit, and reports the three ways a database
 * can fail to configure a run as three different facts.
 *
 * Nothing here spawns a process. Reading the database is a file read and a JSON
 * parse of a file the subject already carries — no compiler, no build system and
 * no daemon is invoked, because the analysis is read-only over its subject and a
 * build writes to the tree.
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, join, sep } from 'node:path';

/**
 * The file names a build database is looked for under, in the order searched.
 *
 * Declared as an ordered list rather than written into the search: a second
 * database format is a row here, and the order the names are tried in is
 * visible rather than implied by the order of `if` statements.
 */
export const BUILD_DATABASE_NAMES = Object.freeze(['compile_commands.json']);

/**
 * The name the C/C++ reasons and limitations carry.
 *
 * `PROPERTY_ENGINES` is the same shape of fact for R6.5's engines: a declared
 * name the prose and the code both read, so a reason cannot drift from the
 * mechanism it names.
 */
export const BUILD_DATABASE_MARKER = BUILD_DATABASE_NAMES[0];

/**
 * The ways a build database fails to configure a run, each its own fact.
 *
 * They are kept apart because they call for different repairs. A project that
 * carries no database is unconfigured; one whose database will not parse is
 * misconfigured; one whose database names no translation unit has a build that
 * was never run. Collapsing them would report a broken build as an absent one.
 */
export const BUILD_DATABASE_LIMITATION_CODES = Object.freeze({
  absent: 'no_build_database',
  unreadable: 'build_database_unreadable',
  empty: 'build_database_empty',
});

/** The scope every build-database limitation is bounded to. */
const LIMITATION_SCOPE = 'the C/C++ extraction';

/**
 * The flags that name an include search path, in both spellings the format uses.
 *
 * `-Ipath` and `-I path` are the same flag, and a reader that knew only one
 * would report a translation unit as having no include path when it had one.
 */
const INCLUDE_FLAG_JOINED = /^-I(.+)$/;
const INCLUDE_FLAG_SEPARATE = '-I';

/** The name a path is known by, for the search over the walk's entries. */
// [::TICKET::] P24-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-6 --for-spec --no-implementation-order`.
function fileNameOf(relativePath) {
  const cut = relativePath.lastIndexOf('/');
  return cut === -1 ? relativePath : relativePath.slice(cut + 1);
}

/**
 * The database file this walk found, or null when the subject carries none.
 *
 * An entry under an excluded directory is still an entry: a build system writes
 * its database where its output goes, and a search that skipped excluded
 * directories would report a configured project as an unconfigured one.
 */
// [::TICKET::] P24-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-6 --for-spec --no-implementation-order`.
function databaseEntryIn(artefacts) {
  for (const name of BUILD_DATABASE_NAMES) {
    const entry = artefacts.find((artefact) => fileNameOf(artefact.path) === name && artefact.readStatus === 'readable');
    if (entry !== undefined) return entry;
  }
  return null;
}

/** The flags one recorded command carries, split into include paths and the rest. */
// [::TICKET::] P24-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-6 --for-spec --no-implementation-order`.
function splitCommand(command) {
  const includePaths = [];
  const compileFlags = [];
  const tokens = typeof command === 'string' ? command.split(/\s+/).filter((token) => token.length > 0) : [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const joined = INCLUDE_FLAG_JOINED.exec(token);
    if (joined !== null) { includePaths.push(joined[1]); continue; }
    if (token === INCLUDE_FLAG_SEPARATE && index + 1 < tokens.length) {
      includePaths.push(tokens[index + 1]);
      index += 1;
      continue;
    }
    compileFlags.push(token);
  }
  return { includePaths, compileFlags };
}

/** The directory a database sits in, root-relative, so its entries resolve against it. */
// [::TICKET::] P24-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-6 --for-spec --no-implementation-order`.
function directoryOf(relativePath) {
  const cut = relativePath.lastIndexOf('/');
  return cut === -1 ? '' : relativePath.slice(0, cut);
}

/**
 * True when a recorded file names a member of the subject rather than a path outside it.
 *
 * The comparison is made against the root **plus a separator**, not against the
 * root's own characters: a sibling directory whose name extends the root's —
 * `/tmp/subject-2` beside `/tmp/subject` — would otherwise pass a bare prefix
 * test, and a flag set recorded for another project would be replayed here.
 */
// [::TICKET::] P24-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-6 --for-spec --no-implementation-order`.
function isInsideSubject(file, root) {
  if (typeof file !== 'string' || file.length === 0) return false;
  const resolved = isAbsolute(file) ? file : join(root, file);
  const boundary = root.endsWith(sep) ? root : `${root}${sep}`;
  return resolved.startsWith(boundary);
}

/**
 * The build database this subject declares, as a record rather than a guess.
 *
 * The record states what was found, where, and — when it could not be used —
 * which of the three failures it was. An unreadable database is never returned
 * as an empty one: a `catch` that answered "no units" would make a project whose
 * build description is broken indistinguishable from one that never had a build
 * description, which is the silent degradation the design forbids.
 *
 * @param {{root: string, artefacts: ReadonlyArray<object>}} params
 * @returns {object} the discovery record
 */
export function discoverBuildDatabase({ root, artefacts } = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error('discoverBuildDatabase needs the subject root the database is searched under');
  }
  if (!Array.isArray(artefacts)) {
    throw new Error('discoverBuildDatabase needs the artefact walk, so that an excluded directory is searched rather than skipped');
  }

  const base = {
    root,
    names: [...BUILD_DATABASE_NAMES],
    found: false,
    path: null,
    directory: null,
    readStatus: 'absent',
    parseError: null,
    entries: null,
    unusable: [],
    translationUnitCount: 0,
  };

  const entry = databaseEntryIn(artefacts);
  if (entry === null) return base;

  const located = { ...base, found: true, path: entry.path, directory: directoryOf(entry.path) };

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(join(root, entry.path), 'utf8'));
  } catch (error) {
    return { ...located, readStatus: 'unreadable', parseError: error.message };
  }
  if (!Array.isArray(parsed)) {
    return {
      ...located,
      readStatus: 'unreadable',
      parseError: `a build database is a list of translation units; this one is ${parsed === null ? 'null' : typeof parsed}`,
    };
  }

  const usable = parsed.filter((record) => isInsideSubject(record?.file, root));
  const unusable = parsed
    .filter((record) => !isInsideSubject(record?.file, root))
    .map((record) => ({
      file: typeof record?.file === 'string' ? record.file : null,
      reason: 'the recorded file is not a member of the subject, so a flag set recorded for it cannot be replayed',
    }));

  return { ...located, readStatus: 'readable', entries: usable, unusable, translationUnitCount: usable.length };
}

/**
 * One record per translation unit, carrying where it is compiled from and with what.
 *
 * The working directory is resolved to an absolute path: a database commonly
 * records it relative to where the build ran, and resolving it against the
 * database's own location is what makes the record usable by a reader that is
 * not standing where the build stood.
 *
 * @param {object} database - a record from `discoverBuildDatabase`
 * @returns {ReadonlyArray<object>} the translation units
 */
export function readTranslationUnits(database) {
  if (database === null || typeof database !== 'object') {
    throw new Error('readTranslationUnits needs a discovery record; it was given none');
  }
  if (database.readStatus !== 'readable') {
    throw new Error(
      `this database is ${database.readStatus}, so it names no translation unit. A reader that answered with an `
      + 'empty list would make a database that could not be read indistinguishable from one that names nothing',
    );
  }

  const base = join(database.root ?? '', database.directory ?? '');
  return (database.entries ?? []).map((entry) => {
    const { includePaths, compileFlags } = splitCommand(entry.command);
    return {
      file: entry.file,
      workingDirectory: base,
      includePaths,
      compileFlags,
    };
  });
}

/**
 * What the scope document carries about the build database.
 *
 * A projection of the record rather than a second reading of the tree: the
 * scope states what the run could see, and the fields it needs are the
 * presence, the names searched and the number of units found. Keeping the
 * projection beside the record is what stops the document from naming fields
 * the record does not have.
 *
 * @param {object} discovery - a record from `discoverBuildDatabase`
 * @returns {{found: boolean, names: ReadonlyArray<string>, translationUnitCount: number}}
 */
export function summariseBuildDatabase(discovery) {
  if (discovery === null || typeof discovery !== 'object') {
    throw new Error('summariseBuildDatabase needs the discovery record it summarises');
  }
  return {
    found: discovery.found,
    names: [...discovery.names],
    translationUnitCount: discovery.translationUnitCount,
    // Published rather than merely held: an entry the run could not use is a
    // fact about what it could see, and a record only the caller can read would
    // make "we read three of the four units" invisible in the document an
    // operator reads.
    unusable: discovery.unusable.map((entry) => ({ ...entry })),
  };
}

/**
 * The two counters, kept apart because they answer different questions.
 *
 * `configsEnumerated` is how many configurations the run found; `configsAnalyzed`
 * is how many translation units it actually ran under. A run that finds a
 * database and analyses three of its forty units reports both numbers, so
 * "we found the configuration" is never read as "we analysed under it".
 *
 * @param {{discovered: number, analysed: number}} params
 * @returns {{configsEnumerated: number, configsAnalyzed: number}}
 */
export function recordConfigurationUse({ discovered, analysed } = {}) {
  if (!Number.isInteger(discovered) || !Number.isInteger(analysed)) {
    throw new Error('recordConfigurationUse needs the two counts as integers, so that neither is derived from the other');
  }
  return { configsEnumerated: discovered, configsAnalyzed: analysed };
}

/**
 * What the run concludes when the database could not be used, or null when it could.
 *
 * The effect is stated as what the conclusion loses rather than as what the run
 * did, because a limitation is weighed against the conclusion it qualifies. The
 * three failures carry three different effects: only the first is an
 * approximation the analyser chose, and the other two are repairs the project
 * owes.
 *
 * @param {{discovery: object}} params
 * @returns {object|null} a limitation satisfying `validateLimitation`, or null
 */
export function reportDatabaseLimitation({ discovery } = {}) {
  if (discovery === null || typeof discovery !== 'object') {
    throw new Error('reportDatabaseLimitation needs the discovery record it reports on');
  }

  const code = (() => {
    if (discovery.readStatus === 'absent') return BUILD_DATABASE_LIMITATION_CODES.absent;
    if (discovery.readStatus === 'unreadable') return BUILD_DATABASE_LIMITATION_CODES.unreadable;
    if (discovery.translationUnitCount === 0) return BUILD_DATABASE_LIMITATION_CODES.empty;
    return null;
  })();
  if (code === null) return null;

  const effect = (() => {
    if (code === BUILD_DATABASE_LIMITATION_CODES.absent) {
      return `${BUILD_DATABASE_MARKER} was not found, so include resolution and translation-unit composition `
        + 'were chosen by the analyser rather than taken from the project — an approximation the analyser chose '
        + 'for itself, and the E1 and E5 readings for C/C++ are conclusions of that approximation';
    }
    if (code === BUILD_DATABASE_LIMITATION_CODES.unreadable) {
      return `${BUILD_DATABASE_MARKER} is present and could not be read (${discovery.parseError}), so no translation `
        + 'unit was configured and include resolution remained the analyser’s choice. This is a repair the project '
        + 'owes, not an absence of configuration';
    }
    return `${BUILD_DATABASE_MARKER} is present and names no translation unit, so the build that would have `
      + 'composed this tree was never recorded and include resolution remained the analyser’s choice';
  })();

  return { code, scope: LIMITATION_SCOPE, effect };
}
