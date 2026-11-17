/**
 * Render one asset file as an OKF concept.
 *
 * The body carries the exact text, the asset hash, the line span, and a
 * footnote. The concept id is derived from the path inside the asset root, so
 * renaming the root does not rename the concept.
 */

import { createHash } from 'node:crypto';

const SKILL_DATE = '2026-11-17';
const STALE_AFTER = '2027-11-17';

export function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function pathInsideRoot(relativePath) {
  const segments = String(relativePath).split('/');
  return segments.length > 1 ? segments.slice(1).join('/') : segments[0];
}

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function fenceFor(text) {
  const runs = text.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function renderSources(resource, sourceId) {
  return [{ resource, id: sourceId, title: resource }];
}

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function bodyFor({ measurement, meta, sourceId }) {
  const fence = fenceFor(measurement.text ?? '');
  const lines = [
    `## ${measurement.path}`,
    '',
    meta.description,
    '',
    `- role: ${meta.type}`,
    `- governing concept: ${meta.requires.join(', ')}`,
    `- asset hash: \`${measurement.sha256}\``,
    `- source span: lines 1-${measurement.lines}`,
    '',
  ];
  if (measurement.kind === 'text') {
    lines.push(`${fence}${measurement.language ?? 'text'}`);
    lines.push((measurement.text ?? '').replace(/\n$/, ''));
    lines.push(fence);
    lines.push('');
  } else {
    lines.push(`Binary asset; read the file at \`${measurement.path}\`.`);
    lines.push('');
  }
  lines.push(`[^${sourceId}]`);
  lines.push('');
  lines.push(`[^${sourceId}]: ${measurement.path} — lines 1-${measurement.lines}.`);
  lines.push('');
  return lines.join('\n');
}

/**
 * @param {{measurement:object, meta:{type:string,description:string,requires:string[]}}} input
 */
export function renderAssetConcept({ measurement, meta }) {
  const inside = pathInsideRoot(measurement.path);
  const idSlug = slug(inside);
  const sourceId = `exec-asset-${idSlug}`;
  const body = bodyFor({ measurement, meta, sourceId });
  const contentSha256 = createHash('sha256').update(body, 'utf8').digest('hex');
  const frontmatter = {
    type: meta.type,
    title: measurement.path,
    description: meta.description ?? `Asset ${measurement.path}`,
    sources: renderSources(measurement.path, sourceId),
    generated: { by: 'build-okf-skill', at: SKILL_DATE },
    verified: [{ by: 'machine', at: SKILL_DATE }],
    status: 'stable',
    stale_after: STALE_AFTER,
    'x-asset-path': measurement.path,
    'x-asset-sha256': measurement.sha256,
    'x-asset-kind': measurement.kind,
    'x-source-span': `1-${measurement.lines}`,
    'x-content-sha256': contentSha256,
    'x-requires': [...meta.requires],
    'x-topic': 'assets',
    ...(meta.extraFrontmatter ?? {}),
  };
  return {
    id: `pages/assets/${idSlug}`,
    path: `pages/assets/${idSlug}.md`,
    frontmatter,
    body,
    contentSha256,
  };
}

export function renderAssetManual({ assets = [] } = {}) {
  if (assets.length === 0) {
    return [
      '## Execution Assets',
      '',
      'No execution assets were provided. All concepts are guide pages; use',
      '`list --path pages` to traverse them.',
      '',
    ].join('\n');
  }
  return [
    '## Execution Assets',
    '',
    'Each asset is a concept under `pages/assets/`. The body carries the exact',
    'file text, the asset hash, and the governing guide section.',
    '',
    '- `node "$OKF" list --path pages/assets`',
    '- `node "$OKF" expand --id pages/assets/<asset>`',
    '- `node "$OKF" sources pages/assets/<asset>`',
    '',
    'Verify a copy with `sha256sum` against `x-asset-sha256`, then copy the asset',
    'root to the workspace before running it.',
    '',
    '### Scenario: find an asset',
    '',
    '1. `node "$OKF" list --path pages/assets`',
    '2. `node "$OKF" expand --id pages/assets/<asset>`',
    '',
    '### Scenario: verify an asset copy',
    '',
    '1. Read `x-asset-sha256` from the concept.',
    '2. Run `sha256sum <asset>` and compare.',
    '',
  ].join('\n');
}
