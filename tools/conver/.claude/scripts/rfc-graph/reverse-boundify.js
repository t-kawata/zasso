#!/usr/bin/env node
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.

/**
 * reverse-boundify.js — B1 through B3, the reverse branch of `/boundify-graph` (§6.7, §6.14.5).
 *
 * The forward flow creates the tree it describes: `boundify-graph-to-dirs.js` derives a
 * Dirs-Tree from the graph and `generate-dir-template.js` materialises it. In reverse mode
 * the tree already exists, so both halves change character. B1 generates no file. B2
 * attaches the provenance header where one is missing and restricts every diff to the
 * header. B3 emits the correspondence table naming which declared files were not generated
 * because they were already there — and, just as importantly, which declarations have no
 * file at all.
 *
 * The judgements themselves live in `reverse-boundify-gates.js`, which touches no disk.
 * This module is the part that reads, writes and reports.
 *
 * An existing `Initial Design Artifact` header is never rewritten. That differs from
 * `refresh-file-headers.js`, which refreshes a header in place; the difference is
 * deliberate, because supreme law 4 forbids altering the header and the reverse path may
 * therefore only attach one where none exists.
 *
 * Writing is opt-in. The forward flow writes by default; here the tree already exists, so
 * a write is the exceptional act and requires `--apply`. The subject tree holds 150 Rust
 * files, so a body-modifying bug is a 150-file corruption rather than a small mistake.
 *
 * Usage:
 *   node reverse-boundify.js --graph=<path> --root=<path> [--dirs-tree=<path>]
 *                            [--out=<dir>] [--correspondence=<path>] [--candidate=<path>] [--apply] [--json]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { generateHeaderComment, resolveHeaderPaths } = require('./boundify-helpers.js');
const {
  DISPOSITIONS,
  GATE_STATUS,
  REFUSAL_REASONS,
  RESOLUTION_REASONS,
  assertCorrespondenceTable,
  assertNoNewFiles,
  attachHeader,
  bodyHash,
  buildCorrespondenceTable,
  detectHeader,
  judgeHeaderOnlyDiffs,
} = require('./reverse-boundify-gates.js');

/** Exit codes, matching the convention the other `rfc-graph/` CLIs use. */
const EXIT_CODES = Object.freeze({ OK: 0, FAIL: 1, USAGE: 2 });

/**
 * Directories a measured inventory does not descend into.
 *
 * `target` and `vendor` hold build and third-party output rather than the project's own
 * files, and the reverse rotation's subject tree carries a 1.1 GB `target`.
 */
const DEFAULT_EXCLUDED_DIRS = Object.freeze(['target', 'vendor', 'node_modules', '.git']);

/** Where the forward builder lives, so the tree shape has one definition rather than two. */
const FORWARD_BUILDER = path.join(__dirname, 'boundify-graph-to-dirs.js');

/** The graph suffix the Dirs-Tree naming convention is derived from. */
const GRAPH_SUFFIX = '-GRAPH.json';

const GRAPH_ARG_PREFIX = '--graph=';
const ROOT_ARG_PREFIX = '--root=';
const DIRS_TREE_ARG_PREFIX = '--dirs-tree=';
const OUT_ARG_PREFIX = '--out=';
const CORRESPONDENCE_ARG_PREFIX = '--correspondence=';
const CANDIDATE_ARG_PREFIX = '--candidate=';

/** The 3-element template every `rfc-graph/` CLI uses, so a failure reads the same way. */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function formatError(problem, cause, remedy) {
  return `[ERROR] ${problem}\nCause: ${cause}\nAction: ${remedy}`;
}

/**
 * Every file under a root, sorted, as root-relative paths.
 *
 * Build output and third-party trees are not the project's own files, so they are not part
 * of what B1 promises to preserve.
 *
 * @param {string} root
 * @param {{exclude?: string[]}} [options]
 * @returns {string[]}
 */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function buildFileInventory(root, { exclude = DEFAULT_EXCLUDED_DIRS } = {}) {
  const excluded = new Set(exclude);
  const found = [];

  const descend = (directory, prefix) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (excluded.has(entry.name)) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) descend(path.join(directory, entry.name), relative);
      else found.push(relative);
    }
  };

  descend(root, '');
  return found.sort();
}

