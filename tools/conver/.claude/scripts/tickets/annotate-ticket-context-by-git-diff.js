#!/usr/bin/env node

/**
 * annotate-ticket-context-by-git-diff.js
 *
 * Injects ticket-key provenance comments into source files modified or added
 * by the current ticket. Operates on git diff output — only touches files
 * that are uncommitted (staged or unstaged).
 *
 * The comment is inserted once per file, at the first meaningful definition
 * (function, struct, class, interface, etc.) that was touched by the diff.
 * If no definition pattern is found, a [::AMBIGUOUS::] marker is inserted
 * at the top of the file for AI resolution.
 *
 * CLI: annotate-ticket-context-by-git-diff.js --ticket-key=PX-59
 *       [--tickets=<Tickets.json>] [--verbose]
 *
 * Exit codes:
 *   0 — All done (or nothing to do)
 *   1 — Error
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_EXTENSIONS = new Set([
  ".rs", ".go", ".ts", ".tsx", ".js", ".jsx", ".vue",
  ".py", ".rb", ".swift", ".kt", ".java", ".cs",
]);

const DEFINITION_PATTERNS = [
  /^\s*fn\s+\w+/,
  /^\s*func\s+\w+/,
  /^\s*(public\s+|private\s+|protected\s+)?(async\s+)?function\s*\*?\s*\w*\s*\(/,
  /^\s*(export\s+)?default\s+(function|class)\s+\w+/,
  /^\s*(export\s+)?(abstract\s+)?class\s+\w+/,
  /^\s*(export\s+)?struct\s+\w+/,
  /^\s*(export\s+)?trait\s+\w+/,
  /^\s*(pub\s+)?impl\s+\w+/,
  /^\s*(export\s+)?enum\s+\w+/,
  /^\s*(export\s+)?interface\s+\w+/,
  /^\s*(export\s+)?type\s+\w+/,
  /^\s*(export\s+)?module\s+\w+/,
  /^\s*def\s+\w+/,
  /^\s*(export\s+default\s+)\{/,
];

const ANNOTATION_PATTERN = /implemented under the\s+(P\d+-\d+|PX-\d+)\s+ticket/;

// ---------------------------------------------------------------------------
// Core functions (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Build the annotation comment for a given ticket key.
 */
function buildAnnotation(ticketKey) {
  return (
    `// This code was implemented under the ${ticketKey} ticket; for details, ` +
    `refer to the command \`node .claude/scripts/tickets/show-ticket-context.js ` +
    `--ticket-key=${ticketKey} --for-spec --no-implementation-order\`.`
  );
}

/**
 * Scan lines for the first definition pattern match.
 * Returns 1-indexed line number, or null if no pattern matches.
 */
function detectFirstDefinition(lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of DEFINITION_PATTERNS) {
      if (pattern.test(line)) {
        return i + 1; // 1-indexed
      }
    }
  }
  return null;
}

/**
 * Check if any line already contains an annotation for the given ticket key.
 */
function hasExistingAnnotation(lines, ticketKey) {
  const escaped = ticketKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`implemented under the\\s+${escaped}\\s+ticket`);
  return lines.some((line) => regex.test(line));
}

/**
 * Insert a comment line at the given 1-indexed position.
 * Returns a new array of lines.
 */
function insertAnnotation(lines, lineIndex, comment) {
  const idx = lineIndex - 1; // convert to 0-indexed
  const result = [
    ...lines.slice(0, idx),
    comment,
    ...lines.slice(idx),
  ];
  return result;
}

/**
 * Filter files by source code extensions.
 */
function filterSourceFiles(filePaths) {
  return filePaths.filter((fp) => {
    const ext = path.extname(fp).toLowerCase();
    return SOURCE_EXTENSIONS.has(ext);
  });
}

/**
 * Process a single file: detect definition, check for existing annotation,
 * insert if needed.  Returns an action string describing what happened.
 */
