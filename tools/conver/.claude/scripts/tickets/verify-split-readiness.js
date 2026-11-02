#!/usr/bin/env node

/**
 * verify-split-readiness.js — report whether a package can complete /split-to-tickets.
 *
 * The report runs the same read-only gates split reads. It never invokes the split
 * command and never writes an input file. A failing gate is a named BLOCKED finding.
 *
 * Usage:
 *   node verify-split-readiness.js --package=<dir> [--json] [--closure-dry-run]
 *   node verify-split-readiness.js --workspace=<root> [--json] [--closure-dry-run]
 *
 * [::TICKET::] PX-346: split readiness report.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { validateAgainstSchema } = require('../rfc-graph/schema/validate.js');
const { POLICY_FIELD, chainPolicyOf } = require('./lib/contract-chain.js');
const { findAllocateManifest, findSingleSiblingPath } = require('../lib/package-artifacts');

const SCRIPTS_ROOT = path.resolve(__dirname, '..');
const RFC_GRAPH_DIR = path.join(SCRIPTS_ROOT, 'rfc-graph');
const SEQUENCES_DIR = path.join(SCRIPTS_ROOT, 'sequences-slice');
const TREE_MANIFEST_FILE = 'WORKSPACIFY-TREE-MANIFEST.json';
const GRAPHIFY_STEPS = Object.freeze(['0', '1', '2', '3', '4', '5']);
const BOUNDIFY_STEPS = Object.freeze(['0', '1', '2', '3']);

/** Read a JSON document, or null when it is absent or unreadable. */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** The root `*-sequences.json` the split chain gate reads, or null outside a workspace. */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function resolveArtifactPath(packageDir) {
  const allocateManifest = findAllocateManifest(packageDir);
  if (allocateManifest === null) return null;
  return findSingleSiblingPath(path.dirname(allocateManifest), '-sequences.json');
}

/** Every canonical path one package owns. */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function packageContext(packageDir) {
  return {
    packageDir,
    graphPath: path.join(packageDir, 'RFC-GRAPH.json'),
    dirsTreePath: path.join(packageDir, 'RFC-Dirs-Tree.json'),
    viewPath: path.join(packageDir, 'SEQUENCES.json'),
    ticketsPath: path.join(packageDir, 'Tickets.json'),
    graphifyStatusPath: path.join(packageDir, 'RFC-GRAPHIFY-Status.json'),
    boundifyStatusPath: path.join(packageDir, 'RFC-BOUNDIFY-Status.json'),
    splitStatusPath: path.join(packageDir, 'RFC-SPLIT-Status.json'),
    artifactPath: resolveArtifactPath(packageDir),
  };
}

/** The default gate runner: one child process, read-only. */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function defaultRunGate({ script, args, cwd }) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  if (result.status === 0) return { ok: true };
  const detail = (result.stderr || result.stdout || '').trim().split('\n')[0];
  return { ok: false, detail: detail || 'exit ' + result.status };
}

/** Whether every named step is done. */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function stepsAreDone(status, expectedSteps) {
  if (status === null || typeof status.steps !== 'object' || status.steps === null) return false;
  return expectedSteps.every((step) => status.steps[step] === 'done');
}

