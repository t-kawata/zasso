/**
 * Verify the hash chain a frozen workspace records.
 *
 * The chain is checked link by link with the function that wrote each link: the tree's
 * normalized source hash, the tree self-hash, the allocate link to the tree, the educe
 * raw digest on the artifact, the allocate self-hash, every recorded seed, and every
 * package view. A workspace that declares no chain is reported as undeclared rather
 * than silently accepted as verified.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { digestOf } from '../../educe-sequences/rail/load.mjs';
import { computeAllocateSelfHash } from '../../workspacify-allocate/lib/allocate-manifest.mjs';
import { sha256Hex } from '../../workspacify-tree/lib/hash.mjs';
import { normalizeTextBytes } from '../../workspacify-tree/lib/normalization.mjs';
import { computeSelfHash } from '../../workspacify-tree/lib/render.mjs';

export const TREE_MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
export const ALLOCATE_MANIFEST_FILE_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
export const ARTIFACT_SUFFIX = '-sequences.json';
export const VIEW_FILE_NAME = 'SEQUENCES.json';

export const CHAIN_CODES = Object.freeze({
  SPEC_DIGEST_MISMATCH: 'SPEC_DIGEST_MISMATCH',
  TREE_MISSING: 'TREE_MISSING',
  TREE_SELF_HASH_MISMATCH: 'TREE_SELF_HASH_MISMATCH',
  TREE_LINK_MISMATCH: 'TREE_LINK_MISMATCH',
  SPEC_LINK_MISMATCH: 'SPEC_LINK_MISMATCH',
  ARTIFACT_MISSING: 'ARTIFACT_MISSING',
  ARTIFACT_SPEC_MISMATCH: 'ARTIFACT_SPEC_MISMATCH',
  ALLOCATE_MISSING: 'ALLOCATE_MISSING',
  ALLOCATE_SELF_HASH_MISMATCH: 'ALLOCATE_SELF_HASH_MISMATCH',
  SEED_DIGEST_MISMATCH: 'SEED_DIGEST_MISMATCH',
  VIEW_MISSING: 'VIEW_MISSING',
  VIEW_LINK_MISMATCH: 'VIEW_LINK_MISMATCH',
  CHAIN_NOT_DECLARED: 'CHAIN_NOT_DECLARED',
});

/** One link result. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function compareLink(name, expected, actual, code) {
  return { link: name, ok: expected === actual, expected, actual, code: expected === actual ? null : code };
}

/** A link that fails with a named code and no comparison. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function failedLink(name, code, detail = null) {
  return { link: name, ok: false, expected: detail, actual: null, code };
}

/** Read JSON, or null when the file is absent or unparsable. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** The single artifact path at the root, or null. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function findArtifactPath(root) {
  const candidates = [];
  for (const name of readdirSync(root)) {
    if (name.endsWith(ARTIFACT_SUFFIX)) candidates.push(join(root, name));
  }
  return candidates.length === 1 ? candidates[0] : null;
}

/** The normalized source hash the tree records for a spec file. */
export function sourceHashOf(specPath) {
  return sha256Hex(normalizeTextBytes(readFileSync(specPath)).bytes);
}

/**
 * Verify the chain under one workspace root.
 *
 * @param {string} root
 * @returns {{ declared: boolean, ok: boolean, links: Array<object> }}
 */
export function verifyChain(root) {
  const tree = readJson(join(root, TREE_MANIFEST_FILE_NAME));
  if (tree === null) {
    return { declared: false, ok: false, links: [failedLink('tree', CHAIN_CODES.TREE_MISSING)] };
  }
  const declared = typeof tree.input?.source_hash === 'string' && typeof tree.integrity?.manifest_hash === 'string';
  if (!declared) {
    return { declared: false, ok: false, links: [failedLink('spec->tree', CHAIN_CODES.CHAIN_NOT_DECLARED)] };
  }

  const links = [];
  const specPath = join(root, tree.input.spec_path);
  if (!existsSync(specPath)) {
    links.push(failedLink('spec->tree', CHAIN_CODES.SPEC_DIGEST_MISMATCH, 'spec missing'));
  } else {
    links.push(compareLink('spec->tree', tree.input.source_hash, sourceHashOf(specPath), CHAIN_CODES.SPEC_DIGEST_MISMATCH));
  }
  links.push(compareLink('tree-self', tree.integrity.manifest_hash, computeSelfHash(tree), CHAIN_CODES.TREE_SELF_HASH_MISMATCH));

  const allocate = readJson(join(root, ALLOCATE_MANIFEST_FILE_NAME));
  if (allocate === null) {
    links.push(failedLink('tree->allocate', CHAIN_CODES.ALLOCATE_MISSING));
  } else {
    links.push(compareLink('tree->allocate', tree.integrity.manifest_hash, allocate.input_tree_manifest?.hash, CHAIN_CODES.TREE_LINK_MISMATCH));
    links.push(compareLink('spec->allocate', tree.input.source_hash, allocate.input_tree_manifest?.spec?.sha256, CHAIN_CODES.SPEC_LINK_MISMATCH));
    links.push(compareLink('allocate-self', allocate.integrity?.manifest_hash, computeAllocateSelfHash(allocate), CHAIN_CODES.ALLOCATE_SELF_HASH_MISMATCH));
    links.push(...verifySeeds(root, allocate));
  }

  const artifactPath = findArtifactPath(root);
  if (artifactPath === null) {
    links.push(failedLink('spec->artifact', CHAIN_CODES.ARTIFACT_MISSING));
  } else {
    const artifact = readJson(artifactPath);
    const expected = existsSync(specPath) ? digestOf(specPath) : null;
    links.push(compareLink('spec->artifact', expected, artifact?.spec?.sha256 ?? null, CHAIN_CODES.ARTIFACT_SPEC_MISMATCH));
  }

  links.push(...verifyViews(root, tree));
  return { declared: true, ok: links.every((entry) => entry.ok), links };
}

/** Every seed the allocate manifest records must still hash to its recorded digest. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function verifySeeds(root, allocate) {
  const links = [];
  for (const seed of allocate.seed_index ?? []) {
    const seedPath = join(root, seed.path);
    const actual = existsSync(seedPath) ? digestOf(seedPath) : null;
    links.push(compareLink(`seed:${seed.path}`, seed.sha256, actual, CHAIN_CODES.SEED_DIGEST_MISMATCH));
  }
  return links;
}

/** Every package the tree names must carry a view that names the same package. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function verifyViews(root, tree) {
  const links = [];
  for (const pkg of tree.workspace?.packages ?? []) {
    const viewPath = join(root, pkg.path, VIEW_FILE_NAME);
    if (!existsSync(viewPath)) {
      links.push(failedLink(`view:${pkg.id}`, CHAIN_CODES.VIEW_MISSING));
      continue;
    }
    const view = readJson(viewPath);
    links.push(compareLink(`view:${pkg.id}`, pkg.id, view?.packageId ?? null, CHAIN_CODES.VIEW_LINK_MISMATCH));
  }
  return links;
}
