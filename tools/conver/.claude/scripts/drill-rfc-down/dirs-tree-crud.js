#!/usr/bin/env node
/**
 * dirs-tree-crud.js --dirs-tree=<path> --graph=<path> <subcommand> [options]
 *
 * /drill-rfc-down Step 3 boundify granular Dirs-Tree editing tool (PX-164).
 *
 * The AI designs the Dirs-Tree evolution by editing a STAGING copy through this
 * tool — no hand-edited JSON. Every operation:
 *   1. loads the Dirs-Tree
 *   2. performs the granular edit in memory
 *   3. writes the candidate to a temp file and runs validate-dirs-tree-schema
 *      (validateFiles) against the source graph
 *   4. on success, atomically promotes the temp file to the real path;
 *      on failure, emits an English Error/Cause/Action and exits 1 with NO write
 *
 * Subcommands:
 *   add-dir       --path=<dirPath> --kind=<kind> [--mapped=<nodeId:title,...>]
 *   add-file      --path=<filePath> --kind=<kind> [--mapped=<nodeId:title,...>]
 *   update-node   --path=<nodePath> --file=<patch.json>  (kind/mappedNodeIds/declarationStub)
 *   update-mapped --path=<nodePath> --mapped=<nodeId:title,...>
 *   remove-node   --path=<nodePath> [--force]            (destructive; forbidden by default)
 *
 * Path addressing: the first path segment is the tree root name (e.g. "src");
 * the tool edits the language tree whose root name matches, then navigates the
 * remaining segments as directory -> ... -> node.
 *
 * Exit codes: 0 = success, 1 = failure (missing args, missing parent, schema
 * violation, forbidden destructive change). No partial writes ever.
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 3).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { validateFiles } = require(path.resolve(SCRIPT_DIR, '../rfc-graph/validate-dirs-tree-schema.js'));

/** The valid node kinds, read from the node schema so they never drift. */
const NODE_KINDS = JSON.parse(
  fs.readFileSync(path.resolve(SCRIPT_DIR, '../rfc-graph/schema/node.schema.json'), 'utf8')
).properties.kind.enum;

const SUBCOMMANDS = ['add-dir', 'add-file', 'update-node', 'update-mapped', 'remove-node'];

/** Emit an English Error/Cause/Action message and exit with status 1. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function failWithEnglishError(error, cause, action) {
  console.error(`[ERROR] dirs-tree-crud: ${error}`);
  console.error(`Cause: ${cause}`);
  console.error(`Action: ${action}`);
  process.exit(1);
}

/** Reject a kind that is not in the node-schema enum (validate-dirs-tree-schema does not check it). */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function assertValidKind(kind) {
  if (!NODE_KINDS.includes(kind)) {
    failWithEnglishError(
      `invalid kind "${kind}".`,
      `kind must be one of: ${NODE_KINDS.join(', ')}.`,
      're-run with a valid kind from the node schema.'
    );
  }
}

/** Parse "--mapped=N0003:Title A,N0004:Title B" into mappedNodeIds. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function parseMappedNodeIds(raw) {
  if (!raw) return [];
  return raw.split(',').filter(Boolean).map((entry) => {
    const colon = entry.indexOf(':');
    if (colon === -1) {
      failWithEnglishError(
        `invalid --mapped entry "${entry}".`,
        'each entry must be "nodeId:title" (e.g. N0003:Session storage).',
        're-run with a correctly formatted --mapped argument.'
      );
    }
    return { nodeId: entry.slice(0, colon).trim(), title: entry.slice(colon + 1).trim() };
  });
}

/** Find the language tree whose root name equals the first path segment. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function resolveTreeRoot(dirsTree, rootName) {
  const matches = Object.entries(dirsTree.trees || {}).filter(([, tree]) => tree.name === rootName);
  if (matches.length === 0) {
    failWithEnglishError(
      `no language tree root named "${rootName}".`,
      `the Dirs-Tree has roots: ${Object.values(dirsTree.trees || {}).map((t) => t.name).join(', ') || 'none'}.`,
      'use a path that starts with an existing tree root name (e.g. src/...).'
    );
  }
  if (matches.length > 1) {
    failWithEnglishError(
      `ambiguous tree root "${rootName}".`,
      `multiple language trees share the root name: ${matches.map(([lang]) => lang).join(', ')}.`,
      'specify the language tree by editing only one root at a time.'
    );
  }
  return matches[0][1];
}

/** Navigate to the node at the given path (the first segment is the tree root). */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function navigateToNode(dirsTree, nodePath) {
  const segments = nodePath.split('/').filter(Boolean);
  if (segments.length < 2) {
    failWithEnglishError(`path "${nodePath}" is too shallow.`, 'a node path must include the tree root and at least one node (e.g. src/api/auth.rs).', 'use a full path such as src/api/auth.rs.');
  }
  const root = resolveTreeRoot(dirsTree, segments[0]);
  let current = root;
  for (let i = 1; i < segments.length; i += 1) {
    const child = (current.children || []).find((c) => c.name === segments[i]);
    if (!child) {
      failWithEnglishError(`node "${segments.slice(0, i + 1).join('/')}" not found.`, `the parent "${segments.slice(0, i).join('/')}" has no child named "${segments[i]}".`, `check the path or create the missing directory with add-dir first.`);
    }
    current = child;
  }
  return current;
}

