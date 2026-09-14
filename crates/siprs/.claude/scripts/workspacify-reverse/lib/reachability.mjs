// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
/**
 * E12 — dead and unreachable code, kept apart from what this reader cannot see.
 *
 * The partition has three states and not two, and that is the whole point of
 * the module. "This is not reached" and "this reader cannot see whether it is
 * reached" are different facts; a boolean would fuse them, and the fusion
 * reports a call graph's blind spots as dead code — the F12 failure, where a
 * reader that could not look is recorded as a reader that looked and found
 * nothing.
 *
 * The population is what the syntax layer enumerated: every declaration the
 * structure measurement holds, plus one region per file the grammar could not
 * read whole. Reachability is decided from material the same run measured — the
 * observed inbound import edges and the package each file belongs to. No
 * entrypoint convention is invented here: when the caller declares no
 * entrypoint, the reading says so and reports the reason it did not use, rather
 * than guessing at a build root the instrument never observed.
 *
 * The counts are asserted to partition the population inside this module, not
 * only in a test. A region that could leave the population by being
 * unanalysable would make the partition the one thing it must not be — a sum
 * that silently drops what it could not classify.
 */
import { renderCappedList } from './analysis-tech.mjs';

/** The stage this item answers, so a consumer does not re-spell it. */
export const REACHABILITY_STAGE = 'r5';

/** A region with an observed path to it from a root the reading can see. */
export const REACHABLE = 'reachable';

/** A region the reading positively found no path to. */
export const UNREACHABLE = 'unreachable';

/** A region this reader cannot decide: the syntax layer could not read it whole. */
export const NOT_ANALYSABLE = 'not-analysable';

/** The three states, in the order the counts are reported. */
export const REACHABILITY_STATES = Object.freeze([REACHABLE, UNREACHABLE, NOT_ANALYSABLE]);

/** An observed inbound import edge points at this region's package. */
export const REACHABILITY_REASON_INCOMING_REFERENCE = 'incoming-reference';

/** No observed import edge points at this region's package. */
export const REACHABILITY_REASON_NO_INCOMING_REFERENCE = 'no-incoming-reference';

/** The package is outside the walk from the declared entrypoints. */
export const REACHABILITY_REASON_NO_ENTRYPOINT_PATH = 'no-entrypoint-path';

/** The grammar could not read the file whole, so nothing about it is decided. */
export const REACHABILITY_REASON_SYNTAX_LAYER_CANNOT_READ = 'syntax-layer-cannot-read';

/** C/C++: the declaration sits inside a preprocessor branch. */
export const REACHABILITY_REASON_PREPROCESSOR_BOUNDARY = 'preprocessor-boundary';

/** A language that gates a declaration with an attribute or a build comment. */
export const REACHABILITY_REASON_CONDITIONAL_COMPILATION_BOUNDARY = 'conditional-compilation-boundary';

/** The reason no entrypoint was used, recorded rather than left implied. */
export const REACHABILITY_REASON_NO_ENTRYPOINT_DECLARED = 'no-entrypoint-declared';

/** The reasons a region carries, in the order the module declares them. */
export const REACHABILITY_REASONS = Object.freeze([
  REACHABILITY_REASON_INCOMING_REFERENCE,
  REACHABILITY_REASON_NO_INCOMING_REFERENCE,
  REACHABILITY_REASON_NO_ENTRYPOINT_PATH,
  REACHABILITY_REASON_SYNTAX_LAYER_CANNOT_READ,
  REACHABILITY_REASON_PREPROCESSOR_BOUNDARY,
  REACHABILITY_REASON_CONDITIONAL_COMPILATION_BOUNDARY,
  REACHABILITY_REASON_NO_ENTRYPOINT_DECLARED,
]);

/**
 * What a reachability measurement is, and what it is not.
 *
 * Constant rather than per-run: a caveat that varied with the data would invite
 * reading it as a finding.
 */
export const REACHABILITY_CAVEAT =
  'This reading is over declarations the syntax layer enumerated and the import edges it observed, and '
  + 'nothing else. It resolves no names, follows no runtime dispatch and models no build configuration, so '
  + 'a region reported unreachable is one no observed edge reaches — which is not a claim that the region '
  + 'is absent from the program. A region this reader could not examine is not-analysable and never '
  + 'unreachable, and the three counts are asserted to sum to the population.';

/** The languages whose conditional compilation is the preprocessor, by name. */
const PREPROCESSOR_LANGUAGES = new Set(['c_cpp']);

