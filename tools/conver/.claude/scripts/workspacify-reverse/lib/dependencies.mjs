// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
/**
 * R2 — the dependency measurement, recorded as a hypothesis.
 *
 * The one thing this module may not do is present an import graph as if it were
 * a coupling graph. An import is a statement in the source; coupling is what
 * happens when the program runs, and between the two sit dynamic dispatch,
 * dependency injection, plugin registration, configuration-driven selection and
 * reflection. The design names the failure this prevents — F4, the static
 * analysis blind spot — and the mechanical guard is that every result carries
 * `coupling_claim: "hypothesis"` and `represents_runtime_binding: false`.
 *
 * A package edge is derived from a `use` declaration's first segment, resolved
 * to the source member that declares that module. The resolution is the same
 * one R0.5 already uses, reused rather than reimplemented, so the two stages
 * cannot disagree about which module a path names.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import {
  ANALYSIS_MODES,
  LANGUAGES_WITH_EXTRACTORS,
  assertAdapterResult,
  renderCappedList,
  emptyCoverage,
  listArtefacts,
  recordAttempt,
} from './analysis-tech.mjs';
import { readTranslationUnits, reportDatabaseLimitation } from './build-database.mjs';
import { BUILD_MANIFESTS, compareText } from './holdout-ledger.mjs';
import { groupKey } from './provenance.mjs';
import { owningDirectoryOf, resolveSourceMember } from './claim-ledger.mjs';
import {
  collectModules,
  collectRustUses,
  parseSourceFile,
  syntaxLanguageOf,
  syntaxRecoveryDiagnostic,
  walkNamed,
} from './structure.mjs';

/** The claim this measurement is allowed to make about coupling. */
export const COUPLING_CLAIM = 'hypothesis';

/**
 * What the import graph does not say, in the words every consumer reads.
 *
 * It is a constant rather than a sentence built per run because a caveat that
 * varies with the data invites reading it as a finding rather than as the
 * standing limitation of the method.
 */
export const RUNTIME_BINDING_CAVEAT =
  'An import graph is a hypothesis about coupling read from use declarations. '
  + 'It does not represent runtime binding: dynamic dispatch, dependency injection, plugin '
  + 'registration, configuration-driven selection and reflection all couple code that no import '
  + 'names. The execution surface measured at R2.5 lists those mechanisms separately, and a '
  + 'proposition touching one of them may not be classified observed on this graph alone.';

/** The closed interval the density ratio lives in. */
export const DENSITY_MINIMUM = 0;
export const DENSITY_MAXIMUM = 1;

/**
 * The value a count carries when the input it would be read from was absent.
 *
 * It is `null` and not `0` because the two are different facts: "we could not
 * measure it" and "we measured it and found none" are merged the moment an
 * absent input is written as a zero, and that merge is failure F12.
 */
export const NOT_MEASURED = null;

/** Why a crossing row carries no count: the input that would carry it did not run. */
export const CALL_SITES_ABSENT_REASON =
  'R3 has not run in this analysis, so the call sites in the source package that name this edge\'s '
  + 'target were not extracted. This crossing is not measured, which is not the same fact as a count '
  + 'of zero — a static call graph cannot see a call behind a trait object, a macro or a registry.';

/** The blank line between two sections of the dependency report. */
const SECTION_SEPARATOR = '';

/**
 * The external dependencies a build manifest declares.
 *
 * Read line by line rather than parsed as TOML: the sections this needs are
 * flat, and a full TOML parser would be a dependency this ticket does not
 * declare. A line the reader does not recognise is skipped, never guessed at.
 */
export function externalDependenciesIn(root, manifestPath) {
  let text;
  try {
    text = readFileSync(join(root, manifestPath), 'utf8');
  } catch (error) {
    return {
      manifest: manifestPath,
      dependencies: [],
      reason: `${error.code ?? 'error'}: the manifest could not be read`,
    };
  }

  const dependencies = [];
  let section = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    if (section === null || !section.endsWith('dependencies')) continue;
    const assignment = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!assignment) continue;
    dependencies.push({
      name: assignment[1],
      section,
      requirement: assignment[2].replace(/\s+#.*$/, '').trim(),
    });
  }

  return {
    manifest: manifestPath,
    dependencies: dependencies.sort((left, right) => compareText(left.name, right.name)),
    reason: null,
  };
}

/** The build manifests present in the measured population. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function manifestsInScope(root, excludedPaths) {
  const excluded = new Set(excludedPaths);
  return listArtefacts(root)
    .filter((artefact) => artefact.readStatus === 'readable' && !artefact.exclusion && !excluded.has(artefact.path))
    .map((artefact) => artefact.path)
    .filter((path) => BUILD_MANIFESTS.includes(path.split('/').pop()))
    .sort(compareText);
}

/**
 * The package a file belongs to: the directory that owns it.
 *
 * Packages are directories here because that is the unit E1 measures and the
 * unit the design's directory-boundary work consumes; a per-file graph would be
 * a different measurement wearing the same name.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function packageOf(relativePath) {
  return relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : '.';
}

/**
 * One edge per ordered package pair, with every location that produced it.
 *
 * Locations are collected rather than collapsed to the first, because an edge
 * supported by one `use` and an edge supported by forty are different evidence
 * for the boundary work downstream, and discarding the count would hide that.
 */
// [::TICKET::] P22-4, P22-5, P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-4|P22-5|P24-3) --for-spec --no-implementation-order`.
function edgesFrom(records) {
  const byPair = new Map();
  for (const record of records) {
    if (record.from === record.to) continue;
    // Joined with a separator no package path can contain. A space is not one:
    // `from: "src/a b"` with `to: "c"` and `from: "src/a"` with `to: "b c"`
    // both spell the same key, and the collision would silently merge two
    // package edges into one.
    //
    // The language is part of the key because a tree can hold two of them, and
    // a TypeScript file importing `src/lib` is a different edge from a Python
    // file importing it. Merging them would attribute one language's dependency
    // to the other.
    const key = groupKey(record.language, record.from, record.to);
    if (!byPair.has(key)) {
      byPair.set(key, {
        from: record.from,
        to: record.to,
        language: record.language,
        kind: 'syntactic_import',
        locations: [],
      });
    }
    byPair.get(key).locations.push({ file: record.file, line: record.line, spelling: record.spelling });
  }
  return [...byPair.values()]
    .map((edge) => ({
      ...edge,
      locations: edge.locations
        .sort((left, right) => compareText(`${left.file}:${left.line}`, `${right.file}:${right.line}`)),
      count: edge.locations.length,
    }))
    .sort((left, right) => compareText(`${left.from}->${left.to}`, `${right.from}->${right.to}`));
}

