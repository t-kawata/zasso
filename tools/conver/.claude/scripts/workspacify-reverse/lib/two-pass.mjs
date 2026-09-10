// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
/**
 * The 2-Pass Hybrid — vertical at the boundaries, horizontal inside (§7.7.1).
 *
 * A package's contract cannot be settled from that package alone: what `A`
 * promises depends on how `B` calls it. Sweeping one directory in isolation
 * therefore produces a diminished RFC that confirms whatever the code already
 * does, which is why the design runs one execution path first, fixes the
 * boundaries it crosses, and only then sweeps each package's interior.
 *
 * What makes the split real is not the order but **what each pass is given**.
 *
 *   - Pass 1 (vertical) is handed the measured crossings between packages.
 *     That is where a boundary is adjudicated.
 *   - Pass 2 (horizontal) is handed one package's own members and nothing else.
 *     The dependency graph is not a parameter of `buildHorizontalPass`, so the
 *     pass cannot reason about another package even by accident. Boundedness
 *     enforced by the shape of the input is a property; boundedness the
 *     implementation is asked to remember is a hope.
 *
 * The measurement bears the split out. R2 records imports at directory
 * granularity, so a package importing itself is not an edge: all 55 measured
 * edges cross a directory boundary and none is internal. A horizontal pass
 * consequently has no edge material to be local about, which is why its input is
 * the member set rather than an edge subset.
 */

import { compareText } from './holdout-ledger.mjs';
import { owningDirectoryOf } from './claim-ledger.mjs';

/** The two passes the design defines. */
export const TWO_PASS_SCOPE = Object.freeze({
  VERTICAL: 'vertical',
  HORIZONTAL: 'horizontal',
});

/**
 * The measured packages and the members the measurement placed in each.
 *
 * @param {{packages?: Array<{directory: string, files?: string[]}>}} structure - R1
 * @returns {Array<{directory: string, members: string[]}>}
 */
export function packagesOf(structure) {
  return (structure?.packages ?? [])
    .filter((entry) => Array.isArray(entry.files) && entry.files.length > 0)
    .map((entry) => ({ directory: entry.directory, members: [...entry.files].sort(compareText) }))
    .sort((left, right) => compareText(left.directory, right.directory));
}

/**
 * Pass 1 — the crossings, and only the crossings.
 *
 * `directories` narrows the walk to the vertical slice the run is following, so
 * a slice fixes the boundaries on its own execution path and leaves the rest for
 * another run. Omitting it walks the whole measured graph.
 *
 * @param {{packages?: Array<{directory: string}>, edges?: Array<object>, directories?: string[]|null}} params
 * @returns {{scope: string, packages: string[], edges: Array<object>}}
 */
export function buildVerticalPass({ packages, edges, directories = null } = {}) {
  const allowed = directories === null || directories === undefined ? null : new Set(directories);
  const crossings = (edges ?? []).filter((edge) => edge.from !== edge.to);
  const scoped = allowed === null
    ? crossings
    : crossings.filter((edge) => allowed.has(edge.from) || allowed.has(edge.to));

  return {
    scope: TWO_PASS_SCOPE.VERTICAL,
    packages: (packages ?? []).map((entry) => entry.directory).sort(compareText),
    edges: [...scoped].sort((left, right) => compareText(edgeKey(left), edgeKey(right))),
  };
}

/**
 * Pass 2 — one package's own members, and nothing else.
 *
 * The dependency graph is deliberately not a parameter: a horizontal pass that
 * cannot be handed another package's material cannot reason about one.
 *
 * @param {{packages?: Array<{directory: string, members?: string[]}>, packageName: string}} params
 * @returns {{scope: string, package: string, members: string[]}}
 */
export function buildHorizontalPass({ packages, packageName } = {}) {
  const entry = (packages ?? []).find((candidate) => candidate.directory === packageName);
  if (entry === undefined) {
    throw new Error(
      `${packageName} is not a package the measurement placed, so there is nothing to sweep — an empty scope `
      + 'would satisfy the locality predicate without having looked at anything',
    );
  }
  return {
    scope: TWO_PASS_SCOPE.HORIZONTAL,
    package: packageName,
    members: [...entry.members].sort(compareText),
  };
}

/**
 * The locality predicate Pass 2 exists to satisfy.
 *
 * @param {{scope?: string, package?: string, members?: string[]}} horizontal
 * @returns {object} the same scope, so a caller can assert and continue
 */
