// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
// [::TICKET::] P22-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-2 --for-spec --no-implementation-order`.
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
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
 *   analyze    — the entrance to the reverse rotation. It fixes the analysis
 *                boundary, measures structure, dependencies and the execution
 *                surface, and runs R0 through R8 in series, publishing the origin
 *                spec into the reserved directory beneath the subject. The
 *                documents it publishes are the ones the stages produce, so the
 *                set is the same whatever the host has installed.
 *   gate       — the check after the run: are the six decisions recorded?
 *
 * Six more perform the mechanical half of one Step of the procedure each, so that a
 * Step names a command rather than asking its reader to derive by eye what a function
 * already computes. `pattern` answers Step 0 from the same function R0 calls;
 * `inventory` records what the subject already holds for Step 1; `status` holds the
 * destination to what the exit owes it for Steps 3 and 4; `decide` writes the six
 * answers through the schema the gate reads for Step 5; `seam` reports where the prior
 * partition and the fixed one differ for Step 6; and `report` prints the stages, the
 * destination and the outcome for Step 8.
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
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { detectForwardTraces } from './lib/detect-forward-traces.mjs';
import { planScrub, scrubForwardTraces } from './lib/scrub-forward-traces.mjs';
import { verifyScrub, exitCodeFor, renderVerification } from './lib/verify-scrub.mjs';
import { captureBaselines, checkBaselines, renderCaptureReport, renderCheckReport } from './lib/regression-gate.mjs';
import { CANDIDATES_RELATIVE_PATH, LEDGER_RELATIVE_PATH, RESERVED_REVERSE_SUBDIRECTORY, RESERVED_ROOT_NAME, freezeLedger, loadLedger, renderLedgerReport, reservedReverseDirectory } from './lib/holdout-ledger.mjs';
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
import { ANALYSIS_STAGES, analyzeProject, buildPartitionCandidate, renderDisagreements, renderSpikeReport, runSpike, stageLabel } from './lib/scope.mjs';
import { buildClaimCandidate, renderClaimLedger } from './lib/claim-ledger.mjs';
import { renderCardsMarkdown } from './lib/packet.mjs';
import {
  findSchemaViolations,
  readReverseDecisions,
  renderDecisionsAdvice,
  renderDecisionsVerdict,
  verifyReverseDecisions,
} from './lib/reverse-decisions.mjs';
import {
  RESERVED_DECISIONS_FILE_NAME,
  reservedReverseDecisionsPath,
} from '../workspacify-tree/lib/reserved-root.mjs';
import { readAnswers, renderDecisionWritingAdvice, renderDecisionWritingVerdict, writeDecisions } from './lib/decision-writing.mjs';
import { readInventory, renderInventory } from './lib/inventory.mjs';
import { detectPatternAt, renderPatternDetection } from './lib/pattern-detection.mjs';
import { findUnpublished, readPublishedSet, renderPublishedSet, renderUnpublishedAdvice } from './lib/published-set.mjs';
import { computeSeam, readFixedPartitionPaths, readPriorPartitionPaths, renderSeam, renderSeamAdvice } from './lib/seam.mjs';
import { readStepReport, renderReportAdvice, renderStepReport } from './lib/step-report.mjs';

const SUBCOMMANDS = [
  'detect', 'scrub', 'verify', 'regression', 'holdout', 'oracle', 'spike', 'analyze', 'gate',
  'pattern', 'inventory', 'decide', 'status', 'seam', 'report',
];

/**
 * The subcommands whose subject is the directory the command is run in, and
 * which therefore take no argument at all.
 *
 * These five measure a subject the operator is standing in. `regression` says so
 * in its own comment; the others say it here, because the same rule is what makes
 * a run reproducible from its directory alone. `gate` reads the decisions document
 * from the reserved directory beneath that subject rather than from a path the
 * caller names — a caller who named one would be naming a document this command
 * already knows the place of. A subcommand that names a fixture instead —
 * `holdout isolation <root>`, `spike <root> <slice>`, and the ledger flags the
 * experiment instruments carry — keeps its argument, because *which* fixture is a
 * choice with no derivable answer.
 *
 * The six Step-level subcommands measure the same subject the other five do, so they
 * are argument-free for the same reason: `decide` names the file it reads with
 * `--answers`, which is an option rather than a positional, and a bare path is refused
 * for all six.
 */