/**
 * The strongly connected components of the package graph, cycles only.
 *
 * Tarjan's algorithm, driven by an explicit work list so that a deep graph
 * cannot overflow the stack. Only a component with more than one member, or a
 * self-edge, is a cycle: reporting a component of one would fill the report
 * with packages that merely exist.
 */
export function findPackageCycles(edges, packages) {
  const adjacency = new Map(packages.map((name) => [name, []]));
  const selfEdges = new Set();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from).push(edge.to);
    if (edge.from === edge.to) selfEdges.add(edge.from);
  }

  const index = new Map();
  const lowLink = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  let nextIndex = 0;

  for (const start of [...adjacency.keys()].sort(compareText)) {
    if (index.has(start)) continue;
    const work = [{ node: start, childIndex: 0 }];
    while (work.length > 0) {
      const frame = work[work.length - 1];
      if (frame.childIndex === 0) {
        index.set(frame.node, nextIndex);
        lowLink.set(frame.node, nextIndex);
        nextIndex += 1;
        stack.push(frame.node);
        onStack.add(frame.node);
      }
      const children = adjacency.get(frame.node) ?? [];
      if (frame.childIndex < children.length) {
        const child = children[frame.childIndex];
        frame.childIndex += 1;
        if (!index.has(child)) {
          work.push({ node: child, childIndex: 0 });
        } else if (onStack.has(child)) {
          lowLink.set(frame.node, Math.min(lowLink.get(frame.node), index.get(child)));
        }
        continue;
      }
      work.pop();
      if (lowLink.get(frame.node) === index.get(frame.node)) {
        const component = [];
        for (;;) {
          const member = stack.pop();
          onStack.delete(member);
          component.push(member);
          if (member === frame.node) break;
        }
        if (component.length > 1 || selfEdges.has(component[0])) components.push(component.sort(compareText));
      }
      if (work.length > 0) {
        const parent = work[work.length - 1];
        lowLink.set(parent.node, Math.min(lowLink.get(parent.node), lowLink.get(frame.node)));
      }
    }
  }

  return components.sort((left, right) => compareText(left[0], right[0]));
}

/** The requirement every measurement in this module states about its inputs. */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function requireArrays({ packages, edges }, functionName) {
  if (!Array.isArray(packages)) {
    throw new Error(`${functionName} needs the measured package set it is to measure; it was given no array of packages`);
  }
  if (!Array.isArray(edges)) {
    throw new Error(`${functionName} needs the measured edge set it is to measure; it was given no array of edges`);
  }
}

/**
 * R2 — cohesion, per candidate directory boundary.
 *
 * The edges are the file-level records R2 read, not the package pairs it
 * collapsed them into: `edgesFrom` drops a pair whose two ends are the same
 * package, and internal coupling is exactly those pairs. The package set is the
 * one that collapse produced, so this measurement and `findPackageCycles` cannot
 * disagree about which directories exist.
 *
 * An edge that crosses a boundary is external coupling for both of its ends:
 * the caller depends on a package it does not own, and the callee is depended on
 * by one. Counting it once would make one of the two read as less coupled than
 * it is.
 */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
export function measureCohesion({ packages, edges } = {}) {
  requireArrays({ packages, edges }, 'measureCohesion');

  const members = new Set(packages);
  const unresolvedEdges = [];
  const tallies = new Map(packages.map((name) => [name, { internal: 0, external: 0, files: new Set() }]));

  for (const edge of edges) {
    if (!members.has(edge.from) || !members.has(edge.to)) {
      const outside = members.has(edge.from) ? edge.to : edge.from;
      unresolvedEdges.push({ from: edge.from, to: edge.to, reason: `${outside} is not in the measured package set` });
      continue;
    }
    if (edge.from === edge.to) {
      tallies.get(edge.from).internal += 1;
    } else {
      tallies.get(edge.from).external += 1;
      tallies.get(edge.to).external += 1;
    }
    // The files the coupling was read from, so the reader can open them rather
    // than being handed a bare number.
    if (typeof edge.file === 'string') tallies.get(edge.from).files.add(edge.file);
  }

  const rows = [...tallies.entries()]
    .map(([name, tally]) => {
      const incidentEdges = tally.internal + tally.external;
      return {
        package: name,
        internalCoupling: tally.internal,
        externalCoupling: tally.external,
        incidentEdges,
        // A ratio over an empty denominator is undefined. Writing it as zero
        // would read as "no external coupling" when the truth is "nothing to
        // divide".
        externalRatio: incidentEdges === 0 ? NOT_MEASURED : tally.external / incidentEdges,
        memberFiles: [...tally.files].sort(compareText),
      };
    })
    .sort((left, right) => compareText(left.package, right.package));

  return { rows, unresolvedEdges };
}

/**
 * R2 — dependency density over the measured packages.
 *
 * A count over a named population, not a score: it says how much of the space of
 * possible package pairs the graph actually uses, and nothing about whether the
 * pairs it uses are the ones the structure wants.
 *
 * The denominator is one for a population of one rather than zero. A single
 * package has no ordered pair other than with itself and the graph holds no
 * self-edge, so the honest reading is "nothing to divide"; a zero denominator
 * would make the ratio undefined and the report unreadable.
 */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
export function measureDependencyDensity({ packages, edges } = {}) {
  requireArrays({ packages, edges }, 'measureDependencyDensity');

  // The population is a set, as it is for the cohesion measurement beside this
  // one: a name given twice is one package, and counting it twice would make two
  // measurements of one population disagree about how many packages it holds.
  const measuredPackages = [...new Set(packages)].sort(compareText);
  const members = new Set(measuredPackages);
  // A self-edge is not an ordered pair of packages, so it cannot be a measured
  // one; excluding it is what keeps the density inside [0, 1] by construction.
  const measuredEdges = edges
    .filter((edge) => edge.from !== edge.to && members.has(edge.from) && members.has(edge.to))
    .length;
  const possibleOrderedPairs = Math.max(measuredPackages.length * (measuredPackages.length - 1), 1);

  return {
    measuredEdges,
    possibleOrderedPairs,
    density: measuredEdges / possibleOrderedPairs,
    // `measured` is stated rather than assumed: a caller reading a zero density
    // has to be able to tell a measured population from one that was not
    // measured at all. measureDependencyDensity refuses a missing input instead
    // of returning, so a returned population is always a measured one.
    population: { packages: measuredPackages, measured: true, reason: null },
  };
}

