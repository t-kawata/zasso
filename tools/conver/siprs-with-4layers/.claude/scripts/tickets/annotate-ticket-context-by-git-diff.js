#!/usr/bin/env node

/**
 * annotate-ticket-context-by-git-diff.js
 *
 * Injects ticket-key provenance comments into source files modified or added
 * by the current ticket. Operates on git diff output — only touches files
 * that are uncommitted (staged or unstaged).
 *
 * The comment is inserted at each definition (function, struct, class, etc.)
 * that contains changed lines, based on `git diff -U0`. Multiple changed lines
 * in the same definition produce exactly one annotation (deduplicated).
 * If a changed line belongs to no definition, a [::AMBIGUOUS::] marker is
 * inserted at the top of the file for AI resolution.
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

// PX-61: Import shared scope detection engine and constants
const { findContainingDefinition } = require("./lib/scope-detection");
const { SOURCE_EXTENSIONS } = require("./lib/scope-detection-constants");

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

// ---------------------------------------------------------------------------
// Constants (imported from PX-61 shared module)
// ---------------------------------------------------------------------------

// SOURCE_EXTENSIONS and DEFINITION_PATTERNS imported from ./lib/scope-detection-constants

// ---------------------------------------------------------------------------
// Core functions (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Build the annotation comment for a given ticket key.
 */
// Implemented or modified under tickets: PX-60, PX-61, PX-62; for details, refer to the command `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-60|PX-61|PX-62) --for-spec --no-implementation-order`.
// [::TICKET::] PX-63 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-63 --for-spec --no-implementation-order`.
function buildAnnotation(ticketKey) {
  return (
    `// [::TICKET::] ${ticketKey} changes. Details: \`node .claude/scripts/tickets/show-ticket-context.js ` +
    `--ticket-key=${ticketKey} --for-spec --no-implementation-order\`.`
  );
}

/**
 * Build the multi-ticket annotation comment for merged hot-spot functions.
 */
// [::TICKET::] PX-62, PX-63 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-62|PX-63) --for-spec --no-implementation-order`.
function buildMultiAnnotation(ticketKeys) {
  const keys = [...new Set(ticketKeys)];
  const keyList = keys.join(", ");
  const ticketKeyArg = keys.join("|");
  return (
    `// [::TICKET::] ${keyList} changes. Details: \`node .claude/scripts/tickets/show-ticket-context.js ` +
    `--ticket-key=(${ticketKeyArg}) --for-spec --no-implementation-order\`.`
  );
}

/**
 * Check if a specific line is an annotation comment and extract its ticket keys.
 *
 * Matches both single format:
 *   "// [::TICKET::] PX-63 changes. Details: ..."
 * and multi format:
 *   "// [::TICKET::] PX-61, PX-63 changes. Details: ... --ticket-key=(PX-61|PX-63)"
 *
 * Returns { ticketKeys: string[], lineIndex: number } or null.
 */
// [::TICKET::] PX-63 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-63 --for-spec --no-implementation-order`.
function detectAnnotationLine(line) {
  if (typeof line !== "string" || !line.trimStart().startsWith("//")) {
    return null;
  }
  // Multi-format: "[::TICKET::] KEY1, KEY2 changes. Details: ...--ticket-key=(KEY1|KEY2)..."
  // Extract all keys from the parenthesized --ticket-key=(...) argument.
  const multiMatch = line.match(/\[::TICKET::\]\s+.+changes\. Details:.*--ticket-key=\(([^)]+)\)/);
  if (multiMatch) {
    const keys = multiMatch[1].split("|").map((k) => k.trim()).filter(Boolean);
    return keys.length > 0 ? { ticketKeys: keys } : null;
  }
  // Single-format: "[::TICKET::] KEY changes. Details: ..."
  const singleMatch = line.match(/\[::TICKET::\]\s+(P\d+-\d+|PX-\d+)\s+changes\. Details/);
  if (singleMatch) {
    return { ticketKeys: [singleMatch[1]] };
  }
  return null;
}

