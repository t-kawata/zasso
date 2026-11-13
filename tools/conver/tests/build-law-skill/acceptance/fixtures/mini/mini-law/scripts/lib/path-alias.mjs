// [::TICKET::] PX-421 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-421 --for-spec --no-implementation-order`.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export const ALIAS_PATTERN = /^sources\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function sha256(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

export function loadPathAlias(aliasPath) {
  if (!aliasPath || !existsSync(aliasPath)) throw new Error('path alias map not found: ' + aliasPath);
  const aliasMap = JSON.parse(readFileSync(aliasPath, 'utf8'));
  if (aliasMap.schema !== 'law-path-alias/v1') throw new Error('path alias map schema is invalid');
  if (!Array.isArray(aliasMap.input_roots) || aliasMap.input_roots.length === 0) {
    throw new Error('path alias map has no input roots');
  }
  if (!aliasMap.aliases || typeof aliasMap.aliases !== 'object') throw new Error('path alias map has no aliases');
  for (const [alias, original] of Object.entries(aliasMap.aliases)) {
    if (!ALIAS_PATTERN.test(alias)) throw new Error('invalid alias: ' + alias);
    if (isAbsolute(original) || String(original).includes('..')) {
      throw new Error('alias target must be repository-relative: ' + original);
    }
  }
  return aliasMap;
}

export function resolveAlias(aliasMap, alias, sourceRoot) {
  const original = aliasMap.aliases[alias];
  if (!original) throw new Error('alias is unmapped: ' + alias);
  const resolved = resolve(sourceRoot, original);
  const relativePath = relative(sourceRoot, resolved);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('alias escapes source root: ' + alias);
  }
  if (!existsSync(resolved)) throw new Error('source missing: ' + original);
  return resolved;
}

export function listAliasEntries(aliasMap) {
  return Object.entries(aliasMap.aliases).map(([alias, original]) => ({ alias, original }));
}