/**
 * The call sites, refused by name when one arrives without the two fields the
 * count is read from.
 *
 * The material crosses a module boundary — a per-language extractor will
 * produce it — so a malformed row is a boundary failure and is named here
 * rather than surfacing as a property access on `undefined` several frames
 * deeper, where the message would name neither the input nor the caller.
 */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function assertCallSites(callSites) {
  for (const site of callSites) {
    if (typeof site?.file !== 'string' || typeof site?.name !== 'string') {
      throw new Error(
        'countBoundaryCrossings needs every call site to carry the file it sits in and the callee it '
        + 'names; one was given without both',
      );
    }
  }
}

/** The item or module names an edge's `use` locations resolved to. */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function targetedNamesOf(edge) {
  const names = new Set();
  for (const location of edge.locations ?? []) {
    const segments = String(location.spelling ?? '').split('::').filter((segment) => segment.length > 0);
    const last = segments[segments.length - 1];
    if (last !== undefined) names.add(last);
  }
  return names;
}

/**
 * R2 — the call sites that cross a package boundary, counted per crossing.
 *
 * The call sites arrive as data rather than being read from Rust syntax here,
 * because the extractor is per language and this measurement is not: the same
 * arithmetic applies to every language's graph once that language has a
 * call-site extractor, and a function that parsed source itself would have to be
 * rewritten for each one.
 *
 * One row per crossing, always. A crossing whose calls the syntax layer cannot
 * see is a count of zero and stays in the output, because dropping it would let
 * an unmeasured crossing read as an absent one. A run in which the call sites
 * were never extracted reports every crossing as not measured, with the missing
 * input named — never as a count of zero.
 */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
export function countBoundaryCrossings({ packages, edges, callSites = NOT_MEASURED } = {}) {
  requireArrays({ packages, edges }, 'countBoundaryCrossings');

  const members = new Set(packages);
  const measured = Array.isArray(callSites);
  const namesByPackage = new Map();
  if (measured) {
    assertCallSites(callSites);
    for (const site of callSites) {
      const owner = packageOf(site.file);
      if (!namesByPackage.has(owner)) namesByPackage.set(owner, []);
      namesByPackage.get(owner).push(site.name);
    }
  }

  return edges
    .filter((edge) => edge.from !== edge.to && members.has(edge.from) && members.has(edge.to))
    .map((edge) => {
      if (!measured) {
        return {
          from: edge.from,
          to: edge.to,
          callSiteCount: NOT_MEASURED,
          measured: false,
          reason: CALL_SITES_ABSENT_REASON,
        };
      }
      const targeted = targetedNamesOf(edge);
      const sites = namesByPackage.get(edge.from) ?? [];
      return {
        from: edge.from,
        to: edge.to,
        callSiteCount: sites.filter((name) => targeted.has(name)).length,
        measured: true,
        reason: null,
      };
    })
    .sort((left, right) => compareText(`${left.from}->${left.to}`, `${right.from}->${right.to}`));
}

/**
 * The files the dependency measurement attempts: in-scope, and of a known language.
 *
 * An unreadable entry stays in the population so that its attempt fails and
 * leaves a ledger row, rather than disappearing from the measurement without
 * anything recording that it was skipped.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function measuredFiles(root, excludedPaths) {
  const excluded = new Set(excludedPaths);
  return listArtefacts(root)
    .filter((artefact) => !artefact.exclusion && !excluded.has(artefact.path))
    .map((artefact) => artefact.path)
    .filter((path) => syntaxLanguageOf(path) !== 'unknown')
    .sort(compareText);
}

// ---------------------------------------------------------------------------
// E5 — how each target language states a dependency, and where its own build
// manifest says a name is looked for
// ---------------------------------------------------------------------------

/**
 * Why a file carries no edge: this instrument has no query set for its language.
 *
 * Named rather than typed into the loop, because the skip is an act with a
 * reader-facing meaning and because the test that asserts the six are read and
 * the test that asserts a language outside them is not must point at one name.
 */
export const NO_EDGE_EXTRACTOR_REASON = 'no_edge_extractor_for_language';

/**
 * The file extensions a relative specifier is tried with, in the order it is tried.
 *
 * TypeScript writes `./alpha.js` for a module the tree holds as `alpha.ts`,
 * because the specifier names the emitted file and not the source one. A
 * resolver that trusted the spelling would find nothing and report a package
 * with no dependencies, which is why the extension is a candidate rather than a
 * fact.
 */
const EXTENSIONS_BY_LANGUAGE = Object.freeze({
  typescript: Object.freeze(['.ts', '.tsx', '.js']),
  javascript: Object.freeze(['.js', '.mjs', '.cjs', '.jsx']),
  python: Object.freeze(['.py']),
  c_cpp: Object.freeze(['.h', '.hpp', '.hh', '.hxx']),
});

/** The directory an include path is looked for in, as the build manifest declares it. */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
const CMAKE_INCLUDE_DIRECTIVE = /target_include_directories\s*\([^)]*?\b(?:PUBLIC|PRIVATE|INTERFACE)\b([^)]*)\)/;

/** The module path a Go tree declares, which every import path is written against. */
const GO_MODULE_CLAUSE = /^\s*module\s+(\S+)\s*$/m;

