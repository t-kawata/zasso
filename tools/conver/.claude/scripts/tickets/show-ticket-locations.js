#!/usr/bin/env node

/**
 * show-ticket-locations.js
 *
 * Shows all [::TICKET::] annotation locations for a given ticket key.
 * Read-only — never mutates any file.
 *
 * CLI:
 *   node show-ticket-locations.js --ticket-key=PX-63 [--show-lines=3]
 *
 * Exit codes:
 *   0 — Success
 *   1 — Error
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const { detectAnnotationLine } = require("./annotate-ticket-context-by-git-diff");
const { SOURCE_EXTENSIONS } = require("./lib/scope-detection-constants");

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

// =============================================================================
// Core logic
// =============================================================================

/**
 * Map language from file extension for Markdown code block.
 */
function getLanguageTag(ext) {
  const map = {
    ".rs": "rust", ".go": "go", ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript", ".vue": "vue",
    ".py": "python", ".rb": "ruby", ".swift": "swift",
    ".kt": "kotlin", ".java": "java", ".cs": "csharp",
  };
  return map[ext] || "";
}

/**
 * Read lines below the annotation for context display.
 */
function readContextLines(filePath, annotationLine, showLines) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    const startIdx = annotationLine; // convert to 0-indexed
    const endIdx = Math.min(startIdx + showLines, lines.length);
    return lines.slice(startIdx, endIdx);
  } catch (_) {
    return [`[unreadable: ${filePath}]`];
  }
}

/**
 * Format a single match as Markdown.
 */
function formatMatch(match, showLines) {
  const lines = [];
  lines.push(`- Line ${match.line}`);
  const lang = getLanguageTag(match.ext);
  lines.push("```" + lang);
  const contextLines = readContextLines(match.filePath, match.line, showLines);
  for (const cl of contextLines) {
    lines.push(cl);
  }
  lines.push("```");
  return lines.join("\n");
}

// =============================================================================
// Main
// =============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { ticketKey: null, showLines: 3 };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ticket-key" && i + 1 < args.length) opts.ticketKey = args[++i];
    else if (args[i].startsWith("--ticket-key=")) opts.ticketKey = args[i].split("=")[1];
    else if (args[i] === "--show-lines" && i + 1 < args.length) opts.showLines = parseInt(args[++i], 10);
    else if (args[i].startsWith("--show-lines=")) opts.showLines = parseInt(args[i].split("=")[1], 10);
  }

  return opts;
}

function main() {
  const opts = parseArgs();

  if (!opts.ticketKey) {
    console.error("Usage: node show-ticket-locations.js --ticket-key=<key> [--show-lines=<N>]");
    process.exit(EXIT_FAILURE);
  }

  // 1. Find all TICKET lines in tracked source files via git grep
  let grepOutput;
  try {
    grepOutput = execFileSync("git", [
      "grep", "--cached", "-n", "--", "\\[::TICKET::\\]",
    ], { encoding: "utf8", timeout: 15000, maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    // git grep exits 1 when no matches found
    if (e.status === 1) {
      console.log(`## ${opts.ticketKey} — 0 locations, not implemented\n\nNot found`);
      process.exit(EXIT_SUCCESS);
    }
    console.error(`[show-ticket-locations] git grep failed: ${e.message}`);
    process.exit(EXIT_FAILURE);
  }

  // 2. Parse grep output: "file:line:content"
  const rawLines = grepOutput.trim().split("\n").filter(Boolean);
  const matches = [];

  for (const rawLine of rawLines) {
    // Split "file:line:content" — line may contain colons, so limit split
    const colonIdx = rawLine.indexOf(":");
    if (colonIdx === -1) continue;
    const filePath = rawLine.slice(0, colonIdx);
    const rest = rawLine.slice(colonIdx + 1);
    const secondColonIdx = rest.indexOf(":");
    if (secondColonIdx === -1) continue;
    const lineNum = parseInt(rest.slice(0, secondColonIdx), 10);
    const annotationLine = rest.slice(secondColonIdx + 1);

    // 3. Filter by source extension
    const ext = path.extname(filePath).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(ext)) continue;

    // 4. Parse the annotation and check if the target ticket key is present
    const parsed = detectAnnotationLine(annotationLine);
    if (!parsed) continue;

    const hasKey = parsed.ticketKeys.some((k) => {
      // Support PX-63 matching and (PX-61|PX-63) parenthesized format
      const normalizedKey = k.trim();
      return normalizedKey === opts.ticketKey;
    });

    if (!hasKey) continue;

    matches.push({
      filePath,
      filePathRelative: filePath,
      line: lineNum,
      annotationLine: annotationLine.trim(),
      ext,
      ticketKeys: parsed.ticketKeys,
    });
  }

  // 5. Output
  if (matches.length === 0) {
    console.log(`## ${opts.ticketKey} — 0 locations, not implemented\n\nNot found`);
    process.exit(EXIT_SUCCESS);
  }

  console.log(`## ${opts.ticketKey} — implemented at ${matches.length} locations\n`);

  // Group by file path
  const byFile = new Map();
  for (const match of matches) {
    const list = byFile.get(match.filePathRelative) || [];
    list.push(match);
    byFile.set(match.filePathRelative, list);
  }

  for (const [file, fileMatches] of byFile) {
    console.log(`### ${file}\n`);
    for (const match of fileMatches) {
      const output = formatMatch(match, opts.showLines);
      console.log(output);
      console.log("");
    }
  }

  process.exit(EXIT_SUCCESS);
}

if (require.main === module) {
  main();
}

module.exports = { formatMatch, readContextLines, getLanguageTag };
