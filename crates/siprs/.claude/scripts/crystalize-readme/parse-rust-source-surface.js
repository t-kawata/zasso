#!/usr/bin/env node

/**
 * parse-rust-source-surface.js — advisory implemented Rust surface.
 *
 * This is not a type-resolved compiler view. It reads public declarations a
 * reader can find in source and reports constructs it cannot classify instead of
 * skipping them. The AI judges the result; the command never treats it as a
 * complete proof.
 */

const fs = require('fs');
const path = require('path');

const SKIP_DIRECTORIES = new Set(['node_modules', 'target', 'dist', '.git']);
const DECLARATION = /^\s*pub(?:\([^)]*\))?\s+(?:(?:async|const|unsafe)\s+)*(?:extern\s+"[^"]*"\s+)?(fn|struct|enum|trait|type|const|static|mod)\s+([A-Za-z_]\w*)/;
const UNPARSED = /^\s*macro_rules!\s+([A-Za-z_]\w*)/;

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function walkRustFiles(directory, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkRustFiles(fullPath, files);
    else if (entry.isFile() && entry.name.endsWith('.rs')) files.push(fullPath);
  }
  return files;
}

/**
 * Parse public Rust declarations under a package root.
 *
 * @param {{root: string, files?: string[]}} input
 * @returns {{items: Array<object>, unparsed: Array<object>}}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function parseRustSourceSurface({ root, files = null } = {}) {
  const sourceFiles = files || walkRustFiles(root);
  const items = [];
  const unparsed = [];

  for (const file of sourceFiles) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      const declaration = line.match(DECLARATION);
      if (declaration) {
        items.push({
          kind: declaration[1],
          name: declaration[2],
          file,
          line: index + 1,
        });
        return;
      }
      const macro = line.match(UNPARSED);
      if (macro) {
        unparsed.push({ kind: 'macro_rules', name: macro[1], file, line: index + 1 });
      }
    });
  }

  return { items, unparsed };
}

if (require.main === module) {
  const root = process.argv[2] || process.cwd();
  process.stdout.write(`${JSON.stringify(parseRustSourceSurface({ root }), null, 2)}\n`);
}

module.exports = {
  parseRustSourceSurface,
  walkRustFiles,
};
