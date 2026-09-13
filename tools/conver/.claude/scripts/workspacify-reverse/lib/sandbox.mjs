/**
 * The isolated environment dynamic evidence is obtained in.
 *
 * R-1 refuses to call a proposition `observed` when it involves a dynamic
 * mechanism and no dynamic evidence exists. Until an environment that can
 * produce such evidence exists, that refusal is permanent, and every such
 * proposition stays unresolved for a reason belonging to the instrument rather
 * than to the project. This module is that environment: it copies a target into
 * a throwaway tree, runs commands inside the copy, and returns the copy to its
 * recorded initial state on demand.
 *
 * Three properties are structural rather than documented.
 *
 * The first is *reset before destruction*. Creating a sandbox takes a pristine
 * snapshot and rehearses the restore once, before the handle is returned; only
 * a rehearsal that reproduced the initial digest produces an armed sandbox. The
 * arming is a module-private set, not a field, so a fabricated handle cannot
 * claim it — a destructive transition is unreachable except through a handle
 * this module itself created and armed.
 *
 * The second is *the boundary*. The copy refuses to reproduce a symlink that
 * points outside the target, because a link carried over verbatim would put a
 * way out of the sandbox inside the sandbox. And the subject's guarded paths are
 * re-measured around every operation, not only when a caller remembers to ask.
 *
 * No part of that is about one project. The subject comes from the caller, the
 * guard comes from the caller, and the ecosystems a start plan can come from are
 * a declared table rather than a list of the ones the first caller happened to
 * use — so an unstartable subject is reported rather than silently unmatched.
 * The third is *the shape of the answer*: a run reports what it resolved and
 * names the channels it never looked at, because the absence of a search must
 * not read as the absence of a mechanism. That model lives in
 * `dynamic-surface.mjs`; this module only feeds it.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { listArtefacts } from './analysis-tech.mjs';
import { EVIDENCE_MODES, buildDynamicSurface } from './dynamic-surface.mjs';
import { SandboxError } from './sandbox-error.mjs';
import { NEVER_WALKED_DIRECTORY_NAMES, compareText, digestTree } from './holdout-ledger.mjs';

export { SandboxError };

/** The conver repository this module belongs to, walked back from its own location. */
export const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

// ---------------------------------------------------------------------------
// The declared vocabulary
//
// Everything below is data a caller may read and a later ticket may extend by
// adding a row. Nothing here names a project: the guards, the ecosystems and the
// database indicators are declarations about how subjects are shaped, and the
// subject itself arrives with the call.
// ---------------------------------------------------------------------------

/**
 * The paths a sandbox guards when the caller declares none.
 *
 * An empty declaration is not an absent guard. `resolveGuardedPaths` unions the
 * declaration with the subject root, so the empty set reads "the subject and
 * nothing else" — which is the only guard that is true of every subject. A
 * module-level list of project directory names would be a guard that is wrong for
 * every subject but the one it was written for.
 */
export const DEFAULT_GUARDED_PATHS = Object.freeze([]);

/** The file name a caller writes in a command shape to mean "the manifest that matched". */
const MANIFEST_PLACEHOLDER = '<manifest>';

/**
 * The executables a declared command shape may name.
 *
 * The allow-list is what makes "adding an ecosystem is adding a row" safe to
 * say: a row cannot reach an arbitrary program, so the table stays reviewable.
 */
export const START_PLAN_EXECUTABLES = Object.freeze([
  'docker',
  'cargo',
  'npm',
  'pnpm',
  'yarn',
  'go',
  'python3',
  'cmake',
  'make',
]);

/**
 * The argument values that would turn a declared shape into a fetch.
 *
 * Matched as whole arguments rather than as substrings, because a flag like
 * `-DCMAKE_FETCHCONTENT_FULLY_DISCONNECTED=ON` is the opposite of a fetch and
 * must not be mistaken for one.
 */
export const START_PLAN_NETWORK_VERBS = Object.freeze([
  'fetch',
  'pull',
  'push',
  'publish',
  'download',
  'clone',
  'get',
  'remote',
  'login',
]);

/**
 * Every ecosystem a start plan can come from, most direct first.
 *
 * A service definition states how to start the thing itself, so it leads; a
 * build manifest states how to build it, and is what remains when there is no
 * service. Every command is bounded, offline and needs no daemon, and each row
 * states why in its own words: `offlineReason` is what a reviewer reads when a
 * later row is added, and it is asserted to be present so a row cannot arrive
 * without one.
 *
 * `manifestNames` is how the ecosystem is recognised, and `commandShape.args`
 * may name the matched manifest with the placeholder, so a plan states the file
 * it will read rather than a name someone remembered. `shapeSelectors` is the
 * one conditional in the table, and it is data: a sibling artefact — a lock file
 * naming the package manager, a pinned requirements file naming the installer —
 * selects a different command for the same ecosystem.
 */