/**
 * Search for an annotation comment near the definition line.
 * Checks the line immediately before defLine (1-indexed).
 * Returns { ticketKeys: string[], lineIndex: number } or null.
 */
function detectAnnotationAtLine(lines, defLine) {
  const checkIndex = defLine - 2; // line above the definition (0-indexed)
  if (checkIndex < 0 || checkIndex >= lines.length) return null;
  const result = detectAnnotationLine(lines[checkIndex]);
  if (result) {
    return { ticketKeys: result.ticketKeys, lineIndex: checkIndex + 1 };
  }
  return null;
}

/**
 * Merge a new ticket key into an existing annotation line.
 * Returns the updated line string, or null if parsing fails.
 * If the key already exists, returns the original line unchanged (idempotent).
 */
function mergeAnnotation(existingLine, ticketKey) {
  const detected = detectAnnotationLine(existingLine);
  if (!detected) return null;
  if (detected.ticketKeys.includes(ticketKey)) return existingLine; // idempotent
  const allKeys = [...detected.ticketKeys, ticketKey];
  return buildMultiAnnotation(allKeys);
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

// =============================================================================
// New functions (PX-62): git diff parsing + definition mapping
// =============================================================================

/**
 * Parse `git diff -U0` output and extract changed line numbers per file.
 *
 * @param {string} gitDiffStdout — raw stdout from `git diff -U0`
 * @returns {Map<string, Set<number> | "ALL">}
 *   Key: repository-relative file path
 *   Value: Set of 0-indexed line numbers that were changed/added, or "ALL"
 *          for new files (--- /dev/null → every line is new)
 */
// [::TICKET::] PX-62, PX-63 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-62|PX-63) --for-spec --no-implementation-order`.
function parseGitDiffUnified0(gitDiffStdout) {
  const result = new Map();
  let currentFile = null;
  let newLineNum = -1;

  if (!gitDiffStdout || gitDiffStdout.trim() === "") return result;

  for (const line of gitDiffStdout.split("\n")) {
    // File header: extract post-image path
    const fileMatch = line.match(/^diff --git a\/(.*) b\/(.*)/);
    if (fileMatch) {
      currentFile = fileMatch[2];
      result.set(currentFile, new Set());
      newLineNum = -1;
      continue;
    }

    // New file: mark as ALL lines changed
    if (line.startsWith("--- /dev/null")) {
      if (currentFile) result.set(currentFile, "ALL");
      continue;
    }

    // Skip non-content lines
    if (
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("index ") ||
      line.startsWith("Binary files") ||
      line.startsWith("similarity") ||
      line.startsWith("rename from") ||
      line.startsWith("rename to") ||
      line.startsWith("new file mode") ||
      line.startsWith("deleted file mode")
    ) continue;

    // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      newLineNum = parseInt(hunkMatch[1], 10);
      continue;
    }

    // Content lines: + = added, ' ' = context — both present in new file
    if (currentFile && (line.startsWith("+") || line.startsWith(" "))) {
      const lines = result.get(currentFile);
      if (lines !== "ALL" && newLineNum > 0) {
        lines.add(newLineNum);
      }
      newLineNum++;
      // + lines also increment (counted above for both)
    }
    // - lines (removed) and \ lines (no-newline) are skipped
  }

  return result;
}

/**
 * Map changed line numbers to their containing definition(s).
 * Deduplicates: multiple changed lines in the same definition → 1 entry.
 *
 * @param {string[]} lines — source file lines
 * @param {Set<number> | "ALL"} changedLines — which lines changed
 * @param {string} ext — file extension (e.g. ".rs") for language hint
 * @returns {Map<number, {name: string, kind: string}>}
 *   Key: definition startLine (0-indexed)
 *   Value: definition metadata
 */
