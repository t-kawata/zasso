#!/usr/bin/env node

/**
 * scope-detection.js
 *
 * PX-61: Scope detection engine — answers "which definition scope contains
 * a given line number?" for source files in any of the 13 supported languages.
 *
 * Pure function module with zero side effects (no fs, no git, no process).
 * 100% unit-testable with inline source snippets as input.
 *
 * Usage:
 *   const { findContainingDefinition } = require("./scope-detection");
 *   const result = findContainingDefinition(lines, 5);
 *   // → { startLine: 3, name: "foo", kind: "function" } | null
 */

const { DEFINITION_PATTERN_METAS } = require("./scope-detection-constants");

// =============================================================================
// Helpers — context-aware brace counting (character-level)
// =============================================================================

/**
 * Determine the language family from an optional hint or content sniffing.
 * Returns "brace" for C-family or "indent" for Python/Ruby.
 */
// Implemented or modified under tickets: PX-61, PX-62; for details, refer to the command `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-61|PX-62) --for-spec --no-implementation-order`.
function detectLanguage(lines, languageHint) {
  if (languageHint === ".py" || languageHint === ".rb") return "indent";
  if (languageHint) return "brace";
  // Content sniffing: if a `def` or `class` with indentation appears before any
  // opening brace, the file is likely indent-based.
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed === "") continue;
    if (/^(def|class)\s/.test(trimmed)) {
      // Check next non-empty line for no opening brace
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
        const nextTrim = lines[j].trim();
        if (nextTrim === "") continue;
        if (nextTrim.includes("{")) return "brace";
        return "indent";
      }
      return "brace";
    }
    if (trimmed.includes("{")) return "brace";
  }
  return "brace"; // default fallback
}

// =============================================================================
// Brace-based scope detection
// =============================================================================

/**
 * Measure the net brace depth change for a single line, tracking multi-line
 * block comments via `inBlockComment` state (mutated).
 *
 * @param {string} line
 * @param {{ inBlockComment: boolean }} state — mutated in-place
 * @returns {number} net brace depth change for this line
 */
// Implemented or modified under the PX-62 ticket; for details, refer to the command `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-62 --for-spec --no-implementation-order`.
function measureBraceChange(line, state) {
  let netChange = 0;
  let inString = false;
  let stringChar = null;
  let escaped = false;
  let inLineComment = false;
  const inBlockComment = state.inBlockComment;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    // -- Block comment carries across lines --
    if (state.inBlockComment) {
      if (ch === "*" && i + 1 < line.length && line[i + 1] === "/") {
        state.inBlockComment = false;
        i++; // skip /
      }
      continue;
    }

    // -- Escape: skip next char --
    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && inString) { escaped = true; continue; }

    // -- Line comment: stop processing this line --
    if (!inString && ch === "/" && i + 1 < line.length && line[i + 1] === "/") {
      inLineComment = true;
      break;
    }

    // -- Block comment start --
    if (!inString && ch === "/" && i + 1 < line.length && line[i + 1] === "*") {
      state.inBlockComment = true;
      i++; // skip *
      continue;
    }

    // -- String delimiters --
    if (!inString && (ch === '"' || ch === "'" || ch === "`")) {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (inString && ch === stringChar) {
      inString = false;
      continue;
    }

    // -- Brace characters (only in code context) --
    if (ch === "{") netChange++;
    if (ch === "}") netChange--;
  }

  // Depth never goes below 0 for an individual line's net change.
  // The caller applies floor-at-zero when adding to running depth.
  return netChange;
}

/**
 * Match a line against all DEFINITION_PATTERN_METAS and extract name + kind.
 * Returns null if no pattern matches.
 */
// Implemented or modified under the PX-62 ticket; for details, refer to the command `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-62 --for-spec --no-implementation-order`.
function matchDefinition(line) {
  const trimmed = line.trim();
  for (const meta of DEFINITION_PATTERN_METAS) {
    const match = trimmed.match(meta.raw);
    if (match) {
      // Determine name
      const nameIndex = meta.nameIndex !== undefined ? meta.nameIndex : 1;
      let name;
      if (nameIndex === null) {
        name = "anonymous";
      } else {
        name = match[nameIndex];
        if (meta.allowEmptyName && name === "") name = "anonymous";
      }

      // Determine kind
      let kind = meta.kind;
      if (kind === null && meta.kindIndex !== undefined) {
        kind = match[meta.kindIndex] === "class" ? "class" : "function";
      }
      if (!kind) kind = "function";

      return { name, kind };
    }
  }
  return null;
}

// =============================================================================
// Indentation-based scope detection (Python, Ruby)
// =============================================================================

/**
 * Find containing definition using indentation tracking.
 * For Pythion "def" and "class" keywords only (Ruby "def" and "class" too).
 */