/** How a gated declaration's reason reads, per language family. */
const GATED_REASON_BY_LANGUAGE = Object.freeze({
  c_cpp: REACHABILITY_REASON_PREPROCESSOR_BOUNDARY,
});

/** What a gated declaration's detail says, per language family. */
const GATED_DETAIL_BY_LANGUAGE = Object.freeze({
  c_cpp: 'the declaration sits inside a preprocessor branch, so whether it exists is decided before this '
    + 'syntax layer ever sees the text, and the flags of each translation unit decide the answer',
});

/** The generic detail for a language that gates with an attribute or a build comment. */
const GATED_DETAIL_DEFAULT =
  'the declaration sits under a conditional-compilation marker, so whether it exists is a build-time '
  + 'question this syntax layer cannot answer';

/** The structure fields a region is read from, and what each one's regions are called. */
const REGION_SOURCES = Object.freeze([
  Object.freeze({ field: 'modules', regionKind: 'module' }),
  Object.freeze({ field: 'publicItems', regionKind: 'declaration' }),
  Object.freeze({ field: 'types', regionKind: 'type' }),
  Object.freeze({ field: 'errorTypes', regionKind: 'error-type' }),
]);

/** Refuse a measurement this reading cannot be taken from. */
function requireList(name, value) {
  if (!Array.isArray(value)) {
    throw new Error(
      `measureReachability needs the ${name} the structure measurement produced; it was given `
      + `${value === null ? 'none' : typeof value}. A reachability reading over an unmeasured population `
      + 'would report the unmeasured as unreachable',
    );
  }
  return value;
}

/** The package each file belongs to, as the structure measurement grouped them. */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function packageByFile(packages) {
  const byFile = new Map();
  for (const entry of packages) {
    for (const file of entry.files) byFile.set(file, entry.directory);
  }
  return byFile;
}

/**
 * The packages an observed inbound import edge points at.
 *
 * An edge with no location is a declaration the instrument observed nowhere,
 * which is not a reference: counting it would report an unreferenced package as
 * referenced. This is the same rule R5's dead-code reading already applies.
 */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function referencedPackages(edges) {
  const referenced = new Set();
  for (const edge of edges) {
    if ((edge.locations ?? []).length === 0) continue;
    referenced.add(edge.to);
  }
  return referenced;
}

/** The packages a walk from the declared entrypoints reaches, following observed edges. */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function packagesReachedFrom(entrypointPackages, edges) {
  const outgoing = new Map();
  for (const edge of edges) {
    if ((edge.locations ?? []).length === 0) continue;
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge.to);
  }

  const reached = new Set();
  const pending = [...entrypointPackages];
  while (pending.length > 0) {
    const current = pending.pop();
    if (reached.has(current)) continue;
    reached.add(current);
    for (const next of outgoing.get(current) ?? []) pending.push(next);
  }
  return reached;
}

/** The entrypoints as a list, refusing a shape this reading cannot use. */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function normaliseEntrypoints(entrypoints) {
  if (!Array.isArray(entrypoints)) {
    throw new Error(
      `entrypoints must be a list of {file, reason} entries; it was given ${typeof entrypoints}. A caller `
      + 'that named no root is expressed by the empty list, not by an absent value',
    );
  }
  return entrypoints.map((entry) => {
    if (typeof entry?.file !== 'string' || entry.file.length === 0) {
      throw new Error(
        `an entrypoint must name the file it declares as a root; this one carried ${JSON.stringify(entry)}. `
        + 'An unnamed root cannot be walked from and would silently contribute nothing',
      );
    }
    return Object.freeze({ file: entry.file, reason: entry.reason ?? null });
  });
}

/** One region of a file the grammar could not read whole. */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function unreadableFileRegion(file) {
  return Object.freeze({
    symbol: null,
    regionKind: 'file',
    file,
    line: 1,
    state: NOT_ANALYSABLE,
    reason: REACHABILITY_REASON_SYNTAX_LAYER_CANNOT_READ,
    detail: 'the grammar could not read this file whole, so its declarations were never enumerated and '
      + 'nothing about them is decided here',
  });
}

/** The declarations the structure measurement enumerated, one region each. */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function enumeratedRegions(structure) {
  const regions = [];
  for (const { field, regionKind } of REGION_SOURCES) {
    for (const item of requireList(field, structure[field])) {
      regions.push({
        symbol: item.symbol ?? null,
        regionKind,
        file: item.file,
        line: item.line,
        cfgGated: item.cfgGated === true,
      });
    }
  }
  return regions;
}

