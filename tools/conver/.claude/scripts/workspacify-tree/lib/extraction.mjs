// [::TICKET::] PX-176 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-176|PX-183) --for-spec --no-implementation-order`.
/**
 * Candidate inventory extraction (§7.3, §8).
 *
 * These harvesters are deliberately mechanical: they collect candidates from
 * tables, inline code spans, claim context code blocks, and a fixed normative
 * keyword dictionary. They never decide final meaning — ambiguous candidates
 * are recorded as REVIEW_REQUIRED so a later AI review confirms or rejects
 * them. No candidate is ever dropped silently.
 */
import { scanFenceStates, lineByteOffsets } from './markdown.mjs';

/** Column headers that announce an object/entity column and their classification. */
const OBJECT_HEADER_CLASSIFICATION = {
  object: 'object',
  entity: 'object',
  message: 'object',
  record: 'record',
  certificate: 'certificate',
  credential: 'credential',
  policy: 'policy',
  operation: 'operation',
};

/** Column headers that refine a row's classification (kind/type/class). */
const CLASS_HEADER_WORDS = new Set(['kind', 'type', 'classification', 'class', '種別', '分類']);

/** Allowed classification values taken from a kind/type cell. */
const CLASS_VALUES = new Set(['object', 'certificate', 'credential', 'policy', 'operation', 'record', 'unknown']);

/** Deterministic dictionary for §7.3 normative keyword harvesting. */
const NORMATIVE_PHRASES = Object.freeze([
  { phrase: 'MUST NOT', classification: 'must-not' },
  { phrase: 'SHALL NOT', classification: 'shall-not' },
  { phrase: 'MUST', classification: 'must' },
  { phrase: 'SHALL', classification: 'shall' },
  { phrase: 'REQUIRED', classification: 'required' },
  { phrase: 'PROHIBITED', classification: 'prohibited' },
  { phrase: 'MAY', classification: 'may' },
  { phrase: 'fail-closed', classification: 'fail-closed' },
  { phrase: 'invariant', classification: 'invariant' },
  { phrase: 'test requirement', classification: 'test-requirement' },
  { phrase: 'error code', classification: 'error-code' },
  { phrase: 'しなければならない', classification: 'must' },
  { phrase: 'してはならない', classification: 'must-not' },
  { phrase: '実装必須', classification: 'test-requirement' },
  { phrase: '検査対象', classification: 'test-requirement' },
  { phrase: 'エラーコード', classification: 'error-code' },
  { phrase: '拒否コード', classification: 'error-code' },
  { phrase: '不変条件', classification: 'invariant' },
  { phrase: '必須', classification: 'required' },
  { phrase: '禁止', classification: 'prohibited' },
].sort((a, b) => b.phrase.length - a.phrase.length));

const REQUIREMENT_CLASSIFICATIONS = new Set(['invariant', 'error-code', 'test-requirement']);
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HAS_LETTER_RE = /[A-Za-z]/;
const SNAKE_RE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;
const PASCAL_RE = /\b[A-Z][A-Za-z0-9]+\b/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;
const CLAIM_HEADING_RE = /claim|proof/i;

/**
 * Harvest object/entity candidates from object columns and inline code spans.
 *
 * @param {{ sourceText: string, headings: Array<object>, segments: Array<object> }} input
 * @returns {Array<object>} object candidates grouped by canonical name
 */
export function harvestObjectCandidates({ sourceText, headings, segments }) {
  const lines = sourceText.split('\n');
  const offsets = lineByteOffsets(sourceText);
  const fenceStates = scanFenceStates(lines);
  const byName = new Map();
  const order = [];

  const addCandidate = (canonicalName, classification, lineIndex) => {
    const existing = byName.get(canonicalName);
    const ref = buildLineRef({ lines, offsets, headings, lineIndex, sourceText });
    if (existing) {
      existing.source_refs.push(ref);
      mergeClassification(existing, classification);
      return;
    }
    const candidate = {
      id: `obj-${String(order.length + 1).padStart(6, '0')}`,
      canonical_name: canonicalName,
      aliases: [],
      classification,
      source_refs: [ref],
      normalization_status: classification === 'unknown' ? 'REVIEW_REQUIRED' : 'CONFIRMED',
      owner_package: null,
    };
    byName.set(canonicalName, candidate);
    order.push(candidate);
  };

  const tables = collectObjectTables(lines);
  for (const table of tables) {
    for (const row of table.rows) {
      for (const objectColumnIndex of table.objectColumns) {
        const raw = row.cells[objectColumnIndex];
        const canonicalName = raw === undefined ? '' : raw.trim();
        if (canonicalName.length === 0 || !IDENTIFIER_RE.test(canonicalName)) {
          continue;
        }
        addCandidate(canonicalName, table.classify(row), row.lineIndex);
      }
    }
  }

  const tableLineIndexes = new Set(tables.flatMap((table) => table.lines));
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (fenceStates[lineIndex] && fenceStates[lineIndex].inFence) {
      continue;
    }
    if (tableLineIndexes.has(lineIndex)) {
      continue;
    }
    for (const match of lines[lineIndex].matchAll(INLINE_CODE_RE)) {
      const token = match[1].trim();
      if (!IDENTIFIER_RE.test(token) || !HAS_LETTER_RE.test(token)) {
        continue;
      }
      addCandidate(token, 'unknown', lineIndex);
    }
  }
  return order;
}

