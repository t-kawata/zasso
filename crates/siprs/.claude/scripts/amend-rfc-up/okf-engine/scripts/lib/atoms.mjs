// @verifies C001
// @verifies C002
/**
 * Source measurement and claim extraction.
 *
 * A wiki atom is a block of source text with a stable identity. A Claim is a
 * non-structural statement block; it is the only atom type that must carry
 * provenance into a node.
 */

import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseBlocks, splitLines } from './markdown.mjs';
import { sha256 } from './redact.mjs';

const CJK = /[぀-ヿ一-鿿]/;
const SEPARATOR = /^[-*_]{3,}$/;
const METADATA_LABEL = /^\*\*(Status|Version|Parent|Contracts|Scope|Owner|Date):\*\*/;

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function atomType(block) {
  if (block.kind === 'code') return 'CodeBlock';
  if (block.kind === 'table') return 'Table';
  if (block.kind === 'heading') return 'Heading';
  if (block.kind === 'blank') return 'Blank';
  if (block.kind === 'list') return isClaimBlock(block) ? 'Claim' : 'Paragraph';
  return isClaimBlock(block) ? 'Claim' : 'Paragraph';
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function isClaimBlock(block) {
  const text = String(block.text ?? '').trim();
  if (text.length === 0) return false;
  if (SEPARATOR.test(text)) return false;
  if (METADATA_LABEL.test(text)) return false;
  return true;
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function atomPrefix(type, ordinal) {
  return `${type.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase()}-${String(ordinal).padStart(2, '0')}`;
}

/**
 * Measure a source set without writing anything.
 *
 * @param {{root:string, paths:string[]}} input
 * @returns {{manifest:object[], atoms:object[], claims:object[]}}
 */
export function measureSources({ root, paths }) {
  const manifest = [];
  const atoms = [];
  const usedAliases = new Set();
  const counters = new Map();

  for (const path of paths) {
    const absolute = resolve(root, path);
    let raw;
    try {
      raw = readFileSync(absolute, 'utf8');
    } catch {
      throw Object.assign(new Error(`source missing: ${path}`), { code: 'SOURCE_MISSING' });
    }
    if (raw.includes('\0')) {
      throw Object.assign(new Error(`not markdown: ${path}`), { code: 'SOURCE_NOT_MARKDOWN' });
    }
    if (CJK.test(raw)) {
      throw Object.assign(new Error(`not English: ${path}`), { code: 'SOURCE_NOT_ENGLISH' });
    }
    const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const alias = `sources/${basename(path)}`;
    if (usedAliases.has(alias)) {
      throw Object.assign(new Error(`duplicate source alias: ${alias}`), { code: 'SOURCE_ALIAS_DUPLICATE' });
    }
    usedAliases.add(alias);
    manifest.push({ alias, sha256: sha256(text), lines: splitLines(text).length });

    const headingStack = [];
    for (const block of parseBlocks(text)) {
      if (block.kind === 'heading') {
        const level = (block.text.match(/^#+/) ?? ['#'])[0].length;
        headingStack.length = Math.min(headingStack.length, level - 1);
        headingStack[level - 1] = block.text.replace(/^#+\s*/, '').trim();
      }
      const type = atomType(block);
      const counter = (counters.get(type) ?? 0) + 1;
      counters.set(type, counter);
      const id = atomPrefix(type, counter);
      atoms.push({
        id,
        type,
        text: block.text,
        source: alias,
        headingPath: headingStack.filter(Boolean),
        span: { start_line: block.start_line, end_line: block.end_line },
        content_sha256: sha256(block.text),
      });
    }
  }

  const lineCoverage = manifest.map((entry) => {
    const covered = new Set();
    for (const atom of atoms.filter((item) => item.source === entry.alias)) {
      for (let line = atom.span.start_line; line <= atom.span.end_line; line += 1) covered.add(line);
    }
    const gaps = [];
    for (let line = 1; line <= entry.lines; line += 1) if (!covered.has(line)) gaps.push(line);
    return { alias: entry.alias, lines: entry.lines, attributed: covered.size, gaps };
  });
  const claims = atoms.filter((atom) => atom.type === 'Claim' || atom.type === 'CodeBlock' || atom.type === 'Table');
  if (claims.length === 0) {
    throw Object.assign(new Error('source set carries no claim-bearing information'), { code: 'INFORMATION_ZERO' });
  }
  return { manifest, atoms, claims, lineCoverage };
}

/**
 * Extract the claims that must become wiki nodes.
 *
 * @param {{atoms:object[]}} input
 * @returns {object[]}
 */
export function extractClaims({ atoms }) {
  const selected = atoms.filter((atom) => atom.type === 'Claim' || atom.type === 'CodeBlock');
  return selected.map((atom) => ({
    id: atom.id,
    type: atom.type,
    topic: topicOf(atom),
    claim: firstSentence(atom.text),
    evidence: atom.text,
    source: atom.source,
    span: atom.span,
    headingPath: atom.headingPath,
    content_sha256: atom.content_sha256,
  }));
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function topicOf(atom) {
  const heading = atom.headingPath.at(-1) ?? atom.source.replace(/^sources\//, '').replace(/\.[^.]+$/, '');
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'general';
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function firstSentence(text) {
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(.+?[.!?])(\s|$)/);
  return (match ? match[1] : normalized).slice(0, 240);
}
