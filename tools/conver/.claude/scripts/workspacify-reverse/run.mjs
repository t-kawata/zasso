// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
// [::TICKET::] P22-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-2 --for-spec --no-implementation-order`.
/**
 * Command entry point for /workspacify-reverse trace hygiene and experiment design.
 *
 * Eight subcommands, each deterministic:
 *   detect     — report the forward-rotation traces in a tree
 *   scrub      — remove the removable ones (or plan the removal with --dry-run)
 *   verify     — re-detect and exit non-zero when residue remains
 *   regression — freeze, or reproduce, the forward rotation's observable output
 *   holdout    — freeze, verify and isolate the projects generality is measured on
 *   oracle     — freeze the answer key, or compare a stage's output against it
 *   spike      — run one vertical slice and measure it, then reconcile it against
 *                the frozen answer key
 *   analyze    — fix the analysis boundary and measure structure, dependencies and
 *                the execution surface, publishing outside the target
 *
 * The process performs no semantic judgement: which traces exist and whether
 * they are gone are facts, not opinions. Deciding what the cleaned tree then
 * means belongs to the reverse-rotation analysis, not here. The regression
 * gate speaks only of *proved* and *not proved*, and the reconciliation emits a
 * disagreement list rather than a score, for the same reason.
 *
 * `spike` is the one subcommand split across two runs, and the split is the
 * point: the run that measures a slice reads the subject root and nothing else,
 * and only the later `spike reconcile` opens the frozen bundle. An executor that
 * could reach the answer key would be measuring itself.
 *
 * `holdout` and `oracle` read and write the project they are pointed at, which
 * defaults to the working directory: the automated sessions that run them
 * before every later ticket's step stand in the project root.
 */
import process from 'node:process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
import { ANALYSIS_STAGES, analyzeProject, buildPartitionCandidate, renderDisagreements, renderSpikeReport, runSpike } from './lib/scope.mjs';
import { buildClaimCandidate, renderClaimLedger } from './lib/claim-ledger.mjs';
import { renderCardsMarkdown } from './lib/packet.mjs';

/** The project this entry point belongs to: `.claude/scripts/workspacify-reverse` walked back to the root. */
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const SUBCOMMANDS = ['detect', 'scrub', 'verify', 'regression', 'holdout', 'oracle', 'spike', 'analyze'];

/**
 * The subcommands whose subject is a tree the caller names.
 *
 * `regression`, `holdout` and `oracle` measure the project this entry point
 * belongs to and take no root; the rest read whatever tree they are handed.
 * Missing one must be an error rather than a report over `undefined`, which
 * reads as a clean tree and is the answer a broken invocation must never give.
 */
const ROOT_TAKING_SUBCOMMANDS = ['detect', 'scrub', 'verify', 'analyze'];

/** The options that name a value; every other `--name` is a switch. */
const VALUE_TAKING_FLAGS = ['--project-root', '--frozen-at', '--stage', '--candidate', '--out', '--recorded', '--through'];

/** Where an analysis publishes its sidecars when the caller names no directory. */
const ANALYSIS_OUTPUT_DIRECTORY = 'tests/workspacify-reverse/analysis';

const HOLDOUT_ACTIONS = ['freeze', 'isolation'];
const ORACLE_ACTIONS = ['freeze', 'compare', 'delta'];
const SPIKE_ACTIONS = ['reconcile'];

/** Where a spike writes the candidate documents `oracle compare` consumes. */
const SPIKE_CANDIDATES_DIRECTORY = 'tests/workspacify-reverse/spike/candidates';

/** Where the spike's measurement report lives. Declared by the ticket, so it is not configurable. */
const SPIKE_REPORT_RELATIVE_PATH = 'docs/SPIKE-REPORT.md';

/** The stages one vertical slice reaches: a partition decision, and its claim candidates. */
const SPIKE_STAGES = Object.freeze(['r1', 'r3']);