/** The state one enumerated region carries, and the reason it carries it. */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function decideRegion(region, { language, packageOfFile, referenced, reachedFromEntrypoints, hasEntrypoints }) {
  if (region.cfgGated) {
    return {
      state: NOT_ANALYSABLE,
      reason: GATED_REASON_BY_LANGUAGE[language] ?? REACHABILITY_REASON_CONDITIONAL_COMPILATION_BOUNDARY,
      detail: GATED_DETAIL_BY_LANGUAGE[language] ?? GATED_DETAIL_DEFAULT,
    };
  }

  const packageName = packageOfFile.get(region.file);
  if (packageName === undefined) {
    throw new Error(
      `${region.file} holds a declaration the structure measurement enumerated and no package it belongs `
      + 'to. A region with no package cannot be walked to or from, and defaulting its state would decide '
      + 'reachability from an absence',
    );
  }

  if (hasEntrypoints) {
    return reachedFromEntrypoints.has(packageName)
      ? { state: REACHABLE, reason: REACHABILITY_REASON_INCOMING_REFERENCE, detail: null }
      : {
        state: UNREACHABLE,
        reason: REACHABILITY_REASON_NO_ENTRYPOINT_PATH,
        detail: `no path of observed import edges leads from a declared entrypoint to ${packageName}`,
      };
  }

  return referenced.has(packageName)
    ? { state: REACHABLE, reason: REACHABILITY_REASON_INCOMING_REFERENCE, detail: null }
    : {
      state: UNREACHABLE,
      reason: REACHABILITY_REASON_NO_INCOMING_REFERENCE,
      detail: `no observed import edge with a recorded location points at ${packageName}`,
    };
}

/** The counts, with the partition asserted before the value is handed back. */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function countsOf(regions) {
  const counts = { reachable: 0, unreachable: 0, notAnalysable: 0, population: regions.length };
  for (const region of regions) {
    if (region.state === REACHABLE) counts.reachable += 1;
    else if (region.state === UNREACHABLE) counts.unreachable += 1;
    else if (region.state === NOT_ANALYSABLE) counts.notAnalysable += 1;
    else throw new Error(`the region ${region.file}:${region.line} carries the state ${region.state}, which is outside the declared three`);
  }
  const sum = counts.reachable + counts.unreachable + counts.notAnalysable;
  if (sum !== counts.population) {
    throw new Error(
      `the three reachability states sum to ${sum} over a population of ${counts.population}. A region that `
      + 'leaves the population by being unanalysable is the one thing this reading may not do',
    );
  }
  return Object.freeze(counts);
}

/**
 * Measure the three-state reachability partition over one language's population.
 *
 * @param {object} params
 * @param {string} params.language - the language whose grammar read the population
 * @param {object} params.structure - the R1 measurement the declarations come from
 * @param {object} params.dependencies - the R2 measurement the import edges come from
 * @param {ReadonlyArray<{file: string, reason?: string}>} [params.entrypoints] - the roots the caller declares
 * @returns {object} the measurement, with the partition asserted before it is returned
 */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
