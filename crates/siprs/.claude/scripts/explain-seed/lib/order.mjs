/**
 * Read one package's place in the implementation order from the command that owns the rule.
 *
 * The ordering rule is not re-implemented here. `workspacify-order` derives the levels, refuses
 * to draw an order that disagrees with the published one, walks the critical chain, and prints a
 * block for one seed; this module runs it and reads that block back. A second implementation of
 * the longest-path rule in this file would be a second answer to one question, and the two would
 * eventually disagree in a document nobody checks.
 *
 * What the reader adds to what it reads is the resolution the printed form cannot carry: the
 * order view prints directory paths, and the facts document names packages by id, so every path
 * is resolved against the stage-one manifest and a path that resolves to nothing raises rather
 * than being dropped.
 *
 * Two failure modes are kept apart on purpose. A workspace the order view cannot order is a
 * broken manifest, and it fails before a child process is spent. Output this reader cannot parse
 * is a defect in this reader, and it fails rather than degrading to empty lists — an empty list
 * of dependencies reads as "nothing to wait for", which is the one claim this module must never
 * make up.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ExplainSeedError } from './errors.mjs';

/** The command whose output is the order, and the manifest that says which workspace it is. */
export const ORDER_VIEW_PATH = fileURLToPath(new URL('../../workspacify-order/run.mjs', import.meta.url));
export const ALLOCATE_MANIFEST_FILE_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';

/** The marks the order view prints, named here so a change in one place is a change in one place. */
export const FOCUS_MARKER = '▶';
export const SERIAL_HEADING = 'waits for';
export const PARALLEL_HEADING = 'parallel in this level';
export const CONSUMER_HEADING = 'used by';
export const CHAIN_HEADING = 'critical chain';
export const CHAIN_ARROW = '→';
export const CRITICAL_PATH_NOTE = 'on the critical path';

const SERIAL_HEADINGS = Object.freeze([SERIAL_HEADING, PARALLEL_HEADING, CONSUMER_HEADING]);
const PLAN_LINE = /(\d+) dirs \/ (\d+) levels \/ (\d+) dependencies/;
const FOCUS_LINE = /^▶\s+(.+?)\s+level\s+(\d+)\s+·\s+(\d+)(?:st|nd|rd|th)(\s+·\s+on the critical path)?$/;
const RELATED_ENTRY = /^ {4}(.+?)\s+level\s+(\d+)$/;
const DECLARED_COUNT = /\((\d+)\)/;

/** The one error this module raises, always naming the artefact it could not read. */
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
function rejectFocusBlock(detail) {
  return new ExplainSeedError(`the implementation-order focus block ${detail}`, {
    field: 'implementation_order',
  });
}

/** Every ancestor directory of `startDirectory`, nearest first. */
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
function ancestorsOf(startDirectory) {
  const ancestors = [];
  let current = resolve(startDirectory);
  for (;;) {
    ancestors.push(current);
    const parent = dirname(current);
    if (parent === current) return ancestors;
    current = parent;
  }
}

/**
 * The workspace root the order view will resolve, so a mismatch is caught before it is asked.
 *
 * The order view walks up from the seed looking for a directory holding both manifests. This
 * repeats only the search — not the ordering — because pairing one workspace's manifests with
 * another workspace's order would produce a document that is internally consistent and wrong.
 */
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
function resolveOrderRoot(seedPath) {
  const candidates = ancestorsOf(dirname(resolve(seedPath))).filter((directory) =>
    existsSync(join(directory, ALLOCATE_MANIFEST_FILE_NAME)),
  );

  if (candidates.length === 0) {
    throw new ExplainSeedError(
      `no ${ALLOCATE_MANIFEST_FILE_NAME} is found in any directory above ${seedPath}, so the implementation order cannot be read`,
      { field: 'stage2_manifest.path' },
    );
  }
  if (candidates.length > 1) {
    throw new ExplainSeedError(
      `${ALLOCATE_MANIFEST_FILE_NAME} is found in more than one directory above ${seedPath}: ${candidates.join(', ')}`,
      { field: 'stage2_manifest.path' },
    );
  }
  return candidates[0];
}

/** One related list: the heading, the count it declares, and the paths under it. */
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
function readRelatedSection(lines, heading) {
  const index = lines.findIndex((line) => line.trimStart().startsWith(heading));
  if (index < 0) throw rejectFocusBlock(`carries no "${heading}" list`);

  const declared = DECLARED_COUNT.exec(lines[index]);
  if (declared === null) throw rejectFocusBlock(`states no count for "${heading}"`);

  const paths = [];
  for (let cursor = index + 1; cursor < lines.length && lines[cursor].trim() !== ''; cursor += 1) {
    const entry = RELATED_ENTRY.exec(lines[cursor]);
    if (entry === null) throw rejectFocusBlock(`carries an entry under "${heading}" it cannot read: ${lines[cursor]}`);
    paths.push(entry[1]);
  }

  if (paths.length !== Number(declared[1])) {
    throw rejectFocusBlock(`says "${heading}" holds ${declared[1]} and prints ${paths.length}`);
  }
  return paths;
}

