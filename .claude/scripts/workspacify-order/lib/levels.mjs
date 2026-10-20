/**
 * Derive the implementation order from the edge records, and read one package out of it.
 *
 * The rule is the one stage one already proved and stage two already re-proved: a package
 * sits at level zero when it depends on nothing, and one level after its deepest provider
 * otherwise. This command re-derives it and then requires the result to equal the published
 * order, so the picture can never contradict the manifest it claims to show.
 *
 * The rule is deliberately not re-implemented as the authority here. The command reads the
 * published order as the authority and re-derivation as the check.
 */
import { basename, dirname, join, resolve, sep } from 'node:path';

import { holdsExplanation, holdsRfc, SEED_FILE_NAME } from './workspace.mjs';
import { readCompletedSessions, readPackageDistribution, readRootEduceGeneration, readRootSmoothGeneration } from './counters.mjs';
import { readSequenceVerdicts } from './verdicts.mjs';
import { WorkspacifyOrderError } from './errors.mjs';

/** The smallest gap between the longest path and the first field. */
export const MINIMUM_GAP = 1;

/**
 * The width of one grapheme cluster.
 *
 * Width is a property of the terminal, not of the code-point count: a CJK ideograph and an
 * emoji occupy two columns, a combining mark or a joiner occupies none, and a ZWJ sequence
 * is one glyph even though it is several code points. The segmenter supplies the clusters;
 * the ranges below supply the East Asian Wide and emoji widths.
 */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
/** Combining marks and format characters draw no column of their own. */
const ZERO_WIDTH_CHARACTER = /^[\p{Mn}\p{Me}\p{Cf}]$/u;
/** The ranges whose code points occupy two terminal columns: East Asian Wide/Fullwidth. */
const WIDE_RANGES = Object.freeze([
  [0x1100, 0x115f],
  [0x2329, 0x232a],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x16fe0, 0x16fff],
  [0x1b000, 0x1b2ff],
  [0x1f200, 0x1f2ff],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
  // Emoji-presentation dingbats below the CJK block; U+274C is the FAILED-SEQ glyph.
  [0x2705, 0x2705],
  [0x2714, 0x2714],
  [0x2716, 0x2716],
  [0x2728, 0x2728],
  [0x274c, 0x274c],
  [0x274e, 0x274e],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27b0, 0x27b0],
  [0x27bf, 0x27bf],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
]);

/** The width of one code point: two for a wide range, zero for a combining mark, one otherwise. */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
function codePointWidth(codePoint) {
  if (ZERO_WIDTH_CHARACTER.test(String.fromCodePoint(codePoint))) return 0;
  return WIDE_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end) ? 2 : 1;
}

/** The width of one grapheme cluster, including emoji sequences and combining marks. */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
function graphemeWidth(grapheme) {
  if (ZERO_WIDTH_CHARACTER.test(grapheme)) return 0;
  // A variation selector or a zero-width joiner presents the cluster as one emoji glyph.
  if (grapheme.includes('\u200d') || grapheme.includes('\ufe0f')) return 2;
  let width = 0;
  for (const character of grapheme) width += codePointWidth(character.codePointAt(0));
  return width;
}

/** The number of terminal columns a string occupies. */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
export function displayWidth(text) {
  let width = 0;
  for (const { segment } of graphemeSegmenter.segment(text)) width += graphemeWidth(segment);
  return width;
}

/** The two spaces, the critical marker or a space, and the space before the path. */
export const PREFIX_WIDTH = displayWidth('  * ');

/**
 * The column one gap after the longest rendered path.
 *
 * The column is exact, not a tab stop: a tab stop is a viewer setting, so rounding to one
 * would only align readers whose terminals agree with the renderer. One space after the
 * longest prefix is the smallest common column every line can reach.
 */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
export function markColumnFor(maxPathWidth) {
  return PREFIX_WIDTH + maxPathWidth + MINIMUM_GAP;
}

/** Provider-first levels: the rule computeImplementationOrder in stage one applies. */
export function deriveLevels({ packageIds, edges }) {
  const providersOf = new Map(packageIds.map((id) => [id, []]));
  for (const edge of edges) {
    providersOf.get(edge.from).push(edge.to);
  }

  const depthMemo = new Map();
  const depthOf = (id) => {
    if (depthMemo.has(id)) return depthMemo.get(id);
    depthMemo.set(id, 0);
    const providers = providersOf.get(id);
    const depth = providers.length === 0 ? 0 : Math.max(...providers.map(depthOf)) + 1;
    depthMemo.set(id, depth);
    return depth;
  };

  const byDepth = [];
  for (const id of packageIds) {
    const depth = depthOf(id);
    byDepth[depth] = byDepth[depth] ?? [];
    byDepth[depth].push(id);
  }
  return byDepth.map((level) => [...level].sort());
}

