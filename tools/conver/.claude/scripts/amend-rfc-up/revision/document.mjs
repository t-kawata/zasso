// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { isAbsolute, relative, resolve } from 'node:path';
import { CJK_PATTERN } from './constants.mjs';
import { sha256Text } from './determinism.mjs';
import { failRevision } from './errors.mjs';

export function normalizeDocument(text) {
  return String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

export function hasCjk(text) {
  return CJK_PATTERN.test(String(text ?? ''));
}

export function detectLanguage(text) {
  return hasCjk(text) ? 'ja' : 'en';
}

export function measureDocument({ text, path = null }) {
  const normalized = normalizeDocument(text);
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const lineHashes = lines.map((line) => sha256Text(line));
  const blocks = classifyLines(lines);
  const headings = lines
    .map((line, index) => ({ line, index }))
    .filter((entry) => /^(#{1,6})\s+\S/.test(entry.line))
    .map((entry) => ({
      line: entry.index + 1,
      level: entry.line.match(/^(#{1,6})/)[1].length,
      text_sha256: sha256Text(entry.line),
    }));
  return {
    schema: 'revision-document-measurement/v1',
    path,
    language: detectLanguage(normalized),
    sha256: sha256Text(normalized),
    lineCount: lines.length,
    headings,
    blocks,
    lineHashes,
  };
}

export function buildDocumentMap({ text, alias }) {
  const measured = measureDocument({ text, path: alias });
  return {
    schema: 'revision-document-map/v1',
    alias,
    sha256: measured.sha256,
    language: measured.language,
    lineCount: measured.lineCount,
    headings: measured.headings.map((heading) => ({
      line: heading.line,
      level: heading.level,
      text_sha256: heading.text_sha256,
    })),
    blocks: measured.blocks.map((block) => ({
      kind: block.kind,
      line: block.line,
      line_sha256: block.line_sha256,
    })),
    lineHashes: measured.lineHashes,
  };
}

export function resolveSourcePath(candidate, root) {
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(root, candidate);
  const rel = relative(resolve(root), absolute);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return absolute;
  return failRevision('REVISION_SOURCE_OUTSIDE_ROOT', `source escapes the repository root: ${candidate}`, { target: candidate });
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function classifyLines(lines) {
  const blocks = [];
  let fence = null;
  lines.forEach((line, index) => {
    const text = line.trim();
    if (text.length === 0) return;
    if (/^(```|~~~)/.test(text)) {
      fence = fence === null ? { start: index + 1 } : null;
      blocks.push({ kind: 'code-block', line: index + 1, line_sha256: sha256Text(line) });
      return;
    }
    if (fence) {
      blocks.push({ kind: 'code-block', line: index + 1, line_sha256: sha256Text(line) });
      return;
    }
    if (/^(#{1,6})\s+\S/.test(text)) {
      blocks.push({ kind: 'heading', line: index + 1, line_sha256: sha256Text(line) });
      return;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      blocks.push({ kind: 'list-item', line: index + 1, line_sha256: sha256Text(line) });
      return;
    }
    if (/^\s*\|/.test(line)) {
      blocks.push({ kind: 'table-row', line: index + 1, line_sha256: sha256Text(line) });
      return;
    }
    blocks.push({ kind: 'paragraph', line: index + 1, line_sha256: sha256Text(line) });
  });
  return blocks;
}
