'use strict';

/**
 * Semantic obligation inventory.
 *
 * Registry rules are not the only source of design obligations. A procedural
 * handbook states them in headings, normative prose, list items and table
 * rows. Every extracted obligation must end with a covering change, a grounded
 * not_applicable, or a recorded judgment. The inventory is an attempt at
 * semantic completeness; it never claims to prove it.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const OBLIGATION_SCHEMA = 'amend-rfc-up.obligations/v1';
const COVERED_STATUS = 'covered';
const NOT_APPLICABLE_STATUS = 'not_applicable';
const JUDGED_STATUS = 'judged';
const UNSET_STATUS = 'unset';
const FENCE_PATTERN = /^\s*```/;
const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const LIST_ITEM_PATTERN = /^\s*(?:[-*+]|\d+[.)])\s+(.+)$/;
const TABLE_ROW_PATTERN = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR_PATTERN = /^\s*\|[\s:|-]+\|\s*$/;
const COMMAND_PREFIX = /^(?:node|npm|npx|pnpm|yarn|docker|docker-compose|make|git|curl|ssh|sudo|cd|export|echo|cat|grep|find|python3?|cargo|rustc|systemctl|iptables|nft|ip|sysctl)\b/;
const NORMATIVE_PATTERN = /\b(?:must(?:\s+not)?|shall(?:\s+not)?|should|required?|require[sd]?|never|do(?:es)?\s+not|only|always|ensure[sd]?|prohibit(?:ed)?|forbidden|mandatory|cannot)\b|必須|必要|義務|禁止|してはならない|してはならず|必ず|限る|のみ|不可欠|要件/i;
const SENTENCE_SPLIT_PATTERN = /(?<=[.!?。])\s+/;
const MIN_TEXT_LENGTH = 20;
const MIN_REASON_LENGTH = 20;
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'must', 'shall', 'should', 'required',
  'never', 'only', 'always', 'into', 'onto', 'over', 'under', 'when', 'then', 'than', 'have',
  'has', 'are', 'was', 'were', 'will', 'would', 'could', 'not', 'its', 'their', 'there',
  'these', 'those', 'each', 'every', 'all', 'any', 'may', 'can', 'does', 'did', 'your',
  'you', 'our', 'use', 'used', 'using', 'one', 'two', 'three', 'via', 'per', 'non',
]);

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function normalizeText(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function stripMarkdown(text) {
  return normalizeText(String(text)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]/g, ''));
}

function obligationId(kind, text) {
  return `OB-${createHash('sha256').update(`${kind}\u0000${normalizeText(text).toLowerCase()}`).digest('hex').slice(0, 12)}`;
}

function addObligation(obligations, seen, entry) {
  const { kind, text, file, line, level = null } = entry;
  const cleaned = normalizeText(text);
  if (cleaned.length === 0) return;
  const key = `${kind}\u0000${cleaned.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  obligations.push({
    id: obligationId(kind, cleaned),
    kind,
    text: cleaned,
    ...(level === null ? {} : { level }),
    source: { file: path.resolve(file), line },
  });
}

function sentencesOf(line) {
  return line.split(SENTENCE_SPLIT_PATTERN).map((sentence) => sentence.trim()).filter(Boolean);
}

function tableText(line) {
  return line.split('|').slice(1, -1).map((cell) => cell.trim()).filter(Boolean);
}

function collectFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

/**
 * A material argument may be a file or a directory. Matching material.js, a
 * directory contributes every file beneath it; skipping the directory silently
 * would report zero obligations and disable semantic coverage.
 */
function expandMaterialFiles(materialPaths = []) {
  const files = [];
  const seen = new Set();
  for (const entry of materialPaths) {
    const entryPath = typeof entry === 'string' ? entry : entry?.path;
    if (!entryPath) continue;
    const resolved = path.resolve(entryPath);
    const candidates = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
      ? collectFiles(resolved)
      : [resolved];
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      files.push(candidate);
    }
  }
  return files;
}