const ARGUMENT_FREE_SUBCOMMANDS = ['analyze', 'detect', 'scrub', 'verify', 'gate', 'pattern', 'inventory', 'decide', 'status', 'seam', 'report'];

/** The options that name a value; every other `--name` is a switch. */
const VALUE_TAKING_FLAGS = ['--project-root', '--frozen-at', '--stage', '--candidate', '--recorded', '--answers'];

/**
 * The options the entrance used to honour and no longer does, with the reason each left.
 *
 * A withdrawn option is refused rather than ignored. The entrance ignores a switch it
 * does not know, which is the right answer for a typo and the wrong one here: a caller
 * asking a question the instrument can no longer answer would receive a complete-looking
 * analysis with the question silently dropped, and a question dropped in silence reads
 * exactly like a search that found nothing. The refusal is raised as the same kind of
 * error an unknown stage raises, so it is reported by the same path and publishes
 * nothing, for the same reason.
 */
const WITHDRAWN_OPTIONS = Object.freeze({
  '--query': 'the serving layer asks no search tool anything, so the question would be dropped in silence; '
    + 'ask a search tool directly and read what it returns as candidates, never as findings.',
  '--out': 'the destination is not selectable. The analysis publishes into the reserved directory beneath '
    + 'the directory the command is run in, and a spike writes its candidates where `oracle compare` reads '
    + 'them; both are declared, so a caller who named somewhere else would leave the next command reading '
    + 'a directory nobody filled.',
  '--through': 'the command line has no prefix instrument. The API can still stop at a stage, but a run '
    + 'from here reaches the last declared stage or publishes nothing.',
});

/**
 * The withdrawn options present in an argument list, as the tokens the caller wrote.
 *
 * The whole token travels rather than the option's name, so `--through=r99` is
 * reported with the stage the caller asked for in it. A refusal that named only
 * the option would leave the value it was given unaccounted for, which is the
 * same dropped question the refusal exists to prevent.
 */
// [::TICKET::] P25-7, PX-213, PX-214 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-7|PX-213|PX-214) --for-spec --no-implementation-order`.
function withdrawnOptionsUsed(optionArgs) {
  return optionArgs.flatMap((token) => {
    const name = Object.keys(WITHDRAWN_OPTIONS)
      .find((candidate) => token === candidate || token.startsWith(`${candidate}=`));
    return name === undefined ? [] : [{ name, token }];
  });
}

/** Refuse a withdrawn option, naming it and the reason it cannot be honoured. */
// [::TICKET::] P25-7, PX-213, PX-214 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-7|PX-213|PX-214) --for-spec --no-implementation-order`.
function refuseWithdrawnOptions(withdrawn) {
  if (withdrawn.length === 0) return;
  const reasons = withdrawn.map(({ name, token }) => `${token}: ${WITHDRAWN_OPTIONS[name]}`).join(' ');
  throw new Error(`withdrawn option ${withdrawn.map(({ token }) => JSON.stringify(token)).join(', ')} — ${reasons}`);
}

/**
 * Refuse a bare argument the entrance was handed.
 *
 * The entrance takes none: its subject is the directory it is run in, and its
 * destination is the reserved directory beneath that. Ignoring a root the caller
 * supplied would leave them believing a run had been scoped when the scope was
 * never theirs — the same dropped question the withdrawn options are refused
 * for, and the reason this names the argument rather than discarding it.
 */
