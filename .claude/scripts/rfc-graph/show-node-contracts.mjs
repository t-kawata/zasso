#!/usr/bin/env node

// PX-336, PX-337: print the semantic implementation brief for one graph node.
//
// The package directory is the only input. Every artifact whose name is fixed by
// spec is derived from it, and the registry is the nearest ancestor allocate
// manifest. The builder holds the rules; this CLI only locates, loads and prints.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildNodeBrief, verifyNodeContracts } from './lib/node-contracts.mjs';

const require = createRequire(import.meta.url);
const ARTIFACT_NAMES = require('./lib/artifact-names.json');

/** Extract the flags the minimal CLI accepts. */
// [::TICKET::] PX-336, PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-336|PX-337) --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const options = { verify: false, id: null, registry: null, maxFacts: null };
  for (const argument of argv) {
    if (argument === '--verify') {
      options.verify = true;
    } else if (argument.startsWith('--id=')) {
      options.id = argument.slice('--id='.length);
    } else if (argument.startsWith('--registry=')) {
      options.registry = argument.slice('--registry='.length);
    } else if (argument.startsWith('--max-facts=')) {
      const value = Number(argument.slice('--max-facts='.length));
      if (Number.isInteger(value) && value > 0) options.maxFacts = value;
    } else {
      throw cliError('UNKNOWN_OPTION', `${argument} is not accepted; fixed artifact names are derived from the package directory`);
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

/** The fixed artifact paths of one package directory. */
// [::TICKET::] PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-337 --for-spec --no-implementation-order`.
function resolvePackagePaths(packageDir) {
  return {
    graph: join(packageDir, ARTIFACT_NAMES.graph),
    view: join(packageDir, ARTIFACT_NAMES.view),
    stepContracts: join(packageDir, ARTIFACT_NAMES.stepContracts),
  };
}

/** The nearest ancestor directory that carries the named manifest, or null. */
// [::TICKET::] PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-337 --for-spec --no-implementation-order`.
function findAncestorManifest(startDir, manifestName) {
  let current = resolve(startDir);
  for (;;) {
    const candidate = join(current, manifestName);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
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
// [::TICKET::] PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-337 --for-spec --no-implementation-order`.
function sourceLine(paths) {
  return `graph=${paths.graph}, view=${paths.view}, stepContracts=${paths.stepContracts}, registry=${paths.registry ?? 'not found'}`;
}

/** The run mode that verifies the closure instead of printing a brief. */
// [::TICKET::] PX-336, PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-336|PX-337) --for-spec --no-implementation-order`.
function runVerify() {
  let graph;
  let view;
  let stepContracts;
  try {
    const paths = resolvePackagePaths(process.cwd());
    graph = readJson(paths.graph, 'MISSING_GRAPH', 'graph');
    view = readJson(paths.view, 'MISSING_VIEW', 'view');
    stepContracts = readJson(paths.stepContracts, 'MISSING_STEP_CONTRACTS', 'step contract sidecar');
  } catch (error) {
    const verdict = { ok: false, findings: [{ code: error.code ?? 'BRIEF_FAILED', subject: '', message: error.message }] };
    process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
    return 1;
  }
  const verdict = verifyNodeContracts({ graph, view, stepContracts });
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
  return verdict.ok ? 0 : 1;
}

/** The run mode that prints one brief per requested node. */
// [::TICKET::] PX-336, PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-336|PX-337) --for-spec --no-implementation-order`.
function runBrief(options) {
  if (options.id === null || options.id.trim().length === 0) {
    throw cliError('MISSING_NODE_ID', '--id=Nxxxx is required');
  }
  const packageDir = process.cwd();
  const paths = resolvePackagePaths(packageDir);
  const registryPath = options.registry ?? findAncestorManifest(packageDir, ARTIFACT_NAMES.allocateManifest);
  const graph = readJson(paths.graph, 'MISSING_GRAPH', 'graph');
  const view = readJson(paths.view, 'MISSING_VIEW', 'view');
  const stepContracts = readJson(paths.stepContracts, 'MISSING_STEP_CONTRACTS', 'step contract sidecar');
  const registry = registryPath === null ? null : readJson(registryPath, 'MISSING_REGISTRY', 'allocate manifest');
  const nodeIds = options.id.split(',').map((value) => value.trim()).filter((value) => value.length > 0);
  const briefs = nodeIds.map((nodeId) => buildNodeBrief({
    graph,
    view,
    stepContracts,
    registry,
    nodeId,
    options: {
      ...(options.maxFacts === null ? {} : { maxFactsPerAxis: options.maxFacts }),
      sources: sourceLine({ ...paths, registry: registryPath }),
    },
  }));
  process.stdout.write(briefs.join('\n---\n'));
  return 0;
}

/** Entry point. */
// [::TICKET::] PX-336, PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-336|PX-337) --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    return printFailure(error, { markdown: false });
  }
  try {
    return options.verify ? runVerify() : runBrief(options);
  } catch (error) {
    return printFailure(error, { markdown: !options.verify });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}

export { main, parseArguments, resolvePackagePaths, findAncestorManifest };
