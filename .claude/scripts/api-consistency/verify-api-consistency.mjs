#!/usr/bin/env node
/**
 * verify-api-consistency.mjs --workspace=<root> [--json]
 *
 * The workspace-wide API surface gate.
 *
 * Every other gate reads structure: headings, node mappings, unit ids, formulas. None of
 * them reads a Rust declaration or a use, so two packages could disagree about a
 * signature and pass every gate. This one builds a workspace symbol table from the RFC
 * code fences and checks that each cross-package use resolves to exactly one declaration
 * with the same shape, and that the consuming package declared the dependency.
 *
 * The gate is read-only and deterministic: it writes no artifact, and two runs over the
 * same workspace produce identical findings.
 *
 * Exit 0 — no blocking finding (unparsed surfaces are advisory).
 * Exit 1 — at least one blocking finding.
 */
import fs from 'node:fs';
import path from 'node:path';

import repairFinding from '../lib/repair-finding.js';
import { digestOfFindings, findingIdentity } from './finding-identity.mjs';
import { parseRustSurface } from './parse-rust-surface.mjs';

const { createFinding } = repairFinding;

const TREE_MANIFEST = 'WORKSPACIFY-TREE-MANIFEST.json';
const ALLOCATE_MANIFEST = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
const RFC_FILENAME = 'RFC.md';
const CRATES_DIRECTORY = 'crates';

/** The declaration kinds whose names are a workspace vocabulary rather than a local one. */
const TYPE_LIKE_KINDS = new Set(['struct', 'trait', 'enum', 'type']);

/** The finding codes, named once so no inline string can drift. */
export const FINDING_CODES = Object.freeze({
  SYMBOL_UNDEFINED: 'SYMBOL_UNDEFINED',
  SYMBOL_DUPLICATE: 'SYMBOL_DUPLICATE',
  ARITY_MISMATCH: 'ARITY_MISMATCH',
  GENERIC_ARITY_MISMATCH: 'GENERIC_ARITY_MISMATCH',
  KIND_MISMATCH: 'KIND_MISMATCH',
  DEPENDENCY_EDGE_MISSING: 'DEPENDENCY_EDGE_MISSING',
  UNPARSED_SURFACE: 'UNPARSED_SURFACE',
});

/** The refusals a workspace that cannot be read produces, named once. */
export const WORKSPACE_CODES = Object.freeze({
  WORKSPACE_UNREADABLE: 'WORKSPACE_UNREADABLE',
  NO_PACKAGE_SURFACE: 'NO_PACKAGE_SURFACE',
  BASELINE_UNREADABLE: 'BASELINE_UNREADABLE',
});

/** The code-pattern refusals carry no findings; this is the empty summary they report. */
const EMPTY_SUMMARY = Object.freeze({
  blocking: 0,
  advisory: 0,
  outOfScopeBlocking: 0,
  newBlocking: 0,
  resolved: 0,
  unresolvedRequired: 0,
});

/** The value of --name=value from argv. */
// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  return inline === undefined ? null : inline.slice(`--${name}=`.length);
}

/** Read one JSON file, or null when it cannot be read. */
// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function readJsonOrNull(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** The packages a workspace names, as `{id, directory}`. */
export function packagesOf(root) {
  // A path that does not exist is not a workspace with no packages; it is a
  // workspace the gate could not read. Returning [] made a typo look clean.
  if (!fs.existsSync(root)) return null;
  const manifest = readJsonOrNull(path.join(root, TREE_MANIFEST));
  const packages = manifest?.workspace?.packages;
  if (Array.isArray(packages) && packages.length > 0) {
    return packages
      .filter((entry) => typeof entry?.path === 'string' && entry.path.length > 0)
      .map((entry) => ({ id: String(entry.id ?? entry.name), directory: path.join(root, entry.path) }));
  }
  const crates = path.join(root, CRATES_DIRECTORY);
  if (!fs.existsSync(crates)) return [];
  return fs.readdirSync(crates, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ id: entry.name, directory: path.join(crates, entry.name) }));
}

