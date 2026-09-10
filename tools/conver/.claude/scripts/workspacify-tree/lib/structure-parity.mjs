// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
/**
 * T1 to T4 — the structure gates of the reverse rotation (§6.3, §6.14.1).
 *
 * The reverse rotation starts from a project that already exists, so its
 * partition must be grounded in a tree that was measured rather than one that
 * was assumed. Each gate returns a record `{ gateId, status, counts, reasons }`
 * plus the detail its reason sentences were built from. A gate that cannot see
 * its input fails and names the missing input: silence is never a verdict.
 *
 * The measured population is defined once, here, so a later change to the
 * exclusions cannot silently change what the gates judge.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { GATE_STATUS } from './errors.mjs';
import { runDagChecks } from './dag.mjs';

/** The gate identifiers, named once so report, tests and design cannot disagree. */
export const STRUCTURE_GATE_IDS = Object.freeze({ T1: 'T1', T2: 'T2', T3: 'T3', T4: 'T4' });

/**
 * Directory names the measurement never descends into or counts.
 *
 * These are the populations R0 names — version control, installed dependencies
 * and generated output — plus the two Python caches, which never hold source.
 * They are matched at any depth, because a monorepo nests `node_modules/` and a
 * vendored dependency nests `vendor/`.
 *
 * The list is deliberately short. A name that can also be a real source
 * directory must not appear here: excluding it would shrink T2's population in
 * silence, and a source file dropped before the gate runs can never be reported
 * as unowned. `build/` is the trap — `src/build/` is ordinary source in the
 * target project, so an unrecorded `build/` directory is reported as an extra
 * path by T1 and recorded, rather than quietly removed from the measurement.
 */
export const MEASURED_TREE_EXCLUSIONS = Object.freeze([
  '.git',
  'node_modules',
  'target',
  'dist',
  'vendor',
  '.venv',
  '__pycache__',
]);

/** File extensions counted as hand-written source across the six target languages. */
export const SOURCE_FILE_EXTENSIONS = Object.freeze([
  '.rs',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.go',
  '.py',
  '.c',
  '.h',
  '.cc',
  '.cpp',
  '.cxx',
  '.hpp',
  '.hxx',
]);

/** A package path that denotes the project root. */
const ROOT_PACKAGE_PATH = '.';

// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function gateRecord(gateId, passed, counts, reasons, detail = {}) {
  return {
    gateId,
    status: passed ? GATE_STATUS.PASS : GATE_STATUS.FAIL,
    counts,
    reasons: reasons.length > 0 ? reasons : [`${gateId} reached a verdict with nothing to report`],
    ...detail,
  };
}

/** True when any path segment names an excluded directory. */
export function isExcludedPath(relativePath) {
  return String(relativePath)
    .split('/')
    .some((segment) => MEASURED_TREE_EXCLUSIONS.includes(segment));
}

/** True when the file carries one of the source extensions the six languages use. */
export function isSourceFile(relativePath) {
  return SOURCE_FILE_EXTENSIONS.some((extension) => relativePath.endsWith(extension));
}

/**
 * Measure a project tree from the filesystem.
 *
 * `directories` holds the directories that *directly* contain a hand-written
 * source file, which is the granularity a package path names. `sourceFiles`
 * holds every hand-written source file at any depth, which is the population
 * T2 asks about.
 *
 * @param {string} root - absolute path to the project root
 * @returns {{directories: string[], sourceFiles: string[], excluded: string[]}}
 */
export function measureDirectoryTree(root) {
  const directories = new Set();
  const sourceFiles = [];
  const excluded = [];

  const walk = (absoluteDir, relativeDir) => {
    for (const entry of readdirSync(absoluteDir).sort()) {
      const absolute = join(absoluteDir, entry);
      const relative = relativeDir === '' ? entry : `${relativeDir}/${entry}`;
      if (isExcludedPath(relative)) {
        excluded.push(relative);
        continue;
      }
      if (statSync(absolute).isDirectory()) {
        walk(absolute, relative);
        continue;
      }
      if (!isSourceFile(relative)) {
        continue;
      }
      sourceFiles.push(relative);
      // A file at the project root is owned by the package whose path is `.`, so
      // the root is measured as `.` rather than as the empty string. Without this
      // a project with a root-level `build.rs` could satisfy neither gate: T1
      // would report the `.` package missing while T2 reported the file unowned,
      // and no package path could reconcile the two.
      directories.add(relativeDir === '' ? ROOT_PACKAGE_PATH : relativeDir);
    }
  };

  walk(root, '');
  return {
    directories: [...directories].sort(),
    sourceFiles: sourceFiles.sort(),
    excluded: excluded.sort(),
  };
}