/** Strips the quotes a string literal's text carries, or null when it is not one. */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function unquoted(text) {
  const match = /^(['"`])(.*)\1$/s.exec(text ?? '');
  return match === null ? null : match[2];
}

/** The directory a relative path sits in, as a POSIX path the tree index uses. */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function directoryOf(relativePath) {
  return relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : '';
}

/** A specifier joined onto the importing file's directory, with `..` resolved. */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function resolveAgainst(importerDirectory, specifier) {
  const joined = posix.normalize(posix.join(importerDirectory, specifier));
  return joined.startsWith('./') ? joined.slice(2) : joined.replace(/^\/+/, '');
}

/**
 * The file a relative specifier names, or null.
 *
 * The candidates are tried in a fixed order — the spelling as written, then the
 * spelling under each extension the language emits, then the spelling as a
 * directory holding an index module — so that a resolution is a fact about the
 * tree rather than a preference between two files that both exist.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function resolveRelativeFile(root, importerDirectory, specifier, extensions) {
  const base = resolveAgainst(importerDirectory, specifier);
  if (base.length === 0) return null;

  const stem = base.includes('.') && base.lastIndexOf('.') > base.lastIndexOf('/')
    ? base.slice(0, base.lastIndexOf('.'))
    : base;
  const candidates = [base, ...extensions.map((extension) => `${stem}${extension}`)];
  for (const extension of extensions) candidates.push(`${base}/index${extension}`);

  for (const candidate of candidates) {
    if (existsSync(join(root, candidate))) return candidate;
  }
  return null;
}

/**
 * Every directory a C/C++ build declares as an include search path.
 *
 * The manifest is the only place the search path is written down; without it a
 * quoted include resolves against the including file's directory alone, and the
 * translation units that reach a shared header through the build's include path
 * would read as having no dependency at all. A generator expression is a value
 * this layer cannot resolve and is skipped rather than guessed at.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function declaredIncludeDirectories(root, files) {
  const directories = new Set();
  for (const manifest of files.filter((path) => path.split('/').pop() === 'CMakeLists.txt')) {
    let text;
    try {
      text = readFileSync(join(root, manifest), 'utf8');
    } catch {
      continue;
    }
    const owner = directoryOf(manifest);
    for (const line of text.split('\n')) {
      const directive = CMAKE_INCLUDE_DIRECTIVE.exec(line);
      if (directive === null) continue;
      for (const token of directive[1].trim().split(/\s+/)) {
        if (token.length === 0 || token.includes('$<')) continue;
        directories.add(owner.length === 0 ? token : `${owner}/${token}`);
      }
    }
  }
  return [...directories].sort(compareText);
}

/** The Go module path the measured tree declares, or null when it declares none. */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function declaredGoModulePath(root, files) {
  const manifest = files.find((path) => path === 'go.mod' || path.endsWith('/go.mod'));
  if (manifest === undefined) return null;
  try {
    const clause = GO_MODULE_CLAUSE.exec(readFileSync(join(root, manifest), 'utf8'));
    return clause === null ? null : clause[1];
  } catch {
    return null;
  }
}

/**
 * The files each top-level Python module name is declared by.
 *
 * A Python import names a module and not a path, so the tree is indexed by the
 * name a module would answer to. A name that several files claim is left out
 * rather than resolved to one of them: choosing between two would be a guess
 * wearing a measurement's clothes.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function pythonModuleIndex(files) {
  const byName = new Map();
  for (const file of files) {
    if (!file.endsWith('.py')) continue;
    const stem = file.slice(file.lastIndexOf('/') + 1, -'.py'.length);
    if (stem === '__init__') continue;
    byName.set(stem, byName.has(stem) ? null : file);
  }
  return byName;
}

/** The package a resolved member belongs to, given whether that member is itself a directory. */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function packageOfMember(member, { isDirectory }) {
  return isDirectory ? member : directoryOf(member);
}

/**
 * The package a Rust path names, resolved the way R0.5 resolves a module path.
 *
 * Rust's first segment names a source member, not a file, so the resolution is
 * the one `resolveSourceMember` already performs and is reused rather than
 * reimplemented — the two stages cannot disagree about which module a path
 * names.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function resolveRustSpecifier(specifier, { root }) {
  const firstSegment = specifier.replace(/^(crate|self|super)::/, '').split('::')[0];
  const member = resolveSourceMember(root, firstSegment);
  return member === null ? null : owningDirectoryOf(member);
}

/** A relative specifier — one the importing file's own directory resolves. */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function resolveRelativeSpecifier(specifier, { language, file, root }) {
  if (!specifier.startsWith('.')) return null;
  const member = resolveRelativeFile(root, directoryOf(file), specifier, EXTENSIONS_BY_LANGUAGE[language]);
  return member === null ? null : packageOfMember(member, { isDirectory: false });
}

/**
 * The package a Go import path names: the remainder of the path under the module.
 *
 * A path that does not begin with the declared module path names something
 * outside the tree — the standard library, or another module — and is recorded
 * as unresolved rather than folded into the local graph.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function resolveGoSpecifier(specifier, { root, goModulePath }) {
  if (goModulePath === null || !specifier.startsWith(`${goModulePath}/`)) return null;
  const member = specifier.slice(goModulePath.length + 1);
  return existsSync(join(root, member)) ? packageOfMember(member, { isDirectory: true }) : null;
}

/**
 * The package a Python module name names.
 *
 * The importing file's own directory is tried first, because that is the
 * sibling a reader looks for; a name that is not there is looked up in the
 * tree-wide index, which is what a configured import root would have provided.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function resolvePythonSpecifier(specifier, { file, root, pythonModules }) {
  const leaf = specifier.split('.').pop();
  const sibling = resolveRelativeFile(root, directoryOf(file), `./${leaf}`, EXTENSIONS_BY_LANGUAGE.python);
  if (sibling !== null) return packageOfMember(sibling, { isDirectory: false });
  const indexed = pythonModules.get(leaf) ?? null;
  return indexed === null ? null : packageOfMember(indexed, { isDirectory: false });
}

/**
 * The package a C/C++ include names.
 *
 * A quoted include is looked for beside the file that writes it and then along
 * the include path the build declares; an angled include is looked for only
 * along that path, because that is the difference the two spellings carry.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function resolveIncludeSpecifier(specifier, { root, file, includeDirectories }) {
  const searchPaths = specifier.quoted ? [directoryOf(file), ...includeDirectories] : [...includeDirectories];
  for (const searchPath of searchPaths) {
    const member = `${searchPath.length === 0 ? '' : `${searchPath}/`}${specifier.path}`;
    if (existsSync(join(root, member))) return packageOfMember(member, { isDirectory: false });
  }
  return null;
}

/** Every `require('...')` a JavaScript file writes with a specifier it can name. */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function literalRequiresOf(tree, relativePath) {
  const requires = [];
  walkNamed(tree.rootNode, (node) => {
    if (node.type !== 'call_expression') return;
    if (node.childForFieldName?.('function')?.text !== 'require') return;
    const [argument] = node.childForFieldName?.('arguments')?.namedChildren ?? [];
    const specifier = argument?.type === 'string' ? unquoted(argument.text) : null;
    // A `require` whose argument is a value rather than a literal names no
    // module here. It is not dropped: R2.5 records it as a mechanism site, and
    // counting it in both channels would report one dependency twice.
    if (specifier === null) return;
    requires.push({ specifier, line: node.startPosition.row + 1 });
  });
  return requires;
}

/** Every specifier one file states, as the language under measurement writes it. */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function importSpecifiersIn(language, tree, relativePath) {
  if (language === 'rust') {
    return collectRustUses(tree, relativePath).map((use) => ({ specifier: use.target, line: use.line }));
  }

  const specifiers = [];
  walkNamed(tree.rootNode, (node) => {
    const line = node.startPosition.row + 1;
    if (language === 'go' && node.type === 'import_spec') {
      const specifier = unquoted(node.childForFieldName?.('path')?.text);
      if (specifier !== null) specifiers.push({ specifier, line });
      return;
    }
    if (language === 'python') {
      if (node.type === 'import_from_statement') {
        const module = node.childForFieldName?.('module_name')?.text;
        if (module !== undefined) specifiers.push({ specifier: module, line });
        return;
      }
      if (node.type === 'import_statement') {
        for (const name of node.namedChildren) {
          if (name.type === 'dotted_name') specifiers.push({ specifier: name.text, line });
        }
        return;
      }
      return;
    }
    if (language === 'c_cpp' && node.type === 'preproc_include') {
      const path = node.childForFieldName?.('path');
      const spelling = unquoted(path?.text);
      if (spelling !== null) specifiers.push({ specifier: { path: spelling, quoted: true }, line });
      else if (path?.type === 'system_lib_string') {
        specifiers.push({ specifier: { path: path.text.slice(1, -1), quoted: false }, line });
      }
      return;
    }
    if (language === 'typescript' || language === 'javascript') {
      if (node.type === 'import_statement' || node.type === 'export_statement') {
        const specifier = unquoted(node.childForFieldName?.('source')?.text);
        if (specifier !== null) specifiers.push({ specifier, line });
      }
    }
  });

  if (language === 'javascript' || language === 'typescript') {
    specifiers.push(...literalRequiresOf(tree, relativePath).map((row) => ({ specifier: row.specifier, line: row.line })));
  }
  return specifiers;
}

/**
 * The query set each target language's dependency extractor reads its grammar with.
 *
 * One frozen row per language, so `measureDependencies` holds no branch on the
 * language and adding a seventh language is adding a row rather than editing a
 * function. Each row states which node types carry an import and how a specifier
 * becomes a package, and the two are the same for all six only in that they are
 * read here.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
export const EDGE_QUERIES_BY_LANGUAGE = Object.freeze({
  rust: Object.freeze({ importNodeTypes: Object.freeze(['use_declaration']), resolve: resolveRustSpecifier }),
  typescript: Object.freeze({ importNodeTypes: Object.freeze(['import_statement', 'export_statement']), resolve: resolveRelativeSpecifier }),
  javascript: Object.freeze({ importNodeTypes: Object.freeze(['import_statement', 'export_statement', 'call_expression']), resolve: resolveRelativeSpecifier }),
  go: Object.freeze({ importNodeTypes: Object.freeze(['import_spec']), resolve: resolveGoSpecifier }),
  python: Object.freeze({ importNodeTypes: Object.freeze(['import_statement', 'import_from_statement']), resolve: resolvePythonSpecifier }),
  c_cpp: Object.freeze({ importNodeTypes: Object.freeze(['preproc_include']), resolve: resolveIncludeSpecifier }),
});

/**
 * Everything a resolution needs that is a fact about the tree rather than a file.
 *
 * Built once per measurement, so a resolver is a pure function of a specifier
 * and this context and cannot read the tree behind the measurement's back.
 *
 * The population here is the whole in-scope tree and not the files the syntax
 * layer reads: a Go import path is written against the module `go.mod` declares
 * and a C/C++ include is looked for along the path `CMakeLists.txt` declares,
 * and neither manifest is a source file any grammar carries. A context built
 * from the syntax population would answer "no module path" and "no include
 * path" for every tree, which is a fact about the reader and not about the tree.
 */
// [::TICKET::] P24-3, P24-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-3|P24-6) --for-spec --no-implementation-order`.
function resolutionContextOf(root, excludedPaths, configuration = null) {
  const excluded = new Set(excludedPaths);
  const inScopePaths = listArtefacts(root)
    .filter((artefact) => artefact.readStatus === 'readable' && !artefact.exclusion && !excluded.has(artefact.path))
    .map((artefact) => artefact.path);

  const recorded = recordedIncludeDirectories(root, configuration);

  return {
    root,
    // The manifest is the fallback, not the preference: a subject that records
    // how it is compiled is read under those flags, and one that does not is
    // read under the path its build file declares. Running both together would
    // resolve an include the real build never composed.
    includeDirectories: recorded.all.length > 0 ? recorded.all : declaredIncludeDirectories(root, inScopePaths),
    includeDirectoriesByFile: recorded.byFile,
    goModulePath: declaredGoModulePath(root, inScopePaths),
    pythonModules: pythonModuleIndex(inScopePaths),
  };
}

/**
 * The include search paths the build database records, per translation unit.
 *
 * A recorded path is relative to the working directory its own translation unit
 * was compiled from, so it is resolved against that directory rather than
 * against the process's. The paths are returned root-relative because that is
 * the form the package graph is keyed in.
 *
 * @param {string} root - the subject root
 * @param {object|null} configuration - a discovery record from `discoverBuildDatabase`
 * @returns {{all: ReadonlyArray<string>, byFile: object}} the recorded paths
 */
// [::TICKET::] P24-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-6 --for-spec --no-implementation-order`.
function recordedIncludeDirectories(root, configuration) {
  if (configuration === null || reportDatabaseLimitation({ discovery: configuration }) !== null) {
    return { all: [], byFile: {} };
  }

  const byFile = {};
  const all = new Set();
  for (const unit of readTranslationUnits(configuration)) {
    const directories = unit.includePaths
      .map((includePath) => {
        const absolute = includePath.startsWith('/') ? includePath : join(unit.workingDirectory, includePath);
        return absolute.startsWith(root) ? absolute.slice(root.length + 1) : null;
      })
      .filter((directory) => directory !== null);
    byFile[unit.file] = directories;
    for (const directory of directories) all.add(directory);
  }
  return { all: [...all].sort(compareText), byFile };
}

/**
 * Every dependency one file states, and how many of its specifiers did not resolve.
 *
 * A specifier that names no member of this tree is counted rather than dropped:
 * the count travels into the report's limitations, so an absent edge reads as a
 * gap in the measurement instead of as an absence of coupling.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
export function collectDependencyEdges(language, tree, relativePath, { context }) {
  const queries = EDGE_QUERIES_BY_LANGUAGE[language];
  if (queries === undefined) {
    throw new Error(`${language} declares no edge query set, so no dependency can be read from ${relativePath}`);
  }

  const records = [];
  let unresolved = 0;
  for (const { specifier, line } of importSpecifiersIn(language, tree, relativePath)) {
    // A translation unit's recorded include paths are its own: two units in one
    // tree can be compiled with different flags, and reading one unit under
    // another's would attribute one build's composition to the other.
    const includeDirectories = context.includeDirectoriesByFile?.[relativePath] ?? context.includeDirectories;
    const target = queries.resolve(specifier, { ...context, language, file: relativePath, includeDirectories });
    if (target === null) {
      unresolved += 1;
      continue;
    }
    records.push({
      from: packageOf(relativePath),
      to: target,
      language,
      file: relativePath,
      line,
      spelling: typeof specifier === 'string' ? specifier : specifier.path,
    });
  }
  return { records, unresolved };
}

/**
 * Whether this instrument reads dependencies written in a language.
 *
 * The answer is read from the declaration rather than from a list written here,
 * so a language added to `TARGET_LANGUAGES` before its query row is written is
 * skipped and recorded, and a row cannot exist without also widening this
 * answer. Exported because the skip it guards is an invariant a test must be
 * able to assert: the six never carry it and a language outside them always
 * does, and a guard no test can reach cannot be asserted to persist.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
export function hasEdgeExtractor(language) {
  return LANGUAGES_WITH_EXTRACTORS.E5.includes(language);
}

/**
 * The row a file leaves behind when this instrument has no query set for its language.
 *
 * The skip is recorded rather than silent, which is why the report can say a
 * language was not reached instead of printing a graph that quietly omits it.
 * It fires for a language outside the six and never for one inside them: a
 * target language whose query set went missing is a different fact, and
 * recording it as "no extractor for this language" would hide it.
 *
 * Exported for the same reason `hasEdgeExtractor` is: the invariant is about
 * the row, and a row no test can produce is a claim nobody checks.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
export function recordSkippedLanguage({ file, language }) {
  return recordAttempt({
    target: file,
    configuration: 'syntax-only',
    tool: `tree-sitter-${language}`,
    outcome: {
      phase: 'parse',
      status: 'skipped',
      extractedCount: 0,
      reason: NO_EDGE_EXTRACTOR_REASON,
    },
  });
}

/**
 * How many mechanisms stand between this graph and the running program, per language.
 *
 * The count is stated per language rather than as one total because a tree can
 * hold more than one, and a reader who is told "twenty mechanisms" cannot say
 * which of the graphs below is the one carrying them. This is the reason R2.5
 * runs before R2: the caveat has to exist when the graph is read.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function dynamicMechanismClause(surface) {
  if (!Array.isArray(surface?.mechanisms)) return '';

  const counted = new Map();
  for (const site of surface.mechanisms) {
    const language = site.language ?? 'unspecified';
    counted.set(language, (counted.get(language) ?? 0) + 1);
  }
  if (counted.size === 0) {
    return ' This run enumerated no dynamic mechanism at R2.5, which is a fact about this subject '
      + 'and not a promise that none is there.';
  }

  const perLanguage = [...counted.entries()]
    .sort((left, right) => compareText(left[0], right[0]))
    .map(([language, count]) => `${language}: ${count}`)
    .join(', ');
  return ` This run enumerated ${surface.mechanisms.length} dynamic mechanism(s) at R2.5 — by language, ${perLanguage}; `
    + 'each one is a place where the graph below and the running program can disagree.';
}

/**
 * R2 — the dependency measurement.
 *
 * @param {{root: string, excludedPaths?: string[], grammar?: object|null, surface?: object|null}} params
 */
export function measureDependencies({ root, excludedPaths = [], grammar, surface = null, configuration = null } = {}) {
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
  const coverage = emptyCoverage();
  const attempts = [];
  const limitations = [];
  const records = [];
  const declaredModules = [];
  const unresolvedByFile = [];

  const files = measuredFiles(root, excludedPaths);
  coverage.files_discovered = files.length;
  const context = resolutionContextOf(root, excludedPaths, configuration);

  for (const file of files) {
    const language = syntaxLanguageOf(file);
    if (!hasEdgeExtractor(language)) {
      attempts.push(recordSkippedLanguage({ file, language }));
      continue;
    }

    const parsed = parseSourceFile(root, file, { grammar });
    if (!parsed.ok) {
      attempts.push(recordAttempt({
        target: file,
        configuration: 'syntax-only',
        tool: 'tree-sitter-rust',
        outcome: {
          phase: 'parse',
          status: 'failed',
          diagnostics: [{ severity: 'error', message: parsed.message }],
          extractedCount: 0,
          reason: parsed.reason,
        },
      }));
      continue;
    }

    coverage.files_parsed += 1;
    if (parsed.errorNodes) coverage.files_with_error_nodes += 1;

    // A specifier that names no member of this tree is a gap in the graph, not
    // an absent dependency. Counting it is what keeps the edge list from reading
    // as the whole of the coupling the source states.
    const { records: fileRecords, unresolved } = collectDependencyEdges(language, parsed.tree, file, { context });
    records.push(...fileRecords);
    if (unresolved > 0) unresolvedByFile.push({ file, count: unresolved });

    for (const module of collectModules(language, parsed.tree, file)) {
      declaredModules.push({ ...module, language, from: packageOf(file) });
    }

    attempts.push(recordAttempt({
      target: file,
      configuration: 'syntax-only',
      tool: `tree-sitter-${language}`,
      outcome: {
        phase: 'parse',
        // A grammar that had to recover could not read the file whole, which is a
        // different fact from a file it read and found nothing in. The ledger
        // counts the two apart, and a single ledger may not hold two rules for
        // one event, so this follows structure.mjs's C003 rule.
        status: parsed.errorNodes ? 'failed' : 'success',
        diagnostics: parsed.errorNodes ? [syntaxRecoveryDiagnostic(parsed.tree)] : [],
        extractedCount: fileRecords.length,
        reason: parsed.errorNodes ? 'grammar_recovered' : null,
      },
    }));
  }

  const edges = edgesFrom(records);
  const packages = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))].sort(compareText);

  const manifests = manifestsInScope(root, excludedPaths);
  coverage.configs_enumerated = manifests.length;
  const external = manifests.map((manifest) => externalDependenciesIn(root, manifest));
  coverage.configs_analyzed = external.filter((entry) => entry.reason === null).length;
  for (const entry of external) {
    if (entry.reason === null) continue;
    limitations.push({
      code: 'MANIFEST_UNREADABLE',
      scope: entry.manifest,
      effect: 'external dependencies could not be inventoried from this manifest, so an empty external list for it means it was not read rather than that none are declared',
    });
  }

  if (unresolvedByFile.length > 0) {
    const total = unresolvedByFile.reduce((sum, entry) => sum + entry.count, 0);
    const first = unresolvedByFile.slice(0, 10).map((entry) => `${entry.file} (${entry.count})`);
    limitations.push({
      code: 'IMPORT_NOT_RESOLVED',
      scope: unresolvedByFile.slice(0, 10).map((entry) => entry.file).join(', ')
        + (unresolvedByFile.length > 10 ? `, and ${unresolvedByFile.length - 10} more file(s)` : ''),
      effect: `${total} use declaration(s) name a module this walk could not resolve to a source member `
        + `— in ${first.join(', ')}${unresolvedByFile.length > 10 ? ', and more' : ''}. The graph below therefore `
        + 'holds fewer edges than the source states, and an absent edge here is a gap in the measurement '
        + 'rather than an absence of coupling',
    });
  }

  const caveat = `${RUNTIME_BINDING_CAVEAT}${dynamicMechanismClause(surface)}`;

  return assertAdapterResult({
    analysis_mode: ANALYSIS_MODES[0],
    coverage: { ...coverage, files_semantically_resolved: 0 },
    limitations,
    coupling_claim: COUPLING_CLAIM,
    represents_runtime_binding: false,
    runtime_binding_caveat: caveat,
    edges,
    packages,
    cycles: findPackageCycles(edges, packages),
    // The partition material. Cohesion is measured over the file-level records
    // and density over the package pairs those records collapsed into, so that
    // internal coupling survives a collapse that deliberately drops self-pairs.
    cohesion: measureCohesion({ packages, edges: records }),
    density: measureDependencyDensity({ packages, edges }),
    // R2 runs before R3, so the call sites that name a crossing's target do not
    // exist yet in this run. The argument is named rather than defaulted so that
    // the not-measured rows are visibly this run's answer and not a value
    // somebody forgot to pass.
    boundaryCrossings: countBoundaryCrossings({ packages, edges, callSites: NOT_MEASURED }),
    declaredModules: declaredModules
      .sort((left, right) => compareText(`${left.file}:${left.line}`, `${right.file}:${right.line}`)),
    external,
    attempts,
  });
}

