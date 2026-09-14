#!/usr/bin/env node
/**
 * check-io-stubs.js <rfc-file>
 *
 * Checks whether [::IO-INFO-STUB::] markers remain in the RFC file.
 * 0 markers → exit 0 (clean)
 * 1+ markers → exit 1 (content not filled in)
 */
// [::TICKET::] PX-157 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-157 --for-spec --no-implementation-order`.
// [::TICKET::] PX-158 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-158 --for-spec --no-implementation-order`.
// [::TICKET::] PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-159 --for-spec --no-implementation-order`.
// [::TICKET::] PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-159 --for-spec --no-implementation-order`.
// [::TICKET::] PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-159 --for-spec --no-implementation-order`.
// [::TICKET::] PX-158 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-158 --for-spec --no-implementation-order`.
import fs from "node:fs";
import path from "node:path";

const RFC_PATH = process.argv[2];
if (!RFC_PATH) {
  console.error("Usage: check-io-stubs.js <rfc-file>");
  process.exit(1);
}

const resolvedPath = path.resolve(RFC_PATH);
if (!fs.existsSync(resolvedPath)) {
  console.error(`Error: RFC file not found: ${resolvedPath}`);
  process.exit(1);
}

const content = fs.readFileSync(resolvedPath, "utf-8");
const lines = content.split("\n");

const stubPattern = /\[::IO-INFO-STUB::\]/;
const foundLines = [];

for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
  const match = lines[lineIndex].match(stubPattern);
  if (match) {
    foundLines.push({ line: lineIndex + 1, text: lines[lineIndex].trim() });
  }
}

if (foundLines.length === 0) {
  process.stdout.write(JSON.stringify({ ok: true, count: 0 }) + '\n');
  process.exit(0);
} else {
  console.error(JSON.stringify({
    ok: false,
    count: foundLines.length,
    stubs: foundLines,
    message: `Found ${foundLines.length} remaining [::IO-INFO-STUB::] marker(s). AI must replace them with actual content before completion declaration.`,
  }, null, 2));
  process.exit(1);
}
