// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-430 --for-spec --no-implementation-order`.
/**
 * Render one traversal response as AI-facing Markdown or verification JSON.
 *
 * The Markdown view is lossless: every frontier entry, the full body, every
 * command, and every extra top-level field appear. JSON stays the machine
 * contract for tests and verifiers, so the AI manual never mentions it.
 */

export const FORMAT_MARKDOWN = 'markdown';
export const FORMAT_JSON = 'json';

const PAGE_HEADING = '## Page';
const PAGE_TITLE = '# OKF Page';
const BODY_HEADING = '### Body';
const COVERAGE_HEADING = '## Coverage';
const FRONTIER_HEADING = '## Frontier';
const DECISION_HEADING = '## Decision';
const REQUIRED_HEADING = '## Required';
const ARTIFACT_HEADING = '## Artifact';
const EDGES_HEADING = '## Edges';
const ADDITIONAL_HEADING = '## Additional fields';
const ENTRIES_HEADING = '## Entries';
const RESULTS_HEADING = '## Results';
const GENERIC_TITLE = '# OKF Response';
const MIN_FENCE_LENGTH = 3;

const PAGE_DESCRIPTION = 'Page identity and body. What this concept is, and the source text the AI must read.';
const COVERAGE_DESCRIPTION = 'Facet coverage for the active profile. Whether the response is sufficient, and what is missing if not.';
const FRONTIER_DESCRIPTION = 'Every next-hop target. Each line is executable; reason and cost are included.';
const DECISION_DESCRIPTION = 'Decision timing and means. When to decide, when to stop, what to run next, and how to go back.';
const REQUIRED_DESCRIPTION = 'The complete required closure. Every entry is listed; nothing is truncated.';
const ARTIFACT_DESCRIPTION = 'Delivered context. Concepts, byte count, and manifest hashes.';
const EDGES_DESCRIPTION = 'Outgoing and incoming links. Each line names the other concept and the relation.';
const ADDITIONAL_DESCRIPTION = 'Remaining response fields. Every field is listed so no envelope data is lost.';
const ENTRIES_DESCRIPTION = 'Directory entries. Each line carries the command that enters it.';
const RESULTS_DESCRIPTION = 'Search results. Each line carries the command that expands it.';