function processFile(filePath, ticketKey, opts) {
  const verbose = opts && opts.verbose;
  const resolved = path.resolve(filePath);

  let content;
  try {
    content = fs.readFileSync(resolved, "utf8");
  } catch (e) {
    if (verbose) console.error(`[annotate] Cannot read ${filePath}: ${e.message}`);
    return "skipped:unreadable";
  }

  const lines = content.split("\n");

  // Check if annotation already exists
  if (hasExistingAnnotation(lines, ticketKey)) {
    if (verbose) console.error(`[annotate] Already annotated: ${filePath}`);
    return "skipped:already-annotated";
  }

  // Find the first definition
  const defLine = detectFirstDefinition(lines);

  if (defLine === null) {
    // No definition pattern found — insert ambiguous marker
    const ambiguousComment = `// [::AMBIGUOUS::] Could not locate first definition for ticket ${ticketKey} — AI must resolve placement.`;
    const newLines = [ambiguousComment, "", ...lines];
    fs.writeFileSync(resolved, newLines.join("\n"), "utf8");
    if (verbose) console.error(`[annotate] Inserted AMBIGUOUS marker: ${filePath}`);
    return "annotated:ambiguous";
  }

  // Insert annotation
  const comment = buildAnnotation(ticketKey);
  const newLines = insertAnnotation(lines, defLine, comment);
  fs.writeFileSync(resolved, newLines.join("\n"), "utf8");

  if (verbose) console.error(`[annotate] Inserted at line ${defLine}: ${filePath}`);
  return `annotated:${defLine}`;
}

/**
 * Main orchestrator: get changed files, filter, annotate.
 * Returns a summary object.
 */