/**
 * The file nodes a Dirs-Tree declares, with the language tree root prefixed.
 *
 * The declared path is what the forward flow would have written. In reverse mode it is a
 * claim about a file that already exists, and the whole point of the correspondence table
 * is to test that claim against the measured tree.
 *
 * @param {object} dirsTree
 * @returns {Array<{declaredPath: string, lang: string, kind: string, mappedNodeIds: string[], nodeMappings: Array<object>}>}
 */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function walkDirsTree(dirsTree) {
  const declared = [];

  const walk = (node, lang, prefix) => {
    const relative = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'file') {
      const nodeMappings = (node.mappedNodeIds ?? []).map((entry) => (
        typeof entry === 'string' ? { nodeId: entry } : entry
      ));
      declared.push({
        declaredPath: relative,
        lang,
        kind: node.kind ?? '',
        mappedNodeIds: nodeMappings.map((mapping) => mapping.nodeId),
        nodeMappings,
      });
    }
    for (const child of node.children ?? []) walk(child, lang, relative);
  };

  for (const [lang, tree] of Object.entries(dirsTree?.trees ?? {})) {
    if (tree) walk(tree, lang, '');
  }
  return declared.sort((left, right) => left.declaredPath.localeCompare(right.declaredPath));
}

/**
 * Where a declared path stands relative to the measured tree.
 *
 * An absent path and an unreadable one are different findings and are reported
 * differently: the first says the graph names a file nothing wrote, the second says
 * something is there that cannot be given a header.
 *
 * @param {string} root
 * @param {string} declaredPath
 * @returns {{path: string|null, reason: string|null}}
 */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function resolveExistingFile(root, declaredPath) {
  const full = path.join(root, declaredPath);
  try {
    if (!fs.existsSync(full)) return { path: null, reason: RESOLUTION_REASONS.ABSENT };
    if (!fs.statSync(full).isFile()) return { path: null, reason: RESOLUTION_REASONS.NOT_A_READABLE_FILE };
    return { path: full, reason: null };
  } catch (error) {
    return { path: null, reason: RESOLUTION_REASONS.NOT_A_READABLE_FILE };
  }
}

/** The header text for one declared file, assembled by the generator that owns the format. */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function headerTextFor({ filePath, mapping, dirsTree, graphPath }) {
  const graphBasename = path.basename(graphPath);
  const sourceBasename = dirsTree.sourceFile ? path.basename(dirsTree.sourceFile) : 'UNKNOWN_SOURCE.md';
  const dirsTreeBasename = graphBasename.endsWith(GRAPH_SUFFIX)
    ? `${graphBasename.slice(0, -GRAPH_SUFFIX.length)}-Dirs-Tree.json`
    : `${graphBasename}.Dirs-Tree.json`;

  const headerPaths = resolveHeaderPaths(
    filePath,
    path.dirname(graphPath),
    graphBasename,
    dirsTreeBasename,
    sourceBasename,
  );

  const mapped = new Set(mapping.mappedNodeIds);
  const crossReferences = (dirsTree.trees?.[mapping.lang]?.crossReferences ?? []).filter(
    (reference) => (reference.connections ?? []).some((connection) => mapped.has(connection.toNodeId)),
  );

  return `${generateHeaderComment(
    headerPaths,
    mapping.nodeMappings,
    crossReferences,
    sourceBasename,
    mapping.lang,
  )}\n`;
}

