// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
// [::TICKET::] P22-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-2 --for-spec --no-implementation-order`.
/**
 * Command entry point for /workspacify-reverse trace hygiene and experiment design.
 *
 * Six subcommands, each deterministic:
 *   detect     — report the forward-rotation traces in a tree
 *   scrub      — remove the removable ones (or plan the removal with --dry-run)
 *   verify     — re-detect and exit non-zero when residue remains
 *   regression — freeze, or reproduce, the forward rotation's observable output
 *   holdout    — freeze, verify and isolate the projects generality is measured on
 *   oracle     — freeze the answer key, or compare a stage's output against it
 *
 * The process performs no semantic judgement: which traces exist and whether
 * they are gone are facts, not opinions. Deciding what the cleaned tree then
 * means belongs to the reverse-rotation analysis, not here. The regression
 * gate speaks only of *proved* and *not proved*, and the reconciliation emits a
 * disagreement list rather than a score, for the same reason.
 *
 * `holdout` and `oracle` read and write the project they are pointed at, which
 * defaults to the working directory: the automated sessions that run them
 * before every later ticket's step stand in the project root.
 */
import process from 'node:process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { detectForwardTraces } from './lib/detect-forward-traces.mjs';
import { planScrub, scrubForwardTraces } from './lib/scrub-forward-traces.mjs';
import { verifyScrub, exitCodeFor, renderVerification } from './lib/verify-scrub.mjs';
import { captureBaselines, checkBaselines, renderCaptureReport, renderCheckReport } from './lib/regression-gate.mjs';
import { CANDIDATES_RELATIVE_PATH, LEDGER_RELATIVE_PATH, freezeLedger, loadLedger, renderLedgerReport } from './lib/holdout-ledger.mjs';
import { FORWARD_ROTATION_PATTERNS, renderIsolationReport, verifyIsolation } from './lib/isolation-check.mjs';
import {
  BUNDLE_RELATIVE_PATH,
  KNOWN_DELTA_RELATIVE_PATH,
  ORACLE_TREE_RELATIVE_PATH,
  SUBJECT_TREE_RELATIVE_PATH,
  extractKnownDelta,
  freezeOracle,
  renderOracleReport,
  writeKnownDelta,
  writeOracleBundle,
} from './lib/oracle-bundle.mjs';
import { NO_KNOWN_DELTA, reconcile, renderReconciliation } from './lib/reconcile.mjs';

/** The project this entry point belongs to: `.claude/scripts/workspacify-reverse` walked back to the root. */
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const SUBCOMMANDS = ['detect', 'scrub', 'verify', 'regression', 'holdout', 'oracle'];

/**
 * The subcommands whose subject is a tree the caller names.
 *
 * `regression`, `holdout` and `oracle` measure the project this entry point
 * belongs to and take no root; the rest read whatever tree they are handed.
 * Missing one must be an error rather than a report over `undefined`, which
 * reads as a clean tree and is the answer a broken invocation must never give.
 */
const ROOT_TAKING_SUBCOMMANDS = ['detect', 'scrub', 'verify'];

/** The options that name a value; every other `--name` is a switch. */
const VALUE_TAKING_FLAGS = ['--project-root', '--frozen-at', '--stage', '--candidate'];

const HOLDOUT_ACTIONS = ['freeze', 'isolation'];
const ORACLE_ACTIONS = ['freeze', 'compare', 'delta'];

