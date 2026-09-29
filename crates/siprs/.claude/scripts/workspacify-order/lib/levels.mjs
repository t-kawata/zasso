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
import { basename, dirname, resolve, sep } from 'node:path';

import { SEED_FILE_NAME } from './workspace.mjs';
import { WorkspacifyOrderError } from './errors.mjs';

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
export function buildModel({ root, treeManifest, allocateManifest }) {
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

  return {
    workspaceName: basename(resolve(root)),
    packages,
    levels,
    levelOf,
    serialIndex: new Map(levels.flat().map((id, index) => [id, index])),
    providersOf,
    consumersOf,
    criticalChain: findCriticalChain({ levels, edges }),
    pathOf: new Map(packages.map((pkg) => [pkg.id, pkg.path])),
    nameOf: new Map(packages.map((pkg) => [pkg.id, pkg.name])),
    pathWidth: Math.max(...packages.map((pkg) => pkg.path.length)),
    edgeCount: edges.length,
  };
}
