/**
 * Grill sessions and drill sessions, built by running the real init.js.
 *
 * A hand-written CheckList.md would be a second implementation of the shape
 * check-all-schema.js validates, and a fixture that drifted from it would fail the
 * resume path for a reason that has nothing to do with the detector. So the fixture runs
 * the command's own initializer and then edits the record, which keeps every session the
 * tests use one the tool itself would accept.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const SCRIPTS = path.join(PROJECT_ROOT, '.claude', 'scripts');
export const GRILL = path.join(SCRIPTS, 'grill-me-for-rfc');
export const INIT = path.join(GRILL, 'init.js');
export const LIST_FILES = path.join(GRILL, 'list-files.js');
export const SETTLE_RUN = path.join(GRILL, 'settle-run.js');
export const DETECTOR = path.join(GRILL, 'sequences-material.js');
export const DRILL_DETECTOR = path.join(SCRIPTS, 'drill-rfc-down', 'sequences-material.js');
export const GUARD = path.join(GRILL, 'guard-edit-surface.js');
export const CANON_STATE = path.join(GRILL, 'canon-state.js');
export const RUN = path.join(SCRIPTS, 'sequences-slice', 'run.mjs');
export const CALIBRATE = path.join(SCRIPTS, 'sequences-slice', 'calibrate.mjs');

export const SOURCE_ARTIFACT_NAME = 'GaiaSekkeiShiyousho_v32-sequences.json';
export const VIEW_MARKDOWN_NAME = 'SEQUENCES.md';
export const VIEW_JSON_NAME = 'SEQUENCES.json';

/** A scratch directory removed when `body` returns, however it returns. */
export function withScratch(prefix, body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return body(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/**
 * The lowercase hex SHA-256 of a file, or null when it is not there.
 *
 * Two sessions compared for byte-identity live in different directories, and the records
 * they write name those directories. `substitutions` removes that difference so the digest
 * compares what the run decided rather than where the run happened.
 */
export function digestFile(filePath, { ignore = [], substitutions = [] } = {}) {
  if (!fs.existsSync(filePath)) return null;
  let normalized = fs.readFileSync(filePath, 'utf8');
  for (const [from, to] of substitutions) {
    normalized = normalized.split(from).join(to);
  }
  for (const key of ignore) {
    normalized = normalized.replace(new RegExp(`"${key}": "[^"]*"`, 'g'), `"${key}": "<ignored>"`);
  }
  return createHash('sha256').update(normalized).digest('hex');
}

/** Every file under a root, by relative path, with its digest. */
export function digestDirectory(root, options = {}) {
  const digests = {};
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else digests[path.relative(root, fullPath)] = digestFile(fullPath, options);
    }
  };
  if (fs.existsSync(root)) walk(root);
  return digests;
}

/** The paths a digestDirectory before/after pair disagrees on, sorted. */
export function changedPaths(before, after) {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...paths].filter((relative) => before[relative] !== after[relative]).sort();
}

/**
 * A package directory holding a grill session, created by init.js itself.
 *
 * @param {{ material?: string[], completedAt?: string }} [options]
 * @returns {string} the package directory
 */
export function makeGrillSession(packageDir, options = {}) {
  const { material = [], completedAt = null } = options;
  fs.mkdirSync(packageDir, { recursive: true });

  const specPath = path.join(packageDir, 'Specification.md');
  fs.writeFileSync(specPath, '# Specification\n\nSynthetic.\n');

  // RFC.md is deliberately NOT written first. init.js chooses overwrite_confirm when an
  // RFC exists without a Status.json, and that mode writes nothing and exits 0, so a
  // fixture that pre-wrote the RFC would build a session with no record in it.
  const result = spawnSync(process.execPath, [INIT, packageDir, specPath, ...material], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`init.js refused to build the fixture session: ${result.stderr || result.stdout}`);
  }
  fs.writeFileSync(path.join(packageDir, 'RFC.md'), '# Synthetic RFC\n');
  if (completedAt !== null) patchStatus(packageDir, { completedAt });
  return packageDir;
}

/** Edit the session record in place, as a completed session would carry it. */
export function patchStatus(packageDir, patch) {
  const statusPath = path.join(packageDir, 'Status.json');
  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  fs.writeFileSync(statusPath, JSON.stringify({ ...status, ...patch }, null, 2));
  return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
}

/** The session record as it stands. */
export function readStatus(packageDir) {
  return JSON.parse(fs.readFileSync(path.join(packageDir, 'Status.json'), 'utf8'));
}