/** The declared consumer -> provider pairs, from either manifest. */
export function dependencyPairs(root) {
  const pairs = new Set();
  const tree = readJsonOrNull(path.join(root, TREE_MANIFEST));
  const allocate = readJsonOrNull(path.join(root, ALLOCATE_MANIFEST));
  for (const boundary of tree?.dependencies?.boundaries ?? []) {
    if (boundary?.consumer_package && boundary?.provider_package) {
      pairs.add(`${boundary.consumer_package}|${boundary.provider_package}`);
    }
  }
  for (const contract of allocate?.contract_registry ?? []) {
    if (contract?.consumer_package && contract?.provider_package) {
      pairs.add(`${contract.consumer_package}|${contract.provider_package}`);
    }
  }
  return pairs;
}

/** The shape a declaration compares on. */
// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function shapeOf(declaration) {
  const fields = [...(declaration.fields ?? [])].sort().join(',');
  return `${declaration.kind}|${declaration.genericArity}|${declaration.parameterCount}|${fields}`;
}

/** One finding, in the uniform repair-record shape. */
// [::TICKET::] PX-369, PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-369|PX-372) --for-spec --no-implementation-order`.
function makeFinding(options = {}) {
  const { code, severity, packageId, symbol, rfcPath, root, cause, route } = options;
  const verify = `node "$(git rev-parse --show-toplevel)/.claude/scripts/api-consistency/verify-api-consistency.mjs" --workspace=${root}`;
  const artifact = rfcPath.length > 0 ? rfcPath : path.join(root, RFC_FILENAME);
  const record = createFinding({
    severity,
    code,
    layer: 'api-consistency',
    artifact,
    cause,
    action: `edit ${artifact} so ${symbol} agrees with its declaration (or add the declaration), then run ${verify}`,
    verify,
    route,
  });
  return { ...record, id: findingIdentity({ code, symbol, package: packageId, cause }), package: packageId, symbol };
}

/** Every parse and the package it came from. */
// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function readSurfaces(packages) {
  const surfaces = [];
  for (const pkg of packages) {
    const rfcPath = path.join(pkg.directory, RFC_FILENAME);
    if (!fs.existsSync(rfcPath)) continue;
    surfaces.push({
      packageId: pkg.id,
      rfcPath,
      ...parseRustSurface({ rfcText: fs.readFileSync(rfcPath, 'utf8'), packageId: pkg.id, rfcPath }),
    });
  }
  return surfaces;
}

/**
 * Measure one workspace.
 *
 * @param {{ workspaceRoot: string }} input
 * @returns {{ ok: boolean, findings: object[], summary: {blocking: number, advisory: number} }}
 */
