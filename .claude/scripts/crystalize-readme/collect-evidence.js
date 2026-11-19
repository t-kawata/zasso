#!/usr/bin/env node

/**
 * collect-evidence.js — deterministic evidence for the boundary contract.
 *
 * Everything here is recomputed from the repository. Nothing is stored unless it
 * cannot be recomputed. The declared surface comes from the RFC code fences;
 * the implemented surface is advisory and never silently skipped.
 */

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { pathToFileURL } = require('url');

const { resolveGraphPath } = require('../lib/resolve-graph-path.js');
const { fromHomeRelative } = require('../lib/path-utils');
const { parseRustSourceSurface } = require('./parse-rust-source-surface.js');
const { parseLanguageSurface } = require('./parse-language-surface.js');

const SKIP_DIRECTORIES = new Set(['node_modules', 'target', 'dist', '.git']);

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function digestIfExists(file) {
  const text = readIfExists(file);
  return text === null ? null : sha256(text);
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function walk(directory, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function listExamples(packageRoot, examplesDir) {
  const directory = examplesDir || path.join(packageRoot, 'examples');
  return walk(directory)
    .sort()
    .map((file) => ({ path: file, digest: digestIfExists(file) }));
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function normalizeDeclaredSurface(parsed) {
  if (Array.isArray(parsed)) return { items: parsed, unparsed: [] };
  if (!parsed || typeof parsed !== 'object') return { items: [], unparsed: [] };
  const items = [];
  for (const value of Object.values(parsed)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry && typeof entry === 'object' && typeof entry.name === 'string') items.push(entry);
      }
    }
  }
  return { items, unparsed: Array.isArray(parsed.unparsed) ? parsed.unparsed : [] };
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
async function parseDeclaredSurface(sourceText, packageRoot, sourceFile) {
  try {
    const modulePath = path.resolve(__dirname, '../api-consistency/parse-rust-surface.mjs');
    const module = await import(pathToFileURL(modulePath).href);
    const parsed = module.parseRustSurface({
      rfcText: sourceText,
      packageId: path.basename(packageRoot),
      rfcPath: sourceFile,
    });
    return normalizeDeclaredSurface(parsed);
  } catch (error) {
    return { items: [], unparsed: [{ reason: error.message }] };
  }
}

/**
 * Decide whether a ticket's spec belongs to this package.
 *
 * A path under packageRoot is the strongest evidence. When the ticket declares
 * no paths, a unit id mention is accepted. Anything else is excluded: including
 * an unrelated package's spec contaminates the evidence digest.
 *
 * @param {object} ticket
 * @param {{packageRoot: string, workspaceRoot?: string, unitId?: string|null}} scope
 * @returns {boolean}
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function ticketMatchesPackage(ticket, { packageRoot, workspaceRoot = packageRoot, unitId = null }) {
  const files = Array.isArray(ticket.default_files) ? ticket.default_files : [];
  if (files.length > 0) {
    return files.some((file) => {
      const expanded = fromHomeRelative(file);
      const resolved = path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(workspaceRoot, expanded);
      return resolved === packageRoot || resolved.startsWith(`${packageRoot}${path.sep}`);
    });
  }
  if (unitId && JSON.stringify(ticket).includes(unitId)) return true;
  return false;
}

/**
 * Digest the package-level evidence set so two runs can be compared.
 *
 * @param {Object<string,string>} digests
 * @returns {string}
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function computePackageDigest(digests) {
  return sha256(JSON.stringify(Object.keys(digests).sort().map((key) => [key, digests[key]])));
}

/**
 * Collect one package's evidence.
 *
 * @param {{packageRoot: string, workspaceRoot?: string, graphPath?: string,
 *   sourceFile?: string, ticketsPath?: string, examplesDir?: string, unitId?: string}} input
 * @returns {Promise<object>}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
async function collectEvidence(input = {}) {
  const {
    packageRoot,
    workspaceRoot = packageRoot,
    graphPath = null,
    sourceFile = null,
    ticketsPath = null,
    examplesDir = null,
    unitId = null,
  } = input;
  const resolvedPackageRoot = path.resolve(packageRoot);
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const graphResolution = graphPath
    ? { path: graphPath, reason: 'FOUND' }
    : resolveGraphPath(packageRoot);
  const resolvedGraph = graphResolution.path;
  const graphText = resolvedGraph ? readIfExists(resolvedGraph) : null;
  let graph = {};
  let graphError = null;
  try {
    graph = graphText ? JSON.parse(graphText) : {};
  } catch (error) {
    graphError = error.message;
  }

  const resolvedSource = sourceFile
    || graph.sourceFile
    || path.join(packageRoot, 'RFC.md');
  const sourceText = readIfExists(resolvedSource) || '';

  const examples = listExamples(packageRoot, examplesDir);
  const specDigests = [];
  let ticketError = null;
  if (ticketsPath) {
    const ticketsText = readIfExists(ticketsPath);
    if (ticketsText) {
      try {
        const tickets = JSON.parse(ticketsText);
        for (const phase of tickets.phases || []) {
          for (const ticket of phase.tickets || []) {
            if (typeof ticket.specPath !== 'string') continue;
            if (!ticketMatchesPackage(ticket, {
              packageRoot: resolvedPackageRoot,
              workspaceRoot: resolvedWorkspaceRoot,
              unitId,
            })) continue;
            const specFile = path.resolve(fromHomeRelative(ticket.specPath));
            specDigests.push({ ticket: ticket.id, path: specFile, digest: digestIfExists(specFile) });
          }
        }
      } catch (error) {
        ticketError = error.message;
      }
    }
  }

  const declaredSurface = await parseDeclaredSurface(sourceText, packageRoot, resolvedSource);
  const implementedSurface = parseRustSourceSurface({ root: packageRoot });
  const languageSurface = parseLanguageSurface({ root: packageRoot });

  const digests = {
    graph: graphText ? sha256(graphText) : sha256('missing-graph'),
    source: sha256(sourceText),
    seed: digestIfExists(path.join(packageRoot, 'RFC-SEED.md')),
    obligation: digestIfExists(path.join(packageRoot, 'OBLIGATION.json')),
    stepContracts: digestIfExists(path.join(packageRoot, 'RFC-STEP-CONTRACTS.json')),
    specs: sha256(JSON.stringify(specDigests)),
    examples: sha256(JSON.stringify(examples)),
  };

  return {
    packageRoot,
    workspaceRoot,
    graphPath: resolvedGraph,
    sourceFile: resolvedSource,
    graph,
    graphError,
    ticketError,
    digests,
    packageDigest: computePackageDigest(digests),
    declaredSurface,
    implementedSurface,
    languageSurface,
    examples,
    specs: specDigests,
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const fieldArg = argv.find((arg) => arg.startsWith('--field='));
  const field = fieldArg ? fieldArg.slice('--field='.length) : null;
  const packageRoot = argv.find((arg) => !arg.startsWith('--')) || process.cwd();
  collectEvidence({ packageRoot })
    .then((evidence) => {
      if (field) {
        if (!(field in evidence)) {
          console.error(`[ERROR] Unknown field: ${field}`);
          console.error('Cause: the requested field is not part of the evidence bundle');
          console.error('Action: Use --field=packageDigest or omit --field for the full bundle.');
          process.exit(2);
        }
        process.stdout.write(`${evidence[field]}\n`);
        return;
      }
      process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    })
    .catch((error) => {
      console.error(`[ERROR] Evidence collection failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  sha256,
  computePackageDigest,
  ticketMatchesPackage,
  collectEvidence,
  parseDeclaredSurface,
  normalizeDeclaredSurface,
  listExamples,
};
