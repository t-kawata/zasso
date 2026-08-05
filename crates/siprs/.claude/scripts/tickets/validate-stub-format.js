#!/usr/bin/env node

/**
 * validate-stub-format.js — STUB marker format validation
 *
 * Exports validateStubFormat(content) which checks whether a string matches
 * the required [::STUB::] marker format:
 *
 *   // [::STUB::] P{phase}-{id}|MUST RESOLVE: <non-empty description>
 *
 * Returns {valid: boolean, errors: string[]}.
 *
 * [::TICKET::] PX-77: Core Validation Scripts — validate-stub-format (C001)
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const STUB_REGEX = /^\/\/\s*\[::STUB::\]\s+(P[A-Z0-9]+-\d+|MUST\s+RESOLVE):\s*\S.*$/;

// Directory tree scan root (the Tickets.json root when run from the gate).
const SCAN_ARG = "--scan";

/**
 * Validate a STUB marker string against the required format.
 *
 * @param {string|null|undefined} content — The string to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function validateStubFormat(content) {
  const errors = [];

  // Precondition: non-empty input
  if (content === null || content === undefined || typeof content !== 'string') {
    errors.push('Input must be a non-empty string');
    errors.push('Got: ' + JSON.stringify(content));
    errors.push('Provide a string value to validate');
    return { valid: false, errors };
  }

  if (content.trim().length === 0) {
    errors.push('Input string is empty or whitespace-only');
    errors.push('Got: empty string');
    errors.push('Provide a non-empty string containing a STUB marker');
    return { valid: false, errors };
  }

  // Split into lines — STUB marker must be entirely on the first line
  const lines = content.split('\n');
  const firstLine = lines[0];

  // If after the first line there is additional non-whitespace content,
  // the marker is multi-line and must be rejected
  const trailingLines = lines.slice(1).filter(function (l) { return l.trim().length > 0; });

  // Check the first line with the STUB regex
  const trimmed = firstLine.trim();
  if (!STUB_REGEX.test(trimmed)) {
    // Provide specific error message based on what went wrong
    if (!trimmed.startsWith('//')) {
      errors.push('STUB marker must start with //');
    } else if (!trimmed.includes('[::STUB::]')) {
      errors.push('Missing [::STUB::] marker tag');
    } else if (!trimmed.includes(':')) {
      errors.push('Missing colon after ticket ID');
    } else {
      const afterTag = trimmed.split('[::STUB::]')[1] || '';
      if (!afterTag.trim()) {
        errors.push('Missing ticket ID after [::STUB::]');
      } else {
        const idPart = afterTag.split(':')[0].trim();
        if (!idPart) {
          errors.push('Missing ticket ID (colon immediately after [::STUB::])');
        } else if (!/^P[A-Z0-9]+-\d+$/.test(idPart) && idPart !== 'MUST RESOLVE') {
          errors.push('Invalid ticket ID format: "' + idPart + '" — expected P{phase}-{id} or MUST RESOLVE');
        } else {
          const descPart = afterTag.split(':')[1];
          if (!descPart || descPart.trim().length === 0) {
            errors.push('Missing description after ticket ID and colon');
          } else {
            errors.push('STUB marker format is invalid: ' + trimmed.substring(0, 50));
          }
        }
      }
    }
    errors.push('Expected format: // [::STUB::] P{phase}-{id}|MUST RESOLVE: <description>');
    errors.push('Fix the marker to match the expected format');
    return { valid: false, errors };
  }

  // Multi-line rejection: STUB marker must be a single-line construct
  if (trailingLines.length > 0) {
    errors.push('STUB marker spans multiple lines');
    errors.push('First line: "' + firstLine.trim() + '", trailing lines: ' + trailingLines.length);
    errors.push('Move the entire STUB marker and description to a single line');
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Validate every STUB marker under a directory against the format rule.
 * Reuses review/find-all-stubs.js for the scan so the quoted-string and
 * fixture-directory heuristics stay single-sourced. Exits 0 iff all valid.
 * @param {string} dir — Directory to scan
 * @returns {{total: number, pass: number, fail: number, failures: Array}}
 */
// [::TICKET::] PX-134, PX-135 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-134|PX-135) --for-spec --no-implementation-order`.
function scanValidate(dir) {
  const scanner = path.resolve(__dirname, "review/find-all-stubs.js");
  const stdout = execFileSync("node", [scanner, path.resolve(dir)], { encoding: "utf8" });
  const stubs = JSON.parse(stdout).stubs || [];

  const failures = [];
  let pass = 0;
  for (const stub of stubs) {
    const result = validateStubFormat(stub.content);
    if (result.valid) pass++;
    else failures.push({ file: stub.file, line: stub.line, errors: result.errors });
  }

  console.log(JSON.stringify({ total: stubs.length, pass, fail: failures.length }));
  for (const failure of failures) {
    for (const error of failure.errors) {
      console.error("[validate-stub-format] FAIL " + failure.file + ":" + failure.line + " -- " + error);
    }
  }
  return { total: stubs.length, pass, fail: failures.length, failures };
}

/**
 * Dispatch the CLI: --scan <dir> runs a tree-wide format gate; otherwise the
 * original single-string mode validates one marker line.
 */
// [::TICKET::] PX-134, PX-135 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-134|PX-135) --for-spec --no-implementation-order`.
function main() {
  const scanIndex = process.argv.indexOf(SCAN_ARG);
  if (scanIndex !== -1) {
    const dir = process.argv[scanIndex + 1];
    if (!dir) {
      console.error("[ERROR] --scan requires a directory argument");
      console.error("Action: Run: node .claude/scripts/tickets/validate-stub-format.js --scan <directory>");
      process.exit(1);
    }
    const result = scanValidate(path.resolve(dir));
    process.exit(result.fail > 0 ? 1 : 0);
    return;
  }

  const input = process.argv[2];
  if (!input) {
    console.error('[ERROR] Missing input string');
    console.error('Cause: No argument provided');
    console.error('Action: Run: node .claude/scripts/tickets/validate-stub-format.js "<stub-marker-string>"');
    process.exit(1);
  }

  const result = validateStubFormat(input);
  console.log(JSON.stringify(result));
  process.exit(result.valid ? 0 : 1);
}

if (require.main === module) main();
module.exports = { validateStubFormat, scanValidate };