const USAGE = [
  'Usage: run.mjs <detect|scrub|verify> <root> [options]',
  '       run.mjs regression <capture|check>',
  '       run.mjs holdout [freeze|isolation <root>] [--project-root=<path>] [--frozen-at=<ISO-8601>]',
  '       run.mjs oracle <freeze|compare --stage <stage> --candidate <path>> [--project-root=<path>] [--frozen-at=<ISO-8601>]',
  '',
  '  detect <root>                    Report L1-L4 traces as Markdown',
  '  scrub  <root> [--dry-run]        Report what would be removed',
  '  scrub  <root> --apply            Remove L1/L2 traces and rename keyed files',
  '  verify <root>                    Exit 0 when no trace remains, 1 otherwise',
  '  regression capture               Freeze the forward rotation as it behaves now',
  '  regression check                 Exit 0 when every frozen value is reproduced',
  '  holdout                          Verify the ledger and isolate every frozen holdout',
  '  holdout freeze                   Freeze the declared candidates, append-only',
  '  holdout isolation <root>         Exit 0 when no ground truth is reachable, 1 otherwise',
  '  oracle freeze                    Extract the answer key into a frozen bundle',
  '  oracle delta                     Measure the two trees and rewrite KNOWN-DELTA.json',
  '  oracle compare                   List the disagreements for one stage, never a score',
  '',
  'Options:',
  '  --apply                      Perform the removal (scrub only)',
  '  --dry-run                    Plan only; never write (scrub only)',
  '  --rename-ticket-keyed-files  Also strip ticket keys from file names',
  '  --json                       Emit a JSON sidecar in addition to Markdown',
  '  --project-root=<path>        Project holding the ledger and the bundle (default: cwd)',
  '  --frozen-at=<ISO-8601>       Freeze timestamp recorded in the artefact',
  '  --stage=<stage>              Stage to compare (oracle compare)',
  '  --candidate=<path>           The stage output document (oracle compare)',
].join('\n');

/** `--name=value` or `--name value`, whichever the caller wrote. */
function flagValue(args, name) {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name) return args[index + 1] ?? null;
    if (args[index].startsWith(`${name}=`)) return args[index].slice(name.length + 1);
  }
  return null;
}

/**
 * The arguments that are not options and are not an option's value.
 *
 * `--project-root <path>` and `--project-root=<path>` are both accepted, so the
 * token after a bare flag belongs to that flag. Without skipping it, a command
 * carrying both a flag and a positional would read the flag's value as the
 * positional — and `holdout isolation --project-root <p> <target>` would inspect
 * `<p>` while reporting on `<target>`.
 *
 * Only the flags that name a value consume the next token. A switch consumes
 * nothing, so `verify --json <tree>` keeps `<tree>` as the root instead of
 * discarding it and verifying a path named `--json`.
 */
function positionalArgs(args) {
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token.startsWith('--')) {
      if (!token.includes('=') && VALUE_TAKING_FLAGS.includes(token)) index += 1;
      continue;
    }
    positionals.push(token);
  }
  return positionals;
}

function parseArgs(argv) {
  const [subcommand, second, ...rest] = argv;
  const flags = new Set(rest);
  const common = {
    subcommand,
    apply: flags.has('--apply'),
    dryRun: flags.has('--dry-run'),
    renameTicketKeyedFiles: flags.has('--rename-ticket-keyed-files'),
    json: flags.has('--json'),
  };

  if (subcommand === 'regression') {
    // The gate measures the project the operator is standing in — the one whose
    // `.claude/scripts/...` path named this entry point. Requiring a root
    // argument would make the command unrunnable by the automated sessions that
    // run it before every later ticket's step.
    return { ...common, action: second, root: process.cwd() };
  }

  if (subcommand === 'holdout' || subcommand === 'oracle') {
    const actions = subcommand === 'holdout' ? HOLDOUT_ACTIONS : ORACLE_ACTIONS;
    // The action is positional, so the option list has to start after the
    // subcommand rather than after the action: `holdout --project-root <p>` is
    // a legitimate invocation with no action at all. A bare `holdout` writes
    // neither, and the argument list a flag scan sees must then hold no entry at
    // all rather than one absent value.
    const optionArgs = [second, ...rest].filter((value) => value !== undefined);
    const action = actions.includes(second) ? second : null;
    // Only `holdout isolation <root>` takes a bare argument; every other value
    // is named by a flag, so a stray positional is never guessed at.
    const positional = action === 'isolation' ? positionalArgs(optionArgs.slice(1))[0] ?? null : null;
    return {
      ...common,
      action,
      positional,
      projectRoot: flagValue(optionArgs, '--project-root') ?? process.cwd(),
      frozenAt: flagValue(optionArgs, '--frozen-at'),
      stage: flagValue(optionArgs, '--stage'),
      candidate: flagValue(optionArgs, '--candidate'),
    };
  }

  // The root is the first bare argument, never a switch: `verify --json <tree>`
  // must verify `<tree>` rather than a directory named `--json`, which does not
  // exist and would be reported clean.
  return { ...common, root: positionalArgs(argv.slice(1))[0] ?? null };
}

