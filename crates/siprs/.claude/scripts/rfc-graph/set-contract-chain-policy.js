#!/usr/bin/env node

/**
 * set-contract-chain-policy.js — the sanctioned writer of the graph chain policy.
 *
 * A graph declares whether its non-registry edge contracts are state transitions. The
 * writer is atomic and idempotent: every other field is preserved, an existing explicit
 * value is never replaced without --force, and --check reports without writing.
 *
 * Usage:
 *   node set-contract-chain-policy.js --graph=<path> --policy=<transition|obligation> [--force] [--check] [--json]
 *   node set-contract-chain-policy.js --workspace=<root> --policy=<transition|obligation> [--force] [--check] [--json]
 *
 * [::TICKET::] PX-346: explicit contract-chain policy.
 */

const fs = require('fs');
const path = require('path');
const { validateAgainstSchema } = require('./schema/validate.js');
const { atomicWrite } = require('./crud.js');
const {
  POLICY_FIELD,
  POLICY_VALUES,
  chainPolicyOf,
} = require('../tickets/lib/contract-chain.js');

const TREE_MANIFEST_FILE = 'WORKSPACIFY-TREE-MANIFEST.json';
const GRAPH_FILE = 'RFC-GRAPH.json';
const GRAPH_SCHEMA_FILE = 'graph.schema.json';
const JSON_INDENT = 2;

/**
 * Parse `--name=value` or `--name value`.
 *
 * @param {string[]} argv
 * @returns {{graphPath: string|null, workspaceRoot: string|null, policy: string|null,
 *   force: boolean, check: boolean, json: boolean}}
 */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function parseArgs(argv = process.argv.slice(2)) {
  const options = { graphPath: null, workspaceRoot: null, policy: null, force: false, check: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--force') { options.force = true; continue; }
    if (argument === '--check') { options.check = true; continue; }
    if (argument === '--json') { options.json = true; continue; }
    const equals = argument.indexOf('=');
    const name = equals === -1 ? argument : argument.slice(0, equals);
    const value = equals === -1 ? argv[index + 1] : argument.slice(equals + 1);
    if (equals === -1 && value !== undefined) index += 1;
    if (name === '--graph') options.graphPath = path.resolve(value);
    if (name === '--workspace') options.workspaceRoot = path.resolve(value);
    if (name === '--policy') options.policy = value;
  }
  return options;
}

/**
 * Serialize with the graph's existing two-space layout and trailing-newline convention.
 *
 * @param {object} value
 * @param {string} originalText
 * @returns {string}
 */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function serializeWithOriginalLayout(value, originalText) {
  const body = JSON.stringify(value, null, JSON_INDENT);
  return originalText.endsWith('\n') ? body + '\n' : body;
}

/**
 * Validate the requested policy before touching a graph.
 *
 * @param {string} policy
 * @throws {Error} With code INVALID_CONTRACT_CHAIN_POLICY
 */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function assertPolicyValue(policy) {
  if (!POLICY_VALUES.includes(policy)) {
    const error = new Error('--policy must be one of ' + POLICY_VALUES.join('|') + '; got ' + JSON.stringify(policy));
    error.code = 'INVALID_CONTRACT_CHAIN_POLICY';
    throw error;
  }
}

