#!/usr/bin/env node
/**
 * complete-run.js <rfc-dir>
 *
 * Finish a grill run in one command: render the distribution ledger from the package's
 * view, evaluate every required STEP 8 gate, record the generation, and only then
 * declare the run DONE.
 *
 * The render lives here rather than in a procedure step because a step the model has to
 * remember is a step that can be skipped, and a counter cannot record an execution that
 * never happened. The gate list lives here for the same reason: a completion command that
 * does not read its own gate list turns DONE into an intention. The order is the point: a
 * refusal writes nothing to Status.json, so a run whose evidence is incomplete cannot
 * finish.
 *
 * Usage: node complete-run.js <rfc-dir>
 * Exit: 0 finished, 1 refused, 2 usage or missing input.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import recorder from '../lib/run-history-recorder.cjs';
import repairFinding from '../lib/repair-finding.js';

import { resolveWorkspaceRoot } from '../spec-formula/index.mjs';
import {
  carriesDistributionMap,
  recordDistributionGeneration,
  renderDistribution,
  writeAtomically,
} from './render-distribution.mjs';
import { COMPLETION_RECEIPT_FILE, writeCompletionReceipt } from './completion-receipt.js';

const { createFinding, renderFindings } = repairFinding;

const RFC_FILE_NAME = 'RFC.md';
const VIEW_FILE_NAME = 'SEQUENCES.json';
const STATUS_FILE_NAME = 'Status.json';
const CHECKLIST_FILE_NAME = 'CheckList.md';
const DONE_STATE = 'DONE';
const GATE_LAYER = 'grill';
const GATE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const UPDATE_STATUS_SCRIPT = path.join(GATE_DIRECTORY, 'update-status.js');

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

/** The route a reader follows to repair the finding. */
const ROUTE = Object.freeze({ IN_DRILL: 'in-drill', UPSTREAM: 'upstream' });

/** One marker that says the RFC still defers a decision. The classes keep the marker words out of this source, so the scanner does not read this rule as a marker itself. */
const DEFERRED_WORK = /\b(?:T[B]D|TO[D]O|FIX[M]E|HAC[K]|X[X]X)\b|\[::[A-Z-]*STUB::\]|delegated to|deferred to (?:a )?future|ask the human|waiting for approval/i;

/** One unchecked checklist item. */
const UNCHECKED_ITEM = /^\s*-\s*\[ \]\s+/m;

/** What a gate that cannot find its workspace reports; never a skip. */
const NO_WORKSPACE_ROOT = 'NO_WORKSPACE_ROOT: neither workspace manifest is above this RFC directory';

/**
 * The ten required conditions of STEP 8, in the order the command states them.
 *
 * A predicate gate reads the package record directly; a script gate spawns the program the
 * command names, so the evidence cannot disagree with the gate a reader would run. Every
 * entry carries the route its repair follows and the command this refusal prints.
 */
export const REQUIRED_GATES = Object.freeze([
  {
    name: 'design-tree-resolved',
    script: 'update-tree.js',
    args: ({ rfcDir }) => [rfcDir, 'open-count'],
    route: ROUTE.IN_DRILL,
    interpret: ({ stdout }) => {
      const openCount = JSON.parse(stdout).openCount;
      return {
        exitCode: openCount === 0 ? 0 : 1,
        detail: `openCount: ${openCount}`,
      };
    },
  },
  {
    name: 'checklist-approved',
    route: ROUTE.IN_DRILL,
    repairTarget: CHECKLIST_FILE_NAME,
    evaluate: ({ rfcDir }) => {
      const checklist = readTextOrNull(path.join(rfcDir, CHECKLIST_FILE_NAME));
      if (checklist === null) return { exitCode: 1, detail: `cannot read ${CHECKLIST_FILE_NAME}` };
      const unchecked = checklist.split('\n').filter((line) => UNCHECKED_ITEM.test(line)).length;
      return { exitCode: unchecked === 0 ? 0 : 1, detail: `${unchecked} unchecked item(s)` };
    },
  },
  {
    name: 'rfc-no-deferred-work',
    route: ROUTE.IN_DRILL,
    repairTarget: RFC_FILE_NAME,
    evaluate: ({ rfcDir }) => {
      const rfc = readTextOrNull(path.join(rfcDir, RFC_FILE_NAME));
      if (rfc === null) return { exitCode: 1, detail: `cannot read ${RFC_FILE_NAME}` };
      const markers = rfc.split('\n')
        .map((line, index) => (DEFERRED_WORK.test(line) ? index + 1 : null))
        .filter((lineNumber) => lineNumber !== null);
      return {
        exitCode: markers.length === 0 ? 0 : 1,
        detail: markers.length === 0 ? 'no deferred-work marker' : `deferred-work markers on lines ${markers.join(', ')}`,
      };
    },
  },
  {
    name: 'seed-divergence-ledger',
    script: 'check-divergence-ledger.js',
    args: ({ rfcDir }) => [rfcDir],
    route: ROUTE.IN_DRILL,
  },
  {
    name: 'defect-ledger',
    script: 'defect-report.js',
    args: ({ workspaceRoot }) => [workspaceRoot, '--gate'],
    route: ROUTE.IN_DRILL,
  },
  {
    name: 'obligation-coverage',
    script: 'check-obligation-coverage.js',
    args: ({ workspaceRoot }) => [workspaceRoot],
    route: ROUTE.UPSTREAM,
  },
  {
    name: 'ledger-discharge',
    script: 'check-ledger-discharge.js',
    args: ({ workspaceRoot }) => [workspaceRoot],
    route: ROUTE.IN_DRILL,
  },
  {
    name: 'contribution-completeness',
    script: 'check-contribution-completeness.js',
    args: ({ workspaceRoot }) => [workspaceRoot],
    route: ROUTE.IN_DRILL,
  },
  {
    name: 'distribution-completeness',
    script: 'check-distribution-completeness.js',
    args: ({ workspaceRoot }) => [workspaceRoot],
    route: ROUTE.UPSTREAM,
  },
  {
    name: 'formula-coverage',
    script: 'check-formula-coverage.js',
    args: ({ rfcDir }) => [rfcDir],
    route: ROUTE.IN_DRILL,
  },
]);

