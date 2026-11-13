// @verifies C001
// @verifies C002
/**
 * Render the OKF tree from the lock.
 *
 * This is the only writer of okf/nodes, okf/index.md, okf/log.md, and the two
 * source views. A rebuild must produce identical bytes.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from './redact.mjs';

export function renderOkf({ lock, outDir }) {
  const nodesDir = join(outDir, 'nodes');
  mkdirSync(nodesDir, { recursive: true });
  const rows = [];
  const bySource = new Map();

  for (const node of lock.nodes) {
    const file = `${safeName(node.id)}.md`;
    const frontmatter = [
      '---',
      `type: ${node.type}`,
      `id: ${node.id}`,
      `topic: ${node.topic}`,
      `summary: ${JSON.stringify(node.summary)}`,
      `sources: ${JSON.stringify(node.sources)}`,
      `source_sha256: ${node.source_sha256}`,
      `span: ${JSON.stringify(node.span)}`,
      `links: ${JSON.stringify(node.links)}`,
      `conflicts: ${JSON.stringify(node.conflicts)}`,
      `supersedes: ${JSON.stringify(node.supersedes)}`,
      `content_sha256: ${node.content_sha256}`,
      '---',
      '',
    ].join('\n');
    writeFileSync(join(nodesDir, file), `${frontmatter}${node.text}\n`);
    rows.push(`| \`${node.id}\` | ${node.type} | ${node.topic} | [node](./nodes/${file}) |`);
    const source = node.sources[0];
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source).push(node.text);
  }

  const index = ['# OKF Index', '', '| ID | Type | Topic | Node |', '|---|---|---|---|', ...rows, ''].join('\n');
  writeFileSync(join(outDir, 'index.md'), index);
  writeFileSync(join(outDir, 'log.md'), [
    '# OKF Log',
    '',
    `- spec_version: ${lock.spec_version}`,
    `- nodes: ${lock.nodes.length}`,
    `- lock: ${lock.closure_sha256}`,
    '',
  ].join('\n'));

  const sourceView = [
    '# Source View',
    '',
    'Generated from the frozen source set. Do not edit.',
    '',
    ...[...bySource.entries()].sort(([left], [right]) => left.localeCompare(right)).flatMap(([source, texts]) => [
      `# Source: ${source}`,
      '',
      ...texts.flatMap((text) => [text, '']),
    ]),
  ].join('\n');
  writeFileSync(join(outDir, 'source.md'), sourceView);
  writeFileSync(join(outDir, 'source.baseline.md'), sourceView);
  return { nodes: lock.nodes.length, closure_sha256: lock.closure_sha256 };
}

export function renderOkfDigest({ lock }) {
  return sha256(JSON.stringify({
    nodes: lock.nodes.map((node) => [node.id, node.content_sha256]),
    sources: lock.sources,
  }));
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function safeName(id) {
  return id.replace(/[^A-Za-z0-9._-]/g, '-');
}