/** The heading and the standing caveat the rest of the report is read under. */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function renderHeaderSection(dependencies) {
  return [
    '# R2 — the dependency hypothesis',
    '',
    `Analysis mode: \`${dependencies.analysis_mode}\`. The coupling claim is \`${dependencies.coupling_claim}\`,`,
    `and this graph represents runtime binding: \`${dependencies.represents_runtime_binding}\`.`,
    '',
    `> ${dependencies.runtime_binding_caveat}`,
  ];
}

/** The edges themselves, with the location that first produced each one. */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function renderMeasuredEdgesSection(dependencies) {
  return [
    '## Measured edges',
    '',
    '| From | To | Kind | Imports | First location |',
    '|---|---|---|---|---|',
    ...dependencies.edges.map(
      (edge) => `| \`${edge.from}\` | \`${edge.to}\` | ${edge.kind} | ${edge.count} | `
        + `${edge.locations[0].file}:${edge.locations[0].line} |`,
    ),
  ];
}

/** The strongly connected components, stated so that no component reads as a path. */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function renderCyclesSection(dependencies) {
  const body = dependencies.cycles.length === 0
    ? 'No cycle was found among the packages this import graph reaches. That is a fact about this'
      + ' graph and not a promise about the program: a cycle that runs through a dynamic mechanism'
      + ' is invisible here.'
    : 'Each entry is a set of packages that can all reach one another. The order is alphabetical'
      + ' and is **not** a path: nothing here claims an edge runs from each package to the next.\n\n'
      + renderCappedList(dependencies.cycles, (cycle) => (cycle.length === 1
        ? `- \`${cycle[0]}\` imports itself`
        : `- ${cycle.length} mutually reachable: ${cycle.map((name) => `\`${name}\``).join(', ')}`)).join('\n');
  return ['## Cycles', '', body];
}

/** What each build manifest declares, and which manifest could not be read. */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function renderExternalDependenciesSection(dependencies) {
  return [
    '## External dependencies',
    '',
    ...dependencies.external.flatMap((entry) => [
      `### \`${entry.manifest}\``,
      '',
      entry.reason === null
        ? (entry.dependencies.length === 0
          ? '_none declared_'
          : entry.dependencies.map((dependency) => `- \`${dependency.name}\` — ${dependency.requirement}`).join('\n'))
        : `_not read: ${entry.reason}_`,
      '',
    ]),
  ];
}