/** T1 — the manifest package path set and the measured directory set, in both directions. */
export function assertStructureParity({ packagePaths, measuredDirectories }) {
  const declared = [...new Set(packagePaths ?? [])].sort();
  const measured = [...new Set(measuredDirectories ?? [])].sort();
  const declaredSet = new Set(declared);
  const measuredSet = new Set(measured);

  const extras = measured.filter((directory) => !declaredSet.has(directory));
  const missing = declared.filter((directory) => !measuredSet.has(directory));
  const reasons = [];

  for (const directory of extras) {
    reasons.push(`${directory} is extra: the measured tree holds it but no package in the manifest does`);
  }
  for (const directory of missing) {
    reasons.push(`${directory} is missing: the manifest declares it but the measured tree has no such directory`);
  }
  if (reasons.length === 0) {
    reasons.push(`the manifest package paths and the measured directories agree exactly (${declared.length} path(s) compared)`);
  }

  return gateRecord('T1', extras.length === 0 && missing.length === 0, { extra: extras.length, missing: missing.length }, reasons, {
    extras,
    missing,
  });
}

/** True when the package path owns the file, treating `.` as the whole project root. */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function packageOwnsPath(packagePath, file) {
  const normalized = packagePath === ROOT_PACKAGE_PATH ? '' : String(packagePath).replace(/\/+$/, '');
  if (normalized === '') {
    return true;
  }
  return file.startsWith(`${normalized}/`);
}

/** T2 — every hand-written source file belongs to some package. */
export function assertNoBehaviouralLoss({ packages, sourceFiles }) {
  const packagePaths = (packages ?? []).map((pkg) => pkg.path);
  const files = [...new Set(sourceFiles ?? [])].sort();
  const unowned = files.filter((file) => !packagePaths.some((packagePath) => packageOwnsPath(packagePath, file)));

  const reasons = unowned.map(
    (file) => `${file} is not owned by any package: no declared package path contains it, so the partition would lose it`,
  );
  if (reasons.length === 0) {
    reasons.push(`all ${files.length} hand-written source file(s) are owned by a declared package path`);
  }

  return gateRecord('T2', unowned.length === 0, { files: files.length, unowned: unowned.length }, reasons, { unowned });
}

/** T3 — every node resolves to a file that exists. */
export function assertGrounding({ nodes, resolveFilePath }) {
  // A gate that cannot see its input fails and names the missing input. An
  // omitted graph is not an empty graph: passing here would publish a manifest
  // whose grounding nothing had checked.
  if (!Array.isArray(nodes)) {
    return gateRecord(
      'T3',
      false,
      { nodes: 0, unresolvable: 0 },
      ['no graph node set was supplied, so grounding could not be judged; supply the graph and re-run'],
      { unresolvable: [] },
    );
  }

  const list = nodes;
  const unresolvable = [];

  for (const node of list) {
    const identifier = node?.id ?? '<unnamed node>';
    const file = node?.file;
    if (typeof file !== 'string' || file.trim() === '') {
      unresolvable.push(identifier);
      continue;
    }
    const resolved = resolveFilePath(file);
    if (typeof resolved !== 'string' || !existsSync(resolved)) {
      unresolvable.push(identifier);
    }
  }

  const reasons = unresolvable.map(
    (identifier) => `${identifier} does not resolve to a file that exists, so the node is not grounded in the measured tree`,
  );
  if (reasons.length === 0) {
    reasons.push(`all ${list.length} node(s) resolve to a file that exists on disk`);
  }

  return gateRecord('T3', unresolvable.length === 0, { nodes: list.length, unresolvable: unresolvable.length }, reasons, {
    unresolvable,
  });
}