/** Navigate to the parent of the last path segment (the node being added). */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function navigateToParent(dirsTree, nodePath, kind) {
  const segments = nodePath.split('/').filter(Boolean);
  if (segments.length < 2) {
    failWithEnglishError(`path "${nodePath}" is too shallow.`, `a ${kind} path must include the tree root and at least one node name.`, `use a full path such as src/api/${kind === 'file' ? 'auth.rs' : 'cache'}.`);
  }
  const root = resolveTreeRoot(dirsTree, segments[0]);
  let current = root;
  for (let i = 1; i < segments.length - 1; i += 1) {
    const child = (current.children || []).find((c) => c.name === segments[i]);
    if (!child) {
      failWithEnglishError(`parent directory "${segments.slice(1, i + 1).join('/')}" not found.`, `the directory path "${segments.slice(1, i + 1).join('/')}" does not exist under "${segments[0]}".`, `create the missing directory with add-dir first, then retry.`);
    }
    if (child.type !== 'directory') {
      failWithEnglishError(`"${child.name}" is not a directory.`, `the path segment "${child.name}" resolves to a file node.`, `check the path: a ${kind} can only be added under a directory.`);
    }
    current = child;
  }
  return { parent: current, name: segments[segments.length - 1] };
}

/** Validate the candidate Dirs-Tree and atomically write it; on failure no write. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function validateAndWrite(dirsTreePath, dirsTree, graphPath, subcommand) {
  const tempPath = path.join(os.tmpdir(), `dirs-tree-crud-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tempPath, JSON.stringify(dirsTree, null, 2) + '\n', 'utf8');
  const result = validateFiles(tempPath, graphPath);
  if (!result.ok) {
    fs.rmSync(tempPath, { force: true });
    failWithEnglishError(
      `${subcommand} failed schema validation; the Dirs-Tree was NOT written.`,
      `validate-dirs-tree-schema reported: ${result.errors.join('; ')}`,
      'fix the edit (kind, path, mappedNodeIds) and re-run the operation.'
    );
  }
  fs.renameSync(tempPath, dirsTreePath);
}

/** Perform an edit on a fresh in-memory tree, then validate and write. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function editAndWrite(dirsTreePath, graphPath, subcommand, editFn) {
  const dirsTree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8'));
  editFn(dirsTree);
  validateAndWrite(dirsTreePath, dirsTree, graphPath, subcommand);
}

// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  let dirsTreePath = '';
  let graphPath = '';
  let subcommand = '';
  const options = {};
  for (const arg of args) {
    if (arg.startsWith('--dirs-tree=')) dirsTreePath = arg.slice('--dirs-tree='.length);
    else if (arg.startsWith('--graph=')) graphPath = arg.slice('--graph='.length);
    else if (SUBCOMMANDS.includes(arg)) subcommand = arg;
    else if (arg.startsWith('--path=')) options.path = arg.slice('--path='.length);
    else if (arg.startsWith('--kind=')) options.kind = arg.slice('--kind='.length);
    else if (arg.startsWith('--mapped=')) options.mapped = arg.slice('--mapped='.length);
    else if (arg.startsWith('--file=')) options.file = arg.slice('--file='.length);
    else if (arg === '--force') options.force = true;
  }
  if (!dirsTreePath || !graphPath || !subcommand) {
    console.error('Usage: dirs-tree-crud.js --dirs-tree=<path> --graph=<path> <add-dir|add-file|update-node|update-mapped|remove-node> [options]');
    process.exit(1);
  }
  if (!fs.existsSync(dirsTreePath)) {
    failWithEnglishError(`Dirs-Tree file not found: ${dirsTreePath}`, 'the --dirs-tree path does not exist.', 'check the path and re-run.');
  }
  if (!fs.existsSync(graphPath)) {
    failWithEnglishError(`graph file not found: ${graphPath}`, 'the --graph path does not exist.', 'check the path and re-run.');
  }

  if (subcommand === 'add-dir' || subcommand === 'add-file') {
    if (!options.path || !options.kind) {
      failWithEnglishError(`${subcommand} requires --path and --kind.`, 'both the node path and its kind are required.', `run: dirs-tree-crud.js ... ${subcommand} --path=src/api/cache --kind=architecture`);
    }
    const nodeType = subcommand === 'add-dir' ? 'directory' : 'file';
    assertValidKind(options.kind);
    const mappedNodeIds = parseMappedNodeIds(options.mapped);
    editAndWrite(dirsTreePath, graphPath, subcommand, (dirsTree) => {
      const { parent, name } = navigateToParent(dirsTree, options.path, nodeType);
      if ((parent.children || []).some((c) => c.name === name)) {
        failWithEnglishError(`${subcommand}: node "${options.path}" already exists.`, `a child named "${name}" is already present.`, 'remove or update the existing node instead of adding a duplicate.');
      }
      parent.children = parent.children || [];
      parent.children.push(nodeType === 'directory'
        ? { name, type: 'directory', kind: options.kind, mappedNodeIds, children: [] }
        : { name, type: 'file', kind: options.kind, mappedNodeIds });
    });
    process.stdout.write(`${subcommand} ${options.path} written and validated.\n`);
    process.exit(0);
  }

  if (subcommand === 'update-node') {
    if (!options.path || !options.file) {
      failWithEnglishError('update-node requires --path and --file.', 'a patch file with the fields to update is required.', 'run: dirs-tree-crud.js ... update-node --path=src/api/auth.rs --file=patch.json');
    }
    const patch = JSON.parse(fs.readFileSync(options.file, 'utf8'));
    if (patch.kind !== undefined) assertValidKind(patch.kind);
    editAndWrite(dirsTreePath, graphPath, subcommand, (dirsTree) => {
      const node = navigateToNode(dirsTree, options.path);
      if (patch.kind !== undefined) node.kind = patch.kind;
      if (patch.mappedNodeIds !== undefined) node.mappedNodeIds = patch.mappedNodeIds;
      if (patch.declarationStub !== undefined) node.declarationStub = patch.declarationStub;
    });
    process.stdout.write(`update-node ${options.path} written and validated.\n`);
    process.exit(0);
  }

  if (subcommand === 'update-mapped') {
    if (!options.path || !options.mapped) {
      failWithEnglishError('update-mapped requires --path and --mapped.', 'the new mappedNodeIds list is required.', 'run: dirs-tree-crud.js ... update-mapped --path=src/api/auth.rs --mapped=N0003:Session storage');
    }
    const mappedNodeIds = parseMappedNodeIds(options.mapped);
    editAndWrite(dirsTreePath, graphPath, subcommand, (dirsTree) => {
      const node = navigateToNode(dirsTree, options.path);
      node.mappedNodeIds = mappedNodeIds;
    });
    process.stdout.write(`update-mapped ${options.path} written and validated.\n`);
    process.exit(0);
  }

  if (subcommand === 'remove-node') {
    if (!options.path) {
      failWithEnglishError('remove-node requires --path.', 'the node path to remove is required.', 'run: dirs-tree-crud.js ... remove-node --path=src/api/auth.rs --force');
    }
    if (!options.force) {
      failWithEnglishError('remove-node is a destructive change and is forbidden by default.', 'deleting a node would remove it from the Dirs-Tree and potentially orphan src files.', 're-run with --force ONLY after explicit AI approval, or update the node instead.');
    }
    editAndWrite(dirsTreePath, graphPath, subcommand, (dirsTree) => {
      const segments = options.path.split('/').filter(Boolean);
      const { parent, name } = navigateToParent(dirsTree, options.path, 'node');
      const before = (parent.children || []).length;
      parent.children = (parent.children || []).filter((c) => c.name !== name);
      if (parent.children.length === before) {
        failWithEnglishError(`remove-node: node "${options.path}" not found.`, 'no child with that name exists under the parent.', 'check the path and re-run.');
      }
    });
    process.stdout.write(`remove-node ${options.path} written and validated.\n`);
    process.exit(0);
  }
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export { parseMappedNodeIds, navigateToNode, navigateToParent, validateAndWrite, editAndWrite, main };