// Implemented or modified under the PX-62 ticket; for details, refer to the command `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-62 --for-spec --no-implementation-order`.
function findContainingDefinitionByIndent(lines, targetLine, languageHint) {
  // Indentation: first non-whitespace column
  const indentStack = []; // { startLine, name, kind, indent }

  for (let i = 0; i <= targetLine; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === "" || trimmed.startsWith("#")) {
      // Still need to pop when outside any def (empty line at indent 0)
      if (i === targetLine && indentStack.length === 0) return null;
      continue;
    }

    const indent = line.length - line.trimStart().length;
    const keywordMatch = trimmed.match(/^(def|class)\s+(\w+)/);

    if (keywordMatch) {
      // Pop definitions with indentation >= current (same or less indented → closed)
      while (indentStack.length > 0 &&
             indentStack[indentStack.length - 1].indent >= indent) {
        indentStack.pop();
      }
      const kind = keywordMatch[1] === "class" ? "class" : "function";
      indentStack.push({
        startLine: i,
        name: keywordMatch[2],
        kind,
        indent,
      });
    }

    if (i === targetLine) {
      if (indentStack.length === 0) return null;
      return extractResult(indentStack[indentStack.length - 1]);
    }
  }

  return null;
}

// =============================================================================
// Main exposed function
// =============================================================================

/**
 * Extract startLine, name, kind from a stack entry.
 */
// Implemented or modified under the PX-62 ticket; for details, refer to the command `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-62 --for-spec --no-implementation-order`.
function extractResult(entry) {
  return { startLine: entry.startLine, name: entry.name, kind: entry.kind };
}

/**
 * Find the innermost definition (function / struct / class / impl / trait /
 * enum / interface / type / module) that contains `targetLine`.
 *
 * @param {string[]} lines      — source file lines
 * @param {number}   targetLine — 0-indexed line number
 * @param {string}   [languageHint] — optional ".rs" | ".py" etc.
 * @returns {{ startLine: number, name: string, kind: string } | null}
 */
// Implemented or modified under the PX-62 ticket; for details, refer to the command `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-62 --for-spec --no-implementation-order`.
function findContainingDefinition(lines, targetLine, languageHint) {
  // -- Input validation --
  if (!Array.isArray(lines) || lines.length === 0) return null;
  if (typeof targetLine !== "number" || targetLine < 0 || targetLine >= lines.length) {
    return null;
  }

  // -- Language detection (hint-based, with content fallback) --
  const lang = detectLanguage(lines, languageHint);

  if (lang === "indent") {
    return findContainingDefinitionByIndent(lines, targetLine, languageHint);
  }

  // ==================================================================
  // Brace-based scan (C-family: Rust, Go, TS/JS, C#, Java, Kotlin, Swift)
  // ==================================================================

  let depth = 0;
  const state = { inBlockComment: false };
  const definitionStack = [];
  // { startLine, name, kind, startDepth }[]

  for (let i = 0; i <= targetLine; i++) {
    const line = lines[i];

    // -- Only check for definitions when not in a block comment --
    if (!state.inBlockComment) {
      const def = matchDefinition(line);
      if (def) {
        definitionStack.push({
          startLine: i,
          name: def.name,
          kind: def.kind,
          startDepth: depth,
          bodyOpened: false, // tracks whether depth > startDepth has been observed
        });
      }
    }

    // -- EARLY RETURN: targetLine reached before applying this line's brace changes.
    //    The closing brace line belongs to its containing definition. --
    if (i === targetLine) {
      if (definitionStack.length === 0) return null;
      return extractResult(definitionStack[definitionStack.length - 1]);
    }

    // -- Apply brace depth changes for this line --
    const netChange = measureBraceChange(line, state);
    const previousDepth = depth;
    depth += netChange;
    if (depth < 0) depth = 0; // never negative

    // -- Mark definitions whose body has opened (depth > startDepth) --
    if (definitionStack.length > 0 && depth > definitionStack[definitionStack.length - 1].startDepth) {
      definitionStack[definitionStack.length - 1].bodyOpened = true;
    }

    // -- Pop definitions whose scope has closed --
    // A definition only closes after its body has opened (depth > startDepth at least once).
    // This handles Go's brace-on-next-line style (func foo()\n{) — the definition is pushed
    // before the opening brace, but shouldn't be popped until after the closing brace.
    while (
      definitionStack.length > 0 &&
      definitionStack[definitionStack.length - 1].bodyOpened &&
      definitionStack[definitionStack.length - 1].startDepth >= depth
    ) {
      definitionStack.pop();
    }
  }

  return null; // unreachable — targetLine is always reached in the loop
}

module.exports = { findContainingDefinition };