/** Every way this measurement is not the whole of the coupling the source states. */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function renderLimitationsSection(dependencies) {
  return [
    '## Limitations',
    '',
    ...renderCappedList(
      dependencies.limitations,
      (limitation) => `- \`${limitation.code}\` over \`${limitation.scope}\` — ${limitation.effect}`,
    ),
  ];
}

/** The first `file:line` the graph holds for a package, so a reader can open it. */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function evidenceFor(packageName, edges) {
  const leaving = edges.find((edge) => edge.from === packageName && edge.locations.length > 0);
  const arriving = edges.find((edge) => edge.to === packageName && edge.locations.length > 0);
  const edge = leaving ?? arriving;
  if (edge === undefined) return 'no location — no edge reaches this package';
  return `${edge.locations[0].file}:${edge.locations[0].line}`;
}

/** The directory the coupling leaves most often, which is where a reader starts. */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function widestBoundary(rows) {
  return [...rows].sort((left, right) => (
    (right.externalRatio ?? 0) - (left.externalRatio ?? 0) || compareText(left.package, right.package)
  ))[0];
}

/** The cohesion counts, with the ratio stated beside the counts rather than instead of them. */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function renderCohesionTable(rows) {
  return [
    '| package | member files | internal | external | incident | external ratio |',
    '|---|---|---|---|---|---|',
    ...rows.map((row) => `| \`${row.package}\` | `
      + `${row.memberFiles.map((file) => `\`${file}\``).join(', ') || '_none measured_'} | `
      + `${row.internalCoupling} | ${row.externalCoupling} | ${row.incidentEdges} | `
      + `${row.externalRatio === NOT_MEASURED ? '_undefined — no incident edge_' : row.externalRatio.toFixed(2)} |`),
  ];
}

/** The cohesion counts and the directory that reads most sharply as a boundary. */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function renderCohesionSection(dependencies) {
  const { rows } = dependencies.cohesion;
  if (rows.length === 0) {
    return [
      '### Cohesion, by candidate boundary',
      '',
      'No package was measured, so no boundary has cohesion to read. That is a fact about this graph',
      'and not a clean result: R2 reaches a package only through an edge that leaves or enters it.',
    ];
  }

  const widest = widestBoundary(rows);
  return [
    '### Cohesion, by candidate boundary',
    '',
    'An edge whose two ends are the same directory is internal coupling; an edge that leaves or enters',
    'the directory is external coupling, and it is external for both of its ends.',
    '',
    ...renderCohesionTable(rows),
    '',
    `The directory whose coupling leaves it most often is \`${widest.package}\`: `
      + `${widest.externalCoupling} of its ${widest.incidentEdges} incident edge(s) leave it or arrive from outside, `
      + `so it reads as a boundary. The coupling was read from `
      + `${widest.memberFiles.map((file) => `\`${file}\``).join(', ') || 'no file it owns'}, and the evidence is `
      + `recorded at ${evidenceFor(widest.package, dependencies.edges)}.`,
    '',
    '**Why this matters.** Because the terminal state is a per-directory re-instantiation of the four',
    'layers, a wrong boundary does not produce one wrong file — it produces a whole wrong structure, in',
    'every directory, at every level. The counts above are what the decision has to be made from, and',
    'they are static: a directory that looks cohesive because the syntax layer cannot see the macro',
    'that crosses it will read as cohesive here until the execution surface is measured against it.',
  ];
}

/** The density ratio, with its numerator, its denominator and its population named. */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function renderDensitySection(dependencies) {
  const measured = dependencies.density;
  const population = measured.population;
  const names = population.packages.map((name) => `\`${name}\``).join(', ') || '_empty_';
  return [
    '### Dependency density',
    '',
    `${measured.measuredEdges} measured edge(s) over ${measured.possibleOrderedPairs} possible ordered pair(s) `
      + `of the ${population.packages.length} package(s) measured — density ${measured.density.toFixed(3)}. `
      + `The population is ${names}${population.measured ? '' : ', and it was not measured'}.`,
    '',
    'A density of one means every ordered pair of packages carries at least one import; a density of zero',
    'means none does. Neither is a verdict: a graph can be dense and correctly partitioned, or sparse and',
    'wrongly partitioned, and this number cannot tell the two apart.',
  ];
}

