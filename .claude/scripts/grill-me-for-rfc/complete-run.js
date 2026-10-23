#!/usr/bin/env node
/**
 * complete-run.js <rfc-dir>
 *
 * Finish a grill run in one command: render the distribution ledger from the
 * package's view, record the generation, and only then declare the run DONE.
 *
 * The render lives here rather than in a procedure step because a step the model
 * has to remember is a step that can be skipped, and a counter cannot record an
 * execution that never happened. The order is the point: a refusal writes nothing
 * and leaves the state untouched, so a run whose ledger cannot be regenerated
 * cannot finish.
 *
 * Usage: node complete-run.js <rfc-dir>
 * Exit: 0 finished, 1 refused, 2 usage or missing input.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  recordDistributionGeneration,
  renderDistribution,
  writeAtomically,
} from './render-distribution.mjs';

const RFC_FILE_NAME = 'RFC.md';
const VIEW_FILE_NAME = 'SEQUENCES.json';
const STATUS_FILE_NAME = 'Status.json';
const DONE_STATE = 'DONE';
const UPDATE_STATUS_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'update-status.js');

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

/**
 * Print one machine-readable line, the same shape the rest of the stage uses.
 *
 * @param {object} payload
 */
function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

/**
 * Render the package's ledger and open one distribution generation.
 *
 * Additivity is a pass, not a failure: a package with no view has nothing to
 * distribute, so the run finishes and records nothing. Everything else either
 * renders or refuses, and a refusal names the unit that stopped it.
 *
 * @param {string} rfcDir — the package directory
 * @returns {{ ok: boolean, rendered: boolean, wrote?: boolean, code?: string }}
 */
function renderPackage(rfcDir) {
  const rfcPath = path.join(rfcDir, RFC_FILE_NAME);
  const viewPath = path.join(rfcDir, VIEW_FILE_NAME);
  if (!fs.existsSync(viewPath)) return { ok: true, rendered: false };

  let view;
  try {
    view = JSON.parse(fs.readFileSync(viewPath, 'utf8'));
  } catch {
    return { ok: false, rendered: false, code: 'VIEW_UNREADABLE' };
  }

  const result = renderDistribution(fs.readFileSync(rfcPath, 'utf8'), view);
  if (!result.ok) {
    return {
      ok: false,
      rendered: false,
      code: result.code,
      missing: result.missing,
      invented: result.invented,
      units: result.units,
    };
  }

  // Recorded before the write: the pre-render file is what says whether the package
  // already carried a map, and therefore which generation this execution opens.
  recordDistributionGeneration(rfcPath, result.map);
  if (result.wrote) writeAtomically(rfcPath, result.rfc);
  return { ok: true, rendered: true, wrote: result.wrote };
}

/**
 * The state the package carries now, for a refusal that must report what it left.
 *
 * Read back rather than assumed: a delegated writer can fail after writing, and a
 * refusal that claimed "unchanged" without looking would be describing its intent
 * instead of the disk.
 *
 * @param {string} rfcDir
 * @returns {string|null}
 */
function currentState(rfcDir) {
  try {
    const status = JSON.parse(fs.readFileSync(path.join(rfcDir, STATUS_FILE_NAME), 'utf8'));
    return status.state ?? null;
  } catch {
    return null;
  }
}

/**
 * Declare the run DONE through the one writer that owns the transition.
 *
 * Delegated rather than reimplemented: `set-state DONE` is what records
 * `completedAt` and moves the session count, and a second copy of that rule here
 * would be a second answer to what "completed" means.
 *
 * @param {string} rfcDir
 * @returns {{ ok: boolean, code?: string, detail?: string }}
 */
function declareDone(rfcDir) {
  try {
    execFileSync(process.execPath, [UPDATE_STATUS_SCRIPT, rfcDir, 'set-state', DONE_STATE], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, code: 'DONE_REFUSED', detail: String(error.stderr ?? '').trim() };
  }
}

/**
 * The command entry point.
 *
 * @param {string[]} argv
 * @returns {number}
 */
export function main(argv = process.argv.slice(2)) {
  const rfcDirArgument = argv[0];
  if (!rfcDirArgument) {
    process.stderr.write('Usage: complete-run.js <rfc-dir>\n');
    return EXIT_USAGE;
  }

  // Resolved before any write: a package the command cannot identify is not
  // finished, and creating state for it would be worse than refusing.
  const rfcDir = path.resolve(rfcDirArgument);
  if (!fs.existsSync(path.join(rfcDir, STATUS_FILE_NAME))) {
    emit({ ok: false, code: 'MISSING_STATUS', rfcDir });
    return EXIT_USAGE;
  }
  if (!fs.existsSync(path.join(rfcDir, RFC_FILE_NAME))) {
    emit({ ok: false, code: 'MISSING_RFC', rfcDir });
    return EXIT_USAGE;
  }

  const rendered = renderPackage(rfcDir);
  if (!rendered.ok) {
    emit({ ...rendered, state: currentState(rfcDir) });
    return EXIT_REFUSED;
  }

  const declared = declareDone(rfcDir);
  if (!declared.ok) {
    emit({ ...declared, state: currentState(rfcDir) });
    return EXIT_REFUSED;
  }

  const status = JSON.parse(fs.readFileSync(path.join(rfcDir, STATUS_FILE_NAME), 'utf8'));
  emit({
    ok: true,
    state: status.state,
    rendered: rendered.rendered,
    wrote: rendered.wrote ?? false,
    distributionGeneration: status.distributionGeneration ?? null,
  });
  return EXIT_OK;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
