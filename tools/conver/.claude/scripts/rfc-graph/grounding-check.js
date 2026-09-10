#!/usr/bin/env node
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.

/**
 * grounding-check.js — GF1, the grounding gate of the reverse rotation (§6.6, §6.14.4).
 *
 * A generated GRAPH can be internally consistent — every heading referenced,
 * every edge joined — and still be connected to nothing real. `node.schema.json`
 * carries no file field and `additionalProperties` is false, so nothing in the
 * graph itself forces a node to name a path that exists. Consistency properties
 * 2 and 3 hold only nominally without this check.
 *
 * Two claims are kept apart, because a reader acts on them differently:
 *
 *   declared but missing   the node names a path, and nothing is at that path
 *   no path declared       the run never grounded the node at all
 *
 * Both fail the gate. Both are reported by identifier, and the second names the
 * absence rather than a path — a node that was never grounded is not the same
 * fact as a node whose file was deleted, and rendering them identically would
 * destroy the only signal that tells the two apart (failure mode F12).
 *
 * The gate is the same rule as `/workspacify-tree`'s T3: a node resolves when
 * the path it carries exists under the measured tree. It does not add a field to
 * the graph to record that: ABOUT-REVERSE 6.12.3 puts `*-GRAPH.json` in layer C,
 * which gains nothing, and the grounding table is published beside it instead.
 *
 * Usage:
 *   node grounding-check.js --graph=<path> --root=<path> [--grounding=<path>] [--dirs-tree=<path>] [--out=<path>]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const { buildNodeIdToPathMap } = require('./dump-node-context-to-spec.js');

/**
 * The gate vocabulary.
 *
 * Declared here rather than imported from the reverse-rotation tree: this module
 * is a leaf of the flat CommonJS `rfc-graph/` toolchain, which shares no module
 * with the ESM trees, and a two-value predicate does not justify the coupling.
 */
const GATE_STATUS = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL' });

/** The gate identifier, named once so report, tests and design cannot disagree. */
const GF1_GATE_ID = 'GF1';

/** The stage name `run.mjs oracle compare --stage grounding` reads. */
const GROUNDING_STAGE = 'grounding';

/** Exit codes, matching the convention the other `rfc-graph/` CLIs use. */
const EXIT_CODES = Object.freeze({ OK: 0, FAIL: 1, USAGE: 2 });

/** The language a graph that names none is compared under. */
const UNKNOWN_LANGUAGE = 'unknown';

/** Where the grounding table comes from, in the order the CLI prefers them. */
const GROUNDING_TABLE_ARG_PREFIX = '--grounding=';
const DIRS_TREE_ARG_PREFIX = '--dirs-tree=';
const GRAPH_ARG_PREFIX = '--graph=';
const ROOT_ARG_PREFIX = '--root=';
const OUT_ARG_PREFIX = '--out=';

/** The 3-element template every `rfc-graph/` CLI uses, so a failure reads the same way. */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function formatError(problem, cause, remedy) {
  return `[ERROR] ${problem}\nCause: ${cause}\nAction: ${remedy}`;
}