const USAGE = [
  'Usage: run.mjs <detect|scrub|verify> <root> [options]',
  '       run.mjs analyze <root> [--through=<stage>] [--out=<dir>]',
  '       run.mjs regression <capture|check>',
  '       run.mjs holdout [freeze|isolation <root>] [--project-root=<path>] [--frozen-at=<ISO-8601>]',
  '       run.mjs oracle <freeze|compare --stage <stage> --candidate <path>> [--project-root=<path>] [--frozen-at=<ISO-8601>]',
  '       run.mjs spike <root> <slice> [--project-root=<path>] [--recorded=<json>] [--out=<dir>]',
  '       run.mjs spike reconcile [--project-root=<path>] [--out=<dir>]',
  '',
  '  detect <root>                    Report L1-L4 traces as Markdown',
  '  scrub  <root> [--dry-run]        Report what would be removed',
  '  scrub  <root> --apply            Remove L1/L2 traces and rename keyed files',
  '  verify <root>                    Exit 0 when no trace remains, 1 otherwise',
  '  analyze <root>                   Fix the boundary and measure R0 through R3.5, writing outside the target',
  '  regression capture               Freeze the forward rotation as it behaves now',
  '  regression check                 Exit 0 when every frozen value is reproduced',
  '  holdout                          Verify the ledger and isolate every frozen holdout',
  '  holdout freeze                   Freeze the declared candidates, append-only',
  '  holdout isolation <root>         Exit 0 when no ground truth is reachable, 1 otherwise',
  '  oracle freeze                    Extract the answer key into a frozen bundle',
  '  oracle delta                     Measure the two trees and rewrite KNOWN-DELTA.json',
  '  oracle compare                   List the disagreements for one stage, never a score',
  '  spike <root> <slice>             Run one vertical slice through R0.5, R3.5 and R7, and measure it',
  '  spike reconcile                  Add the disagreement list to the spike report, from the frozen bundle',
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
  '  --through=<stage>            Last stage an analysis runs, inclusive (analyze; default r2.5)',
  '  --recorded=<path>            JSON holding the interventions and decision samples a spike recorded',
  '  --out=<dir>                  Where an analysis or a spike writes its documents',
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

/** The switches every subcommand shares; an unrecognised `--name` is simply absent. */
function commonOptions(subcommand, rest) {
  const flags = new Set(rest);
  return {
    subcommand,
    apply: flags.has('--apply'),
    dryRun: flags.has('--dry-run'),
    renameTicketKeyedFiles: flags.has('--rename-ticket-keyed-files'),
    json: flags.has('--json'),
  };
}

/** The option tokens a subcommand was given: the action, then every flag. */
function optionTokens(second, rest) {
  return [second, ...rest].filter((value) => value !== undefined);
}

function parseLedgerArguments(subcommand, second, rest) {
  const actions = subcommand === 'holdout' ? HOLDOUT_ACTIONS : ORACLE_ACTIONS;
  // The action is positional, so the option list has to start after the
  // subcommand rather than after the action: `holdout --project-root <p>` is
  // a legitimate invocation with no action at all. A bare `holdout` writes
  // neither, and the argument list a flag scan sees must then hold no entry at
  // all rather than one absent value.
  const optionArgs = optionTokens(second, rest);
  const action = actions.includes(second) ? second : null;
  // Only `holdout isolation <root>` takes a bare argument; every other value
  // is named by a flag, so a stray positional is never guessed at.
  const positional = action === 'isolation' ? positionalArgs(optionArgs.slice(1))[0] ?? null : null;
  return {
    action,
    positional,
    projectRoot: flagValue(optionArgs, '--project-root') ?? process.cwd(),
    frozenAt: flagValue(optionArgs, '--frozen-at'),
    stage: flagValue(optionArgs, '--stage'),
    candidate: flagValue(optionArgs, '--candidate'),
  };
}

function parseSpikeArguments(second, rest, argv) {
  const optionArgs = optionTokens(second, rest);
  const projectRoot = flagValue(optionArgs, '--project-root') ?? process.cwd();
  const out = flagValue(optionArgs, '--out');

  if (SPIKE_ACTIONS.includes(second)) {
    return { action: second, projectRoot, out };
  }
  // `spike <root> <slice>`: both are bare arguments, so a switch is never read
  // as one. Reading `--out` as the slice name would resolve a slice called
  // `--out` and report it unresolved, which looks like a finding about the tree.
  const positionals = positionalArgs(argv.slice(1));
  return {
    action: null,
    root: positionals[0] ?? null,
    slice: positionals[1] ?? null,
    projectRoot,
    out,
    recorded: flagValue(optionArgs, '--recorded'),
  };
}

// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const [subcommand, second, ...rest] = argv;
  const common = commonOptions(subcommand, rest);

  if (subcommand === 'regression') {
    // The gate measures the project the operator is standing in — the one whose
    // `.claude/scripts/...` path named this entry point. Requiring a root
    // argument would make the command unrunnable by the automated sessions that
    // run it before every later ticket's step.
    return { ...common, action: second, root: process.cwd() };
  }

  if (subcommand === 'spike') {
    return { ...common, ...parseSpikeArguments(second, rest, argv) };
  }

  if (subcommand === 'holdout' || subcommand === 'oracle') {
    return { ...common, ...parseLedgerArguments(subcommand, second, rest) };
  }

  if (subcommand === 'analyze') {
    const optionArgs = optionTokens(second, rest);
    // `--through` selects an inclusive prefix of the stages, so the default has
    // to be the last one rather than a hardcoded name: a stage added later must
    // be run by default instead of silently skipped.
    return {
      ...common,
      root: positionalArgs(argv.slice(1))[0] ?? null,
      through: flagValue(optionArgs, '--through') ?? ANALYSIS_STAGES[ANALYSIS_STAGES.length - 1],
      out: flagValue(optionArgs, '--out'),
    };
  }

  // The root is the first bare argument, never a switch: `verify --json <tree>`
  // must verify `<tree>` rather than a directory named `--json`, which does not
  // exist and would be reported clean.
  return { ...common, root: positionalArgs(argv.slice(1))[0] ?? null };
}