/**
 * Set the policy on one graph.
 *
 * @param {{graphPath: string, policy: string, force?: boolean, check?: boolean}} options
 * @returns {{graphPath: string, changed: boolean, policy: string}}
 * @throws {Error} INVALID_CONTRACT_CHAIN_POLICY | POLICY_CONFLICT | schema failure
 */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function assertNoPolicyConflict({ graphPath, current, policy, force }) {
  if (current === undefined || current === policy || force) return;
  const error = new Error('POLICY_CONFLICT: ' + graphPath + ' already declares ' + current);
  error.code = 'POLICY_CONFLICT';
  throw error;
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function setContractChainPolicy({ graphPath, policy, force = false, check = false }) {
  assertPolicyValue(policy);
  const originalText = fs.readFileSync(graphPath, 'utf8');
  const graph = JSON.parse(originalText);
  const current = graph[POLICY_FIELD];

  // Validate an existing value even when it is not the requested one: a typo in a
  // graph must surface as a named failure, never as a silent overwrite.
  chainPolicyOf(graph);
  if (current === policy) return { graphPath, changed: false, policy };
  assertNoPolicyConflict({ graphPath, current, policy, force });

  const next = { ...graph, [POLICY_FIELD]: policy };
  const validation = validateAgainstSchema(next, GRAPH_SCHEMA_FILE);
  if (!validation.valid) {
    const error = new Error('GRAPH_SCHEMA_INVALID: ' + graphPath + '\n' + validation.errors.join('\n'));
    error.code = 'GRAPH_SCHEMA_INVALID';
    throw error;
  }
  if (!check) atomicWrite(graphPath, serializeWithOriginalLayout(next, originalText));
  return { graphPath, changed: true, policy };
}

/**
 * Every package graph a workspace manifest names.
 *
 * @param {string} workspaceRoot
 * @returns {Array<{package: string, graphPath: string, exists: boolean}>}
 * @throws {Error} MISSING_TREE_MANIFEST
 */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function packageGraphPaths(workspaceRoot) {
  const manifestPath = path.join(workspaceRoot, TREE_MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    const error = new Error('MISSING_TREE_MANIFEST: ' + manifestPath);
    error.code = 'MISSING_TREE_MANIFEST';
    throw error;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const packages = manifest.workspace?.packages ?? [];
  return packages.map((pkg) => {
    const graphPath = path.join(workspaceRoot, pkg.path, GRAPH_FILE);
    return { package: pkg.id, graphPath, exists: fs.existsSync(graphPath) };
  });
}

/**
 * Set the policy on every graph a workspace manifest names.
 *
 * @param {{workspaceRoot: string, policy: string, force?: boolean, check?: boolean}} options
 * @returns {{workspaceRoot: string, packages: Array<object>}}
 */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function setContractChainPolicyForWorkspace({ workspaceRoot, policy, force = false, check = false }) {
  assertPolicyValue(policy);
  const entries = packageGraphPaths(workspaceRoot);

  // Preflight every graph before the first write. A conflict in the last package must
  // not leave the earlier packages half-migrated.
  for (const entry of entries.filter((candidate) => candidate.exists)) {
    const graph = JSON.parse(fs.readFileSync(entry.graphPath, 'utf8'));
    chainPolicyOf(graph);
    assertNoPolicyConflict({ graphPath: entry.graphPath, current: graph[POLICY_FIELD], policy, force });
  }

  const packages = entries.map((entry) => {
    if (!entry.exists) return { ...entry, changed: false, skipped: 'MISSING_GRAPH' };
    return { ...entry, ...setContractChainPolicy({ graphPath: entry.graphPath, policy, force, check }) };
  });
  return { workspaceRoot, packages };
}

/** Print one report, JSON or Markdown. */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function report(result, json) {
  if (json) {
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }
  const entries = result.packages ?? [result];
  for (const entry of entries) {
    const label = entry.package ? entry.package + ' ' + entry.graphPath : entry.graphPath;
    process.stdout.write((entry.changed ? 'changed ' : 'unchanged ') + label + ' -> ' + entry.policy + '\n');
  }
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-346 --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const hasGraph = options.graphPath !== null;
  const hasWorkspace = options.workspaceRoot !== null;
  if (hasGraph === hasWorkspace) {
    console.error('[ERROR] choose exactly one of --graph=<path> or --workspace=<root>');
    console.error('Cause: the writer must know whether it updates one graph or a workspace');
    console.error('Action: re-run with --graph=<path> or --workspace=<root>');
    return 2;
  }
  try {
    const result = hasGraph
      ? setContractChainPolicy(options)
      : setContractChainPolicyForWorkspace(options);
    report(result, options.json);
    return 0;
  } catch (error) {
    console.error('[ERROR] ' + error.code + ': ' + error.message);
    console.error('Cause: the graph policy write was refused');
    console.error('Action: fix the graph or pass a valid policy; use --force only to replace an explicit value');
    return 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = {
  parseArgs,
  serializeWithOriginalLayout,
  setContractChainPolicy,
  setContractChainPolicyForWorkspace,
  packageGraphPaths,
};
