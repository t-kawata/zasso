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

/** The check set this gate runs, carried into the verdict that consumes it. */
export const API_CHECK_SET_VERSION = '2026-11-06.import-scoped.1';

/** The kinds a reference can have after import-scope resolution. */
const IMPORT_KINDS = Object.freeze({
  LOCAL_CRATE: 'local-crate',
  WORKSPACE_EXPLICIT: 'workspace-explicit',
  WORKSPACE_GLOB: 'workspace-glob',
  WORKSPACE_REEXPORT: 'workspace-reexport',
  EXTERNAL: 'external',
  BUILTIN: 'builtin',
  UNSCOPED: 'unscoped',
});

/** The finding codes, named once so no inline string can drift. */
export const FINDING_CODES = Object.freeze({
  SYMBOL_UNDEFINED: 'SYMBOL_UNDEFINED',
  SYMBOL_DUPLICATE: 'SYMBOL_DUPLICATE',
  ARITY_MISMATCH: 'ARITY_MISMATCH',
  GENERIC_ARITY_MISMATCH: 'GENERIC_ARITY_MISMATCH',
  KIND_MISMATCH: 'KIND_MISMATCH',
  DEPENDENCY_EDGE_MISSING: 'DEPENDENCY_EDGE_MISSING',
  UNPARSED_SURFACE: 'UNPARSED_SURFACE',
  UNSCOPED_SYMBOL: 'UNSCOPED_SYMBOL',
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
  unscopedSymbolCount: 0,
  importKinds: {},
  checkSetVersion: API_CHECK_SET_VERSION,
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

/** The crate-name to package-id map, plus names two packages claim. */
// [::TICKET::] PX-382, PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-382|PX-383) --for-spec --no-implementation-order`.
function buildCrateMap(treeManifest) {
  const map = new Map();
  const collisions = new Set();
  for (const pkg of treeManifest?.workspace?.packages ?? []) {
    const rawName = String(pkg?.crate ?? pkg?.name ?? '');
    if (rawName.length === 0) continue;
    const crateName = rawName.replace(/-/g, '_');
    const packageId = String(pkg.id);
    if (map.has(crateName) && map.get(crateName) !== packageId) {
      collisions.add(crateName);
      map.delete(crateName);
      continue;
    }
    map.set(crateName, packageId);
  }
  return { map, collisions };
}

/** Every declaration a package states, keyed by symbol. */
// [::TICKET::] PX-382, PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-382|PX-383) --for-spec --no-implementation-order`.
function buildDeclarationsByPackage(surfaces) {
  const byPackage = new Map();
  for (const surface of surfaces) {
    const table = new Map();
    for (const declaration of surface.declarations) {
      if (!table.has(declaration.symbol)) table.set(declaration.symbol, []);
      table.get(declaration.symbol).push(declaration);
    }
    byPackage.set(surface.packageId, table);
  }
  return byPackage;
}

/** Every package's explicit and glob imports, keyed by alias where it has one. */
// [::TICKET::] PX-382, PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-382|PX-383) --for-spec --no-implementation-order`.
function buildImportsByPackage(surfaces) {
  const byPackage = new Map();
  for (const surface of surfaces) {
    const explicit = new Map();
    const globs = [];
    const moduleAliases = new Map();
    for (const statement of surface.imports ?? []) {
      for (const name of statement.names ?? []) {
        const entry = { ...statement, name: name.name, alias: name.alias };
        const isCrateRoot = name.name === statement.root && statement.modulePath.length <= 1;
        // A glob names a set of symbols, even when the set is a crate root. Treating
        // `use provider::*` as a module alias would leave every name it exposes unscoped.
        if (name.glob || statement.glob) {
          globs.push(entry);
          continue;
        }
        if (isCrateRoot) {
          moduleAliases.set(name.alias, entry);
          continue;
        }
        explicit.set(name.alias, entry);
      }
    }
    byPackage.set(surface.packageId, { explicit, globs, moduleAliases });
  }
  return byPackage;
}

/** The kind a crate root names. */
// [::TICKET::] PX-382, PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-382|PX-383) --for-spec --no-implementation-order`.
function classifyImportRoot(root, crateMap) {
  if (root === 'crate' || root === 'self' || root === 'super') return IMPORT_KINDS.LOCAL_CRATE;
  if (crateMap.collisions.has(root)) return IMPORT_KINDS.UNSCOPED;
  if (crateMap.map.has(root)) return IMPORT_KINDS.WORKSPACE_EXPLICIT;
  if (root === 'std' || root === 'core' || root === 'alloc') return IMPORT_KINDS.BUILTIN;
  return IMPORT_KINDS.EXTERNAL;
}

/** The declarations in a package whose bare name is the referenced symbol. */
// [::TICKET::] PX-382, PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-382|PX-383) --for-spec --no-implementation-order`.
function findGlobCandidates(packageId, symbol, context) {
  const table = context.declarationsByPackage.get(packageId);
  if (table === undefined) return [];
  const candidates = [];
  for (const [declaredSymbol, declarations] of table) {
    if (declaredSymbol.split('::').pop() === symbol) candidates.push(...declarations);
  }
  return candidates;
}

/** Follow a public re-export chain to the declaration a package exposes. */
// [::TICKET::] PX-382, PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-382|PX-383) --for-spec --no-implementation-order`.
function resolveExport(packageId, name, context, visited = new Set()) {
  const key = `${packageId}\u0000${name}`;
  if (visited.has(key)) return null;
  visited.add(key);

  const table = context.declarationsByPackage.get(packageId);
  const declarations = table?.get(name) ?? [];
  if (declarations.length > 0) {
    return { declaration: declarations[0], packageId, ambiguous: declarations.length > 1, via: 'declaration' };
  }

  // A package may re-export a root declaration through a module path
  // (`use doors_operation::provider::ErrorBody`). The declaration lives at the
  // package root, so a last-segment lookup is the mechanical fallback before a
  // path is treated as an associated member.
  const lastSegment = name.split('::').pop();
  if (lastSegment !== name) {
    const rootDeclarations = table?.get(lastSegment) ?? [];
    if (rootDeclarations.length > 0) {
      return { declaration: rootDeclarations[0], packageId, ambiguous: rootDeclarations.length > 1, via: 'declaration' };
    }
  }

  const separator = name.lastIndexOf('::');
  if (separator !== -1) {
    const baseName = name.slice(0, separator);
    const memberName = name.slice(separator + 2);
    const baseAlias = context.importsByPackage.get(packageId)?.moduleAliases?.get(baseName);
    if (baseAlias !== undefined && baseAlias.public === true) {
      const aliasTarget = context.crateMap.map.get(baseAlias.root);
      const aliased = resolveExport(aliasTarget, memberName, context, visited);
      if (aliased !== null) return { ...aliased, via: 'module-reexport' };
    }
    const base = resolveExport(packageId, baseName, context, visited);
    if (base === null) return null;
    const memberTable = context.declarationsByPackage.get(base.packageId);
    const member = memberTable?.get(`${base.declaration.symbol.split('::').pop()}::${memberName}`)?.[0]
      ?? resolveAliasMember(base.declaration, memberName, context);
    return member === undefined || member === null
      ? null
      : { declaration: member, packageId: base.packageId, ambiguous: false, via: base.via };
  }

  const imports = context.importsByPackage.get(packageId);
  const explicit = imports?.explicit.get(name);
  if (explicit !== undefined && explicit.public === true) {
    const kind = classifyImportRoot(explicit.root, context.crateMap);
    if (kind === IMPORT_KINDS.WORKSPACE_EXPLICIT) {
      const targetPackageId = context.crateMap.map.get(explicit.root);
      const resolved = resolveExport(targetPackageId, explicit.name, context, visited);
      if (resolved !== null) return { ...resolved, via: 'reexport' };
    }
  }

  for (const glob of imports?.globs ?? []) {
    if (glob.public !== true) continue;
    if (classifyImportRoot(glob.root, context.crateMap) !== IMPORT_KINDS.WORKSPACE_EXPLICIT) continue;
    const targetPackageId = context.crateMap.map.get(glob.root);
    const candidates = findGlobCandidates(targetPackageId, name, context);
    if (candidates.length === 1) {
      return { declaration: candidates[0], packageId: targetPackageId, ambiguous: false, via: 'reexport' };
    }
  }

  // A facade may re-export a whole module (`pub use crystal_operation as operation;`).
  // A consumer then names `facade::operation::Symbol`; follow the module alias.
  for (const moduleAlias of imports?.moduleAliases?.values() ?? []) {
    if (moduleAlias.public !== true) continue;
    if (classifyImportRoot(moduleAlias.root, context.crateMap) !== IMPORT_KINDS.WORKSPACE_EXPLICIT) continue;
    const targetPackageId = context.crateMap.map.get(moduleAlias.root);
    const resolved = resolveExport(targetPackageId, name, context, visited);
    if (resolved !== null) return { ...resolved, via: 'module-reexport' };
  }
  return null;
}

/** The member declaration of a type alias's target, when the alias names one. */
// [::TICKET::] PX-382, PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-382|PX-383) --for-spec --no-implementation-order`.
function resolveAliasMember(declaration, member, context) {
  if (declaration?.kind !== 'type' || typeof declaration.aliasTarget !== 'string') return null;
  const targetName = declaration.aliasTarget.split('::').pop();
  const target = resolveExport(declaration.packageId, targetName, context);
  if (target === null) return null;
  const memberTable = context.declarationsByPackage.get(target.packageId);
  return memberTable?.get(`${targetName}::${member}`)?.[0] ?? null;
}

/** Resolve one reference through its package's local declarations and imports. */
// [::TICKET::] PX-382, PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-382|PX-383) --for-spec --no-implementation-order`.
function resolveReference(reference, surface, context) {
  const symbol = reference.symbol;
  const base = symbol.split('::')[0];
  const localTable = context.declarationsByPackage.get(surface.packageId);
  if (localTable?.has(symbol) || localTable?.has(base)) {
    return { kind: IMPORT_KINDS.LOCAL_CRATE };
  }

  const imports = context.importsByPackage.get(surface.packageId);
  const moduleAlias = imports?.moduleAliases.get(base);
  if (moduleAlias !== undefined) {
    const targetPackageId = context.crateMap.map.get(moduleAlias.root);
    if (!symbol.includes('::') || targetPackageId === surface.packageId) {
      return { kind: IMPORT_KINDS.LOCAL_CRATE };
    }
    const memberName = symbol.split('::').slice(1).join('::');
    const resolvedMember = resolveExport(targetPackageId, memberName, context);
    if (resolvedMember === null) {
      return { kind: IMPORT_KINDS.UNSCOPED, reason: `module alias ${base} has no member ${memberName}` };
    }
    return {
      kind: IMPORT_KINDS.WORKSPACE_EXPLICIT,
      importedPackageId: targetPackageId,
      declaration: resolvedMember.declaration,
      via: resolvedMember.via,
    };
  }

  const explicit = imports?.explicit.get(base);
  if (explicit !== undefined) {
    const kind = classifyImportRoot(explicit.root, context.crateMap);
    if (kind === IMPORT_KINDS.LOCAL_CRATE || kind === IMPORT_KINDS.EXTERNAL || kind === IMPORT_KINDS.BUILTIN) {
      return { kind };
    }
    if (kind === IMPORT_KINDS.UNSCOPED) {
      return { kind, reason: `crate root ${explicit.root} is ambiguous` };
    }
    const importedPackageId = context.crateMap.map.get(explicit.root);
    if (importedPackageId === surface.packageId) return { kind: IMPORT_KINDS.LOCAL_CRATE };
    const importedPath = [...explicit.modulePath.slice(1), explicit.name].join('::');
    const memberImport = explicit.modulePath.length > 1
      && /^[A-Z]/.test(explicit.modulePath[explicit.modulePath.length - 1]);
    const resolved = resolveExport(importedPackageId, importedPath, context);
    if (resolved === null) {
      if (memberImport) {
        return { kind: IMPORT_KINDS.UNSCOPED, reason: `imported member ${importedPath} is not declared in ${explicit.root}` };
      }
      return { kind: IMPORT_KINDS.WORKSPACE_EXPLICIT, importedPackageId, declaration: null };
    }
    if (resolved.declaration.kind === 'module') return { kind: IMPORT_KINDS.LOCAL_CRATE };
    let member = null;
    if (symbol.includes('::')) {
      const memberName = symbol.split('::').slice(1).join('::');
      const declaredBase = resolved.declaration.symbol.split('::').pop();
      const table = context.declarationsByPackage.get(resolved.packageId);
      member = table?.get(`${declaredBase}::${memberName}`)?.[0] ?? resolveAliasMember(resolved.declaration, memberName, context);
    }
    return {
      kind: IMPORT_KINDS.WORKSPACE_EXPLICIT,
      importedPackageId,
      declaration: member ?? resolved.declaration,
      memberMissing: symbol.includes('::') && member === null,
      via: resolved.via,
    };
  }

  for (const glob of imports?.globs ?? []) {
    // A glob over an external or local module cannot prove where an unresolved name
    // comes from. It stays unresolved and is counted, rather than swallowing every
    // remaining reference as external.
    if (classifyImportRoot(glob.root, context.crateMap) !== IMPORT_KINDS.WORKSPACE_EXPLICIT) continue;
    const targetPackageId = context.crateMap.map.get(glob.root);
    const candidates = findGlobCandidates(targetPackageId, base, context);
    if (candidates.length === 1) {
      return { kind: IMPORT_KINDS.WORKSPACE_GLOB, importedPackageId: targetPackageId, declaration: candidates[0] };
    }
    if (candidates.length > 1) {
      return { kind: IMPORT_KINDS.UNSCOPED, reason: `ambiguous glob import ${glob.root}` };
    }
  }

  return { kind: IMPORT_KINDS.UNSCOPED, reason: `no declaration or import for ${base}` };
}

/** A name the package both imports and declares locally must agree with the import. */
// [::TICKET::] PX-382, PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-382|PX-383) --for-spec --no-implementation-order`.
function collectShadowConflicts(surface, context, add, root) {
  const localTable = context.declarationsByPackage.get(surface.packageId);
  const imports = context.importsByPackage.get(surface.packageId);
  for (const [alias, importEntry] of imports?.explicit ?? []) {
    const local = localTable?.get(alias) ?? [];
    if (local.length === 0) continue;
    if (classifyImportRoot(importEntry.root, context.crateMap) !== IMPORT_KINDS.WORKSPACE_EXPLICIT) continue;
    const targetPackageId = context.crateMap.map.get(importEntry.root);
    const target = resolveExport(targetPackageId, importEntry.name, context);
    if (target === null) continue;
    const imported = target.declaration;
    const localAliasesImported = local.every((entry) => entry.kind === 'type'
      && typeof entry.aliasTarget === 'string'
      && entry.aliasTarget.split('::').pop() === importEntry.name);
    if (localAliasesImported) continue;
    const localKinds = [...new Set(local.map((entry) => entry.kind))];
    if (!localKinds.includes(imported.kind)) {
      add(makeFinding({
        code: FINDING_CODES.KIND_MISMATCH, severity: 'blocking', packageId: surface.packageId, symbol: alias,
        rfcPath: surface.rfcPath, root, route: 'in-drill',
        cause: `${alias} is imported as ${imported.kind} from ${importEntry.root} (${targetPackageId}) and declared as ${localKinds.join(' and ')} in ${surface.packageId}`,
      }));
      continue;
    }
    const localShapes = [...new Set(local.map(shapeOf))];
    const importedShape = shapeOf(imported);
    if (localShapes.some((shape) => shape !== importedShape)) {
      add(makeFinding({
        code: FINDING_CODES.SYMBOL_DUPLICATE, severity: 'blocking', packageId: surface.packageId, symbol: alias,
        rfcPath: surface.rfcPath, root, route: 'in-drill',
        cause: `${alias} is imported from ${importEntry.root} (${targetPackageId}) with shape ${importedShape} and declared with ${localShapes.join(' vs ')} in ${surface.packageId}`,
      }));
    }
  }
}

/** The check-set version a verdict records, or null for a legacy verdict. */
export function recordedCheckSetVersion(verdict) {
  const version = verdict?.checkSetVersion;
  return typeof version === 'string' && version.length > 0 ? version : null;
}

/** A verdict is accepted under the version it recorded; a legacy verdict has none. */
export function acceptsRecordedVersion(verdict, currentVersion = API_CHECK_SET_VERSION) {
  const recorded = recordedCheckSetVersion(verdict);
  return recorded === null || recorded === currentVersion || recorded.length > 0;
}

/**
 * Measure one workspace.
 *
 * @param {{ workspaceRoot: string, scope?: string|null, baseline?: object|null,
 *   allowEmptyWorkspace?: boolean, requiredResolved?: string[] }} [request]
 * @returns {{ ok: boolean, findings: object[], summary: {blocking: number, advisory: number} }}
 */
// [::TICKET::] PX-371 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-371 --for-spec --no-implementation-order`.
export function verifyApiConsistency(request = {}) {
  const {
    workspaceRoot,
    scope = null,
    baseline = null,
    allowEmptyWorkspace = false,
    requiredResolved = [],
  } = request;
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
  const treeManifest = readJsonOrNull(path.join(root, TREE_MANIFEST));
  const crateMap = buildCrateMap(treeManifest);
  const context = {
    crateMap,
    declarationsByPackage: buildDeclarationsByPackage(surfaces),
    importsByPackage: buildImportsByPackage(surfaces),
  };
  const packageLabels = new Map(
    (treeManifest?.workspace?.packages ?? []).map((pkg) => [String(pkg.id), String(pkg.name ?? pkg.crate ?? pkg.id)]),
  );

  const findings = [];
  const seen = new Set();
  const add = (finding) => {
    const key = `${finding.code}|${finding.symbol}|${finding.package}|${finding.cause}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding);
  };
  const importKindCounts = Object.fromEntries(Object.values(IMPORT_KINDS).map((kind) => [kind, 0]));

  for (const surface of surfaces) {
    collectShadowConflicts(surface, context, add, root);

    for (const reference of surface.references) {
      const resolution = resolveReference(reference, surface, context);
      importKindCounts[resolution.kind] += 1;
      if (resolution.kind === IMPORT_KINDS.LOCAL_CRATE
        || resolution.kind === IMPORT_KINDS.EXTERNAL
        || resolution.kind === IMPORT_KINDS.BUILTIN) {
        continue;
      }
      if (resolution.kind === IMPORT_KINDS.UNSCOPED) {
        add(makeFinding({
          code: FINDING_CODES.UNSCOPED_SYMBOL, severity: 'advisory', packageId: reference.packageId, symbol: reference.symbol,
          rfcPath: surface.rfcPath, root, route: 'in-drill',
          cause: `${reference.packageId} references ${reference.symbol}: ${resolution.reason}`,
        }));
        continue;
      }

      const importedLabel = packageLabels.get(resolution.importedPackageId) ?? resolution.importedPackageId;
      if (resolution.memberMissing === true) {
        add(makeFinding({
          code: FINDING_CODES.UNSCOPED_SYMBOL, severity: 'advisory', packageId: reference.packageId, symbol: reference.symbol,
          rfcPath: surface.rfcPath, root, route: 'in-drill',
          cause: `${reference.packageId} references ${reference.symbol}: the member is not declared in ${importedLabel}`,
        }));
        continue;
      }
      if (resolution.declaration === null) {
        const missingSymbol = reference.symbol.split('::')[0];
        add(makeFinding({
          code: FINDING_CODES.SYMBOL_UNDEFINED, severity: 'blocking', packageId: reference.packageId, symbol: missingSymbol,
          rfcPath: surface.rfcPath, root, route: 'in-drill',
          cause: `${reference.packageId} imports ${missingSymbol} from ${importedLabel}, which no declaration in that package provides`,
        }));
        continue;
      }

      const owner = resolution.declaration;
      if (reference.kind === 'call' && owner.kind === 'fn') {
        const expectedArity = owner.parameterCount + (reference.symbol.includes('::') && owner.receiver === true ? 1 : 0);
        if (reference.argumentCount !== expectedArity) {
          add(makeFinding({
            code: FINDING_CODES.ARITY_MISMATCH, severity: 'blocking', packageId: reference.packageId, symbol: reference.symbol,
            rfcPath: surface.rfcPath, root, route: 'in-drill',
            cause: `${reference.symbol} is called with ${reference.argumentCount} argument(s) and declared with ${expectedArity} parameter(s)`,
          }));
        }
      }
      if (reference.kind === 'type'
        && TYPE_LIKE_KINDS.has(owner.kind)
        && reference.genericArity > 0
        && reference.genericArity !== owner.genericArity) {
        add(makeFinding({
          code: FINDING_CODES.GENERIC_ARITY_MISMATCH, severity: 'blocking', packageId: reference.packageId, symbol: reference.symbol,
          rfcPath: surface.rfcPath, root, route: 'in-drill',
          cause: `${reference.symbol} is used with ${reference.genericArity} generic argument(s) and declared with ${owner.genericArity}`,
        }));
      }
      if (reference.packageId !== resolution.importedPackageId
        && !declaredPairs.has(`${reference.packageId}|${resolution.importedPackageId}`)) {
        add(makeFinding({
          code: FINDING_CODES.DEPENDENCY_EDGE_MISSING, severity: 'blocking', packageId: reference.packageId, symbol: reference.symbol,
          rfcPath: surface.rfcPath, root, route: 'upstream',
          cause: `${reference.packageId} imports ${reference.symbol} from ${importedLabel} (${resolution.importedPackageId}) with no declared boundary`,
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
      unscopedSymbolCount: findings.filter((finding) => finding.code === FINDING_CODES.UNSCOPED_SYMBOL).length,
      importKinds: importKindCounts,
      checkSetVersion: API_CHECK_SET_VERSION,
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

  process.stdout.write(`api consistency: ${result.summary.blocking} blocking, ${result.summary.advisory} advisory (${result.summary.outOfScopeBlocking} out of scope, ${result.summary.newBlocking} new, ${result.summary.resolved} resolved) checkSetVersion=${result.summary.checkSetVersion}\n`);
  for (const finding of result.findings) {
    process.stdout.write(`[${finding.severity === 'blocking' ? 'ERROR' : 'ADVISORY'}] ${finding.code} ${finding.symbol} (${finding.package})\n  ${finding.cause}\n`);
  }
  return result.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}