/**
 * Fix the analysis boundary over a tree and measure it, writing outside the target.
 *
 * The destination defaults to a directory this project owns rather than to the
 * caller's working directory, because publishing into the tree being measured is
 * refused and a default that could be refused would make the command fail for a
 * reason the caller did not choose.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function runAnalyze({ root, through, out }) {
  if (!root) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const destination = out === null ? join(PROJECT_ROOT, ANALYSIS_OUTPUT_DIRECTORY) : resolve(out);

  let outcome;
  try {
    outcome = analyzeProject({ root, out: destination, through });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }

  process.stdout.write(`${outcome.report}\n`);
  process.stdout.write(
    `\nStages ${outcome.stagesRun.map((stage) => `\`${stage}\``).join(', ')} published to \`${destination}\`.\n`,
  );
  return 0;
}

// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
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

/** Where a spike's candidate documents go unless the caller names somewhere else. */
function resolveCandidatesDirectory(projectRoot, out) {
  return out ?? join(projectRoot, SPIKE_CANDIDATES_DIRECTORY);
}

/** The recorded inputs a run is measured with, or `null` when none were supplied. */
function readRecordedInputs(recordedPath) {
  if (!recordedPath) return null;
  return JSON.parse(readFileSync(recordedPath, 'utf8'));
}

/** Write a file, creating the directory it lives in: a fresh project has neither. */
function writeDocument(fullPath, contents) {
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents);
  return fullPath;
}

/** Write a candidate document in the shape `oracle compare` reads. */
function writeCandidateDocument(fullPath, document) {
  return writeDocument(fullPath, `${JSON.stringify(document, null, 2)}\n`);
}

/**
 * Run one vertical slice and write what it measured.
 *
 * The executor reads the subject root and nothing else: it never opens the
 * answer key, and it must complete in a project that has none. The report it
 * writes states the measured values, the extrapolation and the limits, and says
 * plainly that the comparison has not been run — because an unrun comparison is
 * not agreement.
 */
