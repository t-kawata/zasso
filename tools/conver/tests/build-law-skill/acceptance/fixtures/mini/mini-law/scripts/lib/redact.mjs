import { createHash } from 'node:crypto';

const TOKEN = /[A-Za-z][A-Za-z0-9_]*/g;
const HEX_SHA256 = /^[0-9a-f]{64}$/;
const PLACEHOLDER = /^<[a-z][a-z0-9-]*>$/;

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function redactText(text, redaction) {
  const byHash = new Map((redaction ?? []).map((entry) => [entry.sha256, entry.placeholder]));
  let out = '';
  let last = 0;
  for (const match of String(text).matchAll(TOKEN)) {
    out += text.slice(last, match.index);
    out += byHash.get(sha256(match[0].toLowerCase())) ?? match[0];
    last = match.index + match[0].length;
  }
  return out + text.slice(last);
}

export function isRedactedMap(map) {
  if (!Array.isArray(map)) return false;
  return map.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const keys = Object.keys(entry).sort();
    return keys.length === 2
      && keys[0] === 'placeholder'
      && keys[1] === 'sha256'
      && typeof entry.sha256 === 'string'
      && HEX_SHA256.test(entry.sha256)
      && typeof entry.placeholder === 'string'
      && PLACEHOLDER.test(entry.placeholder);
  });
}

export function findForbiddenTokens(text, redaction) {
  const forbidden = new Set((redaction ?? []).map((entry) => entry.sha256));
  const hits = [];
  for (const match of String(text).matchAll(TOKEN)) {
    if (forbidden.has(sha256(match[0].toLowerCase()))) hits.push(match[0]);
  }
  return hits;
}
