#!/usr/bin/env node

// PX-336: print the semantic implementation brief for one graph node.
//
// The brief is assembled from graph, view, step-contract sidecar and (optionally) the
// allocate manifest. This CLI only loads those files and prints; the builder holds the
// rules. It never writes an artifact and never paraphrases a contract fact.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildNodeBrief, verifyNodeContracts } from './lib/node-contracts.mjs';

/** The default graph file in a canonical package directory. */
const DEFAULT_GRAPH = 'RFC-GRAPH.json';

/** The default view file in a canonical package directory. */
const DEFAULT_VIEW = 'SEQUENCES.json';

/** The default step-contract sidecar in a canonical package directory. */
const DEFAULT_STEP_CONTRACTS = 'RFC-STEP-CONTRACTS.json';

/** The default maximum facts printed per axis. */
const DEFAULT_MAX_FACTS = 6;

/** Extract `--name=value` and bare `--name` flags. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const options = { verify: false, id: null, graph: DEFAULT_GRAPH, view: DEFAULT_VIEW, stepContracts: DEFAULT_STEP_CONTRACTS, registry: null, maxFacts: DEFAULT_MAX_FACTS };
  for (const argument of argv) {
    if (argument === '--verify') {
      options.verify = true;
    } else if (argument.startsWith('--id=')) {
      options.id = argument.slice('--id='.length);
    } else if (argument.startsWith('--graph=')) {
      options.graph = argument.slice('--graph='.length);
    } else if (argument.startsWith('--view=')) {
      options.view = argument.slice('--view='.length);
    } else if (argument.startsWith('--step-contracts=')) {
      options.stepContracts = argument.slice('--step-contracts='.length);
    } else if (argument.startsWith('--registry=')) {
      options.registry = argument.slice('--registry='.length);
    } else if (argument.startsWith('--max-facts=')) {
      const value = Number(argument.slice('--max-facts='.length));
      if (Number.isInteger(value) && value > 0) options.maxFacts = value;
    }
  }
  return options;
}

/** A named failure with the code the CLI prints. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function cliError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** Read and parse one JSON artifact. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function readJson(filePath, code, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw cliError(code, `${label} is not readable: ${filePath} (${error.message})`);
  }
}

/** Print one named failure and return the CLI exit code. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function printFailure(error, { markdown = false } = {}) {
  const code = error.code ?? 'BRIEF_FAILED';
  if (markdown) process.stdout.write(`## UNAVAILABLE\n- ${code}: ${error.message}\n`);
  process.stderr.write(`${code}: ${error.message}\n`);
  return 1;
}

/** The source line the PROOF section carries. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function sourceLine(options) {
  const registry = options.registry === null ? 'not supplied' : options.registry;
  return `graph=${options.graph}, view=${options.view}, stepContracts=${options.stepContracts}, registry=${registry}`;
}

/** The run mode that verifies the closure instead of printing a brief. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function runVerify(options) {
  let graph;
  let view;
  let stepContracts;
  let registry;
  try {
    graph = readJson(options.graph, 'MISSING_GRAPH', 'graph');
    view = readJson(options.view, 'MISSING_VIEW', 'view');
    stepContracts = readJson(options.stepContracts, 'MISSING_STEP_CONTRACTS', 'step contract sidecar');
    registry = options.registry === null ? null : readJson(options.registry, 'MISSING_REGISTRY', 'allocate manifest');
  } catch (error) {
    const verdict = { ok: false, findings: [{ code: error.code ?? 'BRIEF_FAILED', subject: '', message: error.message }] };
    process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
    return 1;
  }
  const verdict = verifyNodeContracts({ graph, view, stepContracts, registry });
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
  return verdict.ok ? 0 : 1;
}

/** The run mode that prints one brief per requested node. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function runBrief(options) {
  if (options.id === null || options.id.trim().length === 0) {
    throw cliError('MISSING_NODE_ID', '--id=Nxxxx is required');
  }
  const graph = readJson(options.graph, 'MISSING_GRAPH', 'graph');
  const view = readJson(options.view, 'MISSING_VIEW', 'view');
  const stepContracts = readJson(options.stepContracts, 'MISSING_STEP_CONTRACTS', 'step contract sidecar');
  const registry = options.registry === null ? null : readJson(options.registry, 'MISSING_REGISTRY', 'allocate manifest');
  const nodeIds = options.id.split(',').map((value) => value.trim()).filter((value) => value.length > 0);
  const briefs = nodeIds.map((nodeId) => buildNodeBrief({
    graph,
    view,
    stepContracts,
    registry,
    nodeId,
    options: {
      maxFactsPerAxis: options.maxFacts,
      sources: sourceLine(options),
    },
  }));
  process.stdout.write(briefs.join('\n---\n'));
  return 0;
}

/** Entry point. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  try {
    return options.verify ? runVerify(options) : runBrief(options);
  } catch (error) {
    return printFailure(error, { markdown: !options.verify });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}

export { main, parseArguments };
