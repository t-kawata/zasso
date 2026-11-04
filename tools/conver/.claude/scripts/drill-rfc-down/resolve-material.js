/**
 * The one pass that decides what a drill reads.
 *
 * A drill used to read exactly the arguments it was handed, so a package with a design
 * note and no arguments read nothing. The optional inputs are now discovered once here:
 * README.md (the RESIDUE), the sequences view, and then whatever the operator passed.
 * Arguments are additive by construction — they are appended after the discovered list
 * and can never remove an entry from it.
 *
 * The session record is the authority on a resume. Once a run has recorded its material
 * list, re-discovering would reorder the list under an answer already given, so the read
 * path returns the record unchanged.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { toHomeRelative } from '../lib/path-utils.js';
import {
  defaultSessionDirFor,
  findSequenceMaterial,
  nodeFileSystem,
} from '../sequences-slice/lib/material.mjs';

/** The package-level document whose RESIDUE the drill reads when it is present. */
export const README_FILENAME = 'README.md';

/** The session record that carries materialPaths once a run has resolved them. */
export const STATUS_FILENAME = 'Status.json';

/** Recursively collect the regular files under a directory. */
// [::TICKET::] PX-368 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-368 --for-spec --no-implementation-order`.
function collectFilesRecursive(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFilesRecursive(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

/**
 * Resolve the argument list into files, keeping the top-level arguments for the report.
 *
 * A file is itself; a directory is walked. An empty directory or a missing path is an
 * error, because an argument the operator named but the run silently ignored is worse
 * than a refusal.
 *
 * @param {string[]} materialArguments
 * @param {string} cwd
 * @returns {{ materialPaths: string[], materialSummary: Array<{path: string, type: string, fileCount: number}>,
 *   argumentEntries: Array<{path: string, files: string[]}> }}
 */
export function collectMaterialArguments(materialArguments, cwd = process.cwd()) {
  const materialPaths = [];
  const materialSummary = [];
  const argumentEntries = [];
  for (const argument of materialArguments) {
    const resolved = path.resolve(cwd, argument);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      const files = collectFilesRecursive(resolved);
      if (files.length === 0) throw new Error(`Empty material directory: ${toHomeRelative(resolved)}`);
      materialPaths.push(...files);
      materialSummary.push({ path: resolved, type: 'directory', fileCount: files.length });
      argumentEntries.push({ path: resolved, files });
    } else if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      materialPaths.push(resolved);
      materialSummary.push({ path: resolved, type: 'file', fileCount: 1 });
      argumentEntries.push({ path: resolved, files: [resolved] });
    } else {
      throw new Error(`Material path not found: ${toHomeRelative(resolved)}`);
    }
  }
  return { materialPaths, materialSummary, argumentEntries };
}

/** The material list a previous run recorded, or null when the session holds none. */
export function readRecordedMaterialPaths(sessionDir) {
  if (typeof sessionDir !== 'string' || sessionDir.length === 0) return null;
  try {
    const record = JSON.parse(fs.readFileSync(path.join(sessionDir, STATUS_FILENAME), 'utf8'));
    return Array.isArray(record.materialPaths) ? [...record.materialPaths] : null;
  } catch {
    return null;
  }
}

/** Append the paths not already present, preserving the first occurrence of each. */
// [::TICKET::] PX-368 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-368 --for-spec --no-implementation-order`.
function appendWithoutDuplicates(target, candidates) {
  for (const candidate of candidates) {
    if (!target.includes(candidate)) target.push(candidate);
  }
}

/**
 * Discover the optional inputs and append the operator's arguments.
 *
 * @param {{ packageDir: string, sessionDir?: string|null, arguments?: string[], cwd?: string,
 *   homeDirectory?: string }} input
 * @returns {{ materialPaths: string[], discovered: string[], addedArguments: string[],
 *   readmePresent: boolean, readmePath: string|null, sequencesPresent: boolean,
 *   sequencesView: string|null, materialSummary: Array<object>, resumed: boolean }}
 */
export function resolveDrillMaterial({
  packageDir,
  sessionDir = defaultSessionDirFor(path.join, packageDir),
  arguments: materialArguments = [],
  cwd = process.cwd(),
  homeDirectory = os.homedir(),
} = {}) {
  const readmePath = path.join(packageDir, README_FILENAME);
  const readmePresent = fs.existsSync(readmePath);

  const sequences = findSequenceMaterial({
    rfcDir: packageDir,
    sessionDir,
    homeDirectory,
    io: { ...nodeFileSystem(fs), basename: path.basename, join: path.join },
  });
  const sequencesPresent = sequences.present === true;
  const sequencesView = sequences.view ?? null;

  const recorded = readRecordedMaterialPaths(sessionDir);
  if (recorded !== null) {
    return {
      materialPaths: recorded,
      discovered: [],
      addedArguments: [],
      readmePresent,
      readmePath: readmePresent ? readmePath : null,
      sequencesPresent,
      sequencesView,
      materialSummary: [],
      resumed: true,
    };
  }

  const discovered = [];
  if (readmePresent) discovered.push(readmePath);
  if (sequencesView !== null) discovered.push(sequencesView);

  const { materialPaths: argumentFiles, materialSummary, argumentEntries } = collectMaterialArguments(materialArguments, cwd);
  const materialPaths = [...discovered];
  appendWithoutDuplicates(materialPaths, argumentFiles);

  const addedArguments = argumentEntries
    .filter((entry) => entry.files.some((file) => !discovered.includes(file)))
    .map((entry) => entry.path);

  return {
    materialPaths,
    discovered,
    addedArguments,
    readmePresent,
    readmePath: readmePresent ? readmePath : null,
    sequencesPresent,
    sequencesView,
    materialSummary,
    resumed: false,
  };
}

/** The CLI form: one JSON object on stdout, for a caller that cannot import the module. */
export function main(argv = process.argv.slice(2)) {
  const packageDir = process.cwd();
  const answer = resolveDrillMaterial({ packageDir, arguments: argv });
  process.stdout.write(`${JSON.stringify(answer)}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}
