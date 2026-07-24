#!/usr/bin/env node

/**
 * resolve-ambiguous-markers.js
 *
 * PX-64: Mechanical [::TICKET::] annotation inserter for [::AMBIGUOUS::] resolution.
 *
 * Two-phase deterministic flow:
 *   Phase 1 (AI reviews):  --mode=list-definitions
 *   Phase 2 (Script does): --mode=inject-at
 *
 * Design principle:
 *   - Script provides information mechanically
 *   - AI makes the sole judgment (which definition line is correct)
 *   - Script executes the mechanical insertion
 *   - Annotation format is always produced by buildAnnotation() — never hand-typed
 *
 * CLI:
 *   node resolve-ambiguous-markers.js --mode=list-definitions --file=<path> --ticket-key=<key>
 *   node resolve-ambiguous-markers.js --mode=inject-at --file=<path> --ticket-key=<key> --definition-line=<N>
 *
 * Exit codes:
 *   0 — Success
 *   1 — Error (outputs JSON {success: false, error: message} on stdout)
 */

const fs = require("fs");
const path = require("path");

// Import annotation functions (format is always guaranteed by buildAnnotation)
const { buildAnnotation, insertAnnotation } = require("./annotate-ticket-context-by-git-diff");

// Import definition patterns for listing
const { DEFINITION_PATTERN_METAS } = require("./lib/scope-detection-constants");

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

// =============================================================================
// Pure functions
// =============================================================================

/**
 * List all definitions in source lines using DEFINITION_PATTERN_METAS.
 * Pure function — no side effects.
 *
 * @param {string[]} lines
 * @returns {Array<{line: number, name: string, kind: string}>}
 */
// [::TICKET::] PX-64 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-64 --for-spec --no-implementation-order`.
function listAllDefinitions(lines) {
  const definitions = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();

    for (const meta of DEFINITION_PATTERN_METAS) {
      const match = trimmed.match(meta.raw);
      if (match) {
        // Extract name
        const nameIndex = meta.nameIndex !== undefined ? meta.nameIndex : 1;
        let name;
        if (nameIndex === null) {
          name = "anonymous";
        } else {
          name = match[nameIndex];
          if (meta.allowEmptyName && name === "") name = "anonymous";
        }

        // Extract kind
        let kind = meta.kind;
        if (kind === null && meta.kindIndex !== undefined) {
          kind = match[meta.kindIndex] === "class" ? "class" : "function";
        }
        if (!kind) kind = "function";

        definitions.push({ line: i, name, kind });
        break; // first match per line wins
      }
    }
  }

  return definitions;
}

// =============================================================================
// File-based operations
// =============================================================================

/**
 * Get git diff -U5 for the given file path.
 * Returns the diff string, or null if not in a git repo.
 */
// [::TICKET::] PX-65 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-65 --for-spec --no-implementation-order`.
function getGitDiffU5(filePath) {
  try {
    const { execFileSync } = require("child_process");
    const stdout = execFileSync("git", ["diff", "-U5", "--", filePath], {
      encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"],
    });
    return stdout.trim() || null;
  } catch (_) {
    return null;
  }
}

/**
 * Build Markdown output for AI consumption.
 * Produces: diff context section + definitions table.
 */
