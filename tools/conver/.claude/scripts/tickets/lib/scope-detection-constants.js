#!/usr/bin/env node
// [::TICKET::] PX-209 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-209 --for-spec --no-implementation-order`.
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
 *
 * This set is checked against the repository rather than trusted. A file the
 * mechanism does not know about is never reported on, so an omission here is
 * invisible: it produces no error and no output, only an absence. `.mjs` was
 * added by P22-4 for that reason, and `.cjs` was left behind at that moment —
 * 134 tracked files, this repository's own tests, none of them able to carry the
 * annotation binding an implementation to the design context it came from.
 *
 * `lib/scope-extensions-census.js` derives the extensions this repository
 * actually contains and `tests/scope-extensions.test.cjs` asserts that every one
 * of them is in this set or in EXCLUDED_SOURCE_EXTENSIONS. An extension present
 * in the repository and absent from both fails that test by name.
 *
 * What the check cannot do is tell whether a decision is right. It can only tell
 * that a decision was written down. `.sh` is excluded on a measurement, not on a
 * principle; a reader who disagrees with the measurement should change the
 * measurement and the entry together.
 */
const SOURCE_EXTENSIONS = new Set([
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
  ".rs", ".go", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue",
  ".py", ".rb", ".swift", ".kt", ".java", ".cs",
]);

/**
 * Path prefixes the census ignores.
 *
 * These are complete copies of other projects' trees, neither of them owned by
 * this repository: `siprs-with-4layers/` has no `.git` of its own and has
 * already diverged from this toolchain, and `siprs-for-reverse/` vendors pjsip.
 * Between them they hold 2253 C/C++ files and the WebRTC build files, which is
 * what reduces the census from forty undecided extensions to four.
 *
 * The exclusion is by path, not by extension, so a vendored `.rs` is excluded
 * exactly as a vendored `.h` is, and a `.h` file in this repository's own tree
 * would still owe a decision.
 */
const VENDORED_ROOTS = ["siprs-with-4layers/", "siprs-for-reverse/"];

/**
 * Extensions present in this repository that the annotation system deliberately
 * does not support, each with the reason the decision was made.
 *
 * The reasons are measurements or ownership facts, not preferences: an entry
 * that says "not needed" is a decision nobody can review.
 */
const EXCLUDED_SOURCE_EXTENSIONS = new Map([
  [
    ".md",
    "Prose. The checklist generators write Markdown for a human to read, and the " +
      "definition parser matches brace-shaped lines, so it would annotate sentences. " +
      "417 tracked files.",
  ],
  [
    ".json",
    "Data. A JSON file has no definitions to bind an annotation to, and most of these " +
      "are fixtures whose bytes the regression gate freezes — writing a comment into " +
      "one would break a frozen digest, not record provenance. 100 tracked files.",
  ],
  [
    ".sh",
    "Measured, not assumed: a ten-file sample of the 18 tracked shell scripts yielded " +
      "0/10 with a definition detected, while a hand-written `function helper() { ` " +
      "fixture does match. Admitting it would annotate nothing while claiming support.",
  ],
  [
    ".toml",
    "Data. A Cargo manifest declares no definition for the parser to bind an " +
      "annotation to — measured 0 across the manifests this repository tracks — and " +
      "`buildAnnotation` writes `//`, which TOML does not read as a comment, so " +
      "admitting it would insert a line the manifest cannot parse rather than record " +
      "provenance.",
  ],
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
  EXCLUDED_SOURCE_EXTENSIONS,
  VENDORED_ROOTS,
  DEFINITION_PATTERNS,
  DEFINITION_PATTERN_METAS,
  DEFINITION_KINDS,
};