export function assertHorizontalScopeIsLocal(horizontal) {
  if (horizontal?.scope !== TWO_PASS_SCOPE.HORIZONTAL) {
    throw new Error(`a horizontal scope must declare scope="${TWO_PASS_SCOPE.HORIZONTAL}"`);
  }
  const foreign = (horizontal.members ?? [])
    .filter((member) => owningDirectoryOf(member) !== horizontal.package);
  if (foreign.length > 0) {
    throw new Error(
      `the horizontal pass over ${horizontal.package} was handed ${foreign.join(', ')}, `
      + 'which belongs to another package',
    );
  }
  return horizontal;
}

/**
 * Assert that the two passes account for the whole measurement, once each.
 *
 * Every measured member is swept by exactly one horizontal pass, every measured
 * crossing is held by the vertical pass, and no horizontal pass was handed an
 * edge — the last being the property that keeps the sweep bounded.
 *
 * @param {{vertical: object, horizontals: Array<object>, edges: Array<object>, population: string[]}} run
 * @returns {{members: number, crossings: number}}
 */
export function assertPassesPartitionMeasurement({ vertical, horizontals, edges, population }) {
  const swept = horizontals.flatMap((horizontal) => horizontal.members);
  const unique = new Set(swept);
  if (unique.size !== swept.length) {
    throw new Error('a member was swept by more than one horizontal pass, so the sweep is not a partition');
  }

  const expected = new Set(population);
  const missing = [...expected].filter((member) => !unique.has(member)).sort(compareText);
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} member(s) belong to no horizontal pass: ${sample(missing)}`,
    );
  }
  const extra = [...unique].filter((member) => !expected.has(member)).sort(compareText);
  if (extra.length > 0) {
    throw new Error(`${extra.length} member(s) were swept that the measurement never placed: ${sample(extra)}`);
  }

  const measuredCrossings = new Set(
    (edges ?? []).filter((edge) => edge.from !== edge.to).map(edgeKey),
  );
  const heldCrossings = new Set((vertical?.edges ?? []).map(edgeKey));
  if (heldCrossings.size !== measuredCrossings.size) {
    throw new Error(
      `the vertical pass holds ${heldCrossings.size} of the ${measuredCrossings.size} measured crossings`,
    );
  }

  for (const horizontal of horizontals) {
    if ('edges' in horizontal) {
      throw new Error(
        `the horizontal pass over ${horizontal.package} was handed edges, which is what would make it unbounded`,
      );
    }
  }

  return { members: unique.size, crossings: heldCrossings.size };
}

/**
 * Build a whole two-pass run from the measurements.
 *
 * @param {{structure?: object, dependencies?: object, slice?: {directories?: string[]}|null}} params
 * @returns {{mode: string, slice: object|null, population: string[], scopes: {vertical: object, horizontal: Array<object>}}}
 */
export function buildTwoPassRun({ structure, dependencies, slice = null } = {}) {
  const packages = requireMeasuredPackages(structure);
  const edges = requireMeasuredEdges(dependencies);
  const directories = slice?.directories ?? null;

  return {
    mode: 'two_pass',
    slice: slice ?? null,
    population: packages.flatMap((entry) => entry.members),
    scopes: {
      vertical: buildVerticalPass({ packages, edges, directories }),
      horizontal: packages.map((entry) => buildHorizontalPass({ packages, packageName: entry.directory })),
    },
  };
}

/**
 * Refuse a run with nothing to sweep.
 *
 * C003's precondition is that the run is in two-pass mode over a measurement
 * that exists. A run built from an absent measurement would report an empty
 * partition, which satisfies every predicate here without having looked at
 * anything — the failure mode that reads as a pass.
 */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function requireMeasuredPackages(structure) {
  const packages = packagesOf(structure);
  if (packages.length === 0) {
    throw new Error('a two-pass run consumes the R1 structure measurement and it placed no package');
  }
  return packages;
}

/** The measured crossings, which the run cannot be built without. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function requireMeasuredEdges(dependencies) {
  if (!Array.isArray(dependencies?.edges)) {
    throw new Error('a two-pass run consumes the R2 dependency measurement and it carries no edges array');
  }
  return dependencies.edges;
}

/** How one crossing is named, so two runs sort and compare the same way. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function edgeKey(edge) {
  return `${edge.from}->${edge.to}`;
}

/** The first few of a long list, with the remainder counted rather than dropped silently. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function sample(items) {
  const head = items.slice(0, 5).join(', ');
  return items.length <= 5 ? head : `${head} and ${items.length - 5} more`;
}