/** The command gates every package runs. */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function commandGates(context, includeTicketGates) {
  const gates = [
    {
      code: 'CONTRACTS_FORMAT_INVALID',
      script: path.join(RFC_GRAPH_DIR, 'verify-contracts-format.js'),
      args: () => ['--graph=' + context.graphPath],
      requires: ['graphPath'],
    },
    {
      code: 'GRAPH_CONTRACT_ERROR',
      script: path.join(__dirname, 'verify-graph-contracts.js'),
      args: () => ['--graph=' + context.graphPath, '--view=' + context.viewPath],
      requires: ['graphPath', 'viewPath'],
    },
    {
      code: 'CHAIN_ERROR',
      script: path.join(SEQUENCES_DIR, 'verify-chain.mjs'),
      args: () => ['--stage=split', '--package=' + context.packageDir]
        .concat(context.artifactPath === null ? [] : ['--artifact=' + context.artifactPath]),
      requires: ['graphPath', 'dirsTreePath', 'viewPath'],
    },
    {
      code: 'SMOOTH_VERDICT_INVALID',
      script: path.join(RFC_GRAPH_DIR, 'verify-smooth-verdict.mjs'),
      args: () => ['--package=' + context.packageDir],
      requires: [],
    },
  ];

  if (includeTicketGates) {
    gates.push(
      {
        code: 'TICKET_CLOSURE_ERROR',
        script: path.join(__dirname, 'verify-ticket-closure.js'),
        args: () => ['--tickets=' + context.ticketsPath, '--graph=' + context.graphPath, '--view=' + context.viewPath],
        requires: ['graphPath', 'viewPath'],
      },
      {
        code: 'TICKET_COVERAGE_ERROR',
        script: path.join(__dirname, 'verify-all-ticket-coverage.js'),
        args: () => [context.ticketsPath],
        requires: ['graphPath', 'viewPath'],
      },
      {
        code: 'IMPLEMENTATION_ORDER_ERROR',
        script: path.join(SEQUENCES_DIR, 'verify-implementation-order.mjs'),
        args: () => ['--package=' + context.packageDir],
        requires: ['graphPath', 'viewPath'],
      },
    );
  }
  return gates;
}

/**
 * Evaluate one package without writing anything.
 *
 * @param {{packageDir: string, packageId?: string, runGate?: Function}} options
 * @returns {{package: string, path: string, policy: string|null, verdict: string,
 *   gates: Array<object>}}
 */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function evaluatePackage({ packageDir, packageId = path.basename(packageDir), runGate = defaultRunGate, closureDryRun = false }) {
  const context = packageContext(packageDir);
  const packageReport = { package: packageId, path: packageDir, policy: null, verdict: 'BLOCKED', gates: [] };
  const add = (code, ok, detail) => {
    packageReport.gates.push({ code, ok, detail: detail ?? null });
  };

  add('GRAPH_MISSING', fs.existsSync(context.graphPath));
  add('DIRS_TREE_MISSING', fs.existsSync(context.dirsTreePath));
  add('SEQUENCES_MISSING', fs.existsSync(context.viewPath));

  const graph = readJson(context.graphPath);
  if (graph === null) {
    add('GRAPH_SCHEMA_INVALID', false, 'RFC-GRAPH.json is missing or unreadable');
  } else {
    const validation = validateAgainstSchema(graph, 'graph.schema.json');
    add('GRAPH_SCHEMA_INVALID', validation.valid, validation.errors?.join('; '));
    // An absent policy is valid for a legacy graph, but the report records that the
    // obligation behavior is a default rather than an author's explicit decision.
    packageReport.policyDefaulted = graph[POLICY_FIELD] === undefined;
    try {
      packageReport.policy = chainPolicyOf(graph);
      add('INVALID_CONTRACT_CHAIN_POLICY', true);
    } catch (error) {
      add(error.code, false, error.message);
    }
  }

  add('GRAPHIFY_INCOMPLETE', stepsAreDone(readJson(context.graphifyStatusPath), GRAPHIFY_STEPS));
  add('BOUNDIFY_INCOMPLETE', stepsAreDone(readJson(context.boundifyStatusPath), BOUNDIFY_STEPS));

  const splitStatus = readJson(context.splitStatusPath);
  const hasSplitError = splitStatus !== null
    && Object.values(splitStatus.steps ?? {}).some((value) => value === 'error');
  add('SPLIT_STATUS_ERROR', !hasSplitError);

  // A run reset before phase design will regenerate Tickets.json at Step 4-1, so the
  // current ticket file is not the state the next split consumes. Checking its
  // prerequisites would report a defect the split itself is about to replace.
  const splitRegeneratesTickets = splitStatus !== null
    && (splitStatus.steps?.['4-1'] !== 'done' || splitStatus.steps?.['5-2'] === 'error');
  packageReport.ticketGates = splitRegeneratesTickets ? 'SKIPPED_REGENERATION' : 'CHECKED';
  if (closureDryRun) {
    packageReport.closureDryRun = splitRegeneratesTickets
      ? 'SKIPPED_REGENERATION'
      : (fs.existsSync(context.ticketsPath) ? 'CURRENT_TICKETS' : 'NO_TICKETS');
  }

  const includeTicketGates = fs.existsSync(context.ticketsPath) && !splitRegeneratesTickets;
  for (const gate of commandGates(context, includeTicketGates)) {
    const ready = gate.requires.every((key) => fs.existsSync(context[key]));
    if (!ready) continue;
    const result = runGate({ script: gate.script, args: gate.args(), cwd: packageDir });
    const code = result.ok ? gate.code : (result.code ?? gate.code);
    add(code, result.ok, result.detail);
  }

  packageReport.verdict = packageReport.gates.every((gate) => gate.ok) ? 'READY' : 'BLOCKED';
  return packageReport;
}

