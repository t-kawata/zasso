#!/usr/bin/env node

/**
 * validate-readme-language.js — generated READMEs are English-only.
 *
 * The contract document is read by professional engineers and by AI. It is
 * written in English. Japanese source may inform the content, but no hiragana,
 * katakana, or CJK ideograph belongs in the generated package or workspace
 * README. ASCII paths, code, and symbols are allowed.
 */

const fs = require('fs');

/** Unicode ranges that identify Japanese script in generated prose. */
const JAPANESE_RANGES = [
  { name: 'hiragana', pattern: /[぀-ゟ]/ },
  { name: 'katakana', pattern: /[゠-ヿㇰ-ㇿｦ-ﾝ]/ },
  { name: 'cjk', pattern: /[㐀-䶿一-鿿]/ },
];

/** An ASCII letter is the only permitted letter in generated README prose. */
const ASCII_LETTER = /^[A-Za-z]$/;

/** Every Unicode letter, used to reject scripts beyond the Japanese ranges. */
const UNICODE_LETTER = /\p{L}/u;

/**
 * Find the first non-English letter on every line.
 *
 * The rule is "English only": ASCII letters pass, and digits, punctuation,
 * symbols, and arrows pass. Any other Unicode letter — Japanese, Cyrillic,
 * Hangul, Arabic, or accented Latin — is a violation. The Japanese ranges keep
 * their named diagnostics; every other letter reports `non-ascii-letter`.
 *
 * @param {string} text — README content
 * @returns {Array<{line: number, column: number, script: string, character: string}>}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function findNonEnglishLetters(text) {
  const findings = [];
  const lines = String(text).split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const characters = Array.from(lines[lineIndex]);
    for (let column = 0; column < characters.length; column += 1) {
      const character = characters[column];
      if (ASCII_LETTER.test(character)) continue;
      if (!UNICODE_LETTER.test(character)) continue;
      const range = JAPANESE_RANGES.find((candidate) => candidate.pattern.test(character));
      findings.push({
        line: lineIndex + 1,
        column: column + 1,
        script: range ? range.name : 'non-ascii-letter',
        character,
      });
      break;
    }
  }
  return findings;
}

/**
 * Find the first Japanese character on every line.
 *
 * Kept as a compatibility view over findNonEnglishLetters for callers that name
 * the Japanese diagnostic explicitly.
 *
 * @param {string} text — README content
 * @returns {Array<{line: number, column: number, script: string, character: string}>}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function findJapaneseCharacters(text) {
  return findNonEnglishLetters(text).filter((finding) => finding.script !== 'non-ascii-letter');
}

/**
 * Validate one generated README.
 *
 * @param {string} text — README content
 * @returns {{ok: boolean, findings: Array<object>}}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function validateReadmeLanguage(text) {
  const findings = findNonEnglishLetters(text);
  return { ok: findings.length === 0, findings };
}

/**
 * Throw when the content is not English-only.
 *
 * @param {string} text — README content
 * @throws {Error} With the first offending line
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function assertReadmeLanguage(text) {
  const result = validateReadmeLanguage(text);
  if (result.ok) return;
  const first = result.findings[0];
  throw new Error(
    `README language violation at line ${first.line}: ${first.script} character "${first.character}"`,
  );
}

/**
 * CLI: validate a file or stdin.
 *
 * @returns {number} exit code
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function main() {
  const file = process.argv[2];
  let text;
  try {
    text = file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8');
  } catch (error) {
    console.error(`[ERROR] Cannot read README: ${error.message}`);
    return 2;
  }
  const result = validateReadmeLanguage(text);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  JAPANESE_RANGES,
  findNonEnglishLetters,
  findJapaneseCharacters,
  validateReadmeLanguage,
  assertReadmeLanguage,
  main,
};
