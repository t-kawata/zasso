#!/usr/bin/env node

/**
 * validate-slug.js — Validates slug field naming conventions for graph nodes
 *
 * Used in the graphify-rfc self-healing loop. Validates that every node's slug field
 * in the graph JSON satisfies lower_snake_case format, max 25 characters, and
 * lowercase-first-letter constraints.
 * Slugs with 4+ words are reported as warnings (non-blocking).
 *
 * CLI: validate-slug.js --graph=<path>
 *
 * Output contract:
 *   On success → {"ok":true, "errors":[], "warnings":[]} (exit code 0)
 *   On error   → {"ok":false, "errors":[...], "warnings":[...]} (exit code 1)
 *   On failure, stderr also receives a 3-part natural language error.
 */

const fs = require('fs');
const path = require('path');
const { MAX_FILE_NAME_LENGTH } = require('./boundify-helpers.js');

// ============================================================
// Constants
// ============================================================

/** Max slug length (file-name-based max excluding extension, referenced from boundify-helpers.js) */
const MAX_SLUG_LENGTH = MAX_FILE_NAME_LENGTH;

/** Slug format pattern: lower_snake_case, starts with lowercase letter */
const SLUG_FORMAT_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Minimum word count that triggers a warning (underscore-delimited) */
const WARNING_WORD_COUNT = 4;

/** CLI argument prefix for graph file path */
const GRAPH_PATH_ARG_PREFIX = '--graph=';

/** Success exit code */
const EXIT_SUCCESS = 0;

/** Failure exit code */
const EXIT_FAILURE = 1;

// ============================================================
// CLI argument parsing
// ============================================================

/**
 * Parses CLI arguments
 *
 * @param {string[]} [testArgs] — Argument array for testing (defaults to process.argv)
 * @returns {{ graphPath: string }}
 * @throws {Error} If arguments are invalid
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);

  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  if (args.length !== 1) {
    throw new Error(
      'Invalid arguments.\n' +
      '  Usage: validate-slug.js --graph=<path>'
    );
  }

  const graphFlag = args[0];
  if (!graphFlag.startsWith(GRAPH_PATH_ARG_PREFIX)) {
    throw new Error(
      'Argument must be --graph=<path>.\n' +
      `  Actual value: ${graphFlag}`
    );
  }
  const graphPath = graphFlag.slice(GRAPH_PATH_ARG_PREFIX.length);
  if (!graphPath) {
    throw new Error('--graph=<path> is empty.');
  }

  return { graphPath };
}

/**
 * 使用方法を出力する
 */
function printUsage() {
  console.log(`Usage: validate-slug.js --graph=<path>

グラフJSONの全ノードの slug フィールドを検証する。

引数:
  --graph=<path>  グラフJSONファイルのパス（必須）

出力:
  正常時: {"ok":true, "errors":[], "warnings":[]}（終了コード0）
  異常時: {"ok":false, "errors":[...], "warnings":[...]}（終了コード1）

slug ルール:
  - lower_snake_case 形式（英小文字・数字・アンダースコアのみ）
  - 先頭は英小文字
  - 最大25文字
  - 4単語以上は警告（ブロックしない）`);
}

// ============================================================
// Graph loading
// ============================================================

/**
 * Loads a graph JSON file
 *
 * @param {string} graphPath — Path to the graph file
 * @returns {object} Graph object
 * @throws {Error} If file read or JSON parse fails
 */
function loadGraph(graphPath) {
  const resolvedPath = path.resolve(graphPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Graph file not found: ${resolvedPath}\n` +
      '  Verify the specified path is correct.'
    );
  }
  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Failed to parse graph JSON file: ${resolvedPath}\n` +
      `  ${e.message}`
    );
  }
}

// ============================================================
// Slug validation functions
// ============================================================

/**
 * Validates that a slug follows lower_snake_case format (lowercase letter start, lowercase/digits/underscore only)
 *
 * @param {string} slug — Slug to validate
 * @returns {{ valid: boolean, reason: string | null }}
 */
function checkSlugFormat(slug) {
  if (!SLUG_FORMAT_PATTERN.test(slug)) {
    // Identify the violation type and return a specific reason
    if (/[A-Z]/.test(slug)) {
      return { valid: false, reason: 'Contains uppercase characters (use lower_snake_case)' };
    }
    if (/[ -]/.test(slug)) {
      return { valid: false, reason: 'Contains space or hyphen (use underscores)' };
    }
    if (/^[^a-z]/.test(slug)) {
      return { valid: false, reason: 'Does not start with a lowercase letter' };
    }
    return { valid: false, reason: 'Format violates lower_snake_case (allowed: [a-z0-9_])' };
  }
  return { valid: true, reason: null };
}

/**
 * Validates that slug length is within the maximum limit
 *
 * @param {string} slug — Slug to validate
 * @returns {{ valid: boolean, reason: string | null }}
 */
function checkSlugLength(slug) {
  if (slug.length > MAX_SLUG_LENGTH) {
    return {
      valid: false,
      reason: `${slug.length} chars (exceeds max ${MAX_SLUG_LENGTH}. Shorten to ${MAX_SLUG_LENGTH} or fewer)`
    };
  }
  return { valid: true, reason: null };
}

