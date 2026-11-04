import fs from 'node:fs';
import path from 'node:path';

import { HISTORY_FILE_NAME, readHistoryFile } from './history.js';

export const DECOY_RE = /(\.delta\.json$|\.bak$|\.p22-ja\.bak$)/;
export const SKIP_DIRS = new Set(['node_modules', '.git', 'target', 'dist', 'archive', 'progress-gif', 'vendor', 'fixtures']);

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
export class WorkspaceError extends Error {
// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
  constructor(message, exitCode = 2, action = '') {
    super(message);
    this.name = 'WorkspaceError';
    this.exitCode = exitCode;
    this.action = action;
  }
}

export function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function readJson(file) {
  const text = readText(file);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function exists(file) {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

export function mtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

export function listDir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function warn(warnings, message) {
  if (Array.isArray(warnings) && !warnings.includes(message)) warnings.push(message);
}

/**
 * Read the two workspacify manifests. Their existence and readability are the only
 * execution gate; schema drift is recorded as a warning so a workspace that has just
 * finished /workspacify-allocate can still produce an initial-state board.
 */
export function readManifests(root) {
  const treePath = path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json');
  const allocPath = path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json');
  if (!exists(treePath)) {
    throw new WorkspaceError(`missing WORKSPACIFY-TREE-MANIFEST.json in ${root}`, 2,
      'Run /workspacify-tree in this directory first.');
  }
  if (!exists(allocPath)) {
    throw new WorkspaceError(`missing WORKSPACIFY-ALLOCATE-MANIFEST.json in ${root}`, 2,
      'Run /workspacify-allocate in this directory first.');
  }
  const tree = readJson(treePath);
  const alloc = readJson(allocPath);
  if (!tree) throw new WorkspaceError(`WORKSPACIFY-TREE-MANIFEST.json is not valid JSON in ${root}`, 2,
    'Repair or regenerate the tree manifest, then re-run.');
  if (!alloc) throw new WorkspaceError(`WORKSPACIFY-ALLOCATE-MANIFEST.json is not valid JSON in ${root}`, 2,
    'Repair or regenerate the allocate manifest, then re-run.');

  const warnings = [];
  if (tree.artifact_kind !== 'workspacify-tree-manifest') {
    warn(warnings, `tree artifact_kind is ${String(tree.artifact_kind)} (expected workspacify-tree-manifest)`);
  }
  if (alloc.artifact_kind !== 'workspacify-allocate-manifest') {
    warn(warnings, `allocate artifact_kind is ${String(alloc.artifact_kind)} (expected workspacify-allocate-manifest)`);
  }
  if (tree.status !== 'COMPLETE') warn(warnings, `tree status is ${String(tree.status)} (expected COMPLETE)`);
  if (alloc.status !== 'COMPLETE') warn(warnings, `allocate status is ${String(alloc.status)} (expected COMPLETE)`);
  if (alloc.completion_decision !== 'COMPLETE') {
    warn(warnings, `allocate completion_decision is ${String(alloc.completion_decision)} (expected COMPLETE)`);
  }
  if (alloc.semantic_review && alloc.semantic_review.status !== 'APPROVED') {
    warn(warnings, `allocate semantic_review.status is ${String(alloc.semantic_review.status)} (expected APPROVED)`);
  }
  if (!alloc.semantic_review) warn(warnings, 'allocate has no semantic_review (older manifest)');
  const treeHash = tree.integrity && tree.integrity.manifest_hash;
  const allocHash = alloc.input_tree_manifest && alloc.input_tree_manifest.hash;
  if (treeHash && allocHash && treeHash !== allocHash) {
    warn(warnings, 'manifest hash chain differs between tree and allocate manifests');
  }
  const treeSpec = tree.input && tree.input.source_hash;
  const allocSpec = alloc.input_tree_manifest && alloc.input_tree_manifest.spec
    && alloc.input_tree_manifest.spec.sha256;
  if (treeSpec && allocSpec && treeSpec !== allocSpec) {
    warn(warnings, 'spec hash differs between tree and allocate manifests');
  }
  if (!Array.isArray(tree.workspace && tree.workspace.packages)) {
    warn(warnings, 'tree.workspace.packages is missing or not an array');
  }
  return { tree, alloc, warnings, treePath, allocPath };
}

/**
 * Resolve a package path inside the workspace. A path outside the root, or one whose
 * ancestor is a symlink, is refused: reading through it would make the output depend on
 * a tree the workspace does not own.
 */
export function safePackageDir(root, packagePath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, packagePath || '.');
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) return null;
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === '') return resolved;
  let cursor = resolvedRoot;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) return null;
    } catch {
      break;
    }
  }
  return resolved;
}