// [::TICKET::] PX-213, PX-214 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-213|PX-214) --for-spec --no-implementation-order`.
function refusePositionalArguments(positionals) {
  if (positionals.length === 0) return;
  throw new Error(
    `the subcommand takes no arguments, and ${positionals.map((token) => JSON.stringify(token)).join(', ')} `
    + `was given. The subject is the directory the command is run in (${process.cwd()}), and the documents `
    + `are published into ${RESERVED_ROOT_NAME}/${RESERVED_REVERSE_SUBDIRECTORY} beneath it; neither is selectable`,
  );
}

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
  'Usage: run.mjs <detect|scrub|verify|analyze|gate|pattern|inventory|decide|status|seam|report> [options]',
  '       run.mjs regression <capture|check>',
  '       run.mjs holdout [freeze|isolation <root>] [--project-root=<path>] [--frozen-at=<ISO-8601>]',
  '       run.mjs oracle <freeze|compare --stage <stage> --candidate <path>> [--project-root=<path>] [--frozen-at=<ISO-8601>]',
  '       run.mjs spike <root> <slice> [--project-root=<path>] [--recorded=<json>]',
  '       run.mjs spike reconcile [--project-root=<path>]',
  '',
  '  detect                           Report L1-L4 traces as Markdown',
  '  scrub [--dry-run]                Report what would be removed',
  '  scrub --apply                    Remove L1/L2 traces and rename keyed files',
  '  verify                           Exit 0 when no trace remains, 1 otherwise',
  `  analyze                          The entrance: run R0 through ${stageLabel(ANALYSIS_STAGES[ANALYSIS_STAGES.length - 1])} in series and publish the origin spec into ${RESERVED_ROOT_NAME}/${RESERVED_REVERSE_SUBDIRECTORY}`,
  `  gate                             Exit 0 when the six decisions are recorded at ${RESERVED_ROOT_NAME}/${RESERVED_REVERSE_SUBDIRECTORY}/${RESERVED_DECISIONS_FILE_NAME}; 1 with the advice otherwise`,
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
  '  pattern                          Identify the pattern of the current directory and report it, without running a stage',
  '  inventory                        Report what the subject already holds: its artefacts, its ticket statuses, its DesignTree and its prior partition',
  '  decide --answers=<path>          Write the six decisions the answers file holds, through the schema the gate reads',
  '  status                           Exit 0 when the destination holds every document the exit owes; 1 naming what is absent or empty',
  '  seam                             Report where the prior partition and the fixed one differ, in both directions',
  '  report                           Print the stages that ran, the destination and proved / not proved',
  '',
  '  detect, scrub, verify, analyze and the six Step-level subcommands measure the directory the command is run in and take no argument.',
  '  holdout isolation and spike name which fixture or slice they act on, so they keep theirs.',
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
  '  --recorded=<path>            JSON holding the interventions and decision samples a spike recorded',
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

/**
 * The switches every subcommand shares.
 *
 * An unrecognised `--name` is simply absent, which is the right answer for a typo.
 * Withdrawn options are the one exception, refused where the subcommand that once read
 * them runs: an option honoured once and ignored now would leave the caller believing
 * their question had been asked when nothing was listening.
 */