/** The call sites that cross each boundary, or the reason there are none to count. */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function renderCrossingsSection(dependencies) {
  const crossings = dependencies.boundaryCrossings;
  if (crossings.length === 0) {
    return [
      '### Boundary crossings',
      '',
      'No edge crosses a package boundary in this graph, so there is no crossing to count.',
    ];
  }

  // Every crossing is listed whichever way the count came out: which direction
  // an edge runs is material to the boundary decision, and a crossing dropped
  // for want of a call count would read as an edge that is not there.
  const table = [
    '| from | to | call sites | measured |',
    '|---|---|---|---|',
    ...crossings.map((row) => `| \`${row.from}\` | \`${row.to}\` | `
      + `${row.measured ? row.callSiteCount : '_not measured_'} | ${row.measured ? 'yes' : 'no'} |`),
  ];

  const head = [
    '### Boundary crossings',
    '',
    'Each row is one directed crossing. The count is the number of call sites in the source package that',
    'name the target of that crossing. A count of zero says the syntax layer looked and saw no call; it is',
    'not the same fact as a crossing that was not measured.',
    '',
  ];

  if (crossings.some((row) => row.measured)) return [...head, ...table];

  return [...head,
    ...table,
    '',
    `No crossing carries a call count in this run. ${crossings[0].reason}`,
    '',
    'The counts are static where they exist at all: the execution surface beside this report names the',
    'mechanisms a call can hide behind, and each one is a place where this table and the running program',
    'can disagree.',
  ];
}

