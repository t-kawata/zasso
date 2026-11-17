// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
/**
 * Measure one asset file without interpreting it.
 *
 * The measurement is the stable input to classification, rendering, and
 * ledgers. Text is LF-normalized; binary content is hashed as bytes and never
 * embedded in a concept body.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const BINARY_PROBE_BYTES = 8192;

export function normalizeLf(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n');
}

export function isBinaryBuffer(buffer) {
  const probe = buffer.subarray(0, BINARY_PROBE_BYTES);
  return probe.includes(0);
}

export function languageFor(relativePath) {
  const name = relativePath.split('/').pop() ?? relativePath;
  if (name === 'Dockerfile' || name === 'Containerfile') return 'dockerfile';
  const extension = extname(name).toLowerCase();
  return {
    '.py': 'python',
    '.sh': 'bash',
    '.bash': 'bash',
    '.ps1': 'powershell',
    '.psm1': 'powershell',
    '.json': 'json',
    '.toml': 'toml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.conf': 'ini',
    '.ini': 'ini',
    '.cfg': 'ini',
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.ts': 'typescript',
  }[extension] ?? 'text';
}

export function lineCount(text) {
  if (text.length === 0) return 0;
  return text.endsWith('\n') ? text.slice(0, -1).split('\n').length : text.split('\n').length;
}

export function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function sha256Bytes(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * @param {{absolutePath:string, relativePath:string, root:string}} input
 */
export function measureAsset({ absolutePath, relativePath, root }) {
  const buffer = readFileSync(absolutePath);
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const rootName = normalizedPath.includes('/') ? normalizedPath.split('/')[0] : normalizedPath;
  if (isBinaryBuffer(buffer)) {
    return {
      path: normalizedPath,
      root: rootName,
      absolutePath,
      kind: 'binary',
      text: null,
      bytes: buffer.length,
      lines: 0,
      sha256: sha256Bytes(buffer),
      language: null,
    };
  }
  const text = normalizeLf(buffer.toString('utf8'));
  return {
    path: normalizedPath,
    root: rootName,
    absolutePath,
    kind: 'text',
    text,
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: lineCount(text),
    sha256: sha256Text(text),
    language: languageFor(normalizedPath),
  };
}