// [::TICKET::] P25-7, PX-214, PX-213 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-7|PX-214|PX-213) --for-spec --no-implementation-order`.
function commonOptions(subcommand, optionArgs) {
  // The switches are read from every token after the subcommand, not from the
  // tokens after the second slot: a subcommand that takes no positional puts its
  // first switch in that slot, and reading only what follows it would drop the
  // switch and perform a plan while the caller asked for the removal.
  const flags = new Set(optionArgs);
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

// [::TICKET::] PX-214, PX-213 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-214|PX-213) --for-spec --no-implementation-order`.
function parseSpikeArguments(second, rest, argv) {
  const optionArgs = optionTokens(second, rest);
  const projectRoot = flagValue(optionArgs, '--project-root') ?? process.cwd();
  // The candidate directory is declared rather than chosen: `oracle compare` reads
  // what a spike wrote, so a caller who moved one would leave the other reading a
  // directory nobody filled. It is left unset here so the single resolution point
  // below places it against the project root, which is what keeps a run pointed at
  // a scratch project from writing into whichever tree it happens to stand in.
  const out = null;

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

// [::TICKET::] P22-4, P22-9, P25-7, PX-213, PX-214, P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-4|P22-9|P25-7|PX-213|PX-214|P26-3) --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const [subcommand, second, ...rest] = argv;
  const common = commonOptions(subcommand, optionTokens(second, rest));

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
    // The subject and the destination are both derived from where the operator
    // stands, so neither is read from the argument list. `through` has to be the
    // last declared stage rather than a hardcoded name: a stage added later must
    // be run instead of silently skipped.
    return {
      ...common,
      root: process.cwd(),
      out: reservedReverseDirectory(process.cwd()),
      through: ANALYSIS_STAGES[ANALYSIS_STAGES.length - 1],
      withdrawn: withdrawnOptionsUsed(optionArgs),
      positionals: positionalArgs(argv.slice(1)),
    };
  }

  // Every subcommand that measures a subject measures the one the operator is
  // standing in, so none of them reads a root from the argument list. A bare
  // argument is carried forward rather than dropped, so the refusal can name
  // what was passed: a caller who scoped a run has to learn that the scope was
  // never theirs, and a silently ignored root reads as a scope that was applied.
  return {
    ...common,
    root: process.cwd(),
    withdrawn: withdrawnOptionsUsed(optionTokens(second, rest)),
    positionals: positionalArgs(argv.slice(1)),
    // The one option a Step-level subcommand reads: `decide` writes the answers the
    // reader authored, and the content is theirs rather than derivable from the
    // directory, so it is named rather than read from a fixed place.
    answers: flagValue(optionTokens(second, rest), '--answers'),
  };
}

/**
 * Refuse a decisions argument the gate was handed.
 *
 * The gate reads the document from the path the reserved root derives from the
 * directory the command is run in, and nothing moves it. This mirrors
 * `workspacify-tree/run.mjs`'s refusal for its own gate, for the reason it gives
 * there: the Step that writes the document and the gate that reads it have to be
 * answering about one file, and a path the caller could name is a path two callers
 * can disagree about while each believes it approved the same decisions.
 *
 * The token the caller wrote travels into the message rather than being summarised,
 * because a refusal that named only the option would leave the value unaccounted for.
 */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
function refuseDecisionsArgument(argv) {
  const tokens = argv.filter((token) => token === '--decisions' || token.startsWith('--decisions='));
  if (tokens.length === 0) return;
  throw new Error(
    `the decisions document is read from ${RESERVED_ROOT_NAME}/${RESERVED_REVERSE_SUBDIRECTORY}/`
    + `${RESERVED_DECISIONS_FILE_NAME} beneath the directory the command is run in, which is not selectable, `
    + `and ${tokens.map((token) => JSON.stringify(token)).join(', ')} was given. `
    + 'Remove it and run the gate again.',
  );
}

/**
 * Report a stage that could not run, naming the stage and the input it was reading.
 *
 * "The analysis failed" is not an answer to "what could not be read", so the
 * message names both. It also says that nothing was written, because a run that
 * stopped and a run that finished are indistinguishable from an exit code alone,
 * and a partial origin spec reads exactly like a complete one.
 */
// [::TICKET::] P22-9, PX-214, PX-213 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-9|PX-214|PX-213) --for-spec --no-implementation-order`.
function reportStage({ stage, input, error }) {
  const subject = stage === null ? 'The arguments' : `Stage ${stageLabel(stage)}`;
  process.stderr.write(
    `${subject} could not run.\n`
    + `  Input: root=${input.root} out=${input.out} through=${input.through}\n`
    + `  Why: ${error.message}\n`
    + 'Nothing was published: the run stops before any document is written, so no partial result is left '
    + 'behind that could be mistaken for a complete one.\n',
  );
  return 1;
}

/**
 * The entrance to the reverse rotation: R0 through R8 in series, once.
 *
 * The subject is the directory the command is run in, and the destination is the
 * reserved directory beneath it. Those are the only pair the entrance has: a run
 * is reproducible from its directory alone, and there is no invocation that
 * scopes it elsewhere. The destination is sound beneath the subject because no
 * walk of the analysis descends into it, which is what makes the before-and-after
 * digest a statement about the subject rather than about the run's own output.
 *
 * The pipeline publishes only after every stage has run and the target has been
 * shown unchanged, so a stage that cannot run leaves nothing behind. What it
 * publishes is what the stages produce and nothing beside it, so the set a reader
 * receives does not depend on what the host has installed.
 */