function runDetect({ root, json }) {
  const report = detectForwardTraces(root);
  process.stdout.write(`${report.markdown}\n`);
  if (json) {
    process.stdout.write(`\n\`\`\`json\n${JSON.stringify(report.layers, null, 2)}\n\`\`\`\n`);
  }
  return 0;
}

function runScrub({ root, apply, dryRun, renameTicketKeyedFiles, json }) {
  if (!apply) {
    const plan = planScrub(detectForwardTraces(root));
    const lines = [
      '## Scrub plan (no changes written)',
      '',
      `Removals planned: ${plan.removals.length}`,
      '',
    ];
    for (const removal of plan.removals.slice(0, 20)) {
      lines.push(`- [${removal.layer}] \`${removal.file}:${removal.line}\` ${removal.text.trim()}`);
    }
    process.stdout.write(`${lines.join('\n')}\n`);
    return 0;
  }

  const result = scrubForwardTraces(root, { apply: true, dryRun, renameTicketKeyedFiles });
  const lines = [
    '## Scrub result',
    '',
    `Lines removed: ${result.removed}`,
    `Files written: ${result.writes.length}`,
    `Files renamed: ${result.renames.length}`,
    '',
  ];
  for (const warning of result.warnings) {
    lines.push(`- WARNING \`${warning.file}:${warning.line}\` ${warning.reason}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  if (json) {
    process.stdout.write(`\n\`\`\`json\n${JSON.stringify(result.renames, null, 2)}\n\`\`\`\n`);
  }
  return 0;
}

function runVerify({ root }) {
  const result = verifyScrub(root);
  process.stdout.write(`${renderVerification(result, root)}\n`);
  return exitCodeFor(result);
}

/**
 * Freeze, or reproduce, the forward rotation's observable output.
 *
 * A missing baseline is an operator error and is reported in one line rather
 * than as a stack trace: the gate's job is to name what is wrong.
 */