const CORE_KEYS = new Set(['protocol', 'node', 'coverage', 'frontier', 'guidance', 'backTo']);
const NODE_KEYS = new Set(['id', 'path', 'type', 'title', 'description', 'body', 'sources', 'trustTier', 'freshness']);
const HANDLED_KEYS = new Set([
  ...CORE_KEYS,
  ...NODE_KEYS,
  'required',
  'artifact',
  'outgoing',
  'incoming',
  'edges',
]);

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
export function formatValue(value, format = FORMAT_MARKDOWN) {
  if (format === FORMAT_JSON) return `${JSON.stringify(value)}\n`;
  if (format === FORMAT_MARKDOWN) return `${renderValueMarkdown(value)}\n`;
  throw Object.assign(
    new Error(`unknown format: ${format}; allowed: ${FORMAT_MARKDOWN}, ${FORMAT_JSON}`),
    { code: 'UNKNOWN_FORMAT' },
  );
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
export function renderEnvelopeMarkdown(envelope) {
  return [
    renderPage(envelope.node),
    renderCoverage(envelope.coverage),
    renderFrontier(envelope.frontier),
    renderDecision(envelope.guidance, envelope.backTo),
  ].join('\n\n');
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
export function renderValueMarkdown(value) {
  if (isTraversalEnvelope(value)) return renderTraversalDocument(value);
  if (Array.isArray(value?.entries)) return renderEntriesDocument(value);
  if (Array.isArray(value?.rows)) return renderResultsDocument(value);
  if (value && Array.isArray(value.required)) return renderRequiredDocument(value);
  return renderGenericDocument(value);
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function isTraversalEnvelope(value) {
  return Boolean(value && value.protocol === 'okf-traversal/v1' && value.coverage && value.guidance);
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
// Extras precede the four fixed sections so context and edge reads lose nothing.
// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderTraversalDocument(envelope) {
  const sections = [];
  if (envelope.required) sections.push(renderRequired(envelope.required));
  if (envelope.artifact) sections.push(renderArtifact(envelope.artifact));
  sections.push(renderEnvelopeMarkdown(envelope));
  const edgeSection = renderEdges(envelope);
  if (edgeSection) sections.push(edgeSection);
  const additionalSection = renderAdditionalFields(envelope);
  if (additionalSection) sections.push(additionalSection);
  return `${PAGE_TITLE} — \`${envelope.node?.id ?? envelope.id ?? ''}\`\n\n${sections.join('\n\n')}`;
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderPage(node) {
  return [
    PAGE_HEADING,
    '',
    PAGE_DESCRIPTION,
    '',
    `- id: \`${node.id}\``,
    `- type: ${node.type}`,
    `- title: ${node.title}`,
    ...(node.description ? [`- description: ${node.description}`] : []),
    `- trustTier: ${renderValueOrNone(node.trustTier)}`,
    `- freshness: ${renderFreshness(node.freshness)}`,
    `- sources: ${renderValueOrNone(collectSourceNames(node.sources))}`,
    '',
    BODY_HEADING,
    '',
    'Verbatim source text the AI must read.',
    '',
    wrapInFence(node.body),
  ].join('\n');
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderCoverage(coverage) {
  return [
    COVERAGE_HEADING,
    '',
    COVERAGE_DESCRIPTION,
    '',
    `- profile: ${coverage.profile}`,
    `- required: ${renderValueOrNone(coverage.requiredFacets)}`,
    `- present: ${renderValueOrNone(coverage.present)}`,
    `- missing: ${renderValueOrNone(coverage.missing)}`,
    `- sufficient: ${coverage.sufficient}`,
    `- insufficient: ${coverage.insufficient}`,
    `- estimatedBytes: ${coverage.estimatedBytes}`,
    `- overfetchRatio: ${coverage.overfetchRatio}`,
  ].join('\n');
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderFrontier(frontier) {
  const lines = frontier.length === 0
    ? ['none']
    : frontier.map((entry, index) => [
      `${index + 1}. \`${entry.id}\``,
      entry.type,
      entry.kind,
      entry.why,
      `\`${entry.command}\``,
      `${entry.estBytes} B`,
      `priority ${entry.priority}`,
    ].join(' — '));
  return [FRONTIER_HEADING, '', FRONTIER_DESCRIPTION, '', ...lines].join('\n');
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderDecision(guidance, backTo) {
  return [
    DECISION_HEADING,
    '',
    DECISION_DESCRIPTION,
    '',
    `- state: ${guidance.state} — ${guidance.reason}`,
    `- decideAfter: ${guidance.decideAfter}`,
    `- stopWhen: ${guidance.stopWhen}`,
    `- mustRun: ${guidance.mustRun ? `\`${guidance.mustRun}\`` : 'none'}`,
    `- hop: ${guidance.hop} / maxHops: ${guidance.maxHops}`,
    `- budget: ${guidance.budget.bytesUsed} B used / ${guidance.budget.bytesLimit ?? 'no limit'}`,
    `- ifBack: \`${guidance.ifBack}\``,
    `- backTo: ${renderValueOrNone(backTo)}`,
  ].join('\n');
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderRequired(required) {
  const lines = [REQUIRED_HEADING, '', REQUIRED_DESCRIPTION, ''];
  for (const [key, value] of Object.entries(required)) {
    if (key === 'records') continue;
    lines.push(`- ${key}: ${renderValueOrNone(value)}`);
  }
  const records = required.records ?? [];
  lines.push(`- records: ${records.length === 0 ? 'none' : records.length}`);
  records.forEach((record, index) => {
    lines.push('', `### Record ${index + 1}`, '');
    for (const [key, value] of Object.entries(record)) {
      lines.push(...renderField(key, value));
    }
  });
  return lines.join('\n');
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderArtifact(artifact) {
  const lines = [ARTIFACT_HEADING, '', ARTIFACT_DESCRIPTION, ''];
  if (Array.isArray(artifact.concepts)) lines.push(`- concepts: ${renderValueOrNone(artifact.concepts)}`);
  if (artifact.bytes !== undefined) lines.push(`- bytes: ${artifact.bytes}`);
  if (artifact.manifest) {
    lines.push(`- manifest bytes: ${artifact.manifest.bytes}`);
    lines.push(`- manifest limit: ${artifact.manifest.limit}`);
    for (const [id, hash] of artifact.manifest.hashes ?? []) {
      lines.push(`- \`${id}\`: ${hash}`);
    }
  }
  return lines.join('\n');
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderEdges(envelope) {
  const groups = [];
  if (Array.isArray(envelope.outgoing)) groups.push(['outgoing', envelope.outgoing]);
  if (Array.isArray(envelope.incoming)) groups.push(['incoming', envelope.incoming]);
  if (Array.isArray(envelope.edges)) groups.push(['edges', envelope.edges]);
  if (groups.length === 0) return null;
  const lines = [EDGES_HEADING, '', EDGES_DESCRIPTION, ''];
  for (const [label, edges] of groups) {
    lines.push(`- ${label}: ${edges.length === 0 ? 'none' : edges.length}`);
    for (const edge of edges) lines.push(`  - ${renderInline(edge)}`);
  }
  return lines.join('\n');
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderAdditionalFields(envelope) {
  const extraKeys = Object.keys(envelope).filter((key) => !HANDLED_KEYS.has(key));
  if (extraKeys.length === 0) return null;
  const lines = [ADDITIONAL_HEADING, '', ADDITIONAL_DESCRIPTION, ''];
  for (const key of extraKeys) lines.push(...renderField(key, envelope[key]));
  return lines.join('\n');
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderEntriesDocument(value) {
  const lines = [ENTRIES_HEADING, '', ENTRIES_DESCRIPTION, ''];
  if (value.path !== undefined) lines.push(`- path: ${value.path}`);
  lines.push(`- count: ${value.entries.length}`);
  value.entries.forEach((entry, index) => {
    const trailing = [entry.kind, `\`${entry.command}\``].filter(Boolean).join(' — ');
    lines.push(`${index + 1}. \`${entry.path}\` — ${trailing}`);
  });
  return `${PAGE_TITLE} — Directory\n\n${lines.join('\n')}`;
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderResultsDocument(value) {
  const lines = [RESULTS_HEADING, '', RESULTS_DESCRIPTION, ''];
  if (value.query !== undefined) lines.push(`- query: ${value.query}`);
  lines.push(`- count: ${value.rows.length}`);
  value.rows.forEach((row, index) => {
    const trailing = [row.title, `\`${row.expand_command}\``].filter(Boolean).join(' — ');
    lines.push(`${index + 1}. \`${row.id}\` — ${trailing}`);
  });
  return `${PAGE_TITLE} — Search\n\n${lines.join('\n')}`;
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderRequiredDocument(value) {
  return `${PAGE_TITLE} — Required\n\n${renderRequired(value)}`;
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderGenericDocument(value) {
  const sections = [];
  for (const [key, item] of Object.entries(value ?? {})) {
    sections.push(...renderField(key, item));
  }
  return `${GENERIC_TITLE}\n\n${sections.join('\n')}`;
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderField(key, value) {
  if (typeof value === 'string' && value.includes('\n')) {
    return [`- ${key}:`, '', wrapInFence(value)];
  }
  if (Array.isArray(value)) {
    const lines = [`- ${key}: ${value.length === 0 ? 'none' : value.length}`];
    value.forEach((item, index) => lines.push(`  ${index + 1}. ${renderInline(item)}`));
    return lines;
  }
  if (value && typeof value === 'object') {
    return [`- ${key}: ${renderInline(value)}`];
  }
  return [`- ${key}: ${renderValueOrNone(value)}`];
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderInline(value) {
  if (value === null || value === undefined) return 'none';
  if (Array.isArray(value)) return value.length === 0 ? 'none' : value.map((item) => renderInline(item)).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => `${key}=${renderInline(item)}`).join('; ');
  }
  return String(value);
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderFreshness(freshness) {
  if (!freshness) return 'none';
  return `status=${freshness.status}, stale=${freshness.stale}, staleAfter=${renderValueOrNone(freshness.staleAfter)}`;
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function collectSourceNames(sources) {
  return (sources ?? []).map((source) => source?.resource ?? source);
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function renderValueOrNone(value) {
  if (value === null || value === undefined) return 'none';
  if (Array.isArray(value)) return value.length === 0 ? 'none' : value.map((item) => renderInline(item)).join(', ');
  if (typeof value === 'object') return renderInline(value);
  return String(value);
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
// The fence grows past any backtick run in the body, so the body is verbatim.
// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-430 --for-spec --no-implementation-order`.
function wrapInFence(text) {
  const content = String(text ?? '');
  const longestRun = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(MIN_FENCE_LENGTH, longestRun + 1));
  return `${fence}markdown\n${content}\n${fence}`;
}
