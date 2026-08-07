#!/usr/bin/env node
/**
 * scope-detection-constants.js
 *
 * PX-61, PX-62: Shared constants extracted from annotate-ticket-context-by-git-diff.js.
 * Both scope-detection.js and the main script import from this module.
 *
 * Pure data — zero logic, zero side effects.
 */

// Implemented or modified under tickets: PX-61, PX-62; for details, refer to the command `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-61|PX-62) --for-spec --no-implementation-order`.

/**
 * Source file extensions that the annotation system supports.
 * Ported verbatim from annotate-ticket-context-by-git-diff.js lines 34-37.
 */
const SOURCE_EXTENSIONS = new Set([
  ".rs", ".go", ".ts", ".tsx", ".js", ".jsx", ".vue",
  ".py", ".rb", ".swift", ".kt", ".java", ".cs",
]);

/**
 * Enhanced pattern definitions with kind metadata and name extraction.
 * Each entry has:
 *   raw          — RegExp to match against a line (first capture group = name)
 *   kind         — kind string ("function" | "class" | "struct" | …)
 *   nameIndex    — capture group index for the definition name (default 1)
 *   kindIndex    — when null, determined dynamically from keyword (for `export default`)
 *
 * Ported and extended from annotate-ticket-context-by-git-diff.js lines 39-54.
 */
const DEFINITION_PATTERN_METAS = [
  // Rust
  { raw: /^\s*fn\s+(\w+)/,                                                      kind: "function" },
  // Go
  { raw: /^\s*func\s+(\w+)/,                                                    kind: "function" },
  // JS/TS: function (named or anonymous arrow, async, generator)
  { raw: /^\s*(?:(?:public|private|protected)\s+)?(?:async\s+)?function\s*\*?\s*(\w*)\s*\(/,
    kind: "function", nameIndex: 1, allowEmptyName: true },
  // JS/TS: method shorthand — bar() { ... } with access modifiers, get/set
  // Negative lookahead excludes control-flow keywords that also use "keyword(...) {"
  { raw: /^\s*(?:(?:public|private|protected|static)\s+)*(?!(?:if|for|while|switch|catch|with|typeof|instanceof|void|return|throw|delete)\b)(?:async\s+)?(?:get\s+|set\s+)?(\w+)\s*\([^)]*\)\s*\{/,
    kind: "function" },
// [::TICKET::] PX-147 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-147 --for-spec --no-implementation-order`.
  // JS/TS: IIFE — `(function name() { ... })();`. The leading "(" makes the
  // line-start function pattern miss it, so it needs an explicit pattern.
  { raw: /^\s*\(\s*(?:async\s+)?function\s*\*?\s*(\w*)\s*\(/,
    kind: "function", nameIndex: 1, allowEmptyName: true },
  // JS/TS: export default function|class (kind determined by match[1])
  { raw: /^\s*(?:export\s+)?default\s+(function|class)\s+(\w+)/,
    kind: null, kindIndex: 1, nameIndex: 2 },
  // General: class
  { raw: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,                     kind: "class" },
  // General: struct
  { raw: /^\s*(?:export\s+)?struct\s+(\w+)/,                                    kind: "struct" },
  // Rust: trait
  { raw: /^\s*(?:export\s+)?trait\s+(\w+)/,                                     kind: "trait" },
  // Rust: impl
  { raw: /^\s*(?:pub\s+)?impl\s+(\w+)/,                                          kind: "impl" },
  // General: enum
  { raw: /^\s*(?:export\s+)?enum\s+(\w+)/,                                      kind: "enum" },
  // General: interface
  { raw: /^\s*(?:export\s+)?interface\s+(\w+)/,                                  kind: "interface" },
  // TypeScript: type alias
  { raw: /^\s*(?:export\s+)?type\s+(\w+)/,                                      kind: "type" },
  // General: module (Swift, Rust)
  { raw: /^\s*(?:export\s+)?module\s+(\w+)/,                                    kind: "module" },
  // Python / Ruby
  { raw: /^\s*def\s+(\w+)/,                                                      kind: "function" },
  // JS/TS: export default {} (expression, no name)
  { raw: /^\s*(?:export\s+default\s+)\{/,                                        kind: "expression", nameIndex: null },
];

/**
 * Raw RegExp patterns (backward compatibility).
 * Ported verbatim from annotate-ticket-context-by-git-diff.js lines 39-54.
 * These are the .raw fields of DEFINITION_PATTERN_METAS.
 */
const DEFINITION_PATTERNS = DEFINITION_PATTERN_METAS.map((m) => m.raw);

/**
 * Quick keyword-to-kind lookup for patterns that don't need complex matching.
 */
const DEFINITION_KINDS = {
  fn: "function",
  func: "function",
  function: "function",
  class: "class",
  struct: "struct",
  trait: "trait",
  impl: "impl",
  enum: "enum",
  interface: "interface",
  type: "type",
  module: "module",
  def: "function",
};

module.exports = {
  SOURCE_EXTENSIONS,
  DEFINITION_PATTERNS,
  DEFINITION_PATTERN_METAS,
  DEFINITION_KINDS,
};
