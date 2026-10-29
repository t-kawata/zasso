#!/usr/bin/env node
/**
 * extract-io-boundary.js <rfc-file>
 *
 * Extracts the "graphify-rfc + boundify-graph reference info — I/O boundary clues from the RFC design document"
 * section from the RFC file and outputs it to stdout.
 *
 * If no section is found, outputs nothing and exits 0 (not an error, just no info).
 */
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
import fs from "node:fs";
import path from "node:path";
// [::TICKET::] PX-231 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-231 --for-spec --no-implementation-order`.
import { toHomeRelative } from '../lib/path-utils.js';
import packageArtifacts from '../lib/package-artifacts.js';

let resolvedPath;
if (process.argv[2]) {
  resolvedPath = path.resolve(process.argv[2]);
} else {
  resolvedPath = packageArtifacts.resolveSourcePath({ cwd: process.cwd() });
  packageArtifacts.reportResolvedPath('source', resolvedPath);
}
if (!fs.existsSync(resolvedPath)) {
  console.error(`Error: RFC file not found: ${toHomeRelative(resolvedPath)}`);
  process.exit(1);
}

const content = fs.readFileSync(resolvedPath, "utf-8");
const lines = content.split("\n");

// Detect the I/O boundary section title
// Format: ## <N>. graphify-rfc + boundify-graph reference info ...
const SECTION_PATTERN = /^## \d+\.\s+graphify-rfc \+ boundify-graph のための参考情報/;

let sectionStartIndex = -1;
for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
  if (SECTION_PATTERN.test(lines[lineIndex])) {
    sectionStartIndex = lineIndex;
    break;
  }
}

if (sectionStartIndex === -1) {
  // No I/O boundary section found
  process.exit(0);
}

// Extract content up to the next ## level heading
let sectionEndIndex = lines.length;
for (let lineIndex = sectionStartIndex + 1; lineIndex < lines.length; lineIndex++) {
  if (/^## \d/.test(lines[lineIndex])) {
    sectionEndIndex = lineIndex;
    break;
  }
}

const sectionLines = lines.slice(sectionStartIndex, sectionEndIndex);
console.log(sectionLines.join("\n"));

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