// [::TICKET::] P22-4, P22-9, P23-7, P25-7, PX-213, PX-214, P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-4|P22-9|P23-7|P25-7|PX-213|PX-214|P26-2) --for-spec --no-implementation-order`.
async function runAnalysisPipeline({ root, through, out }) {
  let currentStage = null;
  let outcome;
  try {
    outcome = await analyzeProject({
      root,
      out,
      through,
      options: { onStage: (stage) => { currentStage = stage; } },
    });
  } catch (error) {
    return reportStage({ stage: currentStage, input: { root, out, through }, error });
  }

  process.stdout.write(`${outcome.report}\n`);
  process.stdout.write(`${renderAnalysisVerdict({ outcome, out })}\n`);
  return 0;
}

/**
 * What a completed run leaves behind, stated as the things the next reader relies on.
 *
 * A stage list and a destination answer "did it run". They do not answer "is what it
 * published the whole of what it should have", and that is the question the Steps
 * after this one are built on. So the three properties the run already enforces are
 * re-measured here against what is on disk and printed:
 *
 *   - **the destination holds this run's set and nothing else.** Read from the
 *     directory rather than from the run's own record, because a record that listed
 *     what was meant to be written would agree with itself.
 *   - **the Markdown re-parses to the sidecar beside it.** Measured on the published
 *     pair, not on a re-render, so what is proved is a property of the files.
 *   - **the subject did not move.** `analyzeProject` throws rather than publishing
 *     when it did, so reaching this point is the proof; what the verdict adds is
 *     that the reader is told it was checked.
 *
 * The last line names the Step to go to. An AI that has just watched a two-minute run
 * finish should not have to work out where it now stands.
 */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
function renderAnalysisVerdict({ outcome, out }) {
  const published = readdirSync(out).sort();
  const lines = [
    '',
    `Stages ${outcome.stagesRun.map((stage) => `\`${stage}\``).join(', ')} published to \`${out}\`.`,
    '',
    `  The destination holds ${published.length} document(s), and they are exactly this run's:`,
    '  it was replaced rather than added to, so nothing a previous round left is standing.',
    '',
    '  Verified before anything was written:',
    // "the declared order" would be read against the file's own phrase for the
    // evaluation order, which is a different list. What ran is the declared SET.
    '    - every stage of the declared set ran, and the last declared stage was reached',
    '    - the Markdown re-parses to the sidecar published beside it',
    '    - the subject hashed the same before and after, so nothing outside the destination moved',
    '',
    'Next: ## Step 4: read the material in the order it is needed.',
  ];
  return lines.join('\n');
}


// [::TICKET::] P22-4, P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-4|P26-2) --for-spec --no-implementation-order`.
function runDetect({ root, json }) {
  const report = detectForwardTraces(root);
  process.stdout.write(`${report.markdown}\n`);
  if (json) {
    process.stdout.write(`\n\`\`\`json\n${JSON.stringify(report.layers, null, 2)}\n\`\`\`\n`);
  }
  return 0;
}

// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
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

/**
 * The gate the procedure runs after the analysis: are the six decisions recorded?
 *
 * The entrance measures the subject. This measures the *procedure* — whether the Step
 * that decides left behind what the Steps after it are built on. The distinction is
 * the one the command file's `## Statuses and gates` section lost: it defined a gate
 * as a refusal, design §1.2 forbids refusing a subject for being an incomplete conver
 * project, and so the file forbade every gate. §1.2 is about the subject; a Step that
 * produced nothing is a fact about this run.
 *
 * The decisions are read from the path the reserved root derives from the subject,
 * never from an argument, for the reason `workspacify-tree` and `workspacify-allocate`
 * both give: a caller who named the document would be naming one this command already
 * knows the place of, and a question dropped in silence reads like one answered.
 */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