export function discoverPackages(root, tree, alloc) {
  const raw = (tree.workspace && Array.isArray(tree.workspace.packages))
    ? tree.workspace.packages
    : [];
  const warnings = [];
  const seen = new Set();
  const packages = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const id = entry.id || entry.package || entry.name;
    if (!id) {
      warn(warnings, 'a package entry has no id and was ignored');
      continue;
    }
    if (seen.has(id)) {
      warn(warnings, `duplicate package id ${id} ignored`);
      continue;
    }
    seen.add(id);
    const dir = safePackageDir(root, entry.path);
    if (!dir) {
      warn(warnings, `package ${id} path escapes the workspace or crosses a symlink and was ignored`);
      continue;
    }
    packages.push({
      id,
      name: entry.name || id,
      path: entry.path || '.',
      dir,
      layer: entry.layer,
      seedRequired: entry.seed_required !== false,
    });
  }
  const serial = alloc.implementation_order && Array.isArray(alloc.implementation_order.serial)
    ? alloc.implementation_order.serial
    : [];
  const rank = new Map(serial.map((item, index) => [
    String(item && typeof item === 'object' ? (item.package || item.id) : item),
    index,
  ]));
  packages.sort((left, right) => {
    const leftRank = rank.has(left.id) ? rank.get(left.id) : Number.MAX_SAFE_INTEGER;
    const rightRank = rank.has(right.id) ? rank.get(right.id) : Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.id.localeCompare(right.id);
  });
  // The array is the package list; warnings travel on the same value so a caller that
  // only needs the list does not have to unwrap a container.
  packages.warnings = warnings;
  packages.packages = packages;
  return packages;
}

export function parseTimestamp(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (dateOnly) {
    const timestamp = Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return { t: timestamp, prec: 'day' };
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return { t: timestamp, prec: 'ms' };
}

export function parseRunId(value) {
  if (typeof value !== 'string') return null;
  const head = value.split('-')[0];
  let ms = null;
  if (/^\d{19,}$/.test(head)) ms = Number(head.slice(0, 13));
  else if (/^\d{13}$/.test(head)) ms = Number(head);
  if (ms === null || !Number.isFinite(ms)) return null;
  return { t: ms, prec: 'ms' };
}

export function parseStamp(value) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const timestamp = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5]), Number(match[6])).getTime();
  return Number.isNaN(timestamp) ? null : { t: timestamp, prec: 'ms' };
}

/**
 * Pick a canonical artifact. The canonical name wins, but another matching candidate is
 * reported as ambiguous so a reader can see that the choice was not silent.
 */
export function resolveCanonical(dir, canonicalName, pattern, warnings) {
  const canonical = path.join(dir, canonicalName);
  const candidates = listDir(dir)
    .filter((name) => pattern.test(name) && name !== canonicalName && !DECOY_RE.test(name))
    .map((name) => path.join(dir, name));
  if (exists(canonical)) {
    if (candidates.length > 0) {
      warn(warnings, `ambiguous ${pattern} in ${dir}: canonical ${canonicalName} chosen over ${candidates.length} candidate(s)`);
    }
    return canonical;
  }
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    warn(warnings, `ambiguous ${pattern} in ${dir}: ${candidates.length} candidates ignored`);
  }
  return null;
}

export function ticketsOf(document) {
  const tickets = [];
  for (const phase of (document && document.phases) || []) {
    for (const ticket of phase.tickets || []) tickets.push(ticket);
  }
  return tickets;
}

export function ticketKeyOf(ticket) {
  const phaseId = Number(ticket.phaseId);
  if (phaseId === -1) return `PX-${ticket.id}`;
  return `P${phaseId}-${ticket.id}`;
}

