// [::TICKET::] PX-199 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-199 --for-spec --no-implementation-order`.
// PX-199 @verifies C001
/**
 * Specification pulse.
 *
 * The final quality of the seed set is bounded by the quality of the document it is
 * transferred from. The pulse looks at the specification as a document and reports
 * observations - a chapter that states normative words but yields no material, a
 * chapter nobody references, a name spelled two ways, a table its own prose never
 * mentions. It states observations only: it never grades, never decides importance
 * and never removes a candidate. The AI settles each candidate in the same session.
 */
import { NORMATIVE_PHRASES } from './extraction.mjs';

/** Every observation kind the pulse can report. */
export const PULSE_KINDS = Object.freeze([
  'thin_normative_density',
  'isolated_chapter',
  'oversized_chapter',
  'extraction_gap',
  'near_duplicate_term',
  'undefined_reference',
  'table_prose_mismatch',
]);

/** A chapter that takes this share of the document is worth a look. */
const OVERSIZED_SHARE = 0.8;

/** A chapter needs at least this many lines before its thin density is worth reporting. */
const THIN_DENSITY_LINES = 8;

/** An inline-code token used exactly this often, and defined nowhere, is worth a look. */
const UNDEFINED_REFERENCE_OCCURRENCES = 1;

const TABLE_ROW_RE = /^\s*\|(.+)\|\s*$/;
const INLINE_CODE_RE = /`([^`\n]+)`/g;

/**
 * Report every observation about the specification as a document.
 *
 * @param {{ sourceText: string, headings: Array<object>, segments: Array<object>, inventory: object }} input
 * @returns {{ candidates: Array<object>, summary: object }}
 */
export function buildSpecPulse({ sourceText = '', headings = [], segments = [], inventory = {} }) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return { candidate_ids: [], candidates: [], summary: summarizeKinds([]) };
  }
  const chapters = buildChapterViews({ sourceText, headings, segments, inventory });
  const observations = [
    ...detectExtractionGap(chapters),
    ...detectIsolatedChapter(chapters),
    ...detectOversizedChapter(chapters),
    ...detectThinNormativeDensity(chapters),
    ...detectNearDuplicateTerm({ chapters, inventory }),
    ...detectTableProseMismatch(chapters),
    ...detectUndefinedReference({ sourceText, chapters, inventory }),
  ];
  const ordered = observations.sort((left, right) => (left.order !== right.order ? left.order - right.order : PULSE_KINDS.indexOf(left.kind) - PULSE_KINDS.indexOf(right.kind)));
  const candidates = ordered.map((observation, index) => ({
    id: `pulse-${String(index + 1).padStart(6, '0')}`,
    kind: observation.kind,
    chapter_ref: observation.chapter_ref,
    observation: observation.observation,
    evidence_refs: observation.evidence_refs,
  }));
  return { candidate_ids: candidates.map((candidate) => candidate.id), candidates, summary: summarizeKinds(candidates) };
}

/** One view per segment: its text, its owned items and its line count. */
function buildChapterViews({ sourceText, headings, segments, inventory }) {
  const ownedBySegment = new Map();
  for (const item of collectInventoryItems(inventory)) {
    for (const ref of item.source_refs ?? []) {
      const bucket = ownedBySegment.get(ref.segment_id) ?? new Set();
      bucket.add(item.id);
      ownedBySegment.set(ref.segment_id, bucket);
    }
  }
  const headingById = new Map((headings ?? []).map((heading) => [heading.id, heading]));
  return [...segments]
    .sort((left, right) => left.byte_start - right.byte_start)
    .map((segment, index) => {
      const text = sourceText.slice(segment.byte_start, segment.byte_end);
      const heading = segment.heading_id ? headingById.get(segment.heading_id) : undefined;
      const title = heading ? heading.text : (segment.title ?? '');
      return {
        segment_id: segment.id,
        heading_id: segment.heading_id,
        // The implicit preamble segment is not a chapter: it has no heading to
        // reference and no title to be referenced by.
        is_chapter: Boolean(segment.heading_id) && (segment.title ?? '').length > 0,
        title,
        text,
        // Prose only: a table mentioning a name does not explain it.
        prose: text.split('\n').filter((line) => !TABLE_ROW_RE.test(line)).join('\n'),
        lines: text.split('\n').filter((line) => line.trim().length > 0).length,
        owned_items: [...(ownedBySegment.get(segment.id) ?? [])].sort(),
        order: index,
        byte_span: segment.byte_end - segment.byte_start,
        normative_phrases: findNormativePhrases(text),
        table_names: extractTableNames(text),
        inline_tokens: extractInlineTokens(text),
      };
    });
}

/** Chapters that state normative words but carry no harvested material. */
function detectExtractionGap(chapters) {
  return chapters
    .filter((chapter) => chapter.normative_phrases.length > 0 && chapter.owned_items.length === 0)
    .map((chapter) => ({
      kind: 'extraction_gap',
      order: chapter.order,
      chapter_ref: chapter.heading_id ?? chapter.segment_id,
      observation: `The chapter "${chapter.title}" states the normative phrase(s) ${chapter.normative_phrases.join(', ')} but carries no harvested inventory item, so the rule it states has no owner yet.`,
      evidence_refs: [chapter.segment_id, ...(chapter.heading_id ? [chapter.heading_id] : [])],
    }));
}

/** Chapters that no other chapter mentions and that carry no material. */
function detectIsolatedChapter(chapters) {
  const realChapters = chapters.filter((chapter) => chapter.is_chapter);
  if (realChapters.length < 2) {
    return [];
  }
  return realChapters
    .filter((chapter) => chapter.title.length > 0 && chapter.owned_items.length === 0)
    .filter((chapter) => !chapters.some((other) => other.segment_id !== chapter.segment_id && other.text.includes(chapter.title)))
    .map((chapter) => ({
      kind: 'isolated_chapter',
      order: chapter.order,
      chapter_ref: chapter.heading_id ?? chapter.segment_id,
      observation: `No other chapter refers to "${chapter.title}" and the chapter carries no harvested item, so its content reaches no directory unless a seed claims it explicitly.`,
      evidence_refs: [chapter.segment_id, ...(chapter.heading_id ? [chapter.heading_id] : [])],
    }));
}

/** A chapter that dominates the document is a split candidate. */
function detectOversizedChapter(chapters) {
  const realChapters = chapters.filter((chapter) => chapter.is_chapter);
  if (realChapters.length < 2) {
    return [];
  }
  const totalBytes = realChapters.reduce((total, chapter) => total + chapter.byte_span, 0);
  return realChapters
    .filter((chapter) => totalBytes > 0 && chapter.byte_span / totalBytes >= OVERSIZED_SHARE)
    .map((chapter) => ({
      kind: 'oversized_chapter',
      order: chapter.order,
      chapter_ref: chapter.heading_id ?? chapter.segment_id,
      observation: `The chapter "${chapter.title}" holds ${Math.round((chapter.byte_span / totalBytes) * 100)}% of the specification, so it may deserve splitting before it becomes one package.`,
      evidence_refs: [chapter.segment_id],
    }));
}

/** A long chapter with neither normative words nor material states nothing yet. */
function detectThinNormativeDensity(chapters) {
  return chapters.filter((chapter) => chapter.is_chapter)
    .filter((chapter) => chapter.lines >= THIN_DENSITY_LINES && chapter.normative_phrases.length === 0 && chapter.owned_items.length === 0)
    .map((chapter) => ({
      kind: 'thin_normative_density',
      order: chapter.order,
      chapter_ref: chapter.heading_id ?? chapter.segment_id,
      observation: `The chapter "${chapter.title}" runs ${chapter.lines} lines without a normative phrase or a harvested item, so nothing in it is implementable as written.`,
      evidence_refs: [chapter.segment_id],
    }));
}

/** Two spellings of one name make the allocation ambiguous. */
function detectNearDuplicateTerm({ chapters, inventory }) {
  const byNormalized = new Map();
  const names = [
    ...collectInventoryItems(inventory).map((item) => item.canonical_name).filter(Boolean),
    ...chapters.flatMap((chapter) => chapter.table_names),
  ];
  for (const name of names) {
    const normalized = String(name).toLowerCase().replace(/[_\s-]/g, '');
    const bucket = byNormalized.get(normalized) ?? new Set();
    bucket.add(String(name));
    byNormalized.set(normalized, bucket);
  }
  const candidates = [];
  for (const [normalized, spellings] of byNormalized) {
    if (spellings.size < 2) {
      continue;
    }
    const chapter = chapters.find((entry) => entry.table_names.some((name) => spellings.has(String(name)))) ?? chapters[0];
    candidates.push({
      kind: 'near_duplicate_term',
      order: chapter ? chapter.order : 0,
      chapter_ref: chapter ? (chapter.heading_id ?? chapter.segment_id) : null,
      observation: `The names ${[...spellings].map((name) => `"${name}"`).join(' and ')} differ only in spelling (${normalized}), so they may denote one concept under two names.`,
      evidence_refs: chapter ? [chapter.segment_id] : [],
    });
  }
  return candidates;
}

/** A table row whose name the chapter prose never mentions. */
function detectTableProseMismatch(chapters) {
  return chapters
    .filter((chapter) => chapter.table_names.length > 0)
    .filter((chapter) => {
      const documentProse = chapters.filter((other) => other.segment_id !== chapter.segment_id).map((other) => other.prose).join('\n');
      return chapter.table_names.some((name) => !chapter.prose.includes(name) && !documentProse.includes(name));
    })
    .map((chapter) => ({
      kind: 'table_prose_mismatch',
      order: chapter.order,
      chapter_ref: chapter.heading_id ?? chapter.segment_id,
      observation: `The table in "${chapter.title}" lists a name its own prose never mentions, so the table and the text may disagree about what is normative.`,
      evidence_refs: [chapter.segment_id],
    }));
}

/** An identifier used once and defined nowhere. */
function detectUndefinedReference({ sourceText, chapters, inventory }) {
  const defined = new Set();
  for (const chapter of chapters) {
    for (const name of chapter.table_names) {
      defined.add(String(name).toLowerCase());
    }
  }
  for (const item of collectInventoryItems(inventory)) {
    if (item.canonical_name) {
      defined.add(String(item.canonical_name).toLowerCase());
    }
  }
  const counts = new Map();
  for (const match of sourceText.matchAll(INLINE_CODE_RE)) {
    const token = match[1].trim();
    if (token.length === 0) {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const candidates = [];
  for (const [token, count] of counts) {
    if (count !== UNDEFINED_REFERENCE_OCCURRENCES || defined.has(token.toLowerCase())) {
      continue;
    }
    const chapter = chapters.find((entry) => entry.inline_tokens.includes(token)) ?? chapters[0];
    candidates.push({
      kind: 'undefined_reference',
      order: chapter ? chapter.order : 0,
      chapter_ref: chapter ? (chapter.heading_id ?? chapter.segment_id) : null,
      observation: `The identifier \`${token}\` is used once and defined nowhere in the document, so its type and owner are unknown.`,
      evidence_refs: chapter ? [chapter.segment_id] : [],
    });
  }
  return candidates;
}