// [::TICKET::] PX-371 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-371 --for-spec --no-implementation-order`.
export function verifyApiConsistency({
  workspaceRoot,
  scope = null,
  baseline = null,
  allowEmptyWorkspace = false,
  requiredResolved = [],
} = {}) {
  const root = path.resolve(workspaceRoot);
  const packages = packagesOf(root);
  if (packages === null) {
    return { ok: false, code: WORKSPACE_CODES.WORKSPACE_UNREADABLE, findings: [], summary: { ...EMPTY_SUMMARY } };
  }
  if (packages.length === 0 && !allowEmptyWorkspace) {
    return { ok: false, code: WORKSPACE_CODES.NO_PACKAGE_SURFACE, findings: [], summary: { ...EMPTY_SUMMARY } };
  }
  const surfaces = readSurfaces(packages);
  const declaredPairs = dependencyPairs(root);

  const declarationsBySymbol = new Map();
  for (const surface of surfaces) {
    for (const declaration of surface.declarations) {
      if (!declarationsBySymbol.has(declaration.symbol)) declarationsBySymbol.set(declaration.symbol, []);
      declarationsBySymbol.get(declaration.symbol).push(declaration);
    }
  }

  const findings = [];
  const seen = new Set();
  const add = (finding) => {
    const key = `${finding.code}|${finding.symbol}|${finding.package}|${finding.cause}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding);
  };

  for (const [symbol, declarations] of declarationsBySymbol) {
    const packagesOfSymbol = [...new Set(declarations.map((entry) => entry.packageId))];
    if (packagesOfSymbol.length < 2) continue;
    // Two packages may each define a free routine named `bind`; a crate's routine
    // names are not a workspace-wide vocabulary. A type name is: a struct and a trait
    // with one name, or two structs with different fields, cannot be one surface.
    if (!declarations.some((entry) => TYPE_LIKE_KINDS.has(entry.kind))) continue;
    const kinds = [...new Set(declarations.map((entry) => entry.kind))];
    const owner = declarations[0];
    if (kinds.length > 1) {
      add(makeFinding({
        code: FINDING_CODES.KIND_MISMATCH, severity: 'blocking', packageId: packagesOfSymbol.join(', '), symbol,
        rfcPath: owner.rfcPath, root, route: 'in-drill',
        cause: `${symbol} is declared as ${kinds.join(' and ')} in ${packagesOfSymbol.join(', ')}`,
      }));
      continue;
    }
    const shapes = [...new Set(declarations.map(shapeOf))];
    if (shapes.length > 1) {
      add(makeFinding({
        code: FINDING_CODES.SYMBOL_DUPLICATE, severity: 'blocking', packageId: packagesOfSymbol.join(', '), symbol,
        rfcPath: owner.rfcPath, root, route: 'in-drill',
        cause: `${symbol} is declared with different shapes in ${packagesOfSymbol.join(', ')}: ${shapes.join(' vs ')}`,
      }));
    }
  }

  for (const surface of surfaces) {
    for (const reference of surface.references) {
      const declarations = declarationsBySymbol.get(reference.symbol) ?? [];
      const local = declarations.some((entry) => entry.packageId === reference.packageId);
      if (local) continue;

      const owners = declarations.filter((entry) => entry.packageId !== reference.packageId);
      if (owners.length === 0) {
        const qualified = reference.symbol.includes('::');
        const typeName = qualified ? reference.symbol.split('::')[0] : reference.symbol;
        // A one-letter capital is a generic parameter the parser could not bind.
        if (qualified && /^[A-Z]$/.test(typeName)) continue;
        const typeOwners = declarationsBySymbol.get(typeName) ?? [];
        // A lowercase left half is a module path (`fs::read`, `mem::take`), not a
        // type whose associated item the workspace must declare. Rust names types
        // in CamelCase and modules in snake_case; that is the distinction available
        // without inference.
        if (qualified && !/^[A-Z]/.test(typeName) && typeOwners.length === 0) continue;
        // A bare unresolved call is a method, an enum variant or a standard-library
        // routine the parser cannot type. Without inference it is not evidence that
        // a workspace symbol is missing; a type use and an associated path are,
        // because the type part is a name the workspace can declare.
        const bareCall = reference.kind === 'call' && !qualified;
        if (bareCall && typeOwners.length === 0) continue;
        const missing = typeOwners.length > 0 ? reference.symbol : typeName;
        add(makeFinding({
          code: FINDING_CODES.SYMBOL_UNDEFINED, severity: 'blocking', packageId: reference.packageId, symbol: missing,
          rfcPath: surface.rfcPath, root, route: 'in-drill',
          cause: `${reference.packageId} references ${missing}, which no package declares`,
        }));
        continue;
      }

      const owner = owners[0];
      if (reference.kind === 'call' && owner.kind === 'fn' && reference.argumentCount !== owner.parameterCount) {
        add(makeFinding({
          code: FINDING_CODES.ARITY_MISMATCH, severity: 'blocking', packageId: reference.packageId, symbol: reference.symbol,
          rfcPath: surface.rfcPath, root, route: 'in-drill',
          cause: `${reference.symbol} is called with ${reference.argumentCount} argument(s) and declared with ${owner.parameterCount} parameter(s)`,
        }));
      }
      if (reference.kind === 'type' && reference.genericArity !== owner.genericArity) {
        add(makeFinding({
          code: FINDING_CODES.GENERIC_ARITY_MISMATCH, severity: 'blocking', packageId: reference.packageId, symbol: reference.symbol,
          rfcPath: surface.rfcPath, root, route: 'in-drill',
          cause: `${reference.symbol} is used with ${reference.genericArity} generic argument(s) and declared with ${owner.genericArity}`,
        }));
      }
      if (!declaredPairs.has(`${reference.packageId}|${owner.packageId}`)) {
        add(makeFinding({
          code: FINDING_CODES.DEPENDENCY_EDGE_MISSING, severity: 'blocking', packageId: reference.packageId, symbol: reference.symbol,
          rfcPath: surface.rfcPath, root, route: 'upstream',
          cause: `${reference.packageId} references ${reference.symbol} owned by ${owner.packageId} with no declared boundary`,
        }));
      }
    }

    for (const entry of surface.unparsed) {
      add(makeFinding({
        code: FINDING_CODES.UNPARSED_SURFACE, severity: 'advisory', packageId: surface.packageId, symbol: entry.reason,
        rfcPath: surface.rfcPath, root, route: 'in-drill',
        cause: `line ${entry.line}: ${entry.reason}`,
      }));
    }
  }

  findings.sort((left, right) => `${left.code}|${left.symbol}|${left.package}`.localeCompare(`${right.code}|${right.symbol}|${right.package}`));
  const scoped = scope === null
    ? findings
    : findings.filter((finding) => String(finding.package).split(/,\s*/).includes(scope));
  const scopedBlocking = scoped.filter((finding) => finding.severity === 'blocking');
  const baselineFindings = Array.isArray(baseline?.findings) ? baseline.findings : null;
  if (baselineFindings !== null && typeof baseline?.digest === 'string'
    && digestOfFindings(baselineFindings) !== baseline.digest) {
    return { ok: false, code: WORKSPACE_CODES.BASELINE_UNREADABLE, findings: [], summary: { ...EMPTY_SUMMARY } };
  }
  const baselineIds = new Set((baselineFindings ?? []).map((finding) => finding.id));
  const currentIds = new Set(scopedBlocking.map((finding) => finding.id));
  const newBlocking = baselineFindings === null
    ? scopedBlocking
    : scopedBlocking.filter((finding) => !baselineIds.has(finding.id));
  const resolved = baselineFindings === null
    ? []
    : [...baselineIds].filter((id) => !currentIds.has(id));
  const unresolvedRequired = requiredResolved.filter((id) => currentIds.has(id));
  const ok = baselineFindings === null
    ? scopedBlocking.length === 0
    : newBlocking.length === 0 && unresolvedRequired.length === 0;
  const allBlocking = findings.filter((finding) => finding.severity === 'blocking').length;

  return {
    ok,
    code: null,
    findings: scoped,
    summary: {
      blocking: scopedBlocking.length,
      advisory: scoped.filter((finding) => finding.severity === 'advisory').length,
      outOfScopeBlocking: allBlocking - scopedBlocking.length,
      newBlocking: newBlocking.length,
      resolved: resolved.length,
      unresolvedRequired: unresolvedRequired.length,
    },
  };
}

/** The CLI entry point. */
export function main(argv = process.argv.slice(2)) {
  const workspaceRoot = argumentFor(argv, 'workspace');
  if (workspaceRoot === null) {
    process.stderr.write('usage: verify-api-consistency.mjs --workspace=<root> [--scope=<pkg>] [--baseline=<path>] [--require-resolved=<id,...>] [--allow-empty-workspace] [--json]\n');
    return 1;
  }

  const scope = argumentFor(argv, 'scope');
  const baselinePath = argumentFor(argv, 'baseline');
  const requireResolved = argumentFor(argv, 'require-resolved');
  const allowEmptyWorkspace = argv.includes('--allow-empty-workspace');

  let baseline = null;
  if (baselinePath !== null) {
    baseline = readJsonOrNull(path.resolve(baselinePath));
    if (baseline !== null && baseline.baseline !== undefined) baseline = baseline.baseline;
    if (baseline === null) {
      const refusal = {
        ok: false,
        code: WORKSPACE_CODES.BASELINE_UNREADABLE,
        findings: [],
        summary: { ...EMPTY_SUMMARY },
      };
      if (argv.includes('--json')) {
        process.stdout.write(`${JSON.stringify(refusal, null, 2)}\n`);
      } else {
        process.stdout.write(`api consistency: ${WORKSPACE_CODES.BASELINE_UNREADABLE}\n`);
      }
      return 2;
    }
  }

  const result = verifyApiConsistency({
    workspaceRoot,
    scope,
    baseline,
    allowEmptyWorkspace,
    requiredResolved: requireResolved === null ? [] : requireResolved.split(',').filter((id) => id.length > 0),
  });
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 1;
  }

  if (result.code !== null) {
    process.stdout.write(`api consistency: ${result.code}\n`);
    return result.ok ? 0 : 1;
  }

  process.stdout.write(`api consistency: ${result.summary.blocking} blocking, ${result.summary.advisory} advisory (${result.summary.outOfScopeBlocking} out of scope, ${result.summary.newBlocking} new, ${result.summary.resolved} resolved)\n`);
  for (const finding of result.findings) {
    process.stdout.write(`[${finding.severity === 'blocking' ? 'ERROR' : 'ADVISORY'}] ${finding.code} ${finding.symbol} (${finding.package})\n  ${finding.cause}\n`);
  }
  return result.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}