export function contractIdsOf(ticket) {
  return new Set((ticket.contracts || []).map((contract) => contract.id).filter(Boolean));
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function readOptional(dir, file, warnings) {
  const full = path.join(dir, file);
  if (!exists(full)) return null;
  return readJson(full);
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function collectStampedFiles(dir, pattern) {
  return listDir(dir)
    .map((name) => {
      const match = pattern.exec(name);
      if (!match) return null;
      const stamp = parseStamp(match[1]);
      if (!stamp) return null;
      return { name, path: path.join(dir, name), ...stamp };
    })
    .filter(Boolean)
    .sort((left, right) => left.t - right.t);
}

/** Read every artifact the progress model can use from one package directory. */
export function discoverPackageArtifacts(root, pkg, warnings) {
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
  const dir = pkg.dir;
  const artifacts = {};
  const info = path.join(dir, 'INFO-RFC-SEED.md');
  const explain = path.join(dir, 'EXPLAIN-RFC-SEED.md');
  artifacts.info = exists(info) ? info : null;
  artifacts.explain = exists(explain) ? explain : null;
  artifacts.designTreePath = path.join(dir, 'DesignTree.json');
  artifacts.designTree = exists(artifacts.designTreePath) ? readJson(artifacts.designTreePath) : null;
  artifacts.statusPath = path.join(dir, 'Status.json');
  artifacts.status = exists(artifacts.statusPath) ? readJson(artifacts.statusPath) : null;
  artifacts.graphPath = resolveCanonical(dir, 'RFC-GRAPH.json', /-GRAPH\.json$/, warnings);
  artifacts.graph = artifacts.graphPath ? readJson(artifacts.graphPath) : null;
  artifacts.graphStatusPath = path.join(dir, 'RFC-GRAPHIFY-Status.json');
  artifacts.graphStatus = exists(artifacts.graphStatusPath) ? readJson(artifacts.graphStatusPath) : null;
  artifacts.dirsPath = resolveCanonical(dir, 'RFC-Dirs-Tree.json', /-Dirs-Tree\.json$/, warnings);
  artifacts.dirs = artifacts.dirsPath ? readJson(artifacts.dirsPath) : null;
  artifacts.boundifyStatusPath = path.join(dir, 'RFC-BOUNDIFY-Status.json');
  artifacts.boundifyStatus = exists(artifacts.boundifyStatusPath) ? readJson(artifacts.boundifyStatusPath) : null;
  artifacts.ticketsPath = path.join(dir, 'Tickets.json');
  artifacts.tickets = exists(artifacts.ticketsPath) ? readJson(artifacts.ticketsPath) : null;
  artifacts.splitStatusPath = path.join(dir, 'RFC-SPLIT-Status.json');
  artifacts.splitStatus = exists(artifacts.splitStatusPath) ? readJson(artifacts.splitStatusPath) : null;
  artifacts.malfeasancePath = path.join(dir, 'Malfeasance.json');
  artifacts.malfeasance = exists(artifacts.malfeasancePath) ? readJson(artifacts.malfeasancePath) : null;
  artifacts.crystalizePath = path.join(dir, 'CRYSTALIZE-Status.json');
  artifacts.crystalize = exists(artifacts.crystalizePath) ? readJson(artifacts.crystalizePath) : null;
  artifacts.drillStatusPath = path.join(dir, 'drills', 'Status.json');
  artifacts.drillStatus = exists(artifacts.drillStatusPath) ? readJson(artifacts.drillStatusPath) : null;
  artifacts.drillTreePath = path.join(dir, 'drills', 'DesignTree.json');
  artifacts.drillTree = exists(artifacts.drillTreePath) ? readJson(artifacts.drillTreePath) : null;
  artifacts.ticketSnapshots = collectStampedFiles(dir, /^Tickets-(\d{14})\.json$/);
  artifacts.omissions = [
    ...collectStampedFiles(dir, /^OMISSIONS-(\d{14})\.json$/),
    ...collectStampedFiles(path.join(dir, 'omissions'), /^OMISSIONS-(\d{14})\.json$/),
  ];
  artifacts.manifests = collectStampedFiles(path.join(dir, 'manifests'), /^CONSOLIDATED-MANIFEST-(\d{14})\.json$/);
  artifacts.drillRounds = listDir(path.join(dir, 'drills'))
    .filter((name) => /^(DesignTree|CheckList)\.round\d+\.archive\./.test(name))
    .map((name) => path.join(dir, 'drills', name));
  artifacts.historyPath = path.join(dir, HISTORY_FILE_NAME);
  const history = readHistoryFile(artifacts.historyPath);
  artifacts.historyRecords = history.records;
  warnings.push(...history.warnings);
  return artifacts;
}

/** Read the workspace-level educe and smooth artifacts. */
export function discoverWorkspaceArtifacts(root, warnings) {
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
  const sequences = listDir(root)
    .filter((name) => /-sequences\.json$/.test(name) && !DECOY_RE.test(name))
    .map((name) => path.join(root, name));
  if (sequences.length !== 1) {
    warn(warnings, `root *-sequences.json count is ${sequences.length} (educe not drawn)`);
  }
  const smoothStatusPath = path.join(root, 'smooth-sequences', 'status.json');
  const historyPath = path.join(root, HISTORY_FILE_NAME);
  const history = readHistoryFile(historyPath);
  warnings.push(...history.warnings);
  return {
    sequencesPath: sequences.length === 1 ? sequences[0] : null,
    educeStatus: readOptional(path.join(root, 'educe-sequences'), 'status.json', warnings),
    smoothStatusPath,
    smoothStatus: exists(smoothStatusPath) ? readJson(smoothStatusPath) : null,
    smoothCertificate: readOptional(path.join(root, 'smooth-sequences'), 'COMPLETION-CERTIFICATE.json', warnings),
    historyPath,
    historyRecords: history.records,
  };
}