/** Extract section, requirement, list-item and table-row obligations. */
function extractObligations({ materialPaths = [] } = {}) {
  const obligations = [];
  const seen = new Set();
  for (const filePath of expandMaterialFiles(materialPaths)) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
    const content = fs.readFileSync(filePath);
    // A directory material may carry images or archives. Binary bytes carry no
    // prose obligation, and decoding them as UTF-8 could invent one.
    if (content.includes(0)) continue;
    const lines = content.toString('utf8').split('\n');
    let inFence = false;
    let paragraph = [];
    const flushParagraph = () => {
      if (paragraph.length === 0) return;
      const joined = paragraph.map((entry) => entry.text).join(' ');
      for (const sentence of sentencesOf(joined)) {
        const text = stripMarkdown(sentence);
        if (text.length < MIN_TEXT_LENGTH || !NORMATIVE_PATTERN.test(text)) continue;
        const anchor = paragraph.find((entry) => entry.text.includes(sentence.slice(0, 30).trim()))
          || paragraph[0];
        addObligation(obligations, seen, {
          kind: 'requirement',
          text,
          file: filePath,
          line: anchor.line,
        });
      }
      paragraph = [];
    };
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (FENCE_PATTERN.test(line)) {
        flushParagraph();
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      const heading = line.match(HEADING_PATTERN);
      if (heading) {
        flushParagraph();
        addObligation(obligations, seen, {
          kind: 'section',
          text: stripMarkdown(heading[2]),
          file: filePath,
          line: index + 1,
          level: heading[1].length,
        });
        continue;
      }

      const listItem = line.match(LIST_ITEM_PATTERN);
      if (listItem) {
        flushParagraph();
        const text = stripMarkdown(listItem[1]);
        if ((text.length >= MIN_TEXT_LENGTH || NORMATIVE_PATTERN.test(text)) && !COMMAND_PREFIX.test(text)) {
          addObligation(obligations, seen, { kind: 'list_item', text, file: filePath, line: index + 1 });
        }
        continue;
      }

      if (TABLE_ROW_PATTERN.test(line) && !TABLE_SEPARATOR_PATTERN.test(line)) {
        flushParagraph();
        const cells = tableText(line);
        const normative = cells.find((cell) => NORMATIVE_PATTERN.test(cell));
        if (normative && normative.length >= 10) {
          addObligation(obligations, seen, {
            kind: 'table_row',
            text: cells.join(' — '),
            file: filePath,
            line: index + 1,
          });
        }
        continue;
      }

      if (normalizeText(line) === '') {
        flushParagraph();
        continue;
      }
      paragraph.push({ text: line.trim(), line: index + 1 });
    }
    flushParagraph();
  }
  return obligations.sort((left, right) => (
    left.source.file.localeCompare(right.source.file)
    || left.source.line - right.source.line
    || left.id.localeCompare(right.id)
  ));
}

function initObligationCoverage({ obligations = [] } = {}) {
  return obligations.map((obligation) => ({
    obligationId: obligation.id,
    status: UNSET_STATUS,
    changeIds: [],
    reason: null,
    rationale: null,
    basis: null,
  }));
}

function indexCoverage(coverage) {
  const indexed = new Map();
  for (const entry of coverage) {
    if (!entry || typeof entry.obligationId !== 'string') {
      throw fail('OBLIGATION_COVERAGE_INVALID', 'every coverage entry needs an obligationId');
    }
    if (indexed.has(entry.obligationId)) {
      throw fail('OBLIGATION_COVERAGE_INVALID', `duplicate obligation coverage: ${entry.obligationId}`);
    }
    indexed.set(entry.obligationId, entry);
  }
  return indexed;
}

