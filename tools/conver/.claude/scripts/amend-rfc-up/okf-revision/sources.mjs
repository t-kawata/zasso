// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { writeConcept } from '../okf-core/authoring/write.mjs';

export function applySourceOperations({
  sourceText,
  sourceAlias,
  operations,
  outDir,
  date,
  existingInventory = null,
  spanOffset = 0,
  writeConcepts = true,
}) {
  const concepts = [];
  const retired = [];
  const citations = [];
  for (const operation of operations ?? []) {
    if (operation.op === 'reference-only') {
      citations.push({ source_alias: operation.source_alias ?? sourceAlias, evidence: operation.evidence ?? null });
      continue;
    }
    if (!['add-source', 'update-source'].includes(operation.op)) continue;
    const extracted = extractConcepts({
      text: sourceText,
      sourceAlias: operation.source_alias ?? sourceAlias,
      prefix: operation.concept_prefix ?? 'pages',
      date,
      requires: operation.requires ?? [],
      spanOffset,
    });
    if (operation.op === 'update-source' && existingInventory?.entries) {
      const sourceSlug = slugify((operation.source_alias ?? sourceAlias).replace(/^sources\//, '').replace(/\.md$/, ''));
      const prefix = `${operation.concept_prefix ?? 'pages'}/${sourceSlug}/`;
      const existingIds = existingInventory.entries
        .map((entry) => entry.id)
        .filter((id) => id.startsWith(prefix));
      const nextIds = new Set(extracted.map((concept) => concept.id));
      for (const id of existingIds) {
        if (!nextIds.has(id)) retired.push(id);
      }
    }
    if (writeConcepts) {
      for (const concept of extracted) {
        writeConcept({ outDir, concept });
      }
    }
    concepts.push(...extracted);
  }
  return { concepts, retired, citations };
}

export function extractConcepts({ text, sourceAlias, prefix = 'pages', date, requires = [], spanOffset = 0 }) {
  const sourceSlug = slugify(sourceAlias.replace(/^sources\//, '').replace(/\.md$/, ''));
  const lines = String(text ?? '').split('\n');
  const headings = [];
  lines.forEach((line, index) => {
    if (/^##\s+\S/.test(line)) headings.push({ index, title: line.replace(/^##\s+/, '').trim() });
  });
  if (headings.length === 0) {
    return [makeConcept({
      title: firstHeading(lines) ?? sourceSlug,
      body: text,
      sourceAlias,
      prefix,
      sourceSlug,
      date,
      requires,
      span: { start: 1, end: lines.length },
      spanOffset,
    })];
  }
  const concepts = [];
  const preamble = lines.slice(0, headings[0].index).join('\n').trim();
  if (preamble.length > 0) {
    concepts.push(makeConcept({
      title: firstHeading(lines.slice(0, headings[0].index)) ?? sourceSlug,
      body: preamble,
      sourceAlias,
      prefix,
      sourceSlug,
      date,
      requires,
      idSuffix: 'preamble',
      span: { start: 1, end: headings[0].index },
      spanOffset,
    }));
  }
  headings.forEach((heading, index) => {
    const start = heading.index;
    const end = index + 1 < headings.length ? headings[index + 1].index : lines.length;
    concepts.push(makeConcept({
      title: heading.title,
      body: lines.slice(start, end).join('\n').trim(),
      sourceAlias,
      prefix,
      sourceSlug,
      date,
      requires,
      span: { start: start + 1, end: end },
      spanOffset,
    }));
  });
  return concepts;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function makeConcept({ title, body, sourceAlias, prefix, sourceSlug, date, requires, idSuffix = null, span, spanOffset = 0 }) {
  const slugTitle = idSuffix ?? slugify(title);
  const id = `${prefix}/${sourceSlug}/${slugTitle}`;
  const start = span.start + spanOffset;
  const end = span.end + spanOffset;
  return {
    id,
    path: `${id}.md`,
    source_span: `${start}-${end}`,
    frontmatter: {
      type: 'Page',
      title,
      description: extractFirstParagraph(body),
      sources: [{ resource: sourceAlias, id: `${sourceSlug}-${slugTitle}`, title }],
      generated: { by: 'build-okf-skill', at: date },
      verified: [{ by: 'machine', at: date }],
      status: 'stable',
      stale_after: addOneYear(date),
      'x-requires': requires,
      'x-source-alias': sourceAlias,
      'x-source-span': `${start}-${end}`,
      'x-topic': sourceSlug,
    },
    body: `${body}\n`,
  };
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function firstHeading(lines) {
  const heading = (lines ?? []).map((line) => line.trim()).find((line) => /^#\s+\S/.test(line));
  return heading ? heading.replace(/^#\s+/, '').trim() : null;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function extractFirstParagraph(body) {
  const paragraph = String(body ?? '').split('\n').map((line) => line.trim()).find((line) => line.length > 0 && !line.startsWith('#'));
  return (paragraph ?? '').slice(0, 200);
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'concept';
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function addOneYear(date) {
  const [year, month, day] = String(date).split('-').map(Number);
  return `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