/** A path is usable when it is a non-empty string; anything else declares nothing. */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function asPath(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Pair every node with the path it is grounded in.
 *
 * The declared table wins over a path carried on the node, so a run can correct
 * a graph it did not author. A node the caller declared no path for is carried
 * as `file: null` rather than dropped: the gate's whole purpose is to report
 * that node, and a node removed before the gate runs can never be reported.
 *
 * @param {{nodes?: Array<object>, declaredFiles?: Record<string, string>}} input
 * @returns {Array<{id: string|null, file: string|null}>}
 */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function extractGroundingTable({ nodes, declaredFiles = {} } = {}) {
  if (!Array.isArray(nodes)) {
    throw new Error(
      `the graph node list must be a list, but it is ${nodes === null ? 'null' : typeof nodes}; `
      + 'an omitted graph is not an empty graph and the two must not be judged alike',
    );
  }
  const declared = declaredFiles === null || typeof declaredFiles !== 'object' ? {} : declaredFiles;

  return nodes.map((node) => {
    const id = asPath(node?.id);
    const declaredPath = id === null ? null : asPath(declared[id]);
    return { id, file: declaredPath ?? asPath(node?.file) };
  });
}

/**
 * GF1 — every node resolves to a file that exists.
 *
 * A gate that cannot see its input fails and names the missing input. Passing
 * here would publish a graph whose grounding nothing had checked, which is the
 * failure the gate exists to make impossible.
 *
 * @param {{nodes?: Array<{id: string|null, file: string|null}>, resolveFilePath?: (file: string) => string}} input
 * @returns {{gateId: string, status: string, counts: object, reasons: string[], unresolvable: string[]}}
 */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function assertGrounding({ nodes, resolveFilePath } = {}) {
  if (!Array.isArray(nodes)) {
    return gateRecord(GATE_STATUS.FAIL, { nodes: 0, unresolvable: 0 }, [
      'no graph node set was supplied, so grounding could not be judged; supply the graph and re-run',
    ], []);
  }

  const resolve = typeof resolveFilePath === 'function' ? resolveFilePath : (file) => file;
  const unresolvable = [];
  const reasons = [];

  for (const node of nodes) {
    const identifier = asPath(node?.id) ?? '<unnamed node>';
    const declared = asPath(node?.file);

    if (declared === null) {
      unresolvable.push(identifier);
      reasons.push(
        `${identifier} cannot be grounded: no path was declared for it in the grounding table, `
        + 'so nothing connects the node to the measured tree',
      );
      continue;
    }

    const resolved = resolve(declared);
    if (typeof resolved !== 'string' || !fs.existsSync(resolved)) {
      unresolvable.push(identifier);
      reasons.push(
        `${identifier} does not resolve to a file that exists: the declared path "${declared}" was looked for `
        + `at "${resolved}" and nothing is there, so the node is not grounded in the measured tree`,
      );
    }
  }

  if (reasons.length === 0) {
    reasons.push(`all ${nodes.length} node(s) resolve to a file that exists on disk`);
  }

  return gateRecord(
    unresolvable.length === 0 ? GATE_STATUS.PASS : GATE_STATUS.FAIL,
    { nodes: nodes.length, unresolvable: unresolvable.length },
    reasons,
    unresolvable,
  );
}

/** One gate record, in the shape the reverse-rotation gates already report. */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function gateRecord(status, counts, reasons, unresolvable) {
  return { gateId: GF1_GATE_ID, status, counts, reasons, unresolvable };
}

/**
 * Judge a grounding table against a measured root.
 *
 * Binding the root here keeps the predicate itself free of a filesystem
 * convention, so a caller that resolves paths differently — an in-memory tree, a
 * worktree fixed at a commit — supplies its own resolver to `assertGrounding`.
 *
 * @param {{nodes?: Array<object>, root: string, resolveFilePath?: (file: string) => string}} input
 * @returns {object} the GF1 gate record
 */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function resolveGroundingTable({ nodes, root, resolveFilePath } = {}) {
  const resolve = typeof resolveFilePath === 'function'
    ? resolveFilePath
    : (file) => path.resolve(root, file);
  return assertGrounding({ nodes, resolveFilePath: resolve });
}

/**
 * The candidate document `run.mjs oracle compare --stage grounding` reads.
 *
 * Every node of the graph is an entry, and `grounded` records whether GF1 could
 * place it. An unobserved region travels through untouched: a run that stopped
 * early must be able to say so, because a region the analysis never looked at is
 * neither agreement nor disagreement and must never be rendered as either.
 *
 * @param {{graph?: object, table?: Array<object>, unobserved?: Array<object>}} input
 * @returns {{stage: string, corpus: object, entries: Array<object>, unobserved: Array<object>}}
 */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function buildGroundingCandidate({ graph, table, unobserved = [] } = {}) {
  const groundedIds = new Set((table ?? []).filter((entry) => asPath(entry?.file) !== null).map((entry) => entry.id));

  return {
    stage: GROUNDING_STAGE,
    corpus: { language: asPath(graph?.mainLanguage) ?? UNKNOWN_LANGUAGE },
    entries: (graph?.nodes ?? []).map((node) => ({
      name: asPath(node?.id) ?? '<unnamed node>',
      value: typeof node?.title === 'string' ? node.title : null,
      grounded: groundedIds.has(node?.id),
    })),
    unobserved: [...(unobserved ?? [])],
  };
}

/**
 * The gate as the Markdown a human or an AI reads before deciding anything.
 *
 * The count leads, then one line per unresolvable node, because a reader acts on
 * the node and not on the total.
 */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function renderGroundingReport(record, { root } = {}) {
  const lines = [
    '# GF1 — node grounding',
    '',
    `**${record.status}** — ${record.counts.nodes} node(s) judged, ${record.counts.unresolvable} unresolvable.`,
    '',
  ];

  if (typeof root === 'string' && root.length > 0) {
    lines.push(`Measured tree: \`${root}\``, '');
  }

  lines.push('## Reasons', '');
  for (const reason of record.reasons) {
    lines.push(`- ${reason}`);
  }

  if (record.unresolvable.length > 0) {
    lines.push('', '## Unresolvable nodes', '');
    for (const identifier of record.unresolvable) {
      lines.push(`- ${identifier}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/** The grounding table a run published, or an empty table when it published none. */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function readGroundingTable(tablePath) {
  const parsed = JSON.parse(fs.readFileSync(tablePath, 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`the grounding table ${tablePath} must be an object mapping a node identifier to a path`);
  }
  return parsed;
}

/** Parse the CLI arguments. */
// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const read = (prefix) => argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? null;

  return {
    graphPath: read(GRAPH_ARG_PREFIX),
    root: read(ROOT_ARG_PREFIX),
    groundingPath: read(GROUNDING_TABLE_ARG_PREFIX),
    dirsTreePath: read(DIRS_TREE_ARG_PREFIX),
    outPath: read(OUT_ARG_PREFIX),
    json: argv.includes('--json'),
  };
}

// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function printUsage() {
  process.stderr.write(
    'Usage: node grounding-check.js --graph=<path> --root=<path> [--grounding=<path>] [--dirs-tree=<path>] [--out=<path>] [--json]\n',
  );
}

// [::TICKET::] P22-14 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-14 --for-spec --no-implementation-order`.
function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.graphPath || !options.root) {
    printUsage();
    process.exit(EXIT_CODES.USAGE);
  }

  const graphPath = path.resolve(options.graphPath);
  const root = path.resolve(options.root);

  let graph;
  try {
    graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  } catch (error) {
    process.stderr.write(formatError(
      `the graph ${graphPath} could not be read as JSON: ${error.message}`,
      'the graph path does not point at a readable GRAPH document',
      'check the path and re-run with --graph=<existing GRAPH.json>',
    ));
    process.stderr.write('\n');
    process.exit(EXIT_CODES.FAIL);
  }

  let declaredFiles = {};
  try {
    if (options.groundingPath) {
      declaredFiles = readGroundingTable(path.resolve(options.groundingPath));
    } else if (options.dirsTreePath) {
      declaredFiles = buildNodeIdToPathMap(readGroundingTable(path.resolve(options.dirsTreePath)));
    }
  } catch (error) {
    process.stderr.write(formatError(
      `the grounding table could not be read: ${error.message}`,
      'the table the run published is unreadable, so nothing can be grounded against it',
      'fix or remove --grounding / --dirs-tree and re-run; a gate that cannot see its input fails rather than passes',
    ));
    process.stderr.write('\n');
    process.exit(EXIT_CODES.FAIL);
  }

  const table = extractGroundingTable({ nodes: graph.nodes, declaredFiles });
  const record = resolveGroundingTable({ nodes: table, root });

  process.stdout.write(`${renderGroundingReport(record, { root })}\n`);

  if (options.outPath) {
    const candidatePath = path.resolve(options.outPath);
    fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
    fs.writeFileSync(candidatePath, `${JSON.stringify(buildGroundingCandidate({ graph, table }), null, 2)}\n`);
    process.stdout.write(`Candidate written to \`${candidatePath}\`.\n\n`);
  }

  process.exit(record.status === GATE_STATUS.PASS ? EXIT_CODES.OK : EXIT_CODES.FAIL);
}

if (require.main === module) {
  main();
}

module.exports = {
  EXIT_CODES,
  GATE_STATUS,
  GF1_GATE_ID,
  GROUNDING_STAGE,
  assertGrounding,
  buildGroundingCandidate,
  extractGroundingTable,
  formatError,
  parseArguments,
  renderGroundingReport,
  resolveGroundingTable,
};