/** The names of the gates, in order, for a caller that reports the evidence set. */
export const REQUIRED_GATE_NAMES = Object.freeze(REQUIRED_GATES.map((gate) => gate.name));

/**
 * The workspace API verdict, evaluated only for a cross-package re-grill.
 *
 * A single-package completion is not answerable for every other package's Rust
 * surface, so this gate is opt-in. A run that edited a neighbour is answerable, and
 * `--cross-package` is how it says so.
 */
export const API_CONSISTENCY_GATE = Object.freeze({
  name: 'api-consistency',
  script: '../api-consistency/verify-api-consistency.mjs',
  args: ({ workspaceRoot }) => [`--workspace=${workspaceRoot}`],
  route: ROUTE.UPSTREAM,
});

/** Read a text file, or null when it cannot be read. */
function readTextOrNull(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/** Print one machine-readable line, the same shape the rest of the stage uses. */
function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

/** The first non-empty line of a program's output, so a refusal carries a readable cause. */
function firstLine(text) {
  return String(text ?? '').split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? '';
}

/**
 * Run one script gate and report what it exited with.
 *
 * A gate whose arguments need the workspace reports `NO_WORKSPACE_ROOT` rather than being
 * skipped: a completion command that silently drops a gate is the failure this command
 * exists to make impossible.
 */
function spawnGate(gate, context) {
  const args = gate.args(context);
  if (args.some((argument) => argument === null || argument === undefined)) {
    return { exitCode: 1, status: 'failed', detail: NO_WORKSPACE_ROOT };
  }

  try {
    const stdout = execFileSync(process.execPath, [path.join(GATE_DIRECTORY, gate.script), ...args], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    const status = /^withheld:/m.test(stdout) ? 'withheld' : 'passed';
    return { exitCode: 0, status, detail: firstLine(stdout) };
  } catch (error) {
    return {
      exitCode: Number.isInteger(error.status) ? error.status : 1,
      status: 'failed',
      detail: firstLine(error.stdout) || firstLine(error.stderr) || String(error.message ?? ''),
    };
  }
}

/**
 * Evaluate every required gate, read-only.
 *
 * All gates are evaluated so the refusal names every short condition, not only the first
 * one; a caller that must stop early still reads the same evidence list.
 */
export function runRequiredGates(context, options = {}) {
  const run = options.run ?? spawnGate;
  const gates = options.gates ?? REQUIRED_GATES;
  return gates.map((gate) => {
    const verdict = typeof gate.evaluate === 'function'
      ? gate.evaluate(context)
      : run(gate, context);
    const status = verdict.status ?? (verdict.exitCode === 0 ? 'passed' : 'failed');
    return Object.freeze({
      name: gate.name,
      script: gate.script ?? null,
      exitCode: verdict.exitCode,
      status,
      detail: verdict.detail ?? '',
    });
  });
}

/** The repair command a failing gate's finding carries. */
// [::TICKET::] PX-371 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-371 --for-spec --no-implementation-order`.
function repairAction(gate, context) {
  if (typeof gate.script !== 'string') {
    return `edit ${path.join(context.rfcDir, gate.repairTarget)} and clear the condition the ${gate.name} gate reports, then rerun node "$(git rev-parse --show-toplevel)/.claude/scripts/grill-me-for-rfc/complete-run.js" ${context.rfcDir}`;
  }
  const target = gate.args(context).filter((argument) => argument !== null).join(' ');
  if (gate.name === 'obligation-coverage') {
    return `run /educe-sequences <spec-path> when the finding is an unstated denominator: declare sourceEnumerations in educe-sequences/declaration.json with the supplied census, then run node "$(git rev-parse --show-toplevel)/.claude/scripts/educe-sequences/rail/phase.mjs" through <spec-path>, then run node "$(git rev-parse --show-toplevel)/.claude/scripts/grill-me-for-rfc/${gate.script}" ${target} and apply its Action lines, then rerun node "$(git rev-parse --show-toplevel)/.claude/scripts/grill-me-for-rfc/complete-run.js" ${context.rfcDir}`;
  }
  return `run node "$(git rev-parse --show-toplevel)/.claude/scripts/grill-me-for-rfc/${gate.script}" ${target} and apply its Action lines, then rerun node "$(git rev-parse --show-toplevel)/.claude/scripts/grill-me-for-rfc/complete-run.js" ${context.rfcDir}`;
}

/**
 * Render the package's ledger and open one distribution generation.
 *
 * Additivity is a pass, not a failure: a package with no view has nothing to distribute,
 * so the run finishes and records nothing. Everything else either renders or refuses, and
 * a refusal names the unit that stopped it.
 *
 * The generation is not recorded here: a run whose gate evidence is short did not happen,
 * and a counter that recorded it would describe an intention as an execution.
 */
function renderPackage(rfcDir) {
  const rfcPath = path.join(rfcDir, RFC_FILE_NAME);
  const viewPath = path.join(rfcDir, VIEW_FILE_NAME);
  const carriedMapBefore = carriesDistributionMap(rfcPath);
  if (!fs.existsSync(viewPath)) {
    return { ok: true, rendered: false, map: null, carriedMapBefore };
  }

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

  if (result.wrote) writeAtomically(rfcPath, result.rfc);
  return { ok: true, rendered: true, wrote: result.wrote, map: result.map, carriedMapBefore };
}

/** The state the package carries now, for a refusal that must report what it left. */
function currentState(rfcDir) {
  try {
    const status = JSON.parse(fs.readFileSync(path.join(rfcDir, STATUS_FILE_NAME), 'utf8'));
    return status.state ?? null;
  } catch {
    return null;
  }
}

/** Declare the run DONE through the one writer that owns the transition. */
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
 */
export function main(argv = process.argv.slice(2)) {
  const rfcDirArgument = argv[0];
  if (!rfcDirArgument) {
    process.stderr.write('Usage: complete-run.js <rfc-dir> [--cross-package]\n');
    return EXIT_USAGE;
  }
  const crossPackage = argv.includes('--cross-package');

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

  // A receipt from an earlier attempt is not evidence for this one. Clearing it
  // before the gates run means a failed completion cannot leave DONE authorized.
  fs.rmSync(path.join(rfcDir, COMPLETION_RECEIPT_FILE), { force: true });

  const rendered = renderPackage(rfcDir);
  if (!rendered.ok) {
    emit({ ...rendered, state: currentState(rfcDir) });
    return EXIT_REFUSED;
  }

  const context = { rfcDir, workspaceRoot: resolveWorkspaceRoot(rfcDir) };
  const selectedGates = crossPackage ? [...REQUIRED_GATES, API_CONSISTENCY_GATE] : REQUIRED_GATES;
  const gates = runRequiredGates(context, { gates: selectedGates });
  const failed = gates.filter((gate) => gate.exitCode !== 0);
  if (failed.length > 0) {
    const first = failed[0];
    const entry = selectedGates.find((gate) => gate.name === first.name);
    const finding = createFinding({
      severity: 'blocking',
      code: 'GATE_FAILED',
      layer: GATE_LAYER,
      artifact: path.join(GATE_DIRECTORY, first.script ?? first.name),
      cause: `${first.name} exited ${first.exitCode}: ${first.detail}`,
      action: repairAction(entry, context),
      verify: `node "$(git rev-parse --show-toplevel)/.claude/scripts/grill-me-for-rfc/complete-run.js" ${rfcDir}`,
      route: entry.route,
    });
    process.stderr.write(`${renderFindings([finding], { cap: 1 })}\n`);
    emit({
      ok: false,
      code: 'GATE_FAILED',
      gate: first.script ?? first.name,
      exitCode: first.exitCode,
      state: currentState(rfcDir),
      gates,
    });
    return EXIT_REFUSED;
  }

  recordDistributionGeneration(path.join(rfcDir, RFC_FILE_NAME), rendered.map, {
    carriedMapBefore: rendered.carriedMapBefore,
  });

  // The gate list passed. Write the evidence update-status.js requires for DONE.
  writeCompletionReceipt(rfcDir, gates);

  const declared = declareDone(rfcDir);
  if (!declared.ok) {
    emit({ ...declared, state: currentState(rfcDir), gates });
    return EXIT_REFUSED;
  }

  const status = JSON.parse(fs.readFileSync(path.join(rfcDir, STATUS_FILE_NAME), 'utf8'));
  emit({
    ok: true,
    state: status.state,
    rendered: rendered.rendered,
    wrote: rendered.wrote ?? false,
    distributionGeneration: status.distributionGeneration ?? null,
    gates,
    withheld: gates.filter((gate) => gate.status === 'withheld').map((gate) => gate.script),
  });
  return EXIT_OK;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = main();
  recorder.recordRunHistory('finish', {
    command: 'grill-me-for-rfc',
    stage: 'grill',
    status: exitCode === EXIT_OK ? 'COMPLETE' : 'BLOCKED_PREREQUISITE',
  });
  process.exit(exitCode);
}