/** How many packages the critical chain holds, counted from the arrows that join them. */
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
function readCriticalChainLength(lines) {
  const index = lines.findIndex((line) => line.trimStart().startsWith(CHAIN_HEADING));
  if (index < 0) throw rejectFocusBlock('carries no critical chain');

  const chain = [];
  for (let cursor = index; cursor < lines.length && lines[cursor].trim() !== ''; cursor += 1) {
    chain.push(lines[cursor]);
  }
  const joined = chain.join(' ');
  const arrows = joined.split(CHAIN_ARROW).length - 1;
  return arrows + 1;
}

/** The plan shape, read from the one line that states it. */
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
function readPlan(lines, criticalChainLength) {
  for (const line of lines) {
    const stated = PLAN_LINE.exec(line);
    if (stated !== null) {
      return {
        directories: Number(stated[1]),
        levels: Number(stated[2]),
        dependencies: Number(stated[3]),
        criticalChainLength,
      };
    }
  }
  throw rejectFocusBlock('states no plan shape');
}

/**
 * The focus block, as the paths and numbers it prints.
 *
 * Pure: it takes the bytes and returns what they say. The command's own output is the only
 * input, so a test can hold a recorded run against this function without spawning anything.
 *
 * @param {string} text — the order view's stdout
 * @returns {{ level: number, ordinal: number, onCriticalPath: boolean, waitsForPaths: string[],
 *   usedByPaths: string[], parallelInLevelPaths: string[], plan: object }}
 */
export function parseFocusBlock(text) {
  const lines = String(text).split('\n');
  const heading = lines.find((line) => line.startsWith(FOCUS_MARKER));
  if (heading === undefined) throw rejectFocusBlock('is not present in what the order view printed');

  const focused = FOCUS_LINE.exec(heading);
  if (focused === null) throw rejectFocusBlock(`carries a heading it cannot read: ${heading}`);

  const [serial, parallel, consumers] = SERIAL_HEADINGS.map((name) => readRelatedSection(lines, name));
  const criticalChainLength = readCriticalChainLength(lines);

  return {
    level: Number(focused[2]),
    ordinal: Number(focused[3]),
    onCriticalPath: focused[4] !== undefined,
    waitsForPaths: serial,
    usedByPaths: consumers,
    parallelInLevelPaths: parallel,
    plan: readPlan(lines, criticalChainLength),
  };
}

/** The path-to-id map the manifests carry, so printed paths become the ids the facts name. */
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
function indexByPath(packages) {
  if (!Array.isArray(packages) || packages.length === 0) {
    throw new ExplainSeedError(
      'the stage-one manifest lists no packages, so the paths the order prints cannot be resolved to ids',
      { field: 'workspace.packages' },
    );
  }
  return new Map(packages.map((pkg) => [pkg.path, pkg.id]));
}

/** One printed list, as package ids. A path the workspace does not hold is a broken manifest. */
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
function resolveIds(paths, idOfPath) {
  return paths.map((path) => {
    const id = idOfPath.get(path);
    if (id === undefined) {
      throw new ExplainSeedError(
        `the implementation order names a directory no package owns: ${path}`,
        { field: 'workspace.packages' },
      );
    }
    return id;
  });
}

/**
 * Run the order view for one seed and return the order facts it reports.
 *
 * @param {{ root: string, seedPath: string, packages: Array<object> }} input
 * @returns {{ level: number, ordinal: number, onCriticalPath: boolean, waitsFor: string[],
 *   usedBy: string[], parallelInLevel: string[], plan: object }}
 */
export function loadOrderFacts({ root, seedPath, packages }) {
  const orderRoot = resolveOrderRoot(seedPath);
  if (orderRoot !== resolve(root)) {
    throw new ExplainSeedError(
      `the implementation order belongs to ${orderRoot}, and this run resolved ${resolve(root)}`,
      { field: 'stage2_manifest.path' },
    );
  }

  const run = spawnSync(process.execPath, [ORDER_VIEW_PATH, seedPath], { encoding: 'utf8' });
  if (run.error !== undefined) {
    throw new ExplainSeedError(`the order view could not be run: ${run.error.message}`, {
      field: 'implementation_order',
    });
  }
  if (run.status !== 0) {
    throw new ExplainSeedError(`the order view failed: ${run.stderr.trim()}`, {
      field: 'implementation_order',
    });
  }

  const parsed = parseFocusBlock(run.stdout);
  const idOfPath = indexByPath(packages);
  return {
    level: parsed.level,
    ordinal: parsed.ordinal,
    onCriticalPath: parsed.onCriticalPath,
    waitsFor: resolveIds(parsed.waitsForPaths, idOfPath),
    usedBy: resolveIds(parsed.usedByPaths, idOfPath),
    parallelInLevel: resolveIds(parsed.parallelInLevelPaths, idOfPath),
    plan: parsed.plan,
  };
}