// [::TICKET::] PX-65 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-65 --for-spec --no-implementation-order`.
function buildMarkdownOutput(definitions, diffOutput) {
  const lines = [];

  if (diffOutput) {
    lines.push("## Changed lines (git diff -U5)");
    lines.push("");
    lines.push("```diff");
    lines.push(diffOutput);
    lines.push("```");
  } else {
    lines.push("## Changed lines (git diff -U5)");
    lines.push("");
    lines.push("*git diff unavailable* — file may be outside a git repository");
  }

  lines.push("");
  lines.push("## Definitions in this file");
  lines.push("");
  lines.push("| Line | Name | Kind |");
  lines.push("|------|------|------|");

  if (definitions.length === 0) {
    lines.push("| *no definitions found* | | |");
  } else {
    for (const def of definitions) {
      lines.push(`| ${def.line} | ${def.name} | ${def.kind} |`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Mode 1: Print Markdown with git diff context + definitions table to stdout.
 * Read-only — never mutates the file.
 */
// [::TICKET::] PX-64, PX-65 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-64|PX-65) --for-spec --no-implementation-order`.
function listDefinitions(filePath, ticketKey) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    const definitions = listAllDefinitions(lines);
    const diffOutput = getGitDiffU5(filePath);
    const markdown = buildMarkdownOutput(definitions, diffOutput);
    console.log(markdown);
  } catch (e) {
    console.error(`Error reading ${filePath}: ${e.message}`);
    process.exit(1);
  }
}

/**
 * Mode 2: Inject a [::TICKET::] annotation before the specified definition line,
 * then remove all [::AMBIGUOUS::] markers. Mutates the file.
 *
 * @param {string} filePath
 * @param {string} ticketKey
 * @param {number} definitionLine — 0-indexed line number of the target definition
 * @returns {{success: boolean, error?: string, insertedAtLine?: number}}
 */
// [::TICKET::] PX-64 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-64 --for-spec --no-implementation-order`.
function injectAt(filePath, ticketKey, definitionLine) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    let lines = content.split("\n");

    // Validate definitionLine
    if (typeof definitionLine !== "number" || definitionLine < 0 || definitionLine >= lines.length) {
      return { success: false, error: `definition-line ${definitionLine} is out of range (file has ${lines.length} lines)` };
    }

    // 1. Generate TICKET comment (mechanical, format guaranteed by buildAnnotation)
    const comment = buildAnnotation(ticketKey);

    // 2. Insert before definition (insertAnnotation uses 1-indexed)
    lines = insertAnnotation(lines, definitionLine + 1, comment);

    // 3. Remove all AMBIGUOUS lines (not just the first)
    lines = lines.filter((l) => !l.includes("[::AMBIGUOUS::]"));

    // 4. Write back
    fs.writeFileSync(filePath, lines.join("\n"), "utf8");

    return { success: true, insertedAtLine: definitionLine };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// =============================================================================
// CLI
// =============================================================================

// [::TICKET::] PX-64 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-64 --for-spec --no-implementation-order`.
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { mode: null, file: null, ticketKey: null, definitionLine: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--mode" && i + 1 < args.length) opts.mode = args[++i];
    else if (args[i].startsWith("--mode=")) opts.mode = args[i].split("=")[1];
    else if (args[i] === "--file" && i + 1 < args.length) opts.file = args[++i];
    else if (args[i].startsWith("--file=")) opts.file = args[i].split("=")[1];
    else if (args[i] === "--ticket-key" && i + 1 < args.length) opts.ticketKey = args[++i];
    else if (args[i].startsWith("--ticket-key=")) opts.ticketKey = args[i].split("=")[1];
    else if (args[i] === "--definition-line" && i + 1 < args.length) opts.definitionLine = parseInt(args[++i], 10);
    else if (args[i].startsWith("--definition-line=")) opts.definitionLine = parseInt(args[i].split("=")[1], 10);
  }

  return opts;
}

// [::TICKET::] PX-64, PX-65 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-64|PX-65) --for-spec --no-implementation-order`.
function main() {
  const opts = parseArgs();

  if (!opts.mode || !opts.file || !opts.ticketKey) {
    console.error("Usage: node resolve-ambiguous-markers.js --mode=list-definitions|inject-at --file=<path> --ticket-key=<key> [--definition-line=<N>]");
    process.exit(EXIT_FAILURE);
  }

  if (!fs.existsSync(opts.file)) {
    const result = { success: false, error: `File not found: ${opts.file}` };
    console.log(JSON.stringify(result));
    process.exit(EXIT_FAILURE);
  }

  if (opts.mode === "list-definitions") {
    listDefinitions(opts.file, opts.ticketKey); // prints Markdown to stdout
    process.exit(EXIT_SUCCESS);
  }

  if (opts.mode === "inject-at") {
    if (opts.definitionLine === null || isNaN(opts.definitionLine)) {
      const result = { success: false, error: "inject-at mode requires --definition-line=<N>" };
      console.log(JSON.stringify(result));
      process.exit(EXIT_FAILURE);
    }
    const result = injectAt(opts.file, opts.ticketKey, opts.definitionLine);
    console.log(JSON.stringify(result));
    process.exit(result.success ? EXIT_SUCCESS : EXIT_FAILURE);
  }

  const result = { success: false, error: `Unknown mode: ${opts.mode}. Use 'list-definitions' or 'inject-at'.` };
  console.log(JSON.stringify(result));
  process.exit(EXIT_FAILURE);
}

// =============================================================================
// Exports
// =============================================================================

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    listAllDefinitions,
    listDefinitions,
    injectAt,
  };
}

if (require.main === module) {
  main();
}