/** Refuse to draw a picture whose order differs from the one the manifests published. */
export function assertMatchesPublished({ derivedLevels, allocateManifest }) {
  const published = allocateManifest?.implementation_order;
  if (
    published === undefined ||
    published === null ||
    !Array.isArray(published.levels) ||
    !Array.isArray(published.serial)
  ) {
    throw new WorkspacifyOrderError(
      'the stage-two manifest carries no implementation_order, so the derived order has nothing to be checked against',
      { artefact: 'implementation_order' },
    );
  }
  if (JSON.stringify(derivedLevels) !== JSON.stringify(published.levels)) {
    throw new WorkspacifyOrderError(
      `the derived order disagrees with the published implementation_order at level ${firstDisagreeingLevel(derivedLevels, published.levels)}`,
      { artefact: 'implementation_order' },
    );
  }
}

// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function firstDisagreeingLevel(derivedLevels, publishedLevels) {
  const shared = Math.min(derivedLevels.length, publishedLevels.length);
  for (let index = 0; index < shared; index += 1) {
    if (JSON.stringify(derivedLevels[index]) !== JSON.stringify(publishedLevels[index])) return index;
  }
  return shared;
}

/**
 * The longest dependency chain, one package per level.
 *
 * It is the floor on the number of stages, so it is the one thing that cannot be
 * parallelised away. Every step is taken through a declared edge: walking to any package one
 * level up would draw a spine the manifests never asserted.
 */
export function findCriticalChain({ levels, edges }) {
  const levelOf = new Map();
  levels.forEach((level, index) => level.forEach((id) => levelOf.set(id, index)));
  const providersOf = new Map();
  for (const edge of edges) {
    if (!providersOf.has(edge.from)) providersOf.set(edge.from, []);
    providersOf.get(edge.from).push(edge.to);
  }

  const chain = [];
  let current = levels.at(-1)[0];
  while (current !== undefined) {
    chain.unshift(current);
    const level = levelOf.get(current);
    if (level === 0) break;
    current = (providersOf.get(current) ?? []).filter((id) => levelOf.get(id) === level - 1).sort()[0];
  }
  return chain;
}

/**
 * The one package a seed path names.
 *
 * The path must be a seed inside the workspace, and its directory must be a package path
 * exactly. A path that matches nothing, or matches only as a prefix, fails rather than
 * resolving to the nearest candidate.
 */
export function focusPackage({ root, seedPath, packages, baseDirectory = process.cwd() }) {
  const absolute = resolve(baseDirectory, seedPath);
  if (basename(absolute) !== SEED_FILE_NAME) {
    throw new WorkspacifyOrderError(
      `the argument must be a path to a ${SEED_FILE_NAME}: ${seedPath}`,
      { artefact: SEED_FILE_NAME },
    );
  }

  const directory = dirname(absolute);
  const rootPath = resolve(root);
  if (directory !== rootPath && !directory.startsWith(rootPath + sep)) {
    throw new WorkspacifyOrderError(
      `the seed is outside the workspace root: ${seedPath} is not under ${rootPath}`,
      { artefact: SEED_FILE_NAME },
    );
  }

  const owner = packages.find((pkg) => resolve(rootPath, pkg.path) === directory);
  if (owner === undefined) {
    throw new WorkspacifyOrderError(
      `no package owns this directory: ${directory}`,
      { artefact: SEED_FILE_NAME },
    );
  }
  return owner;
}

/** The package list, or a message naming the field the manifest is missing. */
// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function requirePackageList(treeManifest) {
  const packages = treeManifest?.workspace?.packages;
  if (!Array.isArray(packages)) {
    throw new WorkspacifyOrderError(
      'the stage-one manifest carries no workspace.packages, so there is no order to draw',
      { artefact: 'workspace.packages' },
    );
  }
  if (packages.length === 0) {
    throw new WorkspacifyOrderError(
      'the stage-one manifest lists no packages, so there is no order to draw',
      { artefact: 'workspace.packages' },
    );
  }
  return packages;
}

/** The edge records, or a message naming the field the manifest is missing. */
// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function requireEdgeRecords(treeManifest) {
  const edges = treeManifest?.dependencies?.dag?.canonical_edges;
  if (!Array.isArray(edges)) {
    throw new WorkspacifyOrderError(
      'the stage-one manifest carries no dependencies.dag.canonical_edges, so the levels cannot be derived',
      { artefact: 'dependencies.dag.canonical_edges' },
    );
  }
  return edges;
}

/** The manifest fields this command prints. A missing one would reach the page as undefined. */
const REQUIRED_PACKAGE_FIELDS = Object.freeze(['id', 'name', 'path']);