export function measureReachability({ language, structure, dependencies, entrypoints = [] } = {}) {
  if (structure === null || typeof structure !== 'object') {
    throw new Error('measureReachability needs the R1 structure measurement to enumerate its population from; it was given none');
  }
  if (dependencies === null || typeof dependencies !== 'object') {
    throw new Error('measureReachability needs the R2 `dependencies` measurement to read its edges from; it was given none');
  }
  if (typeof language !== 'string' || language.length === 0) {
    throw new Error('measureReachability needs the language the population was read in; it was given none');
  }

  const packages = requireList('packages', structure.packages);
  const edges = requireList('edges', dependencies.edges);
  const declaredEntrypoints = normaliseEntrypoints(entrypoints);

  const packageOfFile = packageByFile(packages);
  const referenced = referencedPackages(edges);
  const hasEntrypoints = declaredEntrypoints.length > 0;
  // An entrypoint naming a file the structure measurement never enumerated is a
  // root this walk cannot start from. It is recorded rather than dropped: a walk
  // that silently started from one root of two would report the second root's
  // reach as unreachable.
  const resolvedEntrypoints = declaredEntrypoints.filter((entry) => packageOfFile.has(entry.file));
  const unresolvedEntrypoints = declaredEntrypoints.filter((entry) => !packageOfFile.has(entry.file));
  const reachedFromEntrypoints = new Set(
    packagesReachedFrom(resolvedEntrypoints.map((entry) => packageOfFile.get(entry.file)), edges),
  );

  const unreadable = structure.attempts
    .filter((attempt) => attempt?.status === 'failed')
    .map((attempt) => unreadableFileRegion(attempt.target))
    .sort((left, right) => (left.file < right.file ? -1 : 1));

  const regions = [
    ...unreadable,
    ...enumeratedRegions(structure).map((region) => {
      const { state, reason, detail } = decideRegion(region, {
        language,
        packageOfFile,
        referenced,
        reachedFromEntrypoints,
        hasEntrypoints,
      });
      return Object.freeze({
        symbol: region.symbol,
        regionKind: region.regionKind,
        file: region.file,
        line: region.line,
        state,
        reason,
        detail,
      });
    }),
  ].sort((left, right) => (left.file === right.file
    ? left.line - right.line
    : (left.file < right.file ? -1 : 1)));

  const notes = [
    hasEntrypoints
      ? `the walk starts from ${resolvedEntrypoints.length} declared entrypoint(s): `
        + `${resolvedEntrypoints.map((entry) => entry.file).join(', ')}`
      : `no entrypoint was declared, so ${REACHABILITY_REASON_NO_ENTRYPOINT_PATH} was not used: a package `
        + 'is reported reachable when an observed import edge points at it, and unreachable when none does. '
        + 'Naming a root is what would let this reading tell an unimported package from an unreferenced one',
  ];
  if (unresolvedEntrypoints.length > 0) {
    notes.push(
      `${unresolvedEntrypoints.length} declared entrypoint(s) name a file this population does not hold, so `
      + `the walk did not start from them: ${unresolvedEntrypoints.map((entry) => entry.file).join(', ')}`,
    );
  }

  return Object.freeze({
    stage: REACHABILITY_STAGE,
    language,
    entrypoints: Object.freeze(declaredEntrypoints),
    regions: Object.freeze(regions),
    counts: countsOf(regions),
    notes: Object.freeze(notes),
    caveat: REACHABILITY_CAVEAT,
  });
}

/** The unreachable regions, in the shape R5's gap enumeration consumes. */
export function unreachableRegions(reachability) {
  return (reachability?.regions ?? []).filter((region) => region.state === UNREACHABLE);
}

/**
 * The measurement as the Markdown a human or an AI reads.
 *
 * The caveat is part of the report rather than a note beside it, because a
 * reader who has the counts and not the caveat has the wrong idea about what
 * they measure.
 */
export function renderReachability(measurement) {
  const counts = measurement.counts;
  const lines = [
    '## Reachability',
    '',
    `> ${REACHABILITY_CAVEAT}`,
    '',
    `**Language**: \`${measurement.language}\`. **Population**: ${counts.population}.`,
    '',
    '| State | Count |',
    '|---|---|',
    ...REACHABILITY_STATES.map((state) => {
      const value = state === REACHABLE ? counts.reachable : state === UNREACHABLE ? counts.unreachable : counts.notAnalysable;
      return `| \`${state}\` | ${value} |`;
    }),
    '',
  ];

  for (const note of measurement.notes) lines.push(`> ${note}`, '');

  lines.push('### Unreachable regions', '');
  const unreachable = unreachableRegions(measurement);
  if (unreachable.length === 0) {
    lines.push('No region in this population is unreachable by the reading above.', '');
  } else {
    lines.push('| Region | Location | Reason |', '|---|---|---|');
    lines.push(...renderCappedList(unreachable, (region) => (
      `| \`${region.symbol ?? '(file)'}\` | \`${region.file}:${region.line}\` | \`${region.reason}\` |`
    )));
    lines.push('');
  }

  const notAnalysable = measurement.regions.filter((region) => region.state === NOT_ANALYSABLE);
  lines.push('### Not analysable', '');
  if (notAnalysable.length === 0) {
    lines.push('Every region in this population was readable and decided.', '');
  } else {
    lines.push(
      'These regions are not decided, which is a different fact from being unreachable: the reader could',
      'not see whether they are reached.',
      '',
    );
    lines.push(...renderCappedList(notAnalysable, (region) => (
      `- \`${region.file}:${region.line}\`${region.symbol === null ? '' : ` (\`${region.symbol}\`)`} — \`${region.reason}\``
    )));
    lines.push('');
  }

  return lines.join('\n');
}