function runSpikeSlice({ root, slice, projectRoot, out, recorded }) {
  if (!root || !slice) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  let outcome;
  try {
    outcome = runSpike({ root, slice, recorded: readRecordedInputs(recorded) });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }

  const directory = resolveCandidatesDirectory(projectRoot, out);
  const partitionPath = writeCandidateDocument(join(directory, 'r1.candidate.json'), buildPartitionCandidate(outcome.slice));
  const claimPath = writeCandidateDocument(join(directory, 'r3.candidate.json'), buildClaimCandidate(outcome.ledger));
  const reportPath = writeDocument(
    join(projectRoot, SPIKE_REPORT_RELATIVE_PATH),
    renderSpikeReport(outcome.measurement, { reconciliation: [], targetDigest: outcome.measurement.targetDigest }),
  );

  process.stdout.write(`${renderClaimLedger(outcome.ledger)}\n`);
  process.stdout.write(`${renderCardsMarkdown(outcome.cards)}\n`);
  process.stdout.write(
    `\n## Spike run\n\n`
    + `The slice \`${outcome.slice.slice}\` resolved to ${outcome.slice.directories.length} director(ies) and `
    + `${outcome.slice.seeds.length} seed file(s), producing ${outcome.ledger.claims.length} claim(s) and `
    + `${outcome.cards.length} card(s).\n\n`
    + `Candidates: \`${partitionPath}\`, \`${claimPath}\`\n`
    + `Report: \`${reportPath}\`\n\n`
    + `Run \`run.mjs spike reconcile\` to add the disagreement list from the frozen bundle.\n`,
  );
  return 0;
}

/**
 * Compare the slice's output against the frozen answer key, afterwards.
 *
 * This is the only half that reads the oracle, and it reads the frozen bundle
 * through P22-2's instrument — which refuses to run at all if the answer key has
 * changed since it was frozen, because a comparison against a modified answer
 * key measures nothing.
 */
function runSpikeReconciliation({ projectRoot, out }) {
  const reportPath = join(projectRoot, SPIKE_REPORT_RELATIVE_PATH);
  if (!existsSync(reportPath)) {
    process.stderr.write(
      `no spike report is present at ${SPIKE_REPORT_RELATIVE_PATH} — run "run.mjs spike <root> <slice>" first\n`,
    );
    return 1;
  }

  const knownDeltaPath = join(projectRoot, KNOWN_DELTA_RELATIVE_PATH);
  const knownDelta = existsSync(knownDeltaPath) ? JSON.parse(readFileSync(knownDeltaPath, 'utf8')) : NO_KNOWN_DELTA;
  const directory = resolveCandidatesDirectory(projectRoot, out);

  const reconciliation = [];
  for (const stage of SPIKE_STAGES) {
    try {
      const result = reconcile({
        stage,
        projectRoot,
        candidatePath: join(directory, `${stage}.candidate.json`),
        knownDelta,
      });
      reconciliation.push({ stage, markdown: renderReconciliation(result) });
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
  }

  const existing = readFileSync(reportPath, 'utf8');
  const headingIndex = existing.indexOf('## Disagreements');
  const reportBody = headingIndex === -1 ? `${existing}\n## Disagreements\n\n` : existing.slice(0, headingIndex);
  writeDocument(reportPath, `${reportBody}## Disagreements\n\n${renderDisagreements(reconciliation)}\n`);

  process.stdout.write(`${reconciliation.map((entry) => entry.markdown).join('\n')}\n`);
  return 0;
}

function runSpikeSubcommand(options) {
  if (options.action === 'reconcile') return runSpikeReconciliation(options);
  return runSpikeSlice(options);
}

// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
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
  if (options.subcommand === 'spike') return runSpikeSubcommand(options);
  if (options.subcommand === 'analyze') return runAnalyze(options);
  return runVerify(options);
}

process.exitCode = main();