/**
 * Counts slug words (underscore-delimited) and validates against threshold
 *
 * @param {string} slug — Slug to validate
 * @returns {{ wordCount: number, isWarning: boolean }}
 */
function checkWordCount(slug) {
  if (slug.length === 0) return { wordCount: 0, isWarning: false };
  const wordCount = slug.split('_').length;
  return { wordCount, isWarning: wordCount >= WARNING_WORD_COUNT };
}

/**
 * Builds a validation error object (with remedy field)
 *
 * @param {string} nodeId — Node ID with the violation
 * @param {string} slug — Slug with the violation
 * @param {string} reason — Violation reason
 * @returns {{ nodeId: string, slug: string, reason: string, remedy: string }}
 */
function buildSlugError(nodeId, slug, reason) {
  const suggestedSlug = suggestFixedSlug(slug);
  return {
    nodeId,
    slug,
    reason,
    remedy: `node .claude/scripts/rfc-graph/crud.js --graph="<graph-path>" update-node --id=${nodeId} --field=slug --value="${suggestedSlug}"`
  };
}

/**
 * Generates a suggested fixed slug (lowercase, hyphen→_, leading digit avoidance, 25-char limit)
 *
 * @param {string} slug — Original slug
 * @returns {string} Suggested fix
 */
function suggestFixedSlug(slug) {
  let fixed = slug
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+/, '');

  // If empty or does not start with lowercase, prepend 's'
  if (fixed.length === 0) {
    return 'unnamed';
  }
  if (!/^[a-z]/.test(fixed)) {
    fixed = 's' + fixed;
  }

  // Truncate to 25 chars at word boundary
  if (fixed.length > MAX_SLUG_LENGTH) {
    fixed = truncateAtWordBoundary(fixed, MAX_SLUG_LENGTH);
  }
  return fixed;
}

/**
 * Truncates at word boundary (underscore)
 *
 * @param {string} str — String to truncate
 * @param {number} maxLen — Maximum length
 * @returns {string}
 */
function truncateAtWordBoundary(str, maxLen) {
  if (str.length <= maxLen) return str;
  const parts = str.split('_');
  let result = '';
  for (const part of parts) {
    const candidate = result ? `${result}_${part}` : part;
    if (candidate.length <= maxLen) {
      result = candidate;
    } else {
      break;
    }
  }
  // Fall back to simple truncation if no single word fits
  if (result.length === 0 || result.length > maxLen) {
    result = str.slice(0, maxLen).replace(/_+$/, '');
  }
  return result;
}

// ============================================================
// Main validation logic
// ============================================================

/**
 * Validates all node slugs in the graph
 *
 * @param {object} graph — Graph object ({ nodes: [...], edges: [...] })
 * @returns {{ ok: boolean, errors: Array, warnings: Array }}
 */
function validateSlugs(graph) {
  const errors = [];
  const warnings = [];
  const nodes = graph && graph.nodes ? graph.nodes : [];

  for (const node of nodes) {
    const { id, slug } = node;

    // Skip unset or empty slugs (allowed)
    if (slug === undefined || slug === null || slug === '') {
      continue;
    }
    if (typeof slug !== 'string') {
      errors.push(buildSlugError(id, String(slug), 'slug is not a string'));
      continue;
    }

    // Format check (skip length check on format violation)
    const formatResult = checkSlugFormat(slug);
    if (!formatResult.valid) {
      errors.push(buildSlugError(id, slug, formatResult.reason));
      continue;
    }

    // Length check
    const lengthResult = checkSlugLength(slug);
    if (!lengthResult.valid) {
      errors.push(buildSlugError(id, slug, lengthResult.reason));
    }

    // Word count check (warning only, non-blocking)
    const wordResult = checkWordCount(slug);
    if (wordResult.isWarning) {
      warnings.push({
        nodeId: id,
        slug,
        message: `${wordResult.wordCount}-word slug (>= ${WARNING_WORD_COUNT} words not recommended. Use a shorter slug)`
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

// ============================================================
// Main entry point
// ============================================================

function main() {
  try {
    const { graphPath } = parseArguments();
    const graph = loadGraph(graphPath);
    const result = validateSlugs(graph);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? EXIT_SUCCESS : EXIT_FAILURE);
  } catch (err) {
    console.error(`[ERROR] slug 検証に失敗しました。
原因: ${err.message}
対応: エラーメッセージに従って引数またはグラフファイルを修正してください。`);
    console.log(JSON.stringify({ ok: false, errors: [], warnings: [] }));
    process.exit(EXIT_FAILURE);
  }
}

// Exported for testing
module.exports = {
  validateSlugs,
  checkSlugFormat,
  checkSlugLength,
  checkWordCount,
  buildSlugError,
  suggestFixedSlug,
  truncateAtWordBoundary,
  parseArguments,
  MAX_SLUG_LENGTH,
  WARNING_WORD_COUNT,
  SLUG_FORMAT_PATTERN,
  GRAPH_PATH_ARG_PREFIX
};

// Run main only when executed directly
if (require.main === module) {
  main();
}