/** Plan one declared file: resolve it, then attach, preserve or refuse. */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function planDeclaredFile(mapping, { root, graphPath, dirsTree }) {
  const resolved = resolveExistingFile(root, mapping.declaredPath);
  const base = {
    declaredPath: mapping.declaredPath,
    existingPath: resolved.path,
    originatingNodeId: mapping.mappedNodeIds.join(', ') || null,
    lang: mapping.lang,
    before: null,
    after: null,
    atLine: null,
    headerText: null,
    bodyHashBefore: null,
    bodyHashAfter: null,
  };

  if (resolved.reason === RESOLUTION_REASONS.ABSENT) {
    return { ...base, disposition: DISPOSITIONS.ABSENT, reason: RESOLUTION_REASONS.ABSENT };
  }
  if (resolved.reason) {
    return { ...base, disposition: DISPOSITIONS.REFUSED, reason: resolved.reason };
  }

  let content;
  try {
    content = fs.readFileSync(resolved.path, 'utf8');
  } catch (error) {
    return { ...base, disposition: DISPOSITIONS.REFUSED, reason: RESOLUTION_REASONS.NOT_A_READABLE_FILE };
  }
  base.before = content;
  base.bodyHashBefore = bodyHash(content);

  if (detectHeader(content)) {
    return {
      ...base,
      disposition: DISPOSITIONS.PRESERVED,
      after: content,
      bodyHashAfter: base.bodyHashBefore,
      reason: `${REFUSAL_REASONS.ALREADY_CARRIES_HEADER}: the reverse path attaches a header where none exists and never rewrites one`,
    };
  }

  const headerText = headerTextFor({ filePath: resolved.path, mapping, dirsTree, graphPath });
  const outcome = attachHeader({ path: mapping.declaredPath, content, headerText });
  if (!outcome.ok) {
    return { ...base, disposition: DISPOSITIONS.REFUSED, reason: outcome.reason };
  }

  return {
    ...base,
    disposition: DISPOSITIONS.ATTACHED,
    atLine: outcome.atLine,
    headerText,
    after: outcome.content,
    bodyHashAfter: bodyHash(outcome.content),
    reason: 'the declared file exists and carried no header, so one was attached',
  };
}

/**
 * Plan the reverse boundify: no writes, no mutations, and a gate for each of B1 through B3.
 *
 * @param {{dirsTree?: object, root?: string, graphPath?: string}} input
 * @returns {{root: string, graphPath: string, language: string, dirsTree: object, operations: Array<object>, correspondence: Array<object>, gates: object}}
 */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function planReverseBoundify({ dirsTree, root, graphPath } = {}) {
  if (!dirsTree || typeof dirsTree !== 'object') {
    throw new Error('planReverseBoundify needs a Dirs-Tree; the reverse flow describes an existing tree rather than creating one');
  }
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error('planReverseBoundify needs a --root naming the measured tree');
  }
  if (typeof graphPath !== 'string' || graphPath.length === 0) {
    throw new Error('planReverseBoundify needs a --graph so an attached header can name the graph it came from');
  }

  const declared = walkDirsTree(dirsTree);
  const inventory = buildFileInventory(root);
  const operations = declared.map((mapping) => planDeclaredFile(mapping, { root, graphPath, dirsTree }));

  const correspondence = buildCorrespondenceTable(operations);

  // B1 is judged against the set of paths the plan would write. Every one of them was
  // resolved from the disk, so none can be new; the gate exists to fail loudly if a future
  // change ever plans a write to a computed path instead.
  const intendedWrites = operations
    .filter((operation) => operation.disposition === DISPOSITIONS.ATTACHED)
    .map((operation) => path.relative(root, operation.existingPath).split(path.sep).join('/'));
  const projected = [...new Set([...inventory, ...intendedWrites])].sort();

  return {
    root,
    graphPath,
    language: Object.keys(dirsTree.trees ?? {})[0] ?? 'rust',
    dirsTree,
    operations,
    correspondence,
    gates: {
      B1: assertNoNewFiles(inventory, projected),
      B2: judgeHeaderOnlyDiffs(operations),
      B3: assertCorrespondenceTable(correspondence),
    },
  };
}