/** Every package must carry what the plan prints, or the plan would show blanks. */
// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function assertEveryPackageIsComplete(packages) {
  packages.forEach((pkg, index) => {
    const missing = REQUIRED_PACKAGE_FIELDS.filter((field) => typeof pkg?.[field] !== 'string' || pkg[field] === '');
    if (missing.length > 0) {
      throw new WorkspacifyOrderError(
        `package ${index} of the stage-one manifest has no ${missing.join(' and no ')}`,
        { artefact: 'workspace.packages' },
      );
    }
  });
}

/** An edge naming a package the workspace does not hold would be dropped silently. */
// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function assertEdgesReferencePackages(packages, edges) {
  const knownIds = new Set(packages.map((pkg) => pkg.id));
  const unknown = edges.find((edge) => !knownIds.has(edge.from) || !knownIds.has(edge.to));
  if (unknown !== undefined) {
    throw new WorkspacifyOrderError(
      `the edge ${unknown.from} -> ${unknown.to} names a package this workspace does not hold`,
      { artefact: 'dependencies.dag.canonical_edges' },
    );
  }
}

/**
 * Everything the renderer needs, indexed by package id.
 *
 * @param {{ root: string, treeManifest: object, allocateManifest: object }} input
 * @returns {object} the model the renderer draws from
 */
// [::TICKET::] PX-228 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-228 --for-spec --no-implementation-order`.
export function buildModel({ root, treeManifest, allocateManifest }) {
// [::TICKET::] PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
  const packageRecords = requirePackageList(treeManifest);
  assertEveryPackageIsComplete(packageRecords);
  const packages = packageRecords.map((pkg) => ({
    id: pkg.id,
    name: pkg.name,
    path: pkg.path,
    layer: pkg.layer,
  }));
  const edges = requireEdgeRecords(treeManifest);
  assertEdgesReferencePackages(packages, edges);
  const levels = deriveLevels({ packageIds: packages.map((pkg) => pkg.id), edges });
  assertMatchesPublished({ derivedLevels: levels, allocateManifest });

  const levelOf = new Map();
  levels.forEach((level, index) => level.forEach((id) => levelOf.set(id, index)));
  const providersOf = new Map(packages.map((pkg) => [pkg.id, []]));
  const consumersOf = new Map(packages.map((pkg) => [pkg.id, []]));
  for (const edge of edges) {
    providersOf.get(edge.from).push(edge.to);
    consumersOf.get(edge.to).push(edge.from);
  }
  for (const list of providersOf.values()) list.sort();
  for (const list of consumersOf.values()) list.sort();

  // The marks are settled once per package, and only after the manifest is proven complete, so a
  // package with no path fails with the message that names the field rather than reaching the
  // filesystem with an undefined segment. The first two are probes that read nothing; the third is
  // a verdict, so it is read from the directory's own documents and answers for every package
  // whether or not they are there.
  const explainedIds = new Set(
    packages.filter((pkg) => holdsExplanation({ root, packagePath: pkg.path })).map((pkg) => pkg.id),
  );
  const grilledIds = new Set(
    packages.filter((pkg) => holdsRfc({ root, packagePath: pkg.path })).map((pkg) => pkg.id),
  );
  const sequenceVerdicts = readSequenceVerdicts({ root, packages });
  // The counters are read once per package, beside the documents they qualify. A package
  // with no record answers null, which the renderer reads as unknown rather than zero.
  const rootCounters = {
    edu: readRootEduceGeneration(root),
    smo: readRootSmoothGeneration(root),
  };
  const grillCounts = new Map(
    packages.map((pkg) => [pkg.id, readCompletedSessions(join(root, pkg.path))]),
  );
  const distributionCounts = new Map(
    packages.map((pkg) => [pkg.id, readPackageDistribution(join(root, pkg.path))]),
  );
  const pathWidth = Math.max(...packages.map((pkg) => displayWidth(pkg.path)));

  return {
    workspaceName: basename(resolve(root)),
    packages,
    explainedIds,
    grilledIds,
    sequenceVerdicts,
    rootCounters,
    grillCounts,
    distributionCounts,
    levels,
    levelOf,
    serialIndex: new Map(levels.flat().map((id, index) => [id, index])),
    providersOf,
    consumersOf,
    criticalChain: findCriticalChain({ levels, edges }),
    pathOf: new Map(packages.map((pkg) => [pkg.id, pkg.path])),
    nameOf: new Map(packages.map((pkg) => [pkg.id, pkg.name])),
    pathWidth,
    markColumn: markColumnFor(pathWidth),
    edgeCount: edges.length,
  };
}