function annotateSourceFiles(cwd, ticketKey, opts) {
  const verbose = opts && opts.verbose;

  // 1. Get changed files via git diff
  let changedFiles;
  try {
    const stdout = execFileSync("git", [
      "diff", "--name-only", "--diff-filter=AM",
    ], { cwd, encoding: "utf8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] });
    changedFiles = stdout.split("\n").filter((f) => f.trim().length > 0);
  } catch (e) {
    // Not a git repo or git error
    if (verbose) console.error(`[annotate] git diff failed: ${e.message}`);
    return { total: 0, annotated: [], skipped: [], errors: [] };
  }

  // Also include untracked files
  try {
    const untrackedOut = execFileSync("git", [
      "ls-files", "--others", "--exclude-standard",
    ], { cwd, encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });
    const untrackedFiles = untrackedOut.split("\n").filter((f) => f.trim().length > 0);
    changedFiles = [...new Set([...changedFiles, ...untrackedFiles])];
  } catch (_) {
    // Ignore errors listing untracked files
  }

  // 2. Filter by extension
  const sourceFiles = filterSourceFiles(changedFiles);

  if (sourceFiles.length === 0) {
    if (verbose) console.error("[annotate] No source files to annotate");
    return { total: 0, annotated: [], skipped: [], errors: [] };
  }

  // 3. Process each file
  const annotated = [];
  const skipped = [];
  const errors = [];

  for (const file of sourceFiles) {
    try {
      const action = processFile(file, ticketKey, opts);
      if (action.startsWith("annotated")) {
        annotated.push(file);
      } else {
        skipped.push(file);
      }
    } catch (e) {
      errors.push({ file, error: e.message });
      if (verbose) console.error(`[annotate] Error processing ${file}: ${e.message}`);
    }
  }

  return { total: sourceFiles.length, annotated, skipped, errors };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * Verify that all changed source files have a ticket-key annotation.
 * Returns a verification report object.
 */
function verifyAnnotations(cwd, ticketKey, opts) {
  const verbose = opts && opts.verbose;

  // 1. Get changed files (same logic as annotateSourceFiles)
  let changedFiles;
  try {
    const stdout = execFileSync("git", [
      "diff", "--name-only", "--diff-filter=AM",
    ], { cwd, encoding: "utf8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] });
    changedFiles = stdout.split("\n").filter((f) => f.trim().length > 0);
  } catch (e) {
    if (verbose) console.error(`[annotate-verify] git diff failed: ${e.message}`);
    return { total: 0, missing: [], ambiguous: [], errors: [] };
  }

  // Also include untracked files
  try {
    const untrackedOut = execFileSync("git", [
      "ls-files", "--others", "--exclude-standard",
    ], { cwd, encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });
    const untrackedFiles = untrackedOut.split("\n").filter((f) => f.trim().length > 0);
    changedFiles = [...new Set([...changedFiles, ...untrackedFiles])];
  } catch (_) { /* ignore */ }

  // 2. Filter by extension
  const sourceFiles = filterSourceFiles(changedFiles);

  if (sourceFiles.length === 0) {
    if (verbose) console.error("[annotate-verify] No source files to verify");
    return { total: 0, missing: [], ambiguous: [], errors: [] };
  }

  // 3. Verify each file
  const missing = [];
  const ambiguous = [];
  const errors = [];

  for (const file of sourceFiles) {
    try {
      const resolved = path.resolve(file);
      const content = fs.readFileSync(resolved, "utf8");
      const lines = content.split("\n");

      if (hasExistingAnnotation(lines, ticketKey)) {
        continue; // OK: annotation present
      }

      // Check for AMBIGUOUS marker
      const hasAmbiguous = lines.some((l) => l.includes("[::AMBIGUOUS::]"));
      if (hasAmbiguous) {
        ambiguous.push(file);
      } else {
        missing.push(file);
      }
    } catch (e) {
      errors.push({ file, error: e.message });
    }
  }

  return { total: sourceFiles.length, missing, ambiguous, errors };
}

function parseArgs() {
  const args = process.argv.slice(2);
  let ticketKey = "";
  let verbose = false;
  let verifyMode = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ticket-key" && i + 1 < args.length) {
      ticketKey = args[++i];
    } else if (args[i].startsWith("--ticket-key=")) {
      ticketKey = args[i].split("=")[1];
    } else if (args[i] === "--verbose") {
      verbose = true;
    } else if (args[i] === "--verify") {
      verifyMode = true;
    }
  }

  return { ticketKey, verbose, verifyMode };
}

function main() {
  const opts = parseArgs();

  if (!opts.ticketKey) {
    console.error("Usage: annotate-ticket-context-by-git-diff.js --ticket-key=<P{id}-{id}|PX-{id}> [--verbose] [--verify]");
    process.exit(EXIT_FAILURE);
  }

  const cwd = process.cwd();

  if (opts.verifyMode) {
    // Verify mode: check annotations exist, report defects
    const report = verifyAnnotations(cwd, opts.ticketKey, opts);

    if (opts.verbose) {
      console.error(
        `[annotate-verify] ${report.total} source file(s): ` +
        `${report.missing.length} missing, ` +
        `${report.ambiguous.length} ambiguous, ` +
        `${report.errors.length} error(s)`,
      );
    }

    if (report.missing.length > 0) {
      console.error("[annotate-verify] MISSING annotation in:");
      report.missing.forEach((f) => console.error(`  ${f}`));
    }
    if (report.ambiguous.length > 0) {
      console.error("[annotate-verify] AMBIGUOUS marker found in — AI must resolve:");
      report.ambiguous.forEach((f) => console.error(`  ${f}`));
    }
    if (report.errors.length > 0) {
      console.error("[annotate-verify] ERRORS:");
      report.errors.forEach((e) => console.error(`  ${e.file}: ${e.error}`));
    }

    // Output JSON report to stdout for programmatic consumption
    console.log(JSON.stringify(report));
    process.exit(report.missing.length > 0 || report.errors.length > 0 ? EXIT_FAILURE : EXIT_SUCCESS);
  }

  // Annotate mode (default)
  const result = annotateSourceFiles(cwd, opts.ticketKey, opts);

  if (opts.verbose) {
    console.error(
      `[annotate] Summary: ${result.total} file(s), ` +
      `${result.annotated.length} annotated, ` +
      `${result.skipped.length} skipped, ` +
      `${result.errors.length} error(s)`,
    );
  }

  process.exit(EXIT_SUCCESS);
}

// ---------------------------------------------------------------------------
// Exports (for testing)
// ---------------------------------------------------------------------------

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildAnnotation,
    detectFirstDefinition,
    hasExistingAnnotation,
    insertAnnotation,
    filterSourceFiles,
    annotateSourceFiles,
    verifyAnnotations,
    processFile,
    parseArgs,
    main,
  };
}

// Run if called directly
if (require.main === module) {
  main();
}