/**
 * Apply a plan: attach the headers, and write the artefacts the plan produced.
 *
 * The inventory is taken around the write rather than assumed, so a created file is caught
 * by comparison instead of by intention.
 *
 * @param {object} plan
 * @param {{root?: string, outDir?: string, correspondencePath?: string, candidatePath?: string}} [options]
 * @returns {{attached: string[], written: string[], inventoryBefore: string[], inventoryAfter: string[]}}
 */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function applyReverseBoundify(plan, { root, outDir, correspondencePath, candidatePath } = {}) {
  const measuredRoot = root ?? plan.root;
  const inventoryBefore = buildFileInventory(measuredRoot);
  const attached = [];

  for (const operation of plan.operations) {
    if (operation.disposition !== DISPOSITIONS.ATTACHED) continue;
    if (typeof operation.after !== 'string') continue;
    const target = path.join(measuredRoot, operation.declaredPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, operation.after, 'utf8');
    attached.push(operation.declaredPath);
  }

  const written = [];
  const base = path.basename(plan.graphPath).replace(/-GRAPH\.json$/, '');
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const dirsTreePath = path.join(outDir, `${base}-Dirs-Tree.json`);
    fs.writeFileSync(dirsTreePath, `${JSON.stringify(plan.dirsTree ?? {}, null, 2)}\n`, 'utf8');
    written.push(dirsTreePath);

    const tablePath = correspondencePath ?? path.join(outDir, `${base}-CORRESPONDENCE.md`);
    fs.mkdirSync(path.dirname(tablePath), { recursive: true });
    fs.writeFileSync(tablePath, renderCorrespondenceReport(plan), 'utf8');
    written.push(tablePath);
  }

  if (candidatePath) {
    fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
    fs.writeFileSync(
      candidatePath,
      `${JSON.stringify(buildHeaderCandidate(plan, { language: plan.language ?? 'rust' }), null, 2)}\n`,
      'utf8',
    );
    written.push(candidatePath);
  }

  return { attached, written, inventoryBefore, inventoryAfter: buildFileInventory(measuredRoot) };
}

