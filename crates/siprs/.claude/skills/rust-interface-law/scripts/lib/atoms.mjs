import { parseBlocks, splitLines, splitRow } from './markdown.mjs';
import { parseRegistryTable, RULE_ID } from './registry.mjs';

export { parseBlocks } from './markdown.mjs';
import { redactText, sha256 } from './redact.mjs';
import { attributeCoverage } from './coverage.mjs';

const REGISTRY_HEADERS = [
  'ID',
  'Class',
  'Applicability',
  'Parent',
  'Source',
  'Verification',
  'Gate',
];
const STATEMENT_HEADERS = ['Statement', 'Short statement'];
const NORMATIVE = /\b(MUST NOT|MUST|SHALL)\b/;

export function parseDocument({ path, text, redaction = [] }) {
  const lines = splitLines(text);
  const blocks = parseBlocks(text);
  const atoms = [];
  const registry = new Map();
  const headingStack = [];
  const counters = new Map();
  let ruleOrdinal = 0;

  for (const block of blocks) {
    if (block.kind === 'heading') {
      headingStack.length = Math.min(headingStack.length, block.level - 1);
      headingStack[block.level - 1] = block.heading;
    }

    const headingPath = headingStack.filter((part) => part !== undefined);
    const context = { path, headingPath, redaction };
    const isRegistry = block.kind === 'table'
      && REGISTRY_HEADERS.every((header) => block.headers.includes(header))
      && STATEMENT_HEADERS.some((header) => block.headers.includes(header));

    if (isRegistry) {
      for (const [id, cells] of parseRegistryTable(block)) registry.set(id, cells);
      const headerEnd = Math.min(block.start_line + 1, block.end_line);
      const headerText = block.rows.slice(0, headerEnd - block.start_line + 1).join('\n');
      atoms.push(makeAtom(context, {
        type: 'TableHeader',
        text: headerText,
        span: { start_line: block.start_line, end_line: headerEnd },
        ordinal: 1,
        classification: 'structural',
        reason: 'registry header',
      }));

      for (let rowIndex = 2; rowIndex < block.rows.length; rowIndex++) {
        const row = block.rows[rowIndex];
        const id = (splitRow(row)[0] ?? '').replace(/`/g, '').trim();
        const span = { start_line: block.start_line + rowIndex, end_line: block.start_line + rowIndex };
        if (!RULE_ID.test(id)) {
          atoms.push(makeAtom(context, {
            type: 'TableRow',
            text: row,
            span,
            ordinal: rowIndex,
            classification: 'structural',
            reason: 'non-rule row',
          }));
          continue;
        }
        ruleOrdinal++;
        atoms.push(makeAtom(context, {
          type: 'Rule',
          text: row,
          span,
          ordinal: ruleOrdinal,
          id,
          classification: 'normative',
          reason: 'registry row',
        }));
      }
      continue;
    }

    const type = typeFor(block);
    const counterKey = type + ':' + headingPath.join(' > ');
    const ordinal = (counters.get(counterKey) ?? 0) + 1;
    counters.set(counterKey, ordinal);
    const classification = classify(block);

    atoms.push(makeAtom(context, {
      type,
      text: block.text,
      span: { start_line: block.start_line, end_line: block.end_line },
      ordinal,
      classification: classification.classification,
      reason: classification.reason,
      language: block.language,
    }));
  }

  assertUnique(atoms);
  return {
    path,
    lines: lines.length,
    atoms,
    registry,
    coverage: attributeCoverage(atoms, lines.length),
  };
}

function makeAtom(context, spec) {
  const { path, headingPath, redaction } = context;
  const { type, text, span, ordinal, id, classification, reason, language } = spec;
  const sourceSha256 = sha256(text);
  const delivered = redactText(text, redaction);
  const deliveredHeadingPath = headingPath.map((part) => redactText(part, redaction));
  const contentSha256 = sha256(delivered);
  const atomId = id ?? [
    type.toLowerCase(),
    slug(deliveredHeadingPath.join('/')),
    ordinal,
    contentSha256.slice(0, 12),
  ].join('/');

  return {
    id: atomId,
    type,
    source: path,
    heading_path: deliveredHeadingPath,
    ordinal,
    source_sha256: sourceSha256,
    content_sha256: contentSha256,
    span,
    classification,
    reason,
    text: delivered,
    ...(language ? { language } : {}),
  };
}

function typeFor(block) {
  if (block.kind === 'heading') return 'Heading';
  if (block.kind === 'code') return 'CodeBlock';
  if (block.kind === 'table') return 'Table';
  if (block.kind === 'list') return 'List';
  if (block.kind === 'blank') return 'Blank';
  return 'Paragraph';
}

function classify(block) {
  if (block.kind === 'heading' || block.kind === 'blank') {
    return { classification: 'structural', reason: 'structural block' };
  }
  if (block.kind === 'code' || block.kind === 'table') {
    return { classification: 'non_normative', reason: 'typed block without normative prose' };
  }
  const match = block.text.match(NORMATIVE);
  if (match) {
    return { classification: 'normative', reason: 'normative keyword: ' + match[0] };
  }
  return { classification: 'non_normative', reason: 'no normative keyword' };
}

function slug(value) {
  const slugged = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slugged || 'root';
}

function assertUnique(atoms) {
  const seen = new Set();
  for (const atom of atoms) {
    if (seen.has(atom.id)) throw new Error('duplicate atom id: ' + atom.id);
    seen.add(atom.id);
  }
}
