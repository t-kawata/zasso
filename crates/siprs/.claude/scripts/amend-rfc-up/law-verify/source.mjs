// [::TICKET::] PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-422 --for-spec --no-implementation-order`.
// [::TICKET::] PX-421 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-421 --for-spec --no-implementation-order`.
/**
 * Source-side primitives shared by the canonical *-law verifier.
 *
 * The verifier proves facts from artifacts: it resolves an alias to the actual
 * source file, reads bytes, and hashes the same span the skill claims. It never
 * trusts a generated summary.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const ALIAS_PATTERN = /^sources\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const EVIDENCE_LIMIT = 5;
export const TOKEN_PATTERN = /[A-Za-z][A-Za-z0-9_]*/g;

export function sha256Text(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

export function normalizeLf(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export function exists(filePath) {
  return fs.existsSync(filePath);
}

export function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function listFiles(directory, predicate = () => true) {
  if (!exists(directory)) return [];
  const collected = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'target') continue;
      collected.push(...listFiles(entryPath, predicate));
    } else if (entry.isFile() && predicate(entryPath)) {
      collected.push(entryPath);
    }
  }
  return collected;
}

export function listRelativeFiles(directory) {
  return listFiles(directory).map((file) => path.relative(directory, file).replace(/\\/g, '/')).sort();
}

export function splitLines(text) {
  const lines = normalizeLf(text).split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function parseManifest(text) {
  const manifest = { files: [] };
  let currentFile = null;
  for (const rawLine of normalizeLf(text).split('\n')) {
    const line = rawLine.trim();
    if (line === '[[file]]') {
      currentFile = {};
      manifest.files.push(currentFile);
      continue;
    }
    const assignment = line.match(/^([a-z_][a-z0-9_]*)\s*=\s*"([^"]*)"$/);
    if (!assignment) continue;
    const [, key, value] = assignment;
    if (currentFile && (key === 'path' || key === 'sha256')) currentFile[key] = value;
    else manifest[key] = value;
  }
  return manifest;
}

export function parseFrontmatter(text) {
  const match = normalizeLf(text).match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const assignment = line.match(/^([a-z0-9_]+):\s*(.*)$/);
    if (assignment) fields[assignment[1]] = assignment[2].trim();
  }
  return { fields, body: match[2] };
}

export function stripOneTrailingNewline(text) {
  return String(text).endsWith('\n') ? String(text).slice(0, -1) : String(text);
}

export function redactText(text, redaction) {
  const byHash = new Map((redaction ?? []).map((entry) => [entry.sha256, entry.placeholder]));
  let out = '';
  let last = 0;
  for (const match of String(text).matchAll(TOKEN_PATTERN)) {
    out += text.slice(last, match.index);
    out += byHash.get(sha256Text(match[0].toLowerCase())) ?? match[0];
    last = match.index + match[0].length;
  }
  return out + text.slice(last);
}

export function tokenHashes(text) {
  const hashes = new Set();
  for (const match of String(text).matchAll(TOKEN_PATTERN)) {
    hashes.add(sha256Text(match[0].toLowerCase()));
  }
  return hashes;
}

export function loadAliasMap(aliasPath) {
  if (!aliasPath || !exists(aliasPath)) {
    throw Object.assign(new Error('path alias map is missing'), { code: 'PATH_ALIAS_MISSING' });
  }
  const aliasMap = JSON.parse(readText(aliasPath));
  if (aliasMap.schema !== 'law-path-alias/v1') {
    throw Object.assign(new Error('path alias map schema is invalid'), { code: 'PATH_ALIAS_MISSING' });
  }
  if (!Array.isArray(aliasMap.input_roots) || aliasMap.input_roots.length === 0) {
    throw Object.assign(new Error('path alias map has no input_roots'), { code: 'PATH_ALIAS_MISSING' });
  }
  if (!aliasMap.aliases || typeof aliasMap.aliases !== 'object') {
    throw Object.assign(new Error('path alias map has no aliases'), { code: 'PATH_ALIAS_MISSING' });
  }
  for (const [alias, original] of Object.entries(aliasMap.aliases)) {
    if (!ALIAS_PATTERN.test(alias)) {
      throw Object.assign(new Error(`invalid alias: ${alias}`), { code: 'PATH_ALIAS_MISSING' });
    }
    if (path.isAbsolute(original) || String(original).includes('..')) {
      throw Object.assign(new Error(`alias target is not repository-relative: ${original}`), { code: 'PATH_ALIAS_MISSING' });
    }
  }
  return aliasMap;
}

export function resolveAlias({ alias, aliasMap, sourceRoot }) {
  if (!aliasMap) {
    throw Object.assign(new Error('path alias map is required'), { code: 'PATH_ALIAS_MISSING' });
  }
  if (!sourceRoot) {
    throw Object.assign(new Error('source root is required'), { code: 'SOURCE_ROOT_REQUIRED' });
  }
  const original = aliasMap.aliases[alias];
  if (!original) {
    throw Object.assign(new Error(`alias has no original: ${alias}`), { code: 'PATH_ALIAS_MISSING' });
  }
  const resolved = path.resolve(sourceRoot, original);
  if (!isInside(sourceRoot, resolved)) {
    throw Object.assign(new Error(`alias escapes source root: ${alias}`), { code: 'PATH_ALIAS_MISSING' });
  }
  if (!exists(resolved)) {
    throw Object.assign(new Error(`source missing: ${original}`), { code: 'MANIFEST_HASH_MISMATCH' });
  }
  return resolved;
}

export function hashSpan(sourceLines, span) {
  return sha256Text(sourceLines.slice(span.start_line - 1, span.end_line).join('\n'));
}

export function writeAtomic(filePath, text) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const temporary = `${path.resolve(filePath)}.tmp`;
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, path.resolve(filePath));
}

export function status(value, evidence, extra = {}) {
  return { status: value, evidence, ...extra };
}