function materialLine(materialPaths, basis) {
  const resolved = path.resolve(basis.file);
  const allowed = expandMaterialFiles(materialPaths);
  if (!allowed.includes(resolved) || !fs.existsSync(resolved)) return null;
  const lines = fs.readFileSync(resolved, 'utf8').split('\n');
  const lineNumber = Number(basis.line);
  if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > lines.length) return null;
  return lines
    .slice(Math.max(0, lineNumber - 5), Math.min(lines.length, lineNumber + 5))
    .join('\n');
}

function assertBasis({ basis, materialPaths, obligationId }) {
  if (!basis || typeof basis.quote !== 'string' || basis.quote.trim() === '') {
    throw fail('OBLIGATION_COVERAGE_INVALID', `obligation ${obligationId} needs a basis quote`);
  }
  const window = materialLine(materialPaths, basis);
  if (window === null || !normalizeText(window).toLowerCase().includes(normalizeText(basis.quote).toLowerCase())) {
    throw fail('OBLIGATION_BASIS_UNGROUNDED', `obligation ${obligationId} cites a quote that is not in the material`, {
      obligationId,
    });
  }
}

/** Content-bearing tokens: a claim quote must share at least one with the obligation. */
function distinctiveTokens(text) {
  const tokens = String(text).match(/[A-Za-z][A-Za-z0-9-]{2,}|[一-鿿]{2,}|[゠-ヿ]{3,}/g) || [];
  return [...new Set(tokens.map((token) => token.toLowerCase()).filter((token) => !STOP_WORDS.has(token)))];
}

/** A covered obligation names a change and quotes the claim that answers it. */
function assertCoveredBasis({ basis, changeIds, changeById, obligationId, obligationText }) {
  if (!basis || typeof basis.changeId !== 'string' || typeof basis.quote !== 'string' || basis.quote.trim() === '') {
    throw fail('OBLIGATION_COVERAGE_INVALID', `covered obligation ${obligationId} needs a claim quote`, {
      obligationId,
    });
  }
  if (!changeIds.includes(basis.changeId)) {
    throw fail('OBLIGATION_COVERAGE_INVALID', `covered obligation ${obligationId} quotes an unnamed change`, {
      obligationId,
    });
  }
  const change = changeById.get(basis.changeId) || {};
  const claimText = [change.text, change.reason, change.predicate].filter(Boolean).join('\n');
  if (!normalizeText(claimText).toLowerCase().includes(normalizeText(basis.quote).toLowerCase())) {
    throw fail('OBLIGATION_BASIS_UNGROUNDED', `obligation ${obligationId} quotes a claim that does not contain it`, {
      obligationId,
    });
  }
  const tokens = distinctiveTokens(obligationText);
  const quote = normalizeText(basis.quote).toLowerCase();
  if (tokens.length === 0 || !tokens.some((token) => quote.includes(token))) {
    throw fail('OBLIGATION_BASIS_UNGROUNDED', `obligation ${obligationId} quotes a claim unrelated to its text`, {
      obligationId,
    });
  }
}