/** The decision this material exists to serve, stated rather than answered. */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function renderPartitionQuestion(dependencies) {
  const { rows, unresolvedEdges } = dependencies.cohesion;
  const unresolved = unresolvedEdges.length === 0
    ? ''
    : ` ${unresolvedEdges.length} edge(s) name a package outside the measured set and are recorded in `
      + '`DEPENDENCIES.json` rather than attributed to a package that does not exist.';
  return [
    '### The question this material asks',
    '',
    `Decide whether each directory above is a boundary the four-layer structure wants to keep, or a line `
      + `drawn through coupling that belongs together — and where a crossing is real, decide whether it is an `
      + `intended layering or an accident of history. ${rows.length} package(s) are in front of you; nothing `
      + `here answers the question, and nothing here ranks them for you.`,
    '',
    `What remains unresolved is the coupling the syntax layer cannot follow: the call counts are static, so `
      + `a call behind a trait object, a macro or a registry lookup leaves no trace. That gap is R2.5's and is `
      + `recorded in \`EXECUTION-SURFACE.json\` beside this report.${unresolved}`,
  ];
}

/** The partition material: the ground the terminal structure stands on. */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function renderPartitionMaterialSection(dependencies) {
  return [
    '## The partition material',
    '',
    'The three quantities below are counts over a named population, not a score. There is no `eligible`',
    'field and no verdict of any kind, for the same reason the capability profile carries none: a number',
    'that looked objective while encoding a threshold nobody chose would decide the boundary by accident.',
    '',
    ...renderCohesionSection(dependencies),
    '',
    ...renderDensitySection(dependencies),
    '',
    ...renderCrossingsSection(dependencies),
    '',
    ...renderPartitionQuestion(dependencies),
  ];
}

/** The dependency report, as Markdown for a reader rather than JSON for a machine. */
export function renderDependencyReport(dependencies) {
  const lines = [
    ...renderHeaderSection(dependencies),
    SECTION_SEPARATOR,
    ...renderMeasuredEdgesSection(dependencies),
    SECTION_SEPARATOR,
    ...renderPartitionMaterialSection(dependencies),
    SECTION_SEPARATOR,
    ...renderCyclesSection(dependencies),
    SECTION_SEPARATOR,
    ...renderExternalDependenciesSection(dependencies),
    ...renderLimitationsSection(dependencies),
  ];
  return `${lines.join('\n')}\n`;
}
