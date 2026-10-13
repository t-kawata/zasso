#!/usr/bin/env node

/**
 * calibrate.mjs — measure the sequence-ledger join on a workspace, and write nothing.
 *
 * Usage: node calibrate.mjs <sequences-artifact> [--json]
 *
 * The artifact path is given; the two manifests are resolved beside it, and the package
 * seed documents are found by walking for RFC-SEED.md under crates/ beneath the same
 * root. This is the only module in the slice that touches the filesystem: the libraries
 * are pure, so the surface to audit for a stray write is one file and it is this one.
 *
 * Output is prose by default and a machine record under --json. A calibration is read to
 * decide whether a gate may be written against it, and that decision is made by reading
 * sentences; the machine form exists for the tests and for PX-257.
 *
 * Exit-code contract:
 *   success → 0, the report on stdout
 *   an input that is absent or unreadable, or an artifact that is not one → 2, the
 *   offending path on stderr and nothing on stdout
 *
 * Design context: tools/conver/README.md — 上流ループ / the sequence-ledger calibration.
 */

import fs from 'node:fs';
import path from 'node:path';

import { parseSequencesArtifact } from './lib/artifact.mjs';
import { readSourceSegments } from './lib/segments.mjs';
import { buildCalibrationReport, renderCalibrationJson, renderCalibrationProse } from './lib/report.mjs';

const EXIT_OK = 0;
const EXIT_INPUT_MISSING = 2;

const TREE_MANIFEST_FILENAME = 'WORKSPACIFY-TREE-MANIFEST.json';
const ALLOCATE_MANIFEST_FILENAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
const PACKAGE_ROOT_DIRECTORY = 'crates';
const SEED_FILENAME = 'RFC-SEED.md';
const JSON_FLAG = '--json';

/** A failure the operator can act on: it names the path and says what was wrong with it. */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
class InputError extends Error {}

/**
 * The command line: one artifact path, and whether the machine form was asked for.
 *
 * @param {string[]} argv
 * @returns {{ artifactPath: string, asJson: boolean }}
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const positional = argv.filter((argument) => argument !== JSON_FLAG);
  const asJson = argv.includes(JSON_FLAG);

  if (positional.length !== 1) {
    throw new InputError('usage: calibrate.mjs <sequences-artifact> [--json]');
  }
  return { artifactPath: path.resolve(positional[0]), asJson };
}

/**
 * Read one file, naming it when the read fails.
 *
 * @param {string} filePath
 * @returns {string}
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
function readTextOrFail(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new InputError(`${filePath}: it could not be read (${error.code ?? error.message})`);
  }
}

/**
 * Read and parse one JSON file, naming it when either step fails.
 *
 * @param {string} filePath
 * @returns {unknown}
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
function readJsonOrFail(filePath) {
  const text = readTextOrFail(filePath);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new InputError(`${filePath}: it does not parse as JSON (${error.message})`);
  }
}

/**
 * Read and parse the sequences artifact, reporting a rejection as an input error.
 *
 * The reader raises a plain Error and names the offending artifact in every rejection it
 * makes. The CLI's contract is that a bad input is refused with exit 2 and the path on
 * stderr, so the two rejection kinds are folded into one here rather than escaping as an
 * uncaught throw — an unparsable artifact is an input the operator typed, not a crash.
 *
 * @param {string} artifactPath
 * @returns {object}
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
function readArtifactOrFail(artifactPath) {
  try {
    return parseSequencesArtifact(readTextOrFail(artifactPath), artifactPath);
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(error.message);
  }
}

/**
 * Every package seed document under the manifest root, as package and segment ids.
 *
 * A seed document that carries no source_segments block is read as claiming no segment
 * rather than skipped: skipping it would remove the package from the denominator, and ten
 * packages claiming nothing is one of the findings this calibration exists to report.
 *
 * @param {string} packageRoot
 * @returns {Array<{ packagePath: string, segmentIds: string[] }>}
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
function readPackageSegments(packageRoot) {
  if (!fs.existsSync(packageRoot)) return [];

  const packageSegments = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name === SEED_FILENAME) {
        const segmentIds = readSourceSegments(fs.readFileSync(fullPath, 'utf8'));
        packageSegments.push({ packagePath: path.relative(packageRoot, directory), segmentIds: segmentIds ?? [] });
      }
    }
  };
  walk(packageRoot);
  return packageSegments.sort((left, right) => left.packagePath.localeCompare(right.packagePath));
}

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
function main() {
  try {
    const { artifactPath, asJson } = parseArguments(process.argv.slice(2));
    const root = path.dirname(artifactPath);

    const artifact = readArtifactOrFail(artifactPath);
    const treeManifest = readJsonOrFail(path.join(root, TREE_MANIFEST_FILENAME));
    const allocateManifest = readJsonOrFail(path.join(root, ALLOCATE_MANIFEST_FILENAME));
    const packageSegments = readPackageSegments(path.join(root, PACKAGE_ROOT_DIRECTORY));

    const report = buildCalibrationReport({ artifact, treeManifest, allocateManifest, packageSegments });

    process.stdout.write(
      asJson
        ? renderCalibrationJson(report)
        : renderCalibrationProse(report, { packagePaths: packageSegments.map((entry) => entry.packagePath) }),
    );
    return EXIT_OK;
  } catch (error) {
    if (error instanceof InputError) {
      process.stderr.write(`calibrate refused: ${error.message}\n`);
      return EXIT_INPUT_MISSING;
    }
    throw error;
  }
}

process.exit(main());
