#!/usr/bin/env node

/**
 * parse-language-surface.js — advisory TypeScript, Python and Go surfaces.
 *
 * The language usage matrix needs evidence that a binding or export exists.
 * These scans are intentionally small and report only declarations they can
 * name; they are evidence for AI judgment, not a compiler.
 */

const fs = require('fs');
const path = require('path');

const SKIP_DIRECTORIES = new Set(['node_modules', 'target', 'dist', '.git', '__pycache__']);

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function walk(directory, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function parseTypescriptFile(file) {
  const items = [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const match = line.match(/^\s*export\s+(?:async\s+)?(?:function|class|interface|type|const|let|enum)\s+([A-Za-z_]\w*)/);
    if (match) items.push({ kind: 'export', name: match[1], file, line: index + 1 });
  });
  return items;
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function parsePythonFile(file) {
  const items = [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const match = line.match(/^\s*(?:def|class)\s+([A-Za-z_]\w*)/);
    if (match) items.push({ kind: 'definition', name: match[1], file, line: index + 1 });
    const all = line.match(/__all__\s*=\s*\[([^\]]*)\]/);
    if (all) {
      for (const name of all[1].match(/["']([A-Za-z_]\w*)["']/g) || []) {
        items.push({ kind: 'export', name: name.replace(/["']/g, ''), file, line: index + 1 });
      }
    }
  });
  return items;
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function parseGoFile(file) {
  const items = [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const match = line.match(/^\s*(?:func|type)\s+([A-Z]\w*)/);
    if (match) items.push({ kind: 'export', name: match[1], file, line: index + 1 });
  });
  return items;
}

/**
 * Parse all supported language surfaces under a root.
 *
 * @param {{root: string}} input
 * @returns {{typescript: Array<object>, python: Array<object>, go: Array<object>}}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function parseLanguageSurface({ root } = {}) {
  const files = walk(root);
  const result = { typescript: [], python: [], go: [] };
  for (const file of files) {
    if (file.endsWith('.ts') || file.endsWith('.tsx')) result.typescript.push(...parseTypescriptFile(file));
    else if (file.endsWith('.py')) result.python.push(...parsePythonFile(file));
    else if (file.endsWith('.go')) result.go.push(...parseGoFile(file));
  }
  return result;
}

if (require.main === module) {
  const root = process.argv[2] || process.cwd();
  process.stdout.write(`${JSON.stringify(parseLanguageSurface({ root }), null, 2)}\n`);
}

module.exports = {
  parseLanguageSurface,
  parseTypescriptFile,
  parsePythonFile,
  parseGoFile,
};