/** A drill session directory holding the record drill/session-init.js writes. */
export function makeDrillSession(packageDir, { omitStatus = false } = {}) {
  const sessionDir = path.join(packageDir, 'drills');
  fs.mkdirSync(sessionDir, { recursive: true });
  if (!omitStatus) {
    fs.writeFileSync(
      path.join(sessionDir, 'Status.json'),
      JSON.stringify(
        {
          state: 'DRILLING',
          researchPath: '',
          rfcPath: path.join(packageDir, 'RFC.md'),
          rfcDir: packageDir,
          reviewLoopCount: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        null,
        2,
      ),
    );
  }
  return sessionDir;
}

/** Run either detector entry point as its command runs it. */
export function runDetector(packageDir, { sessionDir = null, entryPoint = DETECTOR } = {}) {
  const args = [entryPoint, packageDir];
  if (sessionDir !== null) args.push(`--session-dir=${sessionDir}`);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, answer: safeParse(result.stdout) };
}

/** Run the guard as the command runs it. */
export function guardVerdict(target) {
  const result = spawnSync(process.execPath, [GUARD, target, '--json'], { encoding: 'utf8' });
  return { status: result.status, verdict: safeParse(result.stdout) };
}

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The STEP 0 command sequence as it stood before this ticket.
 *
 * Kept as an executable record rather than as a checked-in digest, so the comparison is
 * between two runs in the same environment rather than between a run and a file that was
 * written on another day.
 */
export function runPreChangeStepZero(packageDir, { arguments: args }) {
  const init = spawnSync(process.execPath, [INIT, packageDir, ...args], { encoding: 'utf8' });
  if (init.status !== 0) return { init };
  const listFiles = spawnSync(process.execPath, [LIST_FILES, packageDir], { encoding: 'utf8' });
  const settleRun = spawnSync(process.execPath, [SETTLE_RUN, packageDir, 'prior'], { encoding: 'utf8' });
  return { init, listFiles, settleRun };
}

/**
 * STEP 0 as the command definition states it, over the real scripts.
 *
 * The command is a bash block inside a markdown file, so there is no single artifact to
 * invoke. This runs the sequence the block states, using the detector's own answer to
 * decide the branch, and the order test beside it asserts the block states that sequence.
 * Between them, a command that said the wrong thing and a sequence that did the wrong
 * thing each fail.
 *
 * @returns {{ init: object, detector: object, generation: object|null, listFiles: object, settleRun: object }}
 */
export function runStepZero(packageDir, { arguments: args, sessionDir = null, sourcePath = null }) {
  const init = spawnSync(process.execPath, [INIT, packageDir, ...args], { encoding: 'utf8' });

  const detector = runDetector(packageDir, { sessionDir });

  let generation = null;
  if (detector.answer.present && detector.answer.view === null && detector.answer.source !== null) {
    const written = spawnSync(process.execPath, [RUN, detector.answer.source, packageDir], { encoding: 'utf8' });
    const recorded = spawnSync(
      process.execPath,
      [INIT, packageDir, path.join(packageDir, VIEW_MARKDOWN_NAME), path.join(packageDir, VIEW_JSON_NAME)],
      { encoding: 'utf8' },
    );
    generation = { written, recorded };
  } else if (detector.answer.view === null && sourcePath !== null) {
    // The operator named the artifact on the command line rather than recording it, which
    // is the shape a first run takes: init.js records it, and the branch above then sees it.
    const written = spawnSync(process.execPath, [RUN, sourcePath, packageDir], { encoding: 'utf8' });
    const recorded = spawnSync(
      process.execPath,
      [INIT, packageDir, path.join(packageDir, VIEW_MARKDOWN_NAME), path.join(packageDir, VIEW_JSON_NAME)],
      { encoding: 'utf8' },
    );
    generation = { written, recorded };
  }

  const listFiles = spawnSync(process.execPath, [LIST_FILES, packageDir], { encoding: 'utf8' });
  const settleRun = spawnSync(process.execPath, [SETTLE_RUN, packageDir, 'prior'], { encoding: 'utf8' });
  return { init, detector, generation, listFiles, settleRun };
}

/** The three artifacts a STEP 0 run produces, normalized for comparison. */
export function stepZeroArtifacts(packageDir) {
  const substitutions = [[packageDir, '<packageDir>'], [fs.realpathSync(path.dirname(packageDir)), '<parent>']];
  return {
    status: digestFile(path.join(packageDir, 'Status.json'), { ignore: ['createdAt', 'updatedAt', 'materialsAddedAt'], substitutions }),
    tree: digestFile(path.join(packageDir, 'DesignTree.json'), { ignore: ['updatedAt', 'scannedAt'], substitutions }),
    checklist: digestFile(path.join(packageDir, 'CheckList.md'), { substitutions }),
  };
}
