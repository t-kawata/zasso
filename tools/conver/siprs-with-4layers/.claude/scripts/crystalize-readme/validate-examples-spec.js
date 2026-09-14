#!/usr/bin/env node

/**
 * validate-examples-spec.js — Validate an examples spec's reference integrity (Step 2)
 *
 * CLI: validate-examples-spec.js --spec=<path> --examples-dir=<path>
 *
 * The spec is a JSON object with a "samples" array; every sample.file must
 * resolve to an existing file under examplesDir.
 */

const fs = require('fs');
const path = require('path');

/** CLI argument prefix specifying the spec file path */
const SPEC_ARG_PREFIX = '--spec=';

/** CLI argument prefix specifying the examples directory */
const EXAMPLES_DIR_ARG_PREFIX = '--examples-dir=';

/**
 * Parse command line arguments.
 *
 * @param {string[]} [args] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ specPath: string, examplesDir: string }}
 * @throws {Error} If the argument syntax is invalid
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function parseArguments(args) {
  const argv = args || process.argv.slice(2);
  let specPath;
  let examplesDir;
  for (const arg of argv) {
    if (arg.startsWith(SPEC_ARG_PREFIX)) {
      specPath = arg.slice(SPEC_ARG_PREFIX.length);
    } else if (arg.startsWith(EXAMPLES_DIR_ARG_PREFIX)) {
      examplesDir = arg.slice(EXAMPLES_DIR_ARG_PREFIX.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!specPath) {
    throw new Error('--spec=<path> is required.');
  }
  if (!examplesDir) {
    throw new Error('--examples-dir=<path> is required.');
  }
  return { specPath, examplesDir };
}

/**
 * Read and parse an examples spec JSON file.
 *
 * @param {string} specPath — Path to the spec file
 * @returns {Object} Spec object with a samples array
 * @throws {Error} If the file is unreadable or the shape is invalid
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function parseSpec(specPath) {
  const raw = fs.readFileSync(specPath, 'utf8');
  let spec;
  try {
    spec = JSON.parse(raw);
  } catch (parseError) {
    throw new Error(`Spec is not valid JSON: ${parseError.message}`);
  }
  if (!spec || !Array.isArray(spec.samples)) {
    throw new Error('Spec must be an object with a samples array.');
  }
  return spec;
}

/**
 * Validate that every sample file reference resolves under examplesDir.
 *
 * @param {Object} spec — Examples spec object
 * @param {string} examplesDir — Absolute examples directory
 * @returns {{ ok: boolean, unresolvableRefs: Array<{file, reason}> }}
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function validateExamplesSpec(spec, examplesDir) {
  const unresolvableRefs = [];
  for (const sample of spec.samples || []) {
    if (!sample || typeof sample.file !== 'string' || sample.file.trim() === '') {
      unresolvableRefs.push({ file: '(invalid entry)', reason: 'sample entry lacks a non-empty file string' });
      continue;
    }
    const resolved = path.resolve(examplesDir, sample.file);
    if (!fs.existsSync(resolved)) {
      unresolvableRefs.push({ file: sample.file, reason: `Not found under ${examplesDir}` });
    }
  }
  return { ok: unresolvableRefs.length === 0, unresolvableRefs };
}

/**
 * main — CLI entry point.
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function main() {
  try {
    const { specPath, examplesDir } = parseArguments();
    const spec = parseSpec(specPath);
    const result = validateExamplesSpec(spec, examplesDir);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  }
}

// Call main only when executed as CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  parseSpec,
  validateExamplesSpec,
  main,
  SPEC_ARG_PREFIX,
  EXAMPLES_DIR_ARG_PREFIX,
};
