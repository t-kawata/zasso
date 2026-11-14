/**
 * Quality findings that conformance deliberately allows.
 */

import { footnoteLabels, sourceIds } from '../metadata/provenance.mjs';
import { bodyLines } from './conformance.mjs';
import { directoryOf } from '../paths/directory.mjs';

export const DEFAULT_ALLOWED_TYPES = Object.freeze(new Set([
  'Rule', 'Page', 'Identity', 'Concept', 'Claim', 'Entity', 'Procedure', 'Reference', 'Section', 'Documentation',
]));

export const DEFAULT_ALLOWED_KEYS = Object.freeze(new Set([
  'type', 'title', 'description', 'resource', 'tags', 'status',
  'generated', 'verified', 'stale_after', 'sources',
]));

export function lintBundle(bundle, options = {}) {
  const now = options.now ?? new Date();
  const allowedTypes = options.allowedTypes ?? DEFAULT_ALLOWED_TYPES;
  const allowedKeys = options.allowedKeys ?? DEFAULT_ALLOWED_KEYS;
  const findings = [];
  findings.push(...brokenLinks(bundle));
  findings.push(...missingIndexes(bundle));
  findings.push(...indexOrphans(bundle));
  findings.push(...unknownTypes(bundle, allowedTypes));
  findings.push(...unknownKeys(bundle, allowedKeys));
  findings.push(...caseCollisions(bundle));
  findings.push(...staleConcepts(bundle, now));
  findings.push(...sourceMismatches(bundle));
  return findings;
}

function finding(code, path, message, extra = {}) {
  return { code, path, message, ...extra };
}

function brokenLinks(bundle) {
  return bundle.tree.links
    .filter((link) => link.kind === 'internal' && link.exists === false)
    .map((link) => finding('LINK_BROKEN', link.from, `${link.target} does not exist`, { target: link.target, line: link.line }));
}

function missingIndexes(bundle) {
  const concepts = new Map();
  for (const concept of bundle.concepts) concepts.set(directoryOf(concept.path), true);
  const indexed = new Set(bundle.reserved.filter((file) => file.kind === 'index').map((file) => file.directory));
  const findings = [];
  for (const directory of concepts.keys()) {
    if (indexed.has(directory)) continue;
    findings.push(finding('INDEX_MISSING', directory === '' ? 'index.md' : `${directory}/index.md`, 'directory has concepts but no index.md'));
  }
  return findings;
}

function indexOrphans(bundle) {
  const indexByDirectory = new Map(
    bundle.reserved.filter((file) => file.kind === 'index').map((file) => [file.directory, file]),
  );
  const findings = [];
  for (const concept of bundle.concepts) {
    const index = indexByDirectory.get(directoryOf(concept.path));
    if (!index) continue;
    const linked = index.links.some((link) => link.concept === concept.id);
    if (!linked) findings.push(finding('INDEX_ORPHAN', concept.path, 'concept is absent from its directory index'));
  }
  return findings;
}

function unknownTypes(bundle, allowedTypes) {
  return bundle.concepts
    .filter((concept) => concept.type && !allowedTypes.has(concept.type))
    .map((concept) => finding('UNKNOWN_TYPE', concept.path, `unknown type: ${concept.type}`, { type: concept.type }));
}

function unknownKeys(bundle, allowedKeys) {
  const findings = [];
  for (const concept of bundle.concepts) {
    for (const key of Object.keys(concept.frontmatter ?? {})) {
      if (allowedKeys.has(key) || key.startsWith('x-')) continue;
      findings.push(finding('UNKNOWN_KEY', concept.path, `unknown key: ${key}`, { key }));
    }
  }
  return findings;
}

function caseCollisions(bundle) {
  const seen = new Map();
  const findings = [];
  for (const path of bundle.files) {
    const key = path.toLowerCase();
    if (seen.has(key) && seen.get(key) !== path) {
      findings.push(finding('CASE_COLLISION', path, `case-colliding path with ${seen.get(key)}`));
    } else {
      seen.set(key, path);
    }
  }
  return findings;
}

function staleConcepts(bundle, now) {
  return bundle.concepts
    .filter((concept) => concept.isStale(now))
    .map((concept) => finding('STALE_CONCEPT', concept.path, 'concept is stale or deprecated'));
}

function sourceMismatches(bundle) {
  const findings = [];
  for (const concept of bundle.concepts) {
    const ids = new Set(sourceIds(concept));
    for (const label of footnoteLabels(concept)) {
      if (!ids.has(label)) findings.push(finding('SOURCE_ID_MISMATCH', concept.path, `footnote ${label} has no sources entry`));
    }
  }
  return findings;
}

export { bodyLines };