/**
 * The gate results as the Markdown a human or an AI reads before deciding anything.
 *
 * The counts lead, then one line per declared file, because a reader acts on the file and
 * not on the total.
 *
 * @param {object} plan
 * @returns {string}
 */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function renderCorrespondenceReport(plan) {
  const { gates, correspondence } = plan;
  const status = Object.values(gates).every((gate) => gate.status === GATE_STATUS.PASS)
    ? GATE_STATUS.PASS
    : GATE_STATUS.FAIL;
  const countOf = (disposition) => correspondence.filter((row) => row.disposition === disposition).length;

  const lines = [
    '# B1 through B3 — reverse boundify',
    '',
    `**${status}** — ${correspondence.length} declared file(s), ${countOf(DISPOSITIONS.ATTACHED)} header(s) to attach, `
    + `${countOf(DISPOSITIONS.PRESERVED)} already carrying one, ${countOf(DISPOSITIONS.ABSENT)} not generated.`,
    '',
    `Measured tree: \`${plan.root}\``,
    '',
    '## Reasons',
    '',
  ];

  for (const gate of Object.values(gates)) {
    for (const reason of gate.reasons) lines.push(`- ${gate.gateId}: ${reason}`);
  }

  lines.push('', `## Correspondence (${correspondence.length})`, '');
  if (correspondence.length === 0) {
    lines.push('None.', '');
  } else {
    for (const row of correspondence) {
      const node = row.originatingNodeId ? ` — node ${row.originatingNodeId}` : '';
      lines.push(`- \`${row.disposition}\` ${row.declaredPath}${node}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * The candidate document `run.mjs oracle compare --stage headers` reads.
 *
 * The comparison set is the files that carry a header after the run, which is what the
 * oracle counts: a file the analysis gave a header to, and one it left alone, are the same
 * answer to "does a generated header land on a file that has one?".
 *
 * @param {object} plan
 * @param {{language?: string}} [options]
 * @returns {{stage: string, corpus: object, entries: string[], unobserved: Array<object>}}
 */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function buildHeaderCandidate(plan, { language = 'rust' } = {}) {
  const entries = plan.correspondence
    .filter((row) => row.disposition === DISPOSITIONS.ATTACHED || row.disposition === DISPOSITIONS.PRESERVED)
    .map((row) => row.declaredPath)
    .sort();

  return { stage: 'headers', corpus: { language }, entries, unobserved: [] };
}

/**
 * The forward builder is the one definition of the tree shape, so reverse mode calls it
 * rather than re-deriving the tree.
 *
 * `--dry-run --json` prints the Dirs-Tree and writes nothing, which is what makes a reverse
 * run safe to point at a graph stored beside the answer key.
 *
 * @param {string} graphPath
 * @returns {object}
 */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function loadDirsTreeFromForward(graphPath) {
  const result = spawnSync(process.execPath, [FORWARD_BUILDER, `--graph=${graphPath}`, '--dry-run', '--json'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `the forward builder could not derive a Dirs-Tree from ${graphPath} (exit ${result.status}): `
      + `${(result.stderr || result.stdout || '').trim()}`,
    );
  }
  return JSON.parse(result.stdout);
}

/** Read a JSON document, letting the caller turn a parse failure into the CLI's error template. */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Parse the CLI arguments. */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const read = (prefix) => argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? null;

  return {
    graphPath: read(GRAPH_ARG_PREFIX),
    root: read(ROOT_ARG_PREFIX),
    dirsTreePath: read(DIRS_TREE_ARG_PREFIX),
    outDir: read(OUT_ARG_PREFIX),
    correspondencePath: read(CORRESPONDENCE_ARG_PREFIX),
    candidatePath: read(CANDIDATE_ARG_PREFIX),
    apply: argv.includes('--apply'),
    json: argv.includes('--json'),
  };
}

// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function printUsage() {
  process.stderr.write(
    'Usage: node reverse-boundify.js --graph=<path> --root=<path> [--dirs-tree=<path>]\n'
    + '                              [--out=<dir>] [--correspondence=<path>] [--candidate=<path>] [--apply] [--json]\n',
  );
}

/** Read the Dirs-Tree the run describes, from the file given or from the forward builder. */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function resolveDirsTree(options, graphPath) {
  return options.dirsTreePath ? readJson(path.resolve(options.dirsTreePath)) : loadDirsTreeFromForward(graphPath);
}

/** Write the artefacts a run produced, without touching the measured tree. */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function writePlanArtefacts(plan, options) {
  return applyReverseBoundify({ ...plan, operations: [] }, {
    root: plan.root,
    outDir: options.outDir ? path.resolve(options.outDir) : null,
    correspondencePath: options.correspondencePath ? path.resolve(options.correspondencePath) : null,
    candidatePath: options.candidatePath ? path.resolve(options.candidatePath) : null,
  });
}

/** Report what the run did, in the order the decisions were taken. */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function reportOutcome(plan, options) {
  if (options.apply) {
    const result = applyReverseBoundify(plan, {
      root: plan.root,
      outDir: options.outDir ? path.resolve(options.outDir) : null,
      correspondencePath: options.correspondencePath ? path.resolve(options.correspondencePath) : null,
      candidatePath: options.candidatePath ? path.resolve(options.candidatePath) : null,
    });
    const b1 = assertNoNewFiles(result.inventoryBefore, result.inventoryAfter);
    process.stdout.write(`Attached ${result.attached.length} header(s). B1 — ${b1.status}.\n`);
    for (const reason of b1.reasons) process.stdout.write(`- ${reason}\n`);
    return b1.status === GATE_STATUS.PASS;
  }

  if (options.outDir || options.candidatePath || options.correspondencePath) {
    const result = writePlanArtefacts(plan, options);
    process.stdout.write(`Planned only: nothing was written to the measured tree. Wrote ${result.written.length} artefact(s).\n`);
    return true;
  }

  process.stdout.write('Planned only: nothing was written. Pass --apply to attach the headers.\n');
  return true;
}

// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.graphPath || !options.root) {
    printUsage();
    process.exit(EXIT_CODES.USAGE);
  }

  const graphPath = path.resolve(options.graphPath);
  const root = path.resolve(options.root);

  let dirsTree;
  try {
    dirsTree = resolveDirsTree(options, graphPath);
  } catch (error) {
    process.stderr.write(formatError(
      `the Dirs-Tree could not be read: ${error.message}`,
      'the run cannot describe a tree it cannot see',
      'check --dirs-tree, or drop it so the forward builder derives the tree from --graph',
    ));
    process.stderr.write('\n');
    process.exit(EXIT_CODES.FAIL);
  }

  const plan = planReverseBoundify({ dirsTree, root, graphPath });
  process.stdout.write(`${renderCorrespondenceReport(plan)}\n`);

  const applied = reportOutcome(plan, options);
  const failed = !applied || Object.values(plan.gates).some((gate) => gate.status === GATE_STATUS.FAIL);
  process.exit(failed ? EXIT_CODES.FAIL : EXIT_CODES.OK);
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_EXCLUDED_DIRS,
  DISPOSITIONS,
  EXIT_CODES,
  GATE_STATUS,
  applyReverseBoundify,
  buildFileInventory,
  buildHeaderCandidate,
  formatError,
  loadDirsTreeFromForward,
  parseArguments,
  planReverseBoundify,
  renderCorrespondenceReport,
  resolveExistingFile,
  walkDirsTree,
};
