'use strict';

/**
 * /amend-rfc-up workspace discovery and interface surface coverage.
 *
 * Packages come from the workspace tree manifest when it exists; a bounded scan
 * is the fallback. Surface names are read from the instruction and material, so
 * no repository or interface name is hardcoded here.
 */

const fs = require('node:fs');
const path = require('node:path');

const TREE_MANIFEST_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
const PACKAGE_ARTIFACTS = Object.freeze(['RFC.md', 'Tickets.json', 'RFC-GRAPH.json', 'RFC-Dirs-Tree.json']);
const EXCLUDED_DIRECTORIES = Object.freeze(new Set([
  '.git', '.claude', 'node_modules', 'target', 'dist', 'docs', 'regeneration', 'educe-sequences',
]));
const SURFACE_STOP_WORDS = Object.freeze(new Set([
  'implement', 'implements', 'implementation', 'interface', 'interfaces', 'surface', 'surfaces',
  'and', 'or', 'the', 'all', 'each', 'every', 'must', 'should', 'as', 'needed', 'use', 'using',
  'with', 'from', 'for', 'this', 'that', 'these', 'those', 'a', 'an', 'to', 'of', 'in', 'on',
  'safe', 'safely', 'design', 'write', 'update', 'rules', 'rule', 'material', 'given',
  'rfc', 'graph', 'dirs', 'tree', 'tickets', 'amend', 'law', 'rust',
]));
/**
 * An interface name is an acronym (REST, A2A), a CamelCase compound
 * (WebSocket, OpenAPI), or a lowercase-led camel word (gRPC). Prose nouns
 * such as "Rust", "Contract" or "bindings" never match.
 */
