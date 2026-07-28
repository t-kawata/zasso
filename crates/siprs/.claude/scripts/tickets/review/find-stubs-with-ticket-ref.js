#!/usr/bin/env node

/**
 * find-stubs-with-ticket-ref.js — Run find-all-stubs and filter for
 * those whose [::STUB::] marker references a ticket key (P{phase}-{id}).
 *
 * Replaces the inline node -e pipe chain previously hardcoded in start-ticket.md.
 *
 * Usage: node find-stubs-with-ticket-ref.js [--dir=<path>]
 *
 *   --dir=<path>  Directory to scan (default: .)
 *
 * Output: JSON on stdout.
 *   {
 *     ok: true,
 *     total: N,
 *     stubs: [{ file, line, ticketRef, content }, ...]
 *   }
 *
 * Exit 0. Stderr silent on success.
 */

const fs = require('fs');
const path = require('path');

const STUB_REF_RE = /\[::STUB::\]\s+(P[A-Z0-9]+-\d+)/;

function parseArgs() {
  const args = process.argv.slice(2);
  let dirPath = '.';
  for (const a of args) {
    if (a.startsWith('--dir=')) dirPath = a.slice('--dir='.length);
  }
  return path.resolve(dirPath);
}

function scanRawStubs(dirPath) {
  const { scanDirectory } = require('./find-all-stubs');
  const stubs = [];
  scanDirectory(dirPath, stubs);
  return stubs;
}

function filterStubsByTicketRef(rawStubs) {
  const matched = [];
  for (const stub of rawStubs) {
    const m = stub.content.match(STUB_REF_RE);
    if (m) {
      matched.push({
        file: stub.file,
        line: stub.line,
        ticketRef: m[1],
        content: stub.content.substring(0, 120),
      });
    }
  }
  return matched;
}

function findAllStubs(dirPath) {
  const raw = scanRawStubs(dirPath);
  return filterStubsByTicketRef(raw);
}

function main() {
  const dirPath = parseArgs();

  if (!fs.existsSync(dirPath)) {
    console.log(JSON.stringify({ ok: false, error: 'Directory not found: ' + dirPath }));
    process.exit(1);
  }

  const matched = findAllStubs(dirPath);

  const result = {
    ok: true,
    total: matched.length,
    stubs: matched,
  };

  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main();
module.exports = { findAllStubs, filterStubsByTicketRef, scanRawStubs };
