// [::TICKET::] PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-422 --for-spec --no-implementation-order`.
// [::TICKET::] PX-421 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-421 --for-spec --no-implementation-order`.
/**
 * Independent parsers for the artifacts the verifier re-derives.
 *
 * These duplicate only the minimum syntax: Markdown tables, node frontmatter,
 * and the coverage report. They deliberately do not import the skill's parser;
 * a forged parser must not be able to satisfy the verifier.
 */

import path from 'node:path';
import { normalizeLf, parseFrontmatter, readText, listFiles } from './source.mjs';

export const RULE_ID_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/;
export const REGISTRY_HEADERS = Object.freeze([
  'ID',
  'Class',
  'Applicability',
  'Parent',
  'Source',
  'Verification',
  'Gate',
]);
export const STATEMENT_HEADERS = Object.freeze(['Statement', 'Short statement']);

export function splitRow(line) {
  const cells = String(line).split('|').map((cell) => cell.trim());
  if (cells.length > 0 && cells[0] === '') cells.shift();
  if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

export function parseMarkdownTables(text) {
  const lines = normalizeLf(text).split('\n');
  const tables = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].trimStart().startsWith('|')) {
      index++;
      continue;
    }
    const start = index;
    while (index < lines.length && lines[index].trimStart().startsWith('|')) index++;
    const block = lines.slice(start, index);
    const headers = splitRow(block[0]);
    const rows = block.slice(2).map((line) => splitRow(line));
    tables.push({ headers, rows, start_line: start + 1 });
  }
  return tables;
}

export function parseCoverageReport(text) {
  const rows = [];
  for (const table of parseMarkdownTables(text)) {
    if (!table.headers.includes('Path') || !table.headers.includes('Gaps')) continue;
    for (const cells of table.rows) {
      const filePath = (cells[0] ?? '').replace(/`/g, '').trim();
      if (!filePath || filePath === '**TOTAL**') continue;
      rows.push({
        path: filePath,
        lines: Number(cells[1]),
        attributed: Number(cells[2]),
        excluded: Number(cells[3]),
        gaps: Number(cells[4]),
        overlaps: Number(cells[5]),
      });
    }
  }
  return rows;
}

export function collectNodes(skillPath) {
  const nodesDirectory = path.join(skillPath, 'okf/nodes');
  return listFiles(nodesDirectory, (file) => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const parsed = parseFrontmatter(readText(file));
      if (!parsed) return { file, fields: null, body: '' };
      return { file, fields: parsed.fields, body: parsed.body };
    });
}

export function isRegistryTable(table) {
  return REGISTRY_HEADERS.every((header) => table.headers.includes(header))
    && STATEMENT_HEADERS.some((header) => table.headers.includes(header));
}

export function collectRegistryIds(sourceDocuments) {
  const ids = new Set();
  const invalid = [];
  for (const document of sourceDocuments) {
    for (const table of parseMarkdownTables(document.text)) {
      if (!isRegistryTable(table)) continue;
      for (const cells of table.rows) {
        const id = (cells[0] ?? '').replace(/`/g, '').trim();
        if (!id) continue;
        if (!RULE_ID_PATTERN.test(id)) {
          invalid.push(id);
          continue;
        }
        ids.add(id);
      }
    }
  }
  return { ids, invalid };
}

export function parseNumber(value) {
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}
