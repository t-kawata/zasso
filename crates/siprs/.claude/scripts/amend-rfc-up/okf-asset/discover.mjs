/**
 * Discover assets without assuming a directory name.
 *
 * Precedence: explicit manifest, bundle/spec reference, content heuristic,
 * none. Every decision is recorded; weak candidates never become assets by
 * themselves. The function is deterministic for a fixed filesystem.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ASSET_CODES, ASSET_MODES, DEFAULT_EXCLUDES } from './constants.mjs';
import { measureAsset } from './measure.mjs';
import { classifyAsset, isDerivedPath, isSecretPath } from './classify.mjs';

const FILE_EXTENSIONS = /\.(?:py|sh|bash|ps1|psm1|json|toml|ya?ml|conf|ini|cfg|md|txt|js|mjs|cjs|ts|service)$/i;
const KNOWN_BASENAMES = new Set([
  'Dockerfile',
  'Containerfile',
  'Makefile',
  'lab',
  'bootstrap',
  'generate.py',
  'probe.py',
]);

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function toPosix(path) {
  return path.split(sep).join('/');
}

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function shouldSkipDirectory(relativePath) {
  return DEFAULT_EXCLUDES.some((prefix) => `${relativePath}/`.startsWith(prefix));
}

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function walkFiles(root, relativeDirectory = '') {
  const directory = join(root, relativeDirectory);
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(child)) continue;
      files.push(...walkFiles(root, child));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function walkAllFiles(root, relativeDirectory = '') {
  const directory = join(root, relativeDirectory);
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (child === '.git' || child === 'node_modules' || child === 'target' || child === 'dist' || child === 'build') continue;
      files.push(...walkAllFiles(root, child));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function extractReferences(texts) {
  const references = new Set();
  for (const text of texts) {
    for (const match of text.matchAll(/`([^`\n]+)`/g)) {
      const token = match[1].trim().replace(/^\.\//, '');
      if (!token || token.includes(' ')) continue;
      if (FILE_EXTENSIONS.test(token) || KNOWN_BASENAMES.has(token.split('/').pop())) {
        references.add(token);
      }
    }
    for (const match of text.matchAll(/\b([\w./-]+\.(?:py|sh|bash|ps1|psm1|json|toml|ya?ml|conf|ini|cfg|md|txt|js|mjs|cjs|ts))\b/g)) {
      references.add(match[1].replace(/^\.\//, ''));
    }
  }
  return [...references].sort();
}

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function hasStrongContent(root, relativePath) {
  const name = relativePath.split('/').pop() ?? relativePath;
  if (name === 'Dockerfile' || name === 'Containerfile') return true;
  try {
    const text = readFileSync(join(root, relativePath), 'utf8');
    if (text.startsWith('#!')) return true;
    if (/^\s*services\s*:/m.test(text) || /"services"\s*:/.test(text)) return true;
    if (/^\s*FROM\s+/m.test(text)) return true;
  } catch {
    return false;
  }
  return false;
}

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function looksLikeAssetReference(token) {
  if (token.includes('/')) return true;
  return KNOWN_BASENAMES.has(token) || FILE_EXTENSIONS.test(token);
}

export function discoverAssets(input = {}) {
  const {
    sourcePaths = [],
    sourceRoot,
    freeForm = '',
    manifest = null,
    policy = {},
  } = input;
  const root = sourceRoot;
  const sourceSet = new Set(sourcePaths.map(toPosix));
  const manifestRoots = manifest?.assets?.roots ?? [];
  const sourceTexts = sourcePaths
    .filter((path) => existsSync(join(root, path)))
    .map((path) => readFileSync(join(root, path), 'utf8'));

  const included = [];
  const excluded = [];
  const ambiguous = [];
  const includedPaths = new Set();
  const excludedPaths = new Set();

  const recordExcluded = (path, code, reason) => {
    if (excludedPaths.has(path)) return;
    excludedPaths.add(path);
    excluded.push({ path, code, reason });
  };

  const recordAmbiguous = (path, code, reason) => {
    if (ambiguous.some((entry) => entry.path === path && entry.code === code)) return;
    ambiguous.push({ path, code, reason });
  };

  const includeFile = (relativePath, selectedBy, reason) => {
    if (sourceSet.has(relativePath) || includedPaths.has(relativePath)) return;
    const measured = measureAsset({
      absolutePath: join(root, relativePath),
      relativePath,
      root,
    });
    const decision = classifyAsset(measured, policy);
    if (!decision.include) {
      recordExcluded(relativePath, decision.code, decision.reason);
      return;
    }
    includedPaths.add(relativePath);
    included.push({
      ...measured,
      type: decision.type,
      selectedBy,
      reason,
      governingConcepts: [],
    });
  };

  const includeDirectory = (relativePath, selectedBy, reason) => {
    for (const file of walkFiles(root, relativePath)) includeFile(file, selectedBy, reason);
  };

  const recordUnselected = () => {
    for (const file of walkAllFiles(root)) {
      if (sourceSet.has(file) || includedPaths.has(file) || excludedPaths.has(file)) continue;
      if (isSecretPath(file)) {
        recordExcluded(file, ASSET_CODES.SECRET_EXCLUDED, 'secret-bearing path');
      } else if (isDerivedPath(file)) {
        recordExcluded(file, ASSET_CODES.DERIVED_EXCLUDED, 'generated or private path');
      } else {
        recordExcluded(file, ASSET_CODES.WEAK_CANDIDATE, 'weak signal; not selected');
      }
    }
  };

  let mode = ASSET_MODES.NONE;

  if (manifestRoots.length > 0) {
    mode = ASSET_MODES.MANIFEST;
    for (const assetRoot of manifestRoots) {
      if (!existsSync(join(root, assetRoot))) {
        recordAmbiguous(assetRoot, ASSET_CODES.ROOT_MISSING, 'declared asset root is absent');
        continue;
      }
      if (statSync(join(root, assetRoot)).isDirectory()) {
        includeDirectory(assetRoot, 'manifest', 'declared asset root');
      } else {
        includeFile(assetRoot, 'manifest', 'declared asset root');
      }
    }
  } else {
    const references = extractReferences(sourceTexts);
    const existing = references.filter((reference) => existsSync(join(root, reference)));
    for (const reference of references) {
      if (!existsSync(join(root, reference)) && looksLikeAssetReference(reference)) {
        recordAmbiguous(reference, ASSET_CODES.REFERENCE_MISSING, 'reference does not resolve');
      }
    }
    if (existing.length > 0) {
      mode = ASSET_MODES.SPEC_REFERENCE;
      for (const reference of references) {
        const absolute = join(root, reference);
        if (!existsSync(absolute)) {
          if (looksLikeAssetReference(reference)) {
            recordAmbiguous(reference, ASSET_CODES.REFERENCE_MISSING, 'reference does not resolve');
          }
          continue;
        }
        if (statSync(absolute).isDirectory()) {
          includeDirectory(reference, 'spec-reference', 'referenced by the source');
        } else {
          includeFile(reference, 'spec-reference', 'referenced by the source');
        }
      }
    } else {
      const strong = walkFiles(root).filter((file) => hasStrongContent(root, file));
      if (strong.length > 0) {
        mode = ASSET_MODES.HEURISTIC;
        for (const file of strong) includeFile(file, 'heuristic', 'content signal');
      }
    }
  }

  recordUnselected();

  const roots = [...new Set(included.map((entry) => entry.path.split('/')[0]))].sort();
  const bytes = included.reduce((total, entry) => total + entry.bytes, 0);
  if (policy.maxCandidates !== undefined && included.length > policy.maxCandidates) {
    recordAmbiguous('assets', ASSET_CODES.DISCOVERY_AMBIGUOUS, 'candidate count exceeds the policy limit');
  }
  if (policy.maxTotalBytes !== undefined && bytes > policy.maxTotalBytes) {
    recordAmbiguous('assets', ASSET_CODES.SIZE_EXCLUDED, 'total asset bytes exceed the policy limit');
  }
  return {
    mode,
    roots,
    included,
    excluded,
    ambiguous,
    freeForm,
    proposalPath: null,
    counts: {
      included: included.length,
      excluded: excluded.length,
      ambiguous: ambiguous.length,
      bytes,
    },
  };
}