export const START_PLAN_ECOSYSTEMS = Object.freeze([
  Object.freeze({
    id: 'compose',
    priority: 0,
    manifestNames: Object.freeze(['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']),
    commandShape: Object.freeze({
      command: 'docker',
      args: Object.freeze(['compose', '-f', MANIFEST_PLACEHOLDER, 'config', '--quiet']),
      environment: Object.freeze({}),
    }),
    offlineReason: 'compose config parses the manifest and prints it — it starts no service and pulls no image',
  }),
  Object.freeze({
    id: 'cargo',
    priority: 1,
    manifestNames: Object.freeze(['Cargo.toml']),
    commandShape: Object.freeze({
      command: 'cargo',
      args: Object.freeze(['metadata', '--no-deps', '--format-version', '1', '--offline']),
      environment: Object.freeze({ CARGO_NET_OFFLINE: 'true' }),
    }),
    offlineReason: '--offline and CARGO_NET_OFFLINE forbid the registry, and --no-deps reads only this workspace',
  }),
  Object.freeze({
    id: 'node',
    priority: 2,
    manifestNames: Object.freeze(['package.json']),
    commandShape: Object.freeze({
      command: 'npm',
      args: Object.freeze(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline']),
      environment: Object.freeze({}),
    }),
    shapeSelectors: Object.freeze([
      Object.freeze({
        onArtefactNames: Object.freeze(['pnpm-lock.yaml']),
        commandShape: Object.freeze({
          command: 'pnpm',
          args: Object.freeze(['install', '--ignore-scripts', '--offline']),
          environment: Object.freeze({}),
        }),
      }),
      Object.freeze({
        onArtefactNames: Object.freeze(['yarn.lock']),
        commandShape: Object.freeze({
          command: 'yarn',
          args: Object.freeze(['install', '--ignore-scripts', '--offline']),
          environment: Object.freeze({}),
        }),
      }),
      Object.freeze({
        onArtefactNames: Object.freeze(['package-lock.json']),
        commandShape: Object.freeze({
          command: 'npm',
          args: Object.freeze(['ci', '--ignore-scripts', '--offline']),
          environment: Object.freeze({}),
        }),
      }),
    ]),
    offlineReason: '--offline installs from the local store only, and --ignore-scripts forbids a lifecycle script',
  }),
  Object.freeze({
    id: 'go',
    priority: 3,
    manifestNames: Object.freeze(['go.mod']),
    commandShape: Object.freeze({
      command: 'go',
      args: Object.freeze(['build', './...']),
      environment: Object.freeze({ GOFLAGS: '-mod=mod', GOPROXY: 'off' }),
    }),
    offlineReason: 'GOPROXY=off forbids the module proxy, so a module outside the local cache is an error rather than a fetch',
  }),
  Object.freeze({
    id: 'python',
    priority: 4,
    manifestNames: Object.freeze(['pyproject.toml', 'requirements.txt', 'setup.py']),
    commandShape: Object.freeze({
      command: 'python3',
      args: Object.freeze(['-m', 'pip', 'install', '--no-index', '--no-deps', '--no-build-isolation', '.']),
      environment: Object.freeze({ PIP_NO_INDEX: '1', PIP_NO_INPUT: '1' }),
    }),
    shapeSelectors: Object.freeze([
      Object.freeze({
        onArtefactNames: Object.freeze(['requirements.txt']),
        commandShape: Object.freeze({
          command: 'python3',
          args: Object.freeze(['-m', 'pip', 'install', '--no-index', '--no-deps', '-r', MANIFEST_PLACEHOLDER]),
          environment: Object.freeze({ PIP_NO_INDEX: '1', PIP_NO_INPUT: '1' }),
        }),
      }),
    ]),
    offlineReason: '--no-index and PIP_NO_INDEX forbid the package index, so the local cache is the only source',
  }),
  Object.freeze({
    id: 'cmake',
    priority: 5,
    manifestNames: Object.freeze(['CMakeLists.txt']),
    commandShape: Object.freeze({
      command: 'cmake',
      args: Object.freeze(['-S', '.', '-B', 'build', '-DCMAKE_FETCHCONTENT_FULLY_DISCONNECTED=ON']),
      environment: Object.freeze({}),
    }),
    offlineReason: 'FETCHCONTENT_FULLY_DISCONNECTED forbids cmake from fetching a dependency it cannot find locally',
  }),
  Object.freeze({
    id: 'make',
    priority: 6,
    manifestNames: Object.freeze(['Makefile', 'makefile', 'GNUmakefile']),
    commandShape: Object.freeze({
      command: 'make',
      args: Object.freeze(['--no-print-directory', '--dry-run']),
      environment: Object.freeze({}),
    }),
    offlineReason: '--dry-run resolves the rule graph and runs no recipe, so no rule can reach the network',
  }),
]);

/**
 * The database indicators a subject's configuration artefacts are read for.
 *
 * A kind is present when one of its markers appears as a whole word in a
 * manifest the row names, and the marker that matched travels with the artefact
 * it was read from — so "which database" is never a guess about a dependency's
 * name. Markers are words rather than substrings because `pg` would match `pgp`,
 * and a false positive here is a kind the subject does not use.
 */
export const DATABASE_INDICATORS = Object.freeze([
  Object.freeze({
    id: 'sqlite',
    manifestNames: Object.freeze(['Cargo.toml', 'package.json', 'go.mod', 'pyproject.toml', 'requirements.txt', 'CMakeLists.txt', 'Makefile']),
    markers: Object.freeze(['sqlite', 'rusqlite', 'better-sqlite3']),
  }),
  Object.freeze({
    id: 'postgres',
    manifestNames: Object.freeze(['Cargo.toml', 'package.json', 'go.mod', 'pyproject.toml', 'requirements.txt', 'CMakeLists.txt', 'Makefile']),
    markers: Object.freeze(['postgres', 'postgresql', 'pgx', 'psycopg']),
  }),
  Object.freeze({
    id: 'mysql',
    manifestNames: Object.freeze(['Cargo.toml', 'package.json', 'go.mod', 'pyproject.toml', 'requirements.txt', 'CMakeLists.txt', 'Makefile']),
    markers: Object.freeze(['mysql', 'mariadb']),
  }),
  Object.freeze({
    id: 'mongodb',
    manifestNames: Object.freeze(['Cargo.toml', 'package.json', 'go.mod', 'pyproject.toml', 'requirements.txt', 'CMakeLists.txt', 'Makefile']),
    markers: Object.freeze(['mongodb', 'mongoose', 'pymongo']),
  }),
  Object.freeze({
    id: 'redis',
    manifestNames: Object.freeze(['Cargo.toml', 'package.json', 'go.mod', 'pyproject.toml', 'requirements.txt', 'CMakeLists.txt', 'Makefile']),
    markers: Object.freeze(['redis']),
  }),
]);

/**
 * The database kinds a caller may declare to a sandbox.
 *
 * Derived from the indicators rather than enumerated beside them: a second list
 * would let discovery report a kind the sandbox then refuses to contain.
 */
const DECLARABLE_DATABASE_KINDS = Object.freeze(['none', ...DATABASE_INDICATORS.map((indicator) => indicator.id)]);

/** The reason code a guard that resolves outside its subject refuses with. */
const GUARDED_PATH_OUTSIDE_SUBJECT_REASON = 'guarded-path-outside-subject';

/** The reason a sandbox is marked unusable with when one of its guards moved. */
export const SANDBOX_SUBJECT_TOUCHED_REASON = 'subject-touched';

/**
 * The option name P22-18 used, refused by name rather than ignored.
 *
 * A renamed option that is silently dropped is worse than a leftover constant:
 * the caller believes a guard is in place and nothing reports that it is not.
 */
export const RENAMED_GUARD_OPTION = 'productionPaths';

export const SANDBOX_TREE_DIRECTORY_NAME = 'tree';
export const SANDBOX_SNAPSHOT_DIRECTORY_NAME = 'snapshot';

/** The reason code a disposed sandbox refuses with, distinct from a failed reset. */
export const SANDBOX_DISPOSED_REASON = 'sandbox-disposed';
const SANDBOX_UNUSABLE_REASON = 'sandbox-unusable';

// ---------------------------------------------------------------------------
// The private token state
//
// The two WeakSets are the handle itself, held where no caller can reach them.
// Generalising the names above must never route around them: they are what makes
// "a session can only be recorded against a sandbox this process created"
// unfabricatable, and no declaration in the block above changes that.
// ---------------------------------------------------------------------------

/**
 * The sandboxes this process created, and the ones whose reset is armed.
 *
 * A session can only be recorded against a sandbox that was actually observed,
 * and a destructive transition only against one whose reset has been rehearsed.
 * Both tokens are the handle itself, held in module-private sets, so neither
 * property can be fabricated by assigning to a field on an object literal.
 */
const OBSERVED_SANDBOXES = new WeakSet();
const ARMED_SANDBOXES = new WeakSet();

/** True when this process created the handle, so its sessions are real observations. */
export function isObservedSandbox(handle) {
  return typeof handle === 'object' && handle !== null && OBSERVED_SANDBOXES.has(handle);
}

// ---------------------------------------------------------------------------
// The operations
// ---------------------------------------------------------------------------

/** SHA-256 of a file's bytes, lowercase hex. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** SHA-256 of a string, lowercase hex. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Refuse the renamed guard option rather than dropping it.
 *
 * A caller written against the old name would otherwise be silently unguarded:
 * the sandbox would guard the subject root and say nothing, and the caller would
 * believe its own list was in force. Naming the replacement is the whole repair.
 */
export function assertNoRenamedGuardOption(options) {
  if (options !== null && typeof options === 'object' && RENAMED_GUARD_OPTION in options) {
    throw new SandboxError(
      'guarded-option-renamed',
      `the option "${RENAMED_GUARD_OPTION}" was renamed to "guardedPaths", and is refused rather than ignored — a dropped guard is one nobody reports. Declare the same paths as options.guardedPaths, relative to the subject root`,
    );
  }
}

/** Refuse a root that is absent, naming the path that was looked for. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function assertTargetRoot(root) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new SandboxError('root-missing', 'a sandbox needs a target root, and none was given');
  }
  if (!existsSync(root)) {
    throw new SandboxError('root-missing', `no target root exists at ${root} — a sandbox needs a directory to copy`);
  }
  if (!statSync(root).isDirectory()) {
    throw new SandboxError('root-not-directory', `the target root ${root} is not a directory`);
  }
}

/** How deep a relative path sits, counted in directory separators. */
// [::TICKET::] P23-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-5 --for-spec --no-implementation-order`.
function measurePathDepth(relativePath) {
  return relativePath.split('/').length - 1;
}

/** The artefact paths a set of manifest names matches, shallowest first. */
// [::TICKET::] P23-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-5 --for-spec --no-implementation-order`.
function matchManifests(artefacts, manifestNames) {
  const names = new Set(manifestNames);
  return artefacts
    .filter((artefact) => artefact.exclusion === false && artefact.kind === 'file' && artefact.readStatus === 'readable')
    .map((artefact) => artefact.path)
    .filter((relativePath) => names.has(basename(relativePath)))
    .sort((left, right) => measurePathDepth(left) - measurePathDepth(right) || compareText(left, right));
}

/**
 * The declared shape a matched manifest uses, and the sibling artefact that chose it.
 *
 * A selector is read before the default, because a lock file beside a manifest
 * is a statement about how this project is installed — more specific than the
 * ecosystem's own default, and the reason the table needs no branch.
 */
// [::TICKET::] P23-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-5 --for-spec --no-implementation-order`.
function selectShape(ecosystem, matchedFrom, artefacts) {
  const present = new Set(artefacts.filter((artefact) => artefact.exclusion === false).map((artefact) => artefact.path));
  const directory = dirname(matchedFrom);
  const prefix = directory === '.' ? '' : `${directory}/`;

  for (const selector of ecosystem.shapeSelectors ?? []) {
    const namedBy = selector.onArtefactNames.find((name) => present.has(`${prefix}${name}`));
    if (namedBy !== undefined) {
      return { shape: selector.commandShape, namedBy: `${prefix}${namedBy}` };
    }
  }
  return { shape: ecosystem.commandShape, namedBy: null };
}

/** The plan one matched ecosystem declares, naming every artefact the choice rests on. */
// [::TICKET::] P23-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-5 --for-spec --no-implementation-order`.
function buildStartPlan(ecosystem, candidates, artefacts) {
  const matchedFrom = candidates[0];
  const { shape, namedBy } = selectShape(ecosystem, matchedFrom, artefacts);
  return Object.freeze({
    kind: ecosystem.id,
    manifest: basename(matchedFrom),
    matchedFrom,
    alsoMatched: Object.freeze(candidates.slice(1)),
    namedBy,
    command: shape.command,
    args: Object.freeze(shape.args.map((argument) => (argument === MANIFEST_PLACEHOLDER ? matchedFrom : argument))),
  });
}

/**
 * The start plan a subject declares, or a refusal naming every ecosystem searched.
 *
 * The refusal is a result rather than an empty list. "This subject declares no
 * manifest I know" and "this subject declares no manifest at all" are different
 * claims, and an empty plan renders them the same — which is the one reading a
 * caller must never be given, because the second is impossible and the first is
 * a statement about the registry.
 *
 * @param {string} root - the subject being planned for
 * @param {object} [options]
 * @param {Array} [options.ecosystems] - the registry to iterate, most direct first
 * @param {Array} [options.artefacts] - the artefact walk, shared with the rest of the analysis
 */
export function detectStartPlan(root, { ecosystems = START_PLAN_ECOSYSTEMS, artefacts = listArtefacts(root) } = {}) {
  const searchedEcosystems = Object.freeze(
    ecosystems.map((ecosystem) =>
      Object.freeze({ id: ecosystem.id, manifestNames: Object.freeze([...ecosystem.manifestNames]) }),
    ),
  );

  const ranked = [...ecosystems].sort((left, right) => left.priority - right.priority || compareText(left.id, right.id));
  const plans = [];
  for (const ecosystem of ranked) {
    const candidates = matchManifests(artefacts, ecosystem.manifestNames);
    if (candidates.length === 0) continue;
    plans.push(buildStartPlan(ecosystem, candidates, artefacts));
  }

  if (plans.length === 0) {
    const looked = searchedEcosystems.map((row) => `${row.id} (${row.manifestNames.join(', ')})`).join(', ');
    return Object.freeze({
      plan: null,
      plans: Object.freeze([]),
      searchedEcosystems,
      reason: `the subject at ${root} matches no declared ecosystem — looked for ${looked}. An unstartable target is reported rather than yielding an empty evidence set`,
    });
  }

  return Object.freeze({ plan: plans[0], plans: Object.freeze(plans), searchedEcosystems, reason: null });
}

/**
 * Every start plan the target's own manifests declare, most direct first.
 *
 * A plan names the manifest it came from, so "startable" is never a guess about
 * a command someone remembered.
 */
export function discoverStartPlans(root, options = {}) {
  if (typeof root !== 'string' || root.length === 0) return [];
  if (!existsSync(root) || !statSync(root).isDirectory()) return [];
  return [...detectStartPlan(root, options).plans];
}

/**
 * The database kinds a subject's configuration artefacts name, and where each was read.
 *
 * A kind is reported once, from the shallowest manifest that names it. When none
 * is found the answer says so and names the indicators that were searched, so
 * "none present" can never be read as "not looked for".
 *
 * @param {string} root - the subject whose manifests are read
 * @param {object} [options]
 * @param {Array} [options.indicators] - the declared indicators to search for
 * @param {Array} [options.artefacts] - the artefact walk, shared with the rest of the analysis
 */
export function discoverDatabaseKinds(root, { indicators = DATABASE_INDICATORS, artefacts = listArtefacts(root) } = {}) {
  const searched = Object.freeze(
    indicators.map((indicator) =>
      Object.freeze({
        id: indicator.id,
        manifestNames: Object.freeze([...indicator.manifestNames]),
        markers: Object.freeze([...indicator.markers]),
      }),
    ),
  );

  const kinds = [];
  for (const indicator of indicators) {
    for (const source of matchManifests(artefacts, indicator.manifestNames)) {
      const marker = findMarker(readFileSync(join(root, source), 'utf8'), indicator.markers);
      if (marker === null) continue;
      kinds.push(Object.freeze({ id: indicator.id, readFrom: source, marker }));
      break;
    }
  }

  return Object.freeze({
    kinds: Object.freeze(kinds),
    found: kinds.length > 0,
    searched,
    reason:
      kinds.length > 0
        ? null
        : `no database indicator was found in the subject at ${root} — searched ${searched.map((row) => row.id).join(', ')}`,
  });
}

/** The first declared marker appearing as a whole word in the text, or null. */
// [::TICKET::] P23-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-5 --for-spec --no-implementation-order`.
function findMarker(text, markers) {
  const haystack = text.toLowerCase();
  return markers.find((marker) => new RegExp(`\\b${escapeRegExp(marker)}\\b`).test(haystack)) ?? null;
}

/** A literal string as a regular expression that matches only itself. */
// [::TICKET::] P23-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-5 --for-spec --no-implementation-order`.
function escapeRegExp(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Refuse a symlink that would carry a way out of the tree into the sandbox.
 *
 * A link is copied verbatim by default, so it would still point at its original
 * — a production path. A transition writing through it would leave the sandbox
 * without leaving the filesystem, and nothing would report it.
 */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function assertLinkStaysInside(candidate, sourceBase) {
  if (!lstatSync(candidate).isSymbolicLink()) return;
  const target = resolve(dirname(candidate), readlinkSync(candidate));
  if (target === sourceBase || target.startsWith(sourceBase + sep)) return;
  throw new SandboxError(
    'symlink-escapes-target',
    `the symlink ${candidate} points at ${target}, which is outside the target root ${sourceBase} — copying it would put a way out of the sandbox inside the sandbox`,
  );
}

/** Copy a tree, leaving behind what is not project content. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function copyTree(source, destination, excludeDirectoryNames) {
  const excluded = new Set(excludeDirectoryNames);
  const sourceBase = resolve(source);
  cpSync(source, destination, {
    recursive: true,
    filter: (candidate) => {
      if (candidate === source) return true;
      if (excluded.has(basename(candidate))) return false;
      assertLinkStaysInside(candidate, sourceBase);
      return true;
    },
  });
}

/** The declared database, resolved inside the sandbox and nowhere else. */
// [::TICKET::] P22-18, P23-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-18|P23-5) --for-spec --no-implementation-order`.
function resolveDatabase(sandboxRoot, database) {
  const kind = database?.kind ?? 'none';
  if (!DECLARABLE_DATABASE_KINDS.includes(kind)) {
    throw new SandboxError(
      'database-kind-unknown',
      `the declared database kind "${kind}" is not one of ${DECLARABLE_DATABASE_KINDS.join(', ')}`,
    );
  }
  if (kind === 'none') {
    return { kind: 'none', path: null, absolutePath: null, initialDigest: null };
  }

  const relativePath = database?.path;
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new SandboxError('database-path-missing', `a ${kind} database needs a path, and none was given`);
  }
  const sandboxBase = resolve(sandboxRoot);
  const absolutePath = resolve(sandboxBase, relativePath);
  if (absolutePath !== sandboxBase && !absolutePath.startsWith(sandboxBase + sep)) {
    throw new SandboxError(
      'database-outside-sandbox',
      `the declared database ${relativePath} would resolve to ${absolutePath}, which is outside the sandbox — a database the sandbox cannot contain is not an isolated one`,
    );
  }
  if (!existsSync(absolutePath)) {
    throw new SandboxError(
      'database-missing',
      `the declared database ${relativePath} is not present in the sandbox at ${absolutePath}`,
    );
  }
  return { kind, path: relativePath, absolutePath, initialDigest: { sha256: sha256File(absolutePath) } };
}

/**
 * Digest every guarded path, keyed by the path, so two moments can be compared.
 *
 * A guarded root that has gone missing is recorded as a digest with no content
 * rather than raising: the question being asked is whether it changed, and "it
 * is no longer there" is an answer to that question.
 */
// [::TICKET::] P22-18, P23-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-18|P23-5) --for-spec --no-implementation-order`.
function digestGuardedPaths(guardedPaths) {
  const digests = {};
  for (const guardedPath of guardedPaths) {
    digests[guardedPath] = existsSync(guardedPath)
      ? digestTree(guardedPath)
      : { fileCount: 0, sha256: null, unreadable: [guardedPath] };
  }
  return digests;
}

/**
 * The paths a sandbox must not change: the caller's declaration, unioned with the
 * subject root itself.
 *
 * The subject root is always guarded, because it is the tree the sandbox was
 * copied from and the only path whose change is unambiguously the sandbox's
 * fault. A declaration is either relative to the subject or absolute:
 *
 * - A *relative* name is resolved against the subject, and one that resolves
 *   outside it is refused by name. A caller who writes a path in terms of the
 *   subject and escapes it has mis-scoped the guard, and the alternative to
 *   refusing is a guard silently covering a tree they did not name.
 * - An *absolute* path is taken as declared, wherever it points. The worktree
 *   isolation legitimately guards a tree beside the subject, and each guarded
 *   path is digested directly, so such a guard is checkable on its own terms.
 *
 * @param {object} request
 * @param {string} request.subjectRoot - the tree the guard belongs to
 * @param {Array<string>} [request.declared] - guarded paths, relative to the subject or absolute
 * @returns {ReadonlyArray<string>} the guarded paths, absolute and sorted
 */
export function resolveGuardedPaths({ subjectRoot, declared = DEFAULT_GUARDED_PATHS } = {}) {
  if (typeof subjectRoot !== 'string' || subjectRoot.length === 0) {
    throw new SandboxError('subject-root-missing', 'a guarded set needs the subject root it belongs to, and none was given');
  }

  const subject = resolve(subjectRoot);
  const guarded = new Set([subject]);
  for (const name of declared) {
    const absolute = resolve(subject, name);
    if (!isAbsolute(name) && absolute !== subject && !absolute.startsWith(subject + sep)) {
      throw new SandboxError(
        GUARDED_PATH_OUTSIDE_SUBJECT_REASON,
        `the guarded path "${name}" is declared relative to the subject and resolves to ${absolute}, which is outside the subject root ${subject} — a relative guard that escapes its subject is a mis-scoped guard, not a guard on another tree`,
      );
    }
    guarded.add(absolute);
  }
  return Object.freeze([...guarded].sort(compareText));
}

/**
 * The recorded reset, or null when none has been recorded.
 *
 * Arming is the module-private set, not the field: the field is a readable
 * mirror, and only this function adds to the set, so a caller cannot arm a
 * sandbox by assigning to it.
 */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function recordReset(handle) {
  handle.resetHandle = {
    resetId: `reset-${handle.sandboxId}`,
    initialDigest: handle.initialDigest,
    snapshotPath: handle.snapshotRoot,
  };
  ARMED_SANDBOXES.add(handle);
  return handle.resetHandle;
}

/**
 * Restore the sandbox from its snapshot and say whether the initial state came back.
 *
 * The snapshot is checked before the sandbox is touched: taking the way back
 * away and only then discovering there is none is the ordering this exists to
 * avoid.
 */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function restoreFromSnapshot(handle) {
  if (!existsSync(handle.snapshotRoot)) {
    throw new SandboxError(
      'snapshot-missing',
      `the snapshot at ${handle.snapshotRoot} is gone, so the sandbox ${handle.sandboxId} can no longer be returned to its initial state`,
    );
  }
  rmSync(handle.sandboxRoot, { recursive: true, force: true });
  cpSync(handle.snapshotRoot, handle.sandboxRoot, { recursive: true });
  const digest = digestTree(handle.sandboxRoot, { excludedDirectoryNames: handle.excludeDirectoryNames });
  return {
    digest,
    matchesInitial: digest.sha256 === handle.initialDigest.sha256 && digest.fileCount === handle.initialDigest.fileCount,
  };
}

/** Whether the declared database still holds the bytes it held at creation. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function databaseState(handle) {
  if (handle.database.kind === 'none') {
    return { matchesInitial: true, sha256: null };
  }
  if (!existsSync(handle.database.absolutePath)) {
    return { matchesInitial: false, sha256: null };
  }
  const digest = sha256File(handle.database.absolutePath);
  return { matchesInitial: digest === handle.database.initialDigest.sha256, sha256: digest };
}

/** Refuse any operation on a sandbox that is no longer usable, or was never ours. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function assertUsable(handle) {
  if (!isObservedSandbox(handle)) {
    throw new SandboxError(
      'sandbox-not-observed',
      'no sandbox in this process produced this handle — only a handle createSandbox returned can be operated on',
    );
  }
  if (!handle.sandboxUsable) {
    throw new SandboxError(
      handle.unusableReason ?? SANDBOX_UNUSABLE_REASON,
      `the sandbox ${handle.sandboxId} is not usable — ${handle.unusableReasonDetail ?? 'a previous reset failed, so it must not be reused'}`,
    );
  }
}

/**
 * Refuse a destructive transition whose way back has not been recorded.
 *
 * The check reads the module-private arming set, so the ordering cannot be
 * talked around by setting a field on the handle.
 */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function assertResetArmed(handle, transitionName) {
  if (!ARMED_SANDBOXES.has(handle)) {
    throw new SandboxError(
      'reset-not-armed',
      `the transition "${transitionName}" is destructive and no reset has been recorded for the sandbox ${handle.sandboxId} — a transition that cannot be reset is never executed`,
    );
  }
}

/** Mark a sandbox unusable with a reason a caller can branch on. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function markUnusable(handle, reason, detail) {
  handle.sandboxUsable = false;
  ARMED_SANDBOXES.delete(handle);
  handle.resetHandle = null;
  handle.unusableReason = reason;
  handle.unusableReasonDetail = detail;
}

/**
 * Re-measure the guarded paths and refuse to continue when one moved.
 *
 * The isolation claim is checked around every operation rather than only when a
 * caller remembers to ask, because the damage this guards against is attributed
 * to the reverse rotation rather than to the sandbox.
 */
// [::TICKET::] P22-18, P23-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-18|P23-5) --for-spec --no-implementation-order`.
function assertSubjectStillUntouched(handle, operation) {
  const audit = assertSubjectUntouched(handle);
  if (audit.untouched) return audit;

  markUnusable(handle, SANDBOX_SUBJECT_TOUCHED_REASON, `a guarded path changed during ${operation}`);
  throw new SandboxError(
    SANDBOX_SUBJECT_TOUCHED_REASON,
    `the ${operation} changed the guarded path(s) ${audit.changedPaths.join(', ')} — the sandbox ${handle.sandboxId} is marked unusable`,
  );
}

/**
 * Create an isolated copy of a target, with a reset procedure already proven.
 *
 * The returned handle carries the initial digest, the production digest taken
 * before anything ran, the plans the target declares, and an armed reset.
 * Nothing destructive can be executed against it until that reset exists, and
 * the sandbox is thrown away rather than returned if the reset cannot be
 * rehearsed.
 *
 * @param {string} root - the target to isolate
 * @param {object} [options]
 * @param {string} [options.scratchRoot] - where the sandbox directory is made
 * @param {object} [options.database] - `{kind:'none'}` or `{kind:'sqlite', path}`
 * @param {Array} [options.guardedPaths] - paths inside the subject that must not change
 * @returns {object} the sandbox handle
 */
export function createSandbox(root, options = {}) {
  assertNoRenamedGuardOption(options);
  const scratchRoot = options.scratchRoot ?? null;
  const excludeDirectoryNames = options.excludeDirectoryNames ?? NEVER_WALKED_DIRECTORY_NAMES;
  const database = options.database ?? { kind: 'none' };
  const guardedPaths = options.guardedPaths ?? DEFAULT_GUARDED_PATHS;

  assertTargetRoot(root);

  const scratchBaseWasCreated = scratchRoot === null;
  const scratchBase = scratchRoot ?? mkdtempSync(join(tmpdir(), 'wsp-sandbox-root-'));
  mkdirSync(scratchBase, { recursive: true });
  const sandboxDir = mkdtempSync(join(scratchBase, 'sandbox-'));

  try {
    return assembleSandbox(root, sandboxDir, {
      excludeDirectoryNames,
      database,
      guardedPaths,
      scratchBase,
      scratchBaseWasCreated,
    });
  } catch (error) {
    // A sandbox that could not be assembled must not leave a copy of the target
    // behind: the caller never receives a handle, so nothing else can remove it.
    rmSync(sandboxDir, { recursive: true, force: true });
    if (scratchBaseWasCreated) rmSync(scratchBase, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Fill a scratch directory with the copy, its snapshot, and a rehearsed reset.
 *
 * The reset is rehearsed before the handle is handed over, so a sandbox whose
 * way back does not work is never returned and never becomes something a
 * destructive transition can be run against.
 */
// [::TICKET::] P22-18, P23-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-18|P23-5) --for-spec --no-implementation-order`.
function assembleSandbox(root, sandboxDir, setup) {
  const excludeDirectoryNames = setup.excludeDirectoryNames;
  const database = setup.database;
  const guardedPaths = setup.guardedPaths;
  const scratchBase = setup.scratchBase;
  const scratchBaseWasCreated = setup.scratchBaseWasCreated;
  const sandboxRoot = join(sandboxDir, SANDBOX_TREE_DIRECTORY_NAME);
  const snapshotRoot = join(sandboxDir, SANDBOX_SNAPSHOT_DIRECTORY_NAME);

  copyTree(root, sandboxRoot, excludeDirectoryNames);
  copyTree(root, snapshotRoot, excludeDirectoryNames);

  // One walk answers both the plan and the copy the handle records, so the two
  // cannot disagree about what the subject contains.
  const detection = detectStartPlan(root);
  const handle = {
    sandboxId: basename(sandboxDir),
    sandboxDir,
    scratchBase,
    scratchBaseWasCreated,
    targetRoot: root,
    sandboxRoot,
    snapshotRoot,
    excludeDirectoryNames,
    initialDigest: digestTree(sandboxRoot, { excludedDirectoryNames: excludeDirectoryNames }),
    database: resolveDatabase(sandboxRoot, database),
    guardedPaths: resolveGuardedPaths({ subjectRoot: root, declared: guardedPaths }),
    guardedDigest: null,
    startPlans: detection.plans,
    startPlan: detection.plan,
    unstartableReason: detection.reason,
    resetHandle: null,
    replayHandle: null,
    sandboxUsable: true,
    unusableReason: null,
    unusableReasonDetail: null,
    transitions: [],
  };
  handle.guardedDigest = digestGuardedPaths(handle.guardedPaths);
  OBSERVED_SANDBOXES.add(handle);

  const rehearsal = restoreFromSnapshot(handle);
  if (!rehearsal.matchesInitial) {
    markUnusable(handle, SANDBOX_UNUSABLE_REASON, 'the reset rehearsal did not reproduce the initial digest');
    throw new SandboxError(
      'reset-rehearsal-failed',
      `the reset of ${root} was rehearsed and did not reproduce the initial digest, so no destructive transition may run against it`,
    );
  }
  recordReset(handle);

  // The handle reads its arming from the module-private set, so the readable
  // field cannot disagree with the gate that actually decides.
  Object.defineProperty(handle, 'resetArmed', { get: () => ARMED_SANDBOXES.has(handle), enumerable: true });

  return handle;
}

/**
 * Return a sandbox to its recorded initial state.
 *
 * A failure is reported as a result and the environment is marked unusable
 * rather than silently reused, because a sandbox whose way back is broken is
 * not a sandbox. A sandbox with no recorded transitions still takes the same
 * route, and comes back unchanged.
 */
export function resetSandbox(handle) {
  assertUsable(handle);

  const transitionsCleared = handle.transitions.length;
  ARMED_SANDBOXES.delete(handle);
  handle.resetHandle = null;
  // The transitions before a reset belong to sessions that have already been
  // recorded; a fresh log is started so new runs are not mixed into them.
  handle.transitions = [];
  handle.replayHandle = null;

  let restored;
  try {
    restored = restoreFromSnapshot(handle);
    if (!restored.matchesInitial) {
      throw new SandboxError(
        'reset-digest-mismatch',
        'the restored sandbox does not match its initial digest, so it cannot be trusted as a starting point',
      );
    }
  } catch (error) {
    markUnusable(handle, SANDBOX_UNUSABLE_REASON, `a reset of the sandbox failed: ${error.message}`);
    return {
      restored: false,
      matchesInitial: false,
      digest: null,
      database: { matchesInitial: false, sha256: null },
      transitionsCleared,
      reason: error.message,
    };
  }

  const database = databaseState(handle);
  assertSubjectStillUntouched(handle, 'reset');
  recordReset(handle);
  return { restored: true, matchesInitial: true, digest: restored.digest, database, transitionsCleared };
}

/**
 * Run one command inside the sandbox and record it.
 *
 * A destructive transition requires an armed reset, and is refused before
 * anything is executed when there is none. A command that cannot be spawned at
 * all is reported as such, with the command named, rather than recorded as a
 * run that produced nothing. Production is re-measured afterwards.
 */
export function runTransition(handle, transition = {}) {
  const name = transition.name;
  const command = transition.command;
  const args = transition.args ?? [];
  const destructive = transition.destructive ?? false;
  const evidenceMode = transition.evidenceMode ?? 'source_static';
  const observations = transition.observations ?? [];

  assertUsable(handle);
  if (destructive) assertResetArmed(handle, name);
  if (!EVIDENCE_MODES.includes(evidenceMode)) {
    throw new SandboxError(
      'evidence-mode-unknown',
      `the evidence mode "${evidenceMode}" is not one of ${EVIDENCE_MODES.join(', ')}`,
    );
  }

  const result = spawnSync(command, args, {
    cwd: handle.sandboxRoot,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.error) {
    throw new SandboxError(
      'command-unavailable',
      `the command "${command}" could not be run inside the sandbox ${handle.sandboxId}: ${result.error.message}`,
    );
  }

  const record = {
    name,
    command,
    args: [...args],
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    destructive,
    evidenceMode,
    observations: observations.map((observation) => ({
      kind: observation.kind,
      specifier: observation.specifier ?? null,
      symbol: observation.symbol ?? null,
      statement: observation.statement ?? null,
    })),
  };
  handle.transitions.push(record);
  assertSubjectStillUntouched(handle, `transition "${name}"`);
  return record;
}

/** The plan a session will start from, or a refusal naming why there is none. */
// [::TICKET::] P22-18, P23-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-18|P23-5) --for-spec --no-implementation-order`.
function resolveStartPlan(handle, tier) {
  if (tier !== null && tier !== undefined) {
    const plan = handle.startPlans.find((candidate) => candidate.kind === tier);
    if (plan === undefined) {
      throw new SandboxError(
        'tier-unavailable',
        `the target at ${handle.targetRoot} declares no "${tier}" start plan; it declares ${describePlanKinds(handle)}`,
      );
    }
    return plan;
  }
  if (handle.startPlan === null) {
    throw new SandboxError(
      'unstartable',
      handle.unstartableReason ?? `the target at ${handle.targetRoot} matches no declared ecosystem`,
    );
  }
  return handle.startPlan;
}

/** The plan kinds a target declares, named for a human reading a refusal. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function describePlanKinds(handle) {
  return handle.startPlans.length === 0
    ? 'none at all'
    : handle.startPlans.map((plan) => `"${plan.kind}" (from ${plan.manifest})`).join(', ');
}

/** The first non-empty stderr line, so a failure message quotes the cause and not a wall of text. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function firstNonEmptyLine(text) {
  return text.split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? '';
}

/**
 * Start the target's own declared command inside the sandbox.
 *
 * A start that fails is reported with its exit code and the first line of its
 * own output; it is never returned as a session that merely observed nothing.
 */
export function startSession(handle, options = {}) {
  const tier = options.tier ?? null;

  assertUsable(handle);
  const plan = resolveStartPlan(handle, tier);
  const transition = runTransition(handle, {
    name: 'start',
    command: plan.command,
    args: plan.args,
    evidenceMode: 'build_semantic',
  });
  if (transition.exitCode !== 0) {
    throw new SandboxError(
      'start-failed',
      `starting the target at ${handle.targetRoot} with "${plan.command} ${plan.args.join(' ')}" failed with exit code ${transition.exitCode}: ${firstNonEmptyLine(transition.stderr) || '(no stderr)'}`,
    );
  }

  // The session keeps the log it began in, by reference. A later reset starts a
  // fresh log, so what this session did stays readable instead of being erased
  // into an empty evidence set that would look like a clean result.
  const sessionLog = handle.transitions;
  const sessionStartIndex = sessionLog.length - 1;
  const session = { sandboxId: handle.sandboxId, startPlan: plan, started: true, sessionStartIndex };
  Object.defineProperty(session, 'transitions', {
    get: () => sessionLog.slice(sessionStartIndex),
    enumerable: true,
  });
  Object.defineProperty(session, 'sessionId', {
    get: () => sessionIdOf(session),
    enumerable: true,
  });
  Object.defineProperty(session, 'origin', { value: handle, enumerable: false });
  return session;
}

/**
 * The identifier of a session, derived from its content so that the same
 * session names itself the same way twice.
 */
export function sessionIdOf(session) {
  const canonical = JSON.stringify({
    sandboxId: session.sandboxId,
    startPlan: session.startPlan,
    transitions: session.transitions.map((transition) => ({
      name: transition.name,
      command: transition.command,
      args: transition.args,
      exitCode: transition.exitCode,
      stdout: transition.stdout,
      stderr: transition.stderr,
      evidenceMode: transition.evidenceMode,
    })),
  });
  return `ses-${sha256(canonical).slice(0, 16)}`;
}

/**
 * Collect the dynamic evidence an isolated session produced.
 *
 * Two lists come out of a session and they are not interchangeable. The *runs*
 * are what was executed, and they are what makes the scan reproducible. The
 * *observations* are the dynamic constructs the runs and the caller's own
 * reading actually saw. A command that exited zero is not a construct that was
 * resolved, so a run never becomes an observation: collapsing the two would let
 * a build that saw nothing report a surface it never looked at.
 *
 * `unobservedChannels` is passed through untouched, so a caller who says
 * nothing gets the safe reading rather than the flattering one.
 */
export function collectDynamicEvidence(handle, session, options = {}) {
  const observations = options.observations ?? [];

  const saw = session.transitions.flatMap((transition) =>
    transition.observations.map((observation) => ({
      kind: observation.kind,
      specifier: observation.specifier,
      symbol: observation.symbol,
      statement: observation.statement,
      evidence_mode: transition.evidenceMode,
    })),
  );
  const runs = session.transitions.map((transition) => ({
    name: transition.name,
    command: transition.command,
    args: [...transition.args],
    exitCode: transition.exitCode,
    evidence_mode: transition.evidenceMode,
  }));

  return buildDynamicSurface({
    observations: [...observations, ...saw],
    unobservedChannels: options.unobservedChannels,
    runs,
    sandboxId: handle.sandboxId,
    session: { sessionId: session.sessionId, sandboxId: handle.sandboxId },
  });
}

/**
 * Whether the subject's guarded paths still hold the bytes they held at creation.
 *
 * This is the claim the isolation is checked by, and it is deliberately the same
 * measurement the P22-1 gate takes: a digest over the same walk, with the same
 * exclusions. The subject is the tree the sandbox was copied from, so the
 * statement holds for a Rust crate, a Node package or a C project alike.
 */
export function assertSubjectUntouched(handle) {
  const after = digestGuardedPaths(handle.guardedPaths);
  const changedPaths = handle.guardedPaths.filter((guardedPath) => {
    const before = handle.guardedDigest[guardedPath];
    const now = after[guardedPath];
    return before?.sha256 !== now?.sha256 || before?.fileCount !== now?.fileCount;
  });
  return {
    untouched: changedPaths.length === 0,
    before: handle.guardedDigest,
    after,
    changedPaths: [...changedPaths].sort(compareText),
  };
}

/** Throw the sandbox away, leaving it unusable rather than silently reusable. */
export function disposeSandbox(handle) {
  if (!isObservedSandbox(handle)) {
    throw new SandboxError(
      'sandbox-not-observed',
      'no sandbox in this process produced this handle — disposing it would remove a directory this module never made',
    );
  }
  rmSync(handle.sandboxDir, { recursive: true, force: true });
  // A scratch parent this module created holds only this sandbox, so leaving it
  // behind would leak an empty directory per sandbox ever made.
  if (handle.scratchBaseWasCreated) rmSync(handle.scratchBase, { recursive: true, force: true });
  markUnusable(handle, SANDBOX_DISPOSED_REASON, 'the sandbox was disposed');
}