// [::TICKET::] PX-62, PX-63 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-62|PX-63) --for-spec --no-implementation-order`.
function changedLinesToDefinitions(lines, changedLines, ext) {
  const definitions = new Map();

  const lineNumbers = changedLines === "ALL"
    ? Array.from({ length: lines.length }, (_, i) => i)
    : [...changedLines].sort((a, b) => a - b);

  for (const lineNum of lineNumbers) {
    if (lineNum < 0 || lineNum >= lines.length) continue;
    const def = findContainingDefinition(lines, lineNum, ext);
    if (def && !definitions.has(def.startLine)) {
      definitions.set(def.startLine, { name: def.name, kind: def.kind });
    }
  }

  return definitions;
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
/**
 * Resolve a repo-root-relative path to an absolute path.
 * git diff outputs paths relative to repo root, so path.resolve(filePath)
 * would double-prefix when cwd is a subdirectory. Instead join with repo root.
 */
function resolveGitPath(filePath, cwd) {
  const absolute = path.resolve(cwd, filePath);
  if (fs.existsSync(absolute)) return absolute;
  // Fallback: if git diff output is repo-root-relative (e.g. tools/conver/...),
  // resolve against the repo root by going up from cwd
  const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd, encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  return path.resolve(repoRoot, filePath);
}

// [::TICKET::] PX-62, PX-63, PX-146 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-62|PX-63|PX-146) --for-spec --no-implementation-order`.
/**
 * Prepend a comment line to source lines while preserving a leading shebang.
 * A shebang (`#!`) is only valid on line 1 of an executable script, so the
 * comment is inserted BELOW it; otherwise it is inserted at the top.
 * Returns a new array of lines (immutable).
 */
// [::TICKET::] PX-147 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-147 --for-spec --no-implementation-order`.
function prependCommentPreservingShebang(lines, comment) {
  if (lines.length > 0 && lines[0].startsWith("#!")) {
    return [lines[0], comment, ...lines.slice(1)];
  }
  return [comment, ...lines];
}

// [::TICKET::] PX-147 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-147 --for-spec --no-implementation-order`.
function processFile(filePath, ticketKey, opts) {
  const verbose = opts && opts.verbose;
  const cwd = opts && opts.cwd ? opts.cwd : process.cwd();
  const changedLines = opts && opts.changedLines;
  const resolved = resolveGitPath(filePath, cwd);

  let content;
  try {
    content = fs.readFileSync(resolved, "utf8");
  } catch (e) {
    if (verbose) console.error(`[annotate] Cannot read ${filePath}: ${e.message}`);
    return "skipped:unreadable";
  }

  const lines = content.split("\n");
  const ext = path.extname(filePath).toLowerCase();

  // Map changed lines to unique containing definitions
  const definitions = changedLinesToDefinitions(lines, changedLines, ext);

  if (definitions.size === 0) {
    // No definition contains any changed line — insert an AMBIGUOUS marker.
    // Idempotency guard: a marker for the same ticketKey must not stack.
    const alreadyHasMarker = lines.some(
      (l) => l.includes("[::AMBIGUOUS::]") && l.includes(ticketKey)
    );
    if (!alreadyHasMarker) {
      const ambiguousComment = `// [::AMBIGUOUS::] Could not locate containing definition for changed line(s) in ticket ${ticketKey} — AI must resolve placement.`;
      const newLines = prependCommentPreservingShebang(lines, ambiguousComment);
      fs.writeFileSync(resolved, newLines.join("\n"), "utf8");
      if (verbose) console.error(`[annotate] Inserted AMBIGUOUS marker: ${filePath}`);
      return "annotated:ambiguous";
    }
    if (verbose) console.error(`[annotate] AMBIGUOUS marker already present for ${ticketKey}: ${filePath}`);
    return "skipped:already-annotated";
  }

  // Sort definitions by startLine DESCENDING to avoid line offset issues
  // when inserting multiple annotations in the same file.
  const sortedDefs = [...definitions.entries()]
    .sort(([aLine], [bLine]) => bLine - aLine);

  const actions = [];
  let modifiedLines = lines;

  for (const [startLine] of sortedDefs) {
    // 1-indexed line number for the definition (used by detectAnnotationAtLine / insertAnnotation)
    const defLineOneIndexed = startLine + 1;

    // Check for existing annotation at the definition line
    const existingAnnot = detectAnnotationAtLine(modifiedLines, defLineOneIndexed);

    if (existingAnnot) {
      if (existingAnnot.ticketKeys.includes(ticketKey)) {
        if (verbose) console.error(`[annotate] Already annotated at line ${defLineOneIndexed}: ${filePath}`);
        actions.push(`skipped:already-annotated@${defLineOneIndexed}`);
        continue;
      }
      // Merge: add new key to existing annotation
      const mergedLine = mergeAnnotation(modifiedLines[existingAnnot.lineIndex - 1], ticketKey);
      if (mergedLine) {
        modifiedLines[existingAnnot.lineIndex - 1] = mergedLine;
        if (verbose) console.error(`[annotate] Merged key ${ticketKey} at line ${existingAnnot.lineIndex}: ${filePath}`);
        actions.push(`merged:${existingAnnot.lineIndex}`);
        continue;
      }
      // Merge failed — fall through to insert new line
    }

    // Insert new annotation before this definition
    const comment = buildAnnotation(ticketKey);
    modifiedLines = insertAnnotation(modifiedLines, defLineOneIndexed, comment);
    if (verbose) console.error(`[annotate] Inserted at line ${defLineOneIndexed}: ${filePath}`);
    actions.push(`annotated:${defLineOneIndexed}`);
  }

  fs.writeFileSync(resolved, modifiedLines.join("\n"), "utf8");
  return actions.join(";");
}

/**
 * Main orchestrator: get changed file names + line numbers via git diff -U0,
 * filter by extension, annotate each file at its changed definitions.
 * Returns a summary object.
 */
// [::TICKET::] PX-62, PX-63, PX-114 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-62|PX-63|PX-114) --for-spec --no-implementation-order`.
function annotateSourceFiles(cwd, ticketKey, opts) {
  const verbose = opts && opts.verbose;

  // 1. Get changed files with line numbers via git diff -U0
  let perFileChangedLines;
  try {
    const stdout = execFileSync("git", [
      "diff", "-U0", "--diff-filter=AM",
    ], { cwd, encoding: "utf8", timeout: 10000, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
    perFileChangedLines = parseGitDiffUnified0(stdout);
  } catch (e) {
    // Not a git repo or git error
    if (verbose) console.error(`[annotate] git diff failed: ${e.message}`);
    return { total: 0, annotated: [], skipped: [], errors: [] };
  }

  // 2. Also include untracked files (all lines = changed)
  try {
    const untrackedOut = execFileSync("git", [
      "ls-files", "--others", "--exclude-standard",
    ], { cwd, encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });
    const untrackedFiles = untrackedOut.split("\n").filter((f) => f.trim().length > 0);
    for (const file of untrackedFiles) {
      perFileChangedLines.set(file, "ALL");
    }
  } catch (_) { /* ignore */ }

  // 3. Filter by extension
  const sourceFiles = [...perFileChangedLines.keys()]
    .filter((fp) => {
      const ext = path.extname(fp).toLowerCase();
      return SOURCE_EXTENSIONS.has(ext);
    });

  if (sourceFiles.length === 0) {
    if (verbose) console.error("[annotate] No source files to annotate");
    return { total: 0, annotated: [], skipped: [], errors: [] };
  }

  // 4. Process each file with its changed line numbers
  const annotated = [];
  const merged = [];
  const skipped = [];
  const errors = [];

  for (const file of sourceFiles) {
    try {
      const changedLines = perFileChangedLines.get(file);
      const processOpts = { ...(opts || {}), cwd, changedLines };
      const action = processFile(file, ticketKey, processOpts);
      if (action.startsWith("annotated") || action.includes(";annotated:")) {
        annotated.push(file);
      } else if (action.startsWith("merged") || action.includes(";merged:")) {
        merged.push(file);
      } else {
        skipped.push(file);
      }
    } catch (e) {
      errors.push({ file, error: e.message });
      if (verbose) console.error(`[annotate] Error processing ${file}: ${e.message}`);
    }
  }

  return { total: sourceFiles.length, annotated, merged, skipped, errors };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * Verify that all changed source files have a ticket-key annotation at each
 * changed definition. Returns a verification report object.
 */
// [::TICKET::] PX-62, PX-63, PX-114 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-62|PX-63|PX-114) --for-spec --no-implementation-order`.
function verifyAnnotations(cwd, ticketKey, opts) {
  const verbose = opts && opts.verbose;

  // 1. Get changed files with line numbers via git diff -U0 (reuse same logic)
  let perFileChangedLines;
  try {
    const stdout = execFileSync("git", [
      "diff", "-U0", "--diff-filter=AM",
    ], { cwd, encoding: "utf8", timeout: 10000, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
    perFileChangedLines = parseGitDiffUnified0(stdout);
  } catch (e) {
    if (verbose) console.error(`[annotate-verify] git diff failed: ${e.message}`);
    return { total: 0, missing: [], ambiguous: [], errors: [] };
  }

  // 2. Also include untracked files
  try {
    const untrackedOut = execFileSync("git", [
      "ls-files", "--others", "--exclude-standard",
    ], { cwd, encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });
    const untrackedFiles = untrackedOut.split("\n").filter((f) => f.trim().length > 0);
    for (const file of untrackedFiles) {
      perFileChangedLines.set(file, "ALL");
    }
  } catch (_) { /* ignore */ }

  // 3. Filter by extension
  const sourceFiles = [...perFileChangedLines.keys()]
    .filter((fp) => {
      const ext = path.extname(fp).toLowerCase();
      return SOURCE_EXTENSIONS.has(ext);
    });

  if (sourceFiles.length === 0) {
    if (verbose) console.error("[annotate-verify] No source files to verify");
    return { total: 0, missing: [], ambiguous: [], errors: [] };
  }

  // 4. Verify each file: check that every changed definition has an annotation
  const missing = [];
  const ambiguous = [];
  const errors = [];

  for (const file of sourceFiles) {
    try {
      const resolved = resolveGitPath(file, cwd);
      const content = fs.readFileSync(resolved, "utf8");
      const lines = content.split("\n");
      const changedLines = perFileChangedLines.get(file);
      const ext = path.extname(file).toLowerCase();

      // Get definitions that should have annotations
      const expectedDefs = changedLinesToDefinitions(lines, changedLines, ext);

      if (expectedDefs.size === 0) {
        // No definitions expected — check for AMBIGUOUS marker
        const hasAmbiguous = lines.some((l) => l.includes("[::AMBIGUOUS::]"));
        if (hasAmbiguous) {
          ambiguous.push(file);
        }
        continue;
      }

      // Check each expected definition has an annotation
      for (const [startLine] of expectedDefs) {
        const annot = detectAnnotationAtLine(lines, startLine + 1);
        if (!annot || !annot.ticketKeys.includes(ticketKey)) {
          missing.push({ file, startLine });
        }
      }
    } catch (e) {
      errors.push({ file, error: e.message });
    }
  }

  return { total: sourceFiles.length, missing, ambiguous, errors };
}

/**
 * Check for [::AMBIGUOUS::] markers in changed source files.
 * Exits 0 if none found, 1 if any found (with list on stderr).
 */
function checkAmbiguousMarkers(cwd, ticketKey, opts) {
  const verbose = opts && opts.verbose;

  // Reuse verify logic — extract ambiguous field
  const report = verifyAnnotations(cwd, ticketKey, opts);

  if (verbose) {
    console.error(
      `[check-ambiguous] ${report.total} source file(s), ` +
      `${report.ambiguous.length} ambiguous, ` +
      `${report.errors.length} error(s)`,
    );
  }

  if (report.ambiguous.length > 0) {
    console.error("[check-ambiguous] AMBIGUOUS markers still present — must resolve:");
    report.ambiguous.forEach((f) => console.error(`  ${f}`));
    process.exit(EXIT_FAILURE); // 1 = unresolved
  }

  if (report.errors.length > 0) {
    console.error("[check-ambiguous] Errors during check:");
    report.errors.forEach((e) => console.error(`  ${e.file}: ${e.error}`));
    process.exit(EXIT_FAILURE);
  }

  if (verbose) console.error("[check-ambiguous] No AMBIGUOUS markers found.");
  process.exit(EXIT_SUCCESS); // 0 = clean
}

function parseArgs() {
  const args = process.argv.slice(2);
  let ticketKey = "";
  let verbose = false;
  let verifyMode = false;
  let checkAmbiguousMode = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ticket-key" && i + 1 < args.length) {
      ticketKey = args[++i];
    } else if (args[i].startsWith("--ticket-key=")) {
      ticketKey = args[i].split("=")[1];
    } else if (args[i] === "--verbose") {
      verbose = true;
    } else if (args[i] === "--verify") {
      verifyMode = true;
    } else if (args[i] === "--check-ambiguous") {
      checkAmbiguousMode = true;
    }
  }

  return { ticketKey, verbose, verifyMode, checkAmbiguousMode };
}

function main() {
  const opts = parseArgs();

  if (!opts.ticketKey) {
    console.error("Usage: annotate-ticket-context-by-git-diff.js --ticket-key=<P{id}-{id}|PX-{id}> [--verbose] [--verify] [--check-ambiguous]");
    process.exit(EXIT_FAILURE);
  }

  const cwd = process.cwd();

  if (opts.checkAmbiguousMode) {
    checkAmbiguousMarkers(cwd, opts.ticketKey, opts);
    return; // exits inside
  }

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

/**
 * Find the first source-code definition (function, class, struct, interface, etc.)
 * in an array of lines and return its 1-indexed line number, or null if none found.
 * Pure function — no side effects.
 *
 * @param {string[]} lines
 * @returns {number|null} — 1-indexed line number or null
 */
// [::TICKET::] PX-147 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-147 --for-spec --no-implementation-order`.
function detectFirstDefinition(lines) {
  if (!Array.isArray(lines)) return null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || typeof line !== "string") continue;
    const trimmed = line.trimStart();
    // Rust: fn, struct, enum, trait, impl, macro_rules!, pub (fn|struct|enum|trait|impl)
    if (/^(pub\s+)?(fn|struct|enum|trait|impl|unsafe\s+(fn|trait|impl)|macro_rules!)\b/.test(trimmed)) return i + 1;
    if (/^(pub\s+)?(fn|struct|enum|trait|impl)\b/.test(trimmed)) return i + 1;
    // Go: func, type
    if (/^(func|type)\s+\w+/.test(trimmed)) return i + 1;
    // JS/TS: function, class, export (function|class|interface|type|const|default)
    if (/^(export\s+)?(function|class|interface|type|const|let|var|async\s+function)\b/.test(trimmed)) return i + 1;
    if (/^export\s+default\s+(function|class|{)/.test(trimmed)) return i + 1;
    if (/^export\s+default\s/.test(trimmed)) return i + 1;
    // Python: def, class
    if (/^(def|class)\s+\w+/.test(trimmed)) return i + 1;
  }
  return null;
}

/**
 * Check whether any line in the given array carries an annotation for the
 * specified ticket key. Uses detectAnnotationLine for single-line check.
 * Pure function — no side effects.
 *
 * @param {string[]} lines
 * @param {string} ticketKey — e.g. "PX-59"
 * @returns {boolean}
 */
function hasExistingAnnotation(lines, ticketKey) {
  if (!Array.isArray(lines) || !ticketKey) return false;
  for (const line of lines) {
    const detected = detectAnnotationLine(line);
    if (detected && detected.ticketKeys.includes(ticketKey)) return true;
  }
  return false;
}


if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildAnnotation,
    buildMultiAnnotation,
    detectAnnotationLine,
    detectAnnotationAtLine,
    mergeAnnotation,
    insertAnnotation,
    filterSourceFiles,
    annotateSourceFiles,
    verifyAnnotations,
    checkAmbiguousMarkers,
    processFile,
    prependCommentPreservingShebang,
    parseArgs,
    main,
    // New PX-62 functions
    parseGitDiffUnified0,
    changedLinesToDefinitions,
    // PX-114: missing export wrappers for pre-existing test coverage
    detectFirstDefinition,
    hasExistingAnnotation,
  };
}

// Run if called directly
if (require.main === module) {
  main();
}