const SURFACE_NAME_PATTERN = /^(?:[A-Z][A-Z0-9]{1,11}|[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*|[A-Z][a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)$/;
const INTERFACE_WORD_PATTERN = /\binterfaces?\b|インターフェース/i;
const INTERFACE_HEADING_SUFFIX_PATTERN = /(?:Adapter|Interface|Surface|Transport)\b/i;
const SURFACE_HEADING_STOP_WORDS = Object.freeze(new Set([
  'part', 'chapter', 'section', 'adapter', 'interface', 'surface', 'transport', 'contract', 'bindings',
]));
const ROMAN_NUMERAL_PATTERN = /^[IVX]+$/;
const MAX_SCAN_DEPTH = 6;

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function hasArtifacts(directory) {
  return PACKAGE_ARTIFACTS.every((name) => fs.existsSync(path.join(directory, name)));
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function canonStateOf(directory) {
  const present = PACKAGE_ARTIFACTS.filter((name) => fs.existsSync(path.join(directory, name)));
  if (present.length === PACKAGE_ARTIFACTS.length) return 'materialized-fresh';
  if (present.length === 0) return 'absent';
  return 'partial';
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function packageEntry({ id, directory, kind = null, layer = null }) {
  const resolved = path.resolve(directory);
  return {
    id,
    dir: resolved,
    kind,
    layer,
    hasArtifacts: hasArtifacts(resolved),
    canonState: canonStateOf(resolved),
  };
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function readManifest({ repoRoot, manifestPath }) {
  const candidate = manifestPath || path.join(repoRoot, TREE_MANIFEST_NAME);
  if (!fs.existsSync(candidate)) return null;
  try {
    return JSON.parse(fs.readFileSync(candidate, 'utf8'));
  } catch (error) {
    throw fail('WORKSPACE_MANIFEST_UNREADABLE', `workspace manifest is not JSON: ${error.message}`, { path: candidate });
  }
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function manifestPackages({ manifest, repoRoot }) {
  const packages = manifest?.workspace?.packages;
  if (!Array.isArray(packages)) return null;
  return packages.map((entry) => packageEntry({
    id: entry.id,
    directory: path.resolve(repoRoot, entry.path || '.'),
    kind: entry.kind || null,
    layer: entry.layer || null,
  }));
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function scanForPackages({ directory, base, depth = 0, found = [] }) {
  if (depth > MAX_SCAN_DEPTH) return found;
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    return found;
  }
  const names = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  if (names.has('RFC.md') && names.has('Tickets.json')) {
    found.push(packageEntry({ id: path.relative(base, directory) || path.basename(directory), directory }));
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    scanForPackages({ directory: path.join(directory, entry.name), base, depth: depth + 1, found });
  }
  return found;
}

/** Enumerate workspace packages from the manifest, or a bounded scan. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function discoverPackages({ repoRoot = process.cwd(), manifestPath = null } = {}) {
  const resolvedRoot = path.resolve(repoRoot);
  const manifest = readManifest({ repoRoot: resolvedRoot, manifestPath });
  const fromManifest = manifest ? manifestPackages({ manifest, repoRoot: resolvedRoot }) : null;
  if (fromManifest && fromManifest.length > 0) {
    return { source: 'manifest', packages: fromManifest };
  }
  return {
    source: 'scan',
    packages: scanForPackages({ directory: resolvedRoot, base: resolvedRoot })
      .map((entry, index) => ({ ...entry, id: entry.id || `pkg-${index + 1}` })),
  };
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function resolvePackage({ packages, idOrPath }) {
  const wanted = path.resolve(idOrPath);
  const found = packages.find((entry) => entry.id === idOrPath || path.resolve(entry.dir) === wanted);
  if (!found) throw fail('PACKAGE_NOT_FOUND', `package not found: ${idOrPath}`, { packageId: idOrPath });
  return found;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function readMaterialText(materialPaths) {
  return materialPaths
    .filter((materialPath) => fs.existsSync(materialPath) && fs.statSync(materialPath).isFile())
    .map((materialPath) => fs.readFileSync(materialPath, 'utf8'))
    .join('\n');
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function addSurface(surfaces, token) {
  const cleaned = String(token).replace(/[.+#-]+$/, '');
  if (!SURFACE_NAME_PATTERN.test(cleaned)) return;
  if (ROMAN_NUMERAL_PATTERN.test(cleaned)) return;
  if (SURFACE_STOP_WORDS.has(cleaned.toLowerCase())) return;
  const key = cleaned.toLowerCase();
  if (!surfaces.has(key)) surfaces.set(key, cleaned);
}

/** The list immediately before the word "interface" on one line. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function instructionSurfaces(text) {
  const surfaces = new Map();
  for (const line of String(text).split('\n')) {
    const interfaceMatch = line.match(INTERFACE_WORD_PATTERN);
    if (!interfaceMatch) continue;
    const before = line.slice(0, interfaceMatch.index);
    const listMatch = before.match(/([A-Za-z][A-Za-z0-9.+#-]*(?:\s*[,/]\s*[A-Za-z][A-Za-z0-9.+#-]*)+\s*)$/);
    if (!listMatch) continue;
    for (const token of listMatch[1].match(/[A-Za-z][A-Za-z0-9.+#-]*/g) || []) addSurface(surfaces, token);
  }
  return surfaces;
}

/** Surface names carried by headings such as "PART III.6 — REST Adapter". */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function materialSurfaces(text) {
  const surfaces = new Map();
  for (const line of String(text).split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (!heading || !INTERFACE_HEADING_SUFFIX_PATTERN.test(heading[1])) continue;
    for (const token of heading[1].match(/[A-Za-z][A-Za-z0-9.+#-]*/g) || []) {
      if (SURFACE_HEADING_STOP_WORDS.has(token.toLowerCase())) continue;
      addSurface(surfaces, token);
    }
  }
  return surfaces;
}

/** Extract interface surfaces named by the instruction or material. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function extractSurfaces({ instructionText = '', materialPaths = [] } = {}) {
  const materialText = readMaterialText(materialPaths.map((entry) => (
    typeof entry === 'string' ? entry : entry.path
  )));
  const surfaces = instructionSurfaces(instructionText);
  for (const [key, value] of materialSurfaces(materialText)) {
    if (!surfaces.has(key)) surfaces.set(key, value);
  }
  return [...surfaces.values()].sort((left, right) => left.toLowerCase().localeCompare(right.toLowerCase()));
}

/** Every surface needs a package assignment or an explicit not_applicable reason. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function assertSurfaceCoverage({ surfaces = [], coverage = [], packages = [] } = {}) {
  const packageIds = new Set(packages.map((entry) => entry.id));
  const bySurface = new Map();
  for (const entry of coverage) {
    if (bySurface.has(entry.surface)) {
      throw fail('SURFACE_COVERAGE_INVALID', `duplicate surface coverage: ${entry.surface}`);
    }
    bySurface.set(entry.surface, entry);
  }
  for (const surface of surfaces) {
    const entry = bySurface.get(surface);
    if (!entry) throw fail('SURFACE_TARGET_MISSING', `surface has no target: ${surface}`, { surface });
    if (entry.status === 'covered') {
      const ids = Array.isArray(entry.packageIds) ? entry.packageIds : [];
      if (ids.length === 0 || ids.some((id) => !packageIds.has(id))) {
        throw fail('SURFACE_COVERAGE_INVALID', `surface ${surface} names an unknown package`);
      }
    } else if (entry.status === 'not_applicable') {
      if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
        throw fail('SURFACE_COVERAGE_INVALID', `surface ${surface} needs a not_applicable reason`);
      }
    } else {
      throw fail('SURFACE_COVERAGE_INVALID', `surface ${surface} has an unknown status`);
    }
  }
  return { ok: true };
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function readJsonInput(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const text = value.startsWith('@') ? fs.readFileSync(value.slice(1), 'utf8') : value;
  return JSON.parse(text);
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function readMaterialPaths(value) {
  if (!value) return [];
  try {
    const parsed = readJsonInput(value);
    if (Array.isArray(parsed)) return parsed.map((entry) => (typeof entry === 'string' ? entry : entry.path));
  } catch (error) {
    // A plain comma-separated list is the fallback form.
  }
  return String(value).split(',').filter(Boolean);
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  try {
    if (command === 'surfaces') {
      const instructionArgument = argumentValue(argv, 'instruction');
      const instructionText = instructionArgument
        ? fs.readFileSync(instructionArgument.replace(/^@/, ''), 'utf8')
        : '';
      const surfaces = extractSurfaces({
        instructionText,
        materialPaths: readMaterialPaths(argumentValue(argv, 'materials')),
      });
      const outPath = argumentValue(argv, 'out');
      if (outPath) fs.writeFileSync(outPath, JSON.stringify(surfaces, null, 2) + '\n');
      process.stdout.write(`${JSON.stringify({ ok: true, count: surfaces.length, out: outPath || null })}\n`);
      return 0;
    }
    if (command === 'packages') {
      const inventory = discoverPackages({ repoRoot: argumentValue(argv, 'repo') || process.cwd() });
      const outPath = argumentValue(argv, 'out');
      if (outPath) fs.writeFileSync(outPath, JSON.stringify(inventory, null, 2) + '\n');
      process.stdout.write(`${JSON.stringify({ ok: true, count: inventory.packages.length, out: outPath || null })}\n`);
      return 0;
    }
    process.stdout.write(`${JSON.stringify({ code: 'UNKNOWN_SUBCOMMAND', command })}\n`);
    return 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ code: error.code || 'WORKSPACE_FAILED', message: error.message })}\n`);
    return 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = {
  EXCLUDED_DIRECTORIES,
  TREE_MANIFEST_NAME,
  assertSurfaceCoverage,
  discoverPackages,
  extractSurfaces,
  resolvePackage,
};