function runRegression({ action, root }) {
  if (action === 'capture') {
    process.stdout.write(`${renderCaptureReport(captureBaselines({ projectRoot: root }))}\n`);
    return 0;
  }
  if (action === 'check') {
    let result;
    try {
      result = checkBaselines({ projectRoot: root });
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    process.stdout.write(`${renderCheckReport(result)}\n`);
    return result.verdict === 'proved' ? 0 : 1;
  }
  process.stderr.write(`${USAGE}\n`);
  return 2;
}

/**
 * Freeze, verify and isolate the projects generality is measured against.
 *
 * Freezing a candidate that is not present writes a ledger saying so rather
 * than failing: "none were selected" is a fact about the checkout, and the
 * design treats it as a reportable state rather than an error. Everything else
 * that is wrong — drift, contamination — exits non-zero.
 */
function runHoldout({ action, positional, projectRoot, frozenAt }) {
  if (action === 'isolation') {
    if (!positional) {
      process.stderr.write(`${USAGE}\n`);
      return 2;
    }
    const result = verifyIsolation(positional);
    process.stdout.write(`${renderIsolationReport(result, positional)}\n`);
    return result.clean ? 0 : 1;
  }

  if (action === 'freeze') {
    const declarationPath = join(projectRoot, CANDIDATES_RELATIVE_PATH);
    if (!existsSync(declarationPath)) {
      process.stderr.write(`no candidate declaration is present at ${CANDIDATES_RELATIVE_PATH} under ${projectRoot}\n`);
      return 1;
    }
    const declaration = JSON.parse(readFileSync(declarationPath, 'utf8'));
    let ledger;
    try {
      ledger = freezeLedger({ projectRoot, candidates: declaration.candidates ?? [], frozenAt });
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    process.stdout.write(
      `Frozen ${ledger.holdouts.length} holdout(s) into \`${LEDGER_RELATIVE_PATH}\`; `
      + `${ledger.notSelected.length} declared candidate(s) were not selected.\n\n`,
    );
    process.stdout.write(`${renderLedgerReport(loadLedger({ projectRoot }))}\n`);
    return 0;
  }

  let loaded;
  try {
    loaded = loadLedger({ projectRoot });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }

  process.stdout.write(`${renderLedgerReport(loaded)}\n`);
  const contaminated = [];
  for (const entry of loaded.ledger.holdouts ?? []) {
    const root = join(projectRoot, entry.path);
    if (!existsSync(root)) continue;
    // A holdout has not been forward rotated, so its own README is its
    // documentation rather than a derived answer key.
    const isolation = verifyIsolation(root, { patterns: FORWARD_ROTATION_PATTERNS });
    process.stdout.write(`${renderIsolationReport(isolation, root)}\n`);
    if (!isolation.clean) contaminated.push(entry.id);
  }

  if (loaded.drifted.length > 0 || contaminated.length > 0) {
    process.stderr.write(
      `holdout verification failed: ${loaded.drifted.length} drifted, ${contaminated.length} contaminated `
      + `(${[...loaded.drifted.map((entry) => entry.id), ...contaminated].join(', ')})\n`,
    );
    return 1;
  }
  return 0;
}

/**
 * Freeze the answer key, or compare one stage's output against it.
 *
 * A comparison refuses to run against an oracle whose digest has changed, and
 * reports disagreements by name. It never reports a score: classifying a
 * disagreement is a human's work.
 */
function runOracle({ action, projectRoot, frozenAt, stage, candidate }) {
  if (action === 'freeze') {
    const oracleRoot = join(projectRoot, ORACLE_TREE_RELATIVE_PATH);
    let bundle;
    try {
      bundle = freezeOracle({ oracleRoot, frozenAt });
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    writeOracleBundle({ projectRoot, bundle });
    process.stdout.write(`Frozen the answer key into \`${BUNDLE_RELATIVE_PATH}\`.\n\n`);
    process.stdout.write(`${renderOracleReport({ bundle })}\n`);
    return 0;
  }

  if (action === 'delta') {
    const oracleRoot = join(projectRoot, ORACLE_TREE_RELATIVE_PATH);
    const subjectRoot = join(projectRoot, SUBJECT_TREE_RELATIVE_PATH);
    if (!existsSync(oracleRoot) || !existsSync(subjectRoot)) {
      process.stderr.write(
        `the delta measures two trees and one is absent: ${ORACLE_TREE_RELATIVE_PATH} and ${SUBJECT_TREE_RELATIVE_PATH} must both be present under ${projectRoot}\n`,
      );
      return 1;
    }
    const delta = extractKnownDelta({ oracleRoot, subjectRoot });
    writeKnownDelta({ projectRoot, delta });
    process.stdout.write(
      `Wrote the measured delta to \`${KNOWN_DELTA_RELATIVE_PATH}\`: `
      + `${delta.counts.differing} differing shared file(s), ${delta.counts.onlyInOracle} answer-key-only path(s), `
      + `${delta.renamedTestFiles.length} rename(s) recovered, ${delta.unresolvedRenames.length} unresolved.\n\n`,
    );
    return 0;
  }

  if (action === 'compare') {
    if (!stage || !candidate) {
      process.stderr.write(`${USAGE}\n`);
      return 2;
    }
    const knownDeltaPath = join(projectRoot, KNOWN_DELTA_RELATIVE_PATH);
    const knownDelta = existsSync(knownDeltaPath) ? JSON.parse(readFileSync(knownDeltaPath, 'utf8')) : NO_KNOWN_DELTA;
    let result;
    try {
      result = reconcile({ stage, projectRoot, candidatePath: candidate, knownDelta });
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    process.stdout.write(`${renderReconciliation(result)}\n`);
    return 0;
  }

  process.stderr.write(`${USAGE}\n`);
  return 2;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.subcommand || !SUBCOMMANDS.includes(options.subcommand)) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  if (ROOT_TAKING_SUBCOMMANDS.includes(options.subcommand) && !options.root) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  if (options.subcommand === 'detect') return runDetect(options);
  if (options.subcommand === 'scrub') return runScrub(options);
  if (options.subcommand === 'regression') return runRegression(options);
  if (options.subcommand === 'holdout') return runHoldout(options);
  if (options.subcommand === 'oracle') return runOracle(options);
  return runVerify(options);
}

process.exitCode = main();
