#!/usr/bin/env node

/**
 * format-json.js — Pretty-print a single JSON value from stdin to stdout
 *
 * Reads one JSON value from stdin and writes it back with 2-space
 * indentation. When stdin is not valid JSON, the raw input passes through
 * untouched so a formatting failure never swallows a caller's output.
 *
 * Usage:
 *   producer | node format-json.js
 *   node format-json.js < payload.json
 */

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  try {
    const parsed = JSON.parse(input);
    process.stdout.write(JSON.stringify(parsed, null, 2) + '\n');
  } catch (_) {
    // Non-JSON input (or an empty stream) is emitted verbatim.
    process.stdout.write(input);
  }
});