/** Every obligation is covered, explicitly not applicable, or judged with a basis. */
function validateObligationCoverage({ obligations = [], coverage = [], changes = [], materialPaths = [] } = {}) {
  const obligationIds = new Set(obligations.map((obligation) => obligation.id));
  const changeIds = new Set(changes.map((change) => change.id));
  const changeById = new Map(changes.map((change) => [change.id, change]));
  const indexed = indexCoverage(coverage);

  for (const obligationId of indexed.keys()) {
    if (!obligationIds.has(obligationId)) {
      throw fail('OBLIGATION_COVERAGE_INVALID', `unknown obligation in coverage: ${obligationId}`, { obligationId });
    }
  }
  if (indexed.size !== obligationIds.size) {
    throw fail('OBLIGATION_COVERAGE_INVALID', 'coverage does not name every obligation');
  }

  for (const obligation of obligations) {
    const entry = indexed.get(obligation.id);
    if (entry.status === COVERED_STATUS) {
      const ids = Array.isArray(entry.changeIds) ? entry.changeIds : [];
      if (ids.length === 0 || ids.some((id) => !changeIds.has(id))) {
        throw fail('OBLIGATION_COVERAGE_INVALID', `covered obligation ${obligation.id} names an unknown change`, {
          obligationId: obligation.id,
        });
      }
      assertCoveredBasis({
        basis: entry.basis,
        changeIds: ids,
        changeById,
        obligationId: obligation.id,
        obligationText: obligation.text,
      });
    } else if (entry.status === NOT_APPLICABLE_STATUS) {
      if (typeof entry.reason !== 'string' || entry.reason.trim().length < MIN_REASON_LENGTH) {
        throw fail('OBLIGATION_COVERAGE_INVALID', `not_applicable obligation ${obligation.id} needs a reason`, {
          obligationId: obligation.id,
        });
      }
      assertBasis({ basis: entry.basis, materialPaths, obligationId: obligation.id });
    } else if (entry.status === JUDGED_STATUS) {
      if (typeof entry.rationale !== 'string' || entry.rationale.trim().length < MIN_REASON_LENGTH) {
        throw fail('OBLIGATION_COVERAGE_INVALID', `judged obligation ${obligation.id} needs a rationale`, {
          obligationId: obligation.id,
        });
      }
      assertBasis({ basis: entry.basis, materialPaths, obligationId: obligation.id });
    } else {
      throw fail('REQUEST_OBLIGATION_UNCOVERED', `obligation ${obligation.id} has no disposition`, {
        obligationId: obligation.id,
      });
    }
  }
  return { ok: true };
}

function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : null;
}

function readJsonInput(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const text = value.startsWith('@') ? fs.readFileSync(value.slice(1), 'utf8') : value;
  return JSON.parse(text);
}

function readMaterials(value) {
  if (!value) return [];
  try {
    const parsed = readJsonInput(value);
    if (Array.isArray(parsed)) return parsed;
  } catch (error) {
    // A plain comma-separated list is the fallback form.
  }
  return String(value).split(',').filter(Boolean);
}

function writeJson(value, outPath) {
  if (!outPath) return;
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(value, null, 2)}\n`);
}

function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  try {
    if (command === 'inventory') {
      const obligations = extractObligations({ materialPaths: readMaterials(argumentValue(argv, 'materials')) });
      const outPath = argumentValue(argv, 'out');
      writeJson(obligations, outPath);
      process.stdout.write(`${JSON.stringify({ ok: true, schema: OBLIGATION_SCHEMA, count: obligations.length })}\n`);
      return 0;
    }
    if (command === 'init') {
      const obligations = readJsonInput(argumentValue(argv, 'inventory')) || [];
      const coverage = initObligationCoverage({ obligations });
      const outPath = argumentValue(argv, 'out');
      writeJson(coverage, outPath);
      process.stdout.write(`${JSON.stringify({ ok: true, count: coverage.length })}\n`);
      return 0;
    }
    if (command === 'validate') {
      const result = validateObligationCoverage({
        obligations: readJsonInput(argumentValue(argv, 'inventory')) || [],
        coverage: readJsonInput(argumentValue(argv, 'coverage')) || [],
        changes: readJsonInput(argumentValue(argv, 'changes')) || [],
        materialPaths: readMaterials(argumentValue(argv, 'materials')),
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return 0;
    }
    process.stdout.write(`${JSON.stringify({ code: 'UNKNOWN_SUBCOMMAND', command })}\n`);
    return 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ code: error.code || 'OBLIGATION_INVENTORY_FAILED', message: error.message })}\n`);
    return 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = {
  COVERED_STATUS,
  JUDGED_STATUS,
  NOT_APPLICABLE_STATUS,
  NORMATIVE_PATTERN,
  OBLIGATION_SCHEMA,
  UNSET_STATUS,
  expandMaterialFiles,
  extractObligations,
  initObligationCoverage,
  validateObligationCoverage,
};