/**
 * Harvest claim/proof candidates from code blocks inside claim context.
 *
 * @param {{ sourceText: string, headings: Array<object>, segments: Array<object> }} input
 * @returns {Array<object>} claim candidates
 */
export function harvestClaimCandidates({ sourceText, headings, segments }) {
  const lines = sourceText.split('\n');
  const offsets = lineByteOffsets(sourceText);
  const fenceStates = scanFenceStates(lines);
  const byName = new Map();
  const order = [];

  const addCandidate = (canonicalName, lineIndex) => {
    const existing = byName.get(canonicalName);
    const ref = buildLineRef({ lines, offsets, headings, lineIndex, sourceText });
    if (existing) {
      existing.source_refs.push(ref);
      return;
    }
    const candidate = {
      id: `claim-${String(order.length + 1).padStart(6, '0')}`,
      canonical_name: canonicalName,
      source_refs: [ref],
      primary_owner: null,
      collaborating_owners: [],
      review_status: 'REVIEW_REQUIRED',
    };
    byName.set(canonicalName, candidate);
    order.push(candidate);
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (!fenceStates[lineIndex] || !fenceStates[lineIndex].inFence) {
      continue;
    }
    const nearest = nearestHeadingAt(headings, lineIndex + 1);
    if (!nearest || !CLAIM_HEADING_RE.test(nearest.text)) {
      continue;
    }
    const line = lines[lineIndex];
    for (const match of line.matchAll(SNAKE_RE)) {
      addCandidate(match[0], lineIndex);
    }
    for (const match of line.matchAll(PASCAL_RE)) {
      addCandidate(match[0], lineIndex);
    }
  }
  return order;
}

/**
 * Harvest normative keyword candidates (§7.3).
 *
 * @param {{ sourceText: string, headings: Array<object>, segments: Array<object> }} input
 * @returns {Array<object>} normative candidates
 */
export function harvestNormativeCandidates({ sourceText, headings, segments }) {
  return harvestPhraseCandidates({ sourceText, headings, segments }, NORMATIVE_PHRASES);
}

/**
 * Harvest requirement candidates limited to invariant/error-code/test-requirement.
 *
 * @param {{ sourceText: string, headings: Array<object>, segments: Array<object> }} input
 * @returns {Array<object>} requirement candidates
 */
export function harvestRequirementCandidates({ sourceText, headings, segments }) {
  const all = harvestPhraseCandidates({ sourceText, headings, segments }, NORMATIVE_PHRASES);
  return all.filter((candidate) => REQUIREMENT_CLASSIFICATIONS.has(candidate.classification));
}

function harvestPhraseCandidates({ sourceText, headings, segments }, phrases) {
  const lines = sourceText.split('\n');
  const offsets = lineByteOffsets(sourceText);
  const fenceStates = scanFenceStates(lines);
  const candidates = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (fenceStates[lineIndex] && fenceStates[lineIndex].inFence) {
      continue;
    }
    const line = lines[lineIndex];
    const matchedPhrases = phrases.filter((entry) => line.includes(entry.phrase));
    if (matchedPhrases.length === 0) {
      continue;
    }
    // A phrase contained inside a longer matched phrase is redundant (e.g.
    // MUST inside MUST NOT); keep only the most specific matches.
    const specificPhrases = matchedPhrases.filter((entry) => {
      return !matchedPhrases.some((other) => other !== entry && other.phrase.length > entry.phrase.length && other.phrase.includes(entry.phrase));
    });
    const ambiguous = specificPhrases.length > 1;
    const nearest = nearestHeadingAt(headings, lineIndex + 1);
    const ref = buildLineRef({ lines, offsets, headings, lineIndex, sourceText });
    for (const entry of specificPhrases) {
      candidates.push({
        id: `req-${String(candidates.length + 1).padStart(6, '0')}`,
        keyword: entry.phrase,
        classification: entry.classification,
        section_id: nearest ? nearest.id : null,
        line_start: lineIndex + 1,
        line_end: lineIndex + 1,
        byte_start: ref.byte_start,
        byte_end: ref.byte_end,
        context: line.trim(),
        snippet: ref.snippet,
        normalization_status: ambiguous ? 'REVIEW_REQUIRED' : 'CONFIRMED',
      });
    }
  }
  return candidates;
}

// ---- table parsing -------------------------------------------------------