function runGate({ root }) {
  refuseDecisionsArgument(process.argv.slice(2));
  const path = reservedReverseDecisionsPath(root);
  const out = reservedReverseDirectory(root);
  const { decisions, findings: readFindings } = readReverseDecisions(path);
  const present = existsSync(out) ? readdirSync(out) : [];

  const findings = [
    ...readFindings,
    ...verifyReverseDecisions({ decisions, present }),
    ...(decisions === null ? [] : findSchemaViolations(decisions)),
  ];

  if (findings.length > 0) {
    process.stderr.write(`${renderDecisionsAdvice(findings, { path })}\n`);
    return 1;
  }

  process.stdout.write(`${renderDecisionsVerdict({ path })}\n`);
  return 0;
}

// --- The Step-level subcommands ---------------------------------------------
//
// Each of these performs one Step's mechanical half, so that a Step of the procedure
// names a command instead of asking its reader to derive by eye what a library call
// already computes. They are the same shape as `runGate`: read what the Step is a
// predicate over, print the answer or name what is wrong, and hand the operator the
// exit code they act on. None of them writes into the subject — `decide` writes into
// the reserved destination, which is a member of the never-walked set.

/**
 * Step 0 — the pattern, from the same function the run's R0 calls.
 *
 * [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
 */
// [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
function runPatternStep({ root }) {
  try {
    process.stdout.write(`${renderPatternDetection(detectPatternAt(root))}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(renderStepFailure({ step: 'Step 0', root, error }));
    return 1;
  }
}

/**
 * Step 1 — what the subject already holds, recorded before anything is measured.
 *
 * [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
 */
// [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
function runInventoryStep({ root }) {
  process.stdout.write(`${renderInventory(readInventory({ root }))}\n`);
  return 0;
}

/**
 * Steps 3 and 4 — what the destination holds against what the exit owes it.
 *
 * [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
 */
// [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
function runStatusStep({ root }) {
  const destination = reservedReverseDirectory(root);
  const set = readPublishedSet({ destination });
  const findings = findUnpublished(set);

  if (findings.length > 0) {
    process.stderr.write(`${renderUnpublishedAdvice(findings, { destination })}\n`);
    return 1;
  }

  process.stdout.write(`${renderPublishedSet(set)}\n`);
  return 0;
}

/**
 * Step 5 — the six decisions, written through the schema the gate reads.
 *
 * The answers are the reader's, and the document's shape is not: a hand-written
 * document can be shaped wrong in ways the gate then reports as missing answers, which
 * is why the writing is here rather than in the reader's hands.
 *
 * [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
 */
// [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
function runDecideStep({ root, answers }) {
  const path = reservedReverseDecisionsPath(root);
  if (answers === undefined || answers === null) {
    process.stderr.write(`${renderDecisionWritingAdvice(['no answers file was named — pass --answers=<path>'], { path })}\n`);
    return 1;
  }

  const { answers: parsed, findings: readFindings } = readAnswers(answers);
  if (parsed === null) {
    process.stderr.write(`${renderDecisionWritingAdvice(readFindings, { path })}\n`);
    return 1;
  }

  const { path: written, findings: writeFindings } = writeDecisions({
    destination: reservedReverseDirectory(root),
    answers: parsed,
    path,
  });
  if (written === null) {
    process.stderr.write(`${renderDecisionWritingAdvice(writeFindings, { path })}\n`);
    return 1;
  }

  process.stdout.write(renderDecisionWritingVerdict({ path: written }));
  return 0;
}

/**
 * Step 6 — where the partition already on disk differs from the one the analysis fixed.
 *
 * [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
 */
// [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
function runSeamStep({ root }) {
  const seam = computeSeam({ prior: readPriorPartitionPaths(root), fixed: readFixedPartitionPaths(root) });

  if (seam.findings.length > 0) {
    process.stderr.write(renderSeamAdvice(seam.findings));
    return 1;
  }

  process.stdout.write(renderSeam(seam, { root }));
  return 0;
}

/**
 * Step 8 — the stages that ran, the destination, and the digest outcome.
 *
 * [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
 */
// [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
function runReportStep({ root }) {
  const destination = reservedReverseDirectory(root);
  const report = readStepReport({ root, destination });

  if (report.findings.length > 0) {
    process.stderr.write(`${renderReportAdvice(report.findings, { destination })}\n`);
    return 1;
  }

  process.stdout.write(renderStepReport(report));
  return 0;
}

/**
 * A Step-level subcommand that could not run, as an instruction rather than a stack.
 *
 * The rule is the one `reportStage` states: a gate's job is to name what is wrong. A
 * stack names neither what to correct nor where to look, and the reader here is an
 * operator forbidden from asking.
 *
 * [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
 */
// [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
function renderStepFailure({ step, root, error }) {
  return `${step} could not run.\n  Where: ${root}\n  Why: ${error.message}\nWhat to do: correct what the message names and run the same command again.\n`;
}

// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
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
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
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

// [::TICKET::] P22-4, P22-9, P23-7, PX-214, PX-213, P26-2, P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-4|P22-9|P23-7|PX-214|PX-213|P26-2|P26-3) --for-spec --no-implementation-order`.
async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.subcommand || !SUBCOMMANDS.includes(options.subcommand)) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  // Withdrawal is a property of the entrance rather than of one subcommand, so
  // it is judged here, over the whole argument list, instead of inside whichever
  // branch happened to collect the tokens first.
  const withdrawn = withdrawnOptionsUsed(process.argv.slice(2).filter((token) => token.startsWith('--')));
  try {
    refuseWithdrawnOptions(withdrawn);
    if (ARGUMENT_FREE_SUBCOMMANDS.includes(options.subcommand)) {
      refusePositionalArguments(options.positionals ?? []);
    }
  } catch (error) {
    return reportStage({
      stage: null,
      input: { root: options.root, out: options.out ?? 'the reserved directory', through: options.through ?? 'the last stage' },
      error,
    });
  }
  if (options.subcommand === 'detect') return runDetect(options);
  if (options.subcommand === 'scrub') return runScrub(options);
  if (options.subcommand === 'regression') return runRegression(options);
  if (options.subcommand === 'holdout') return runHoldout(options);
  if (options.subcommand === 'oracle') return runOracle(options);
  if (options.subcommand === 'spike') return runSpikeSubcommand(options);
  if (options.subcommand === 'analyze') return runAnalysisPipeline(options);
  if (options.subcommand === 'gate') return runGate(options);
  if (options.subcommand === 'pattern') return runPatternStep(options);
  if (options.subcommand === 'inventory') return runInventoryStep(options);
  if (options.subcommand === 'decide') return runDecideStep(options);
  if (options.subcommand === 'status') return runStatusStep(options);
  if (options.subcommand === 'seam') return runSeamStep(options);
  if (options.subcommand === 'report') return runReportStep(options);
  return runVerify(options);
}

// `analyze` awaits an execution, so the dispatch is asynchronous and the process
// exit code is set once it settles. Every other subcommand returns its code on the
// same tick it always did; the promise is the price of the one stage that waits.
/**
 * Report a failure that reached the top level, as an instruction rather than a stack.
 *
 * `reportStage` above already does this for a stage that could not run, and its JSDoc
 * states the rule: a gate's job is to name what is wrong. The same rule applies one
 * level up, and the stack trace this replaces was the one place in the file that
 * broke it. A stack names neither what to correct nor where to look, and the reader
 * here is an operator forbidden from asking.
 *
 * Nothing is said about a Step, because a failure that reaches this point is raised
 * before any Step has run — an argument the command line cannot honour, or a fault
 * inside a handler. The line the operator needs is what to do about it.
 */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
function reportUnhandledFailure(error) {
  process.stderr.write(
    'The reverse rotation could not continue.\n'
    + `  Why: ${error?.message ?? String(error)}\n`
    + 'What to do: correct what the message names and run the same command again. Nothing was '
    + 'published, so no partial result is left behind and there is no prefix to fall back to.\n',
  );
  process.exitCode = 1;
}

main().then(
  (exitCode) => { process.exitCode = exitCode; },
  reportUnhandledFailure,
);
