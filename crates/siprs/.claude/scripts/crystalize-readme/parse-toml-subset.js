#!/usr/bin/env node

/**
 * parse-toml-subset.js — the workspace-map subset crystalize needs.
 *
 * The full TOML grammar is not required. The map uses tables, [[unit]] arrays,
 * strings, arrays, numbers and booleans. Keeping the reader local means
 * /crystalize-readme works in a project that does not install a law skill.
 */

/**
 * Report syntax the local subset deliberately does not implement.
 *
 * Silently misparsing a multi-line array as a partial value is worse than
 * refusing: the workspace map would decide package ownership from a fragment.
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
class UnsupportedTomlSyntaxError extends Error {
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
  constructor(lineNumber) {
    super(`UNSUPPORTED_TOML_SYNTAX at line ${lineNumber}: multi-line arrays and triple-quoted strings are not supported`);
    this.code = 'UNSUPPORTED_TOML_SYNTAX';
    this.lineNumber = lineNumber;
  }
}

/**
 * Count unclosed array brackets outside quoted strings.
 *
 * @param {string} text
 * @returns {number}
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function unclosedArrayDepth(text) {
  let depth = 0;
  let inString = false;
  for (const character of String(text)) {
    if (character === '"') inString = !inString;
    if (inString) continue;
    if (character === '[') depth += 1;
    if (character === ']') depth -= 1;
  }
  return depth;
}

/** Strip a comment that is not inside a quoted string. */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function stripComment(line) {
  let inString = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') inString = !inString;
    if (character === '#' && !inString) return line.slice(0, index);
  }
  return line;
}

/** Split a top-level comma list outside strings and brackets. */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') inString = !inString;
    if (!inString) {
      if (character === '[') depth += 1;
      if (character === ']') depth -= 1;
      if (character === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
    }
    current += character;
  }
  if (current.trim() !== '') parts.push(current.trim());
  return parts;
}

/** Parse one TOML value into a JS value. */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function parseValue(text) {
  const value = text.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    return splitTopLevel(value.slice(1, -1)).map((entry) => parseValue(entry));
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  const number = Number(value);
  return Number.isNaN(number) ? value : number;
}

/**
 * Parse the workspace-map subset.
 *
 * @param {string} text — TOML source
 * @returns {Object} Parsed document
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function parseTomlSubset(text) {
  const root = {};
  let current = root;

  const lines = String(text).split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = stripComment(rawLine).trim();
    if (line === '') continue;
    if (line.includes('"""') || line.includes("'''")) {
      throw new UnsupportedTomlSyntaxError(lineIndex + 1);
    }

    if (line.startsWith('[[') && line.endsWith(']]')) {
      const name = line.slice(2, -2).trim();
      root[name] = root[name] || [];
      current = {};
      root[name].push(current);
      continue;
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      const name = line.slice(1, -1).trim();
      root[name] = root[name] || {};
      current = root[name];
      continue;
    }

    const equals = line.indexOf('=');
    if (equals === -1) continue;
    const key = line.slice(0, equals).trim();
    const valueText = line.slice(equals + 1).trim();
    if (valueText.startsWith('[') && unclosedArrayDepth(valueText) !== 0) {
      throw new UnsupportedTomlSyntaxError(lineIndex + 1);
    }
    current[key] = parseValue(valueText);
  }

  return root;
}

if (require.main === module) {
  const fs = require('fs');
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: parse-toml-subset.js <file>');
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify(parseTomlSubset(fs.readFileSync(file, 'utf8')))}\n`);
}

module.exports = {
  UnsupportedTomlSyntaxError,
  parseTomlSubset,
  parseValue,
};