function collectObjectTables(lines) {
  const tables = [];
  for (let lineIndex = 0; lineIndex < lines.length - 1; lineIndex++) {
    if (!isDelimiterRow(lines[lineIndex + 1]) || !isTableRow(lines[lineIndex])) {
      continue;
    }
    const headerCells = splitRow(lines[lineIndex]).map((cell) => cell.trim());
    const objectColumns = [];
    const classColumns = [];
    headerCells.forEach((header, index) => {
      const normalized = header.toLowerCase();
      if (normalized in OBJECT_HEADER_CLASSIFICATION) {
        objectColumns.push(index);
      }
      if (CLASS_HEADER_WORDS.has(normalized)) {
        classColumns.push(index);
      }
    });
    if (objectColumns.length === 0) {
      continue;
    }
    const rows = [];
    const tableLines = [lineIndex, lineIndex + 1];
    let rowIndex = lineIndex + 2;
    while (rowIndex < lines.length && isTableRow(lines[rowIndex]) && !isDelimiterRow(lines[rowIndex])) {
      rows.push({ cells: splitRow(lines[rowIndex]).map((cell) => cell.trim()), lineIndex: rowIndex });
      tableLines.push(rowIndex);
      rowIndex++;
    }
    tables.push({
      headerCells,
      objectColumns,
      classColumns,
      rows,
      lines: tableLines,
      classify: (row) => {
        for (const classColumnIndex of classColumns) {
          const classValue = row.cells[classColumnIndex];
          if (classValue && CLASS_VALUES.has(classValue)) {
            return classValue;
          }
        }
        return OBJECT_HEADER_CLASSIFICATION[headerCells[objectColumns[0]].toLowerCase()] ?? 'unknown';
      },
    });
  }
  return tables;
}

function isTableRow(line) {
  return line.includes('|') && line.trim().length > 0;
}

function isDelimiterRow(line) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
}

function splitRow(line) {
  return line.split('|').slice(1, -1);
}

// ---- shared helpers ------------------------------------------------------

function nearestHeadingAt(headings, line) {
  let nearest = null;
  for (const heading of headings) {
    if (heading.line_start <= line) {
      nearest = heading;
    } else {
      break;
    }
  }
  return nearest;
}

function buildLineRef({ lines, offsets, headings, lineIndex, sourceText }) {
  const totalBytes = Buffer.byteLength(sourceText, 'utf8');
  const byteStart = offsets[lineIndex];
  const byteEnd = lineIndex + 1 < offsets.length ? offsets[lineIndex + 1] - 1 : totalBytes;
  const nearest = nearestHeadingAt(headings, lineIndex + 1);
  return {
    section_id: nearest ? nearest.id : null,
    line_start: lineIndex + 1,
    line_end: lineIndex + 1,
    byte_start: byteStart,
    byte_end: byteEnd,
    snippet: lines[lineIndex].trim(),
  };
}

function mergeClassification(candidate, classification) {
  const current = candidate.classification;
  if (current === 'unknown') {
    candidate.classification = classification;
    if (classification === 'unknown') {
      candidate.normalization_status = 'REVIEW_REQUIRED';
    }
    return;
  }
  if (classification !== 'unknown' && classification !== current) {
    candidate.classification = 'unknown';
    candidate.normalization_status = 'REVIEW_REQUIRED';
    return;
  }
  if (classification === 'unknown') {
    candidate.normalization_status = 'REVIEW_REQUIRED';
  }
}

/**
 * Harvest requirement candidates into typed inventory categories.
 *
 * Normative requirements are split into invariants, error codes, and required
 * tests so the ownership gates can enforce a unique owner per category
 * (ALLOCATE §9.3) instead of collapsing them into an untyped term list.
 *
 * @param {{ sourceText: string, headings: Array<object>, segments: Array<object> }} input
 * @returns {{ invariants: Array<object>, stateMachines: Array<object>, errorCodes: Array<object>, requiredTests: Array<object> }}
 */
export function harvestCategoryInventory({ sourceText, headings, segments }) {
  const requirements = harvestRequirementCandidates({ sourceText, headings, segments });
  const invariants = [];
  const stateMachines = [];
  const errorCodes = [];
  const requiredTests = [];

  for (const candidate of requirements) {
    const item = {
      id: candidate.id,
      canonical_name: candidate.keyword,
      classification: candidate.classification,
      section_id: candidate.section_id,
      line_start: candidate.line_start,
      line_end: candidate.line_end,
      byte_start: candidate.byte_start,
      byte_end: candidate.byte_end,
      snippet: candidate.snippet,
    };
    if (candidate.classification === 'invariant') {
      invariants.push(item);
    } else if (candidate.classification === 'error-code') {
      errorCodes.push(item);
    } else if (candidate.classification === 'test-requirement') {
      requiredTests.push(item);
    } else if (candidate.classification === 'state-machine') {
      stateMachines.push(item);
    }
  }
  return { invariants, stateMachines, errorCodes, requiredTests };
}