/** Every package a workspace manifest names. */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function workspacePackages(workspaceRoot) {
  const manifest = readJson(path.join(workspaceRoot, TREE_MANIFEST_FILE));
  if (manifest === null) return null;
  return (manifest.workspace?.packages ?? []).map((pkg) => ({
    packageId: pkg.id,
    packageDir: path.join(workspaceRoot, pkg.path),
  }));
}

/**
 * Produce the readiness report for one package or a workspace.
 *
 * @param {{packageDir?: string, workspaceRoot?: string, runGate?: Function}} options
 * @returns {{ok: boolean, packages: Array<object>, findings: Array<object>}}
 */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function verifySplitReadiness({ packageDir, workspaceRoot, runGate = defaultRunGate, closureDryRun = false } = {}) {
  const hasPackage = typeof packageDir === 'string' && packageDir.length > 0;
  const hasWorkspace = typeof workspaceRoot === 'string' && workspaceRoot.length > 0;
  if (hasPackage && hasWorkspace) {
    return {
      ok: false,
      packages: [],
      findings: [{ code: 'AMBIGUOUS_ARGUMENT', package: null, path: null, detail: 'pass --package or --workspace, not both' }],
    };
  }

  let entries;
  if (hasPackage) {
    entries = [{ packageId: path.basename(packageDir), packageDir }];
  } else if (typeof workspaceRoot === 'string' && workspaceRoot.length > 0) {
    entries = workspacePackages(workspaceRoot);
    if (entries === null) {
      return {
        ok: false,
        packages: [],
        findings: [{ code: 'MISSING_TREE_MANIFEST', package: null, path: workspaceRoot, detail: TREE_MANIFEST_FILE + ' is missing' }],
      };
    }
  } else {
    return {
      ok: false,
      packages: [],
      findings: [{ code: 'MISSING_ARGUMENT', package: null, path: null, detail: 'pass --package or --workspace' }],
    };
  }

  const packages = entries.map((entry) => evaluatePackage({ ...entry, runGate, closureDryRun }));
  const findings = packages.flatMap((entry) => entry.gates
    .filter((gate) => !gate.ok)
    .map((gate) => ({ code: gate.code, package: entry.package, path: entry.path, detail: gate.detail })));
  return { ok: findings.length === 0, packages, findings };
}

/** Parse `--name=value` or `--name value`. */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function parseArgs(argv = process.argv.slice(2)) {
  const options = { packageDir: null, workspaceRoot: null, json: false, closureDryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') { options.json = true; continue; }
    if (argument === '--closure-dry-run') { options.closureDryRun = true; continue; }
    const equals = argument.indexOf('=');
    const name = equals === -1 ? argument : argument.slice(0, equals);
    const value = equals === -1 ? argv[index + 1] : argument.slice(equals + 1);
    if (equals === -1 && value !== undefined) index += 1;
    if (name === '--package') options.packageDir = path.resolve(value);
    if (name === '--workspace') options.workspaceRoot = path.resolve(value);
  }
  return options;
}

/** Print the report as JSON or a Markdown table. */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function printReport(report, json) {
  if (json) {
    process.stdout.write(JSON.stringify(report) + '\n');
    return;
  }
  for (const entry of report.packages) {
    process.stdout.write(entry.package + '\t' + entry.verdict + '\t' + (entry.policy ?? '-') + '\n');
  }
  for (const finding of report.findings) {
    process.stdout.write('BLOCKED\t' + finding.code + '\t' + (finding.package ?? '-') + '\t' + (finding.detail ?? '') + '\n');
  }
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const report = verifySplitReadiness(options);
  printReport(report, options.json);
  return report.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = {
  verifySplitReadiness,
  evaluatePackage,
  packageContext,
  parseArgs,
};