function collectInventoryItems(inventory) {
  const lists = ['objects', 'claims', 'invariants', 'state_machines', 'error_codes', 'required_tests'];
  return lists.flatMap((listName) => inventory?.[listName] ?? []);
}

function findNormativePhrases(text) {
  const upper = text.toUpperCase();
  const found = new Set();
  for (const entry of NORMATIVE_PHRASES) {
    if (upper.includes(entry.phrase.toUpperCase()) && !isTableRow(entry.phrase)) {
      found.add(entry.phrase);
    }
  }
  return [...found].sort();
}

function isTableRow(phrase) {
  return phrase.includes('|');
}

function extractTableNames(text) {
  const names = [];
  for (const line of text.split('\n')) {
    const match = TABLE_ROW_RE.exec(line);
    if (!match) {
      continue;
    }
    const cells = match[1].split('|').map((cell) => cell.trim());
    if (cells.length < 2 || cells.every((cell) => /^:?-{2,}:?$/.test(cell) || cell.length === 0)) {
      continue;
    }
    if (cells[0].toLowerCase() === 'object' || cells[0].toLowerCase() === 'kind') {
      continue;
    }
    if (cells[0].length > 0) {
      names.push(cells[0]);
    }
  }
  return names;
}

function extractInlineTokens(text) {
  return [...text.matchAll(INLINE_CODE_RE)].map((match) => match[1].trim()).filter((token) => token.length > 0);
}

function summarizeKinds(candidates) {
  const byKind = {};
  for (const kind of PULSE_KINDS) {
    byKind[kind] = candidates.filter((candidate) => candidate.kind === kind).length;
  }
  return { candidate_count: candidates.length, by_kind: byKind };
}