/**
 * Resolve one measured endpoint to a package id.
 *
 * A measurement spells a directory the way its tooling does — `./src`, `src/` —
 * while a manifest names a package id or its declared path. Anything the catalog
 * cannot place is returned as the normalised spelling, so the caller reports it
 * as an unnamed package rather than silently discarding it.
 */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function resolveMeasuredEndpoint(catalog, endpoint) {
  const normalized = normaliseEndpoint(endpoint);
  const byPath = catalog.find((pkg) => normaliseEndpoint(pkg.path) === normalized);
  return byPath ? byPath.id : normalized;
}

/** The spelling of a directory, reduced to the way a manifest names it. */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function normaliseEndpoint(endpoint) {
  return String(endpoint).replace(/^\.\//, '').replace(/\/+$/, '');
}

/**
 * T4 — prove the implementation order from the measured DAG and require the
 * manifest to declare the same one.
 *
 * An endpoint is resolved against the package catalog before anything is
 * compared: a measurement names directories while a manifest names package ids,
 * and `./src` and `src/` both denote `src`. Resolving here rather than in the
 * caller keeps the comparison in one testable place.
 *
 * An edge the catalog cannot place is not a detail to count and move past. It
 * means the measurement and the manifest disagree about which packages exist,
 * and dropping it would let the remaining edges prove an order the measurement
 * does not support — a proof the gate does not have.
 */
export function measureImplementationOrder({ packages, measuredEdges, manifestOrder }) {
  const declaredOrder = [...(manifestOrder?.serial ?? [])];

  if (!Array.isArray(measuredEdges)) {
    return gateRecord(
      'T4',
      false,
      { cycles: 0, divergent: 0, unknown: 0 },
      [
        'no measured edge set was supplied, so the implementation order could not be proved from measurement; supply the R2 dependency measurement and re-run',
      ],
      { measuredOrder: [], manifestOrder: declaredOrder },
    );
  }

  const catalog = packages ?? [];
  const resolvedEdges = measuredEdges.map((edge) => ({
    from: resolveMeasuredEndpoint(catalog, edge.from),
    to: resolveMeasuredEndpoint(catalog, edge.to),
  }));
  const nodeSet = new Set(catalog.map((pkg) => pkg.id));
  const unknownEdges = resolvedEdges.filter((edge) => !nodeSet.has(edge.from) || !nodeSet.has(edge.to));
  const usableEdges = resolvedEdges.filter((edge) => nodeSet.has(edge.from) && nodeSet.has(edge.to));
  const report = runDagChecks({ packages: catalog, edges: usableEdges });
  const measuredOrder = report.implementation_order.serial;

  if (unknownEdges.length > 0) {
    return gateRecord(
      'T4',
      false,
      { cycles: report.cycle_count, divergent: 0, unknown: unknownEdges.length },
      unknownEdges.map(
        (edge) =>
          `the measured DAG orders ${edge.from} -> ${edge.to}, but one of those is not a package the manifest declares, so the measurement and the manifest disagree about the package set`,
      ),
      { measuredOrder, manifestOrder: declaredOrder },
    );
  }

  if (report.cycle_count > 0) {
    const cycles = report.cycles.map((cycle) => cycle.path.join(' -> ')).join('; ');
    return gateRecord(
      'T4',
      false,
      { cycles: report.cycle_count, divergent: 0, unknown: 0 },
      [`the measured DAG contains ${report.cycle_count} cycle(s), so it has no implementation order: ${cycles}`],
      { measuredOrder, manifestOrder: declaredOrder },
    );
  }

  const length = Math.max(measuredOrder.length, declaredOrder.length);
  const divergentPositions = [];
  for (let index = 0; index < length; index += 1) {
    if (measuredOrder[index] !== declaredOrder[index]) {
      divergentPositions.push(
        `position ${index}: the measured DAG places ${measuredOrder[index] ?? '(nothing)'} where the manifest declares ${declaredOrder[index] ?? '(nothing)'}`,
      );
    }
  }

  const reasons =
    divergentPositions.length === 0
      ? [`the measured DAG proves the same implementation order the manifest declares (${measuredOrder.length} package(s))`]
      : divergentPositions;

  return gateRecord('T4', divergentPositions.length === 0, { cycles: 0, divergent: divergentPositions.length, unknown: 0 }, reasons, {
    measuredOrder,
    manifestOrder: declaredOrder,
  });
}
