#!/usr/bin/env node
// The phase driver's command line (PX-240).
//
// Every phase the command file names is reachable from here by number, which is what
// makes the command's table executable rather than descriptive: a step in the command
// runs one of these subcommands, reads its exit code, and follows the back-edge the
// refusal named.
//
// The product path is untouched: `run.mjs <spec-file>` still writes the one artifact and
// still derives its location from the argument alone. This file drives the phases that
// lead to that artifact, and keeps its working state beside the specification, in a
// directory named for this tool, so that a reader of the specification can find the
// declaration and the readings the artifact was built from.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { coverageLine } from './coverage.mjs';
import { checkAll, escapedOperationsOf } from './engine.mjs';
import { parseSpecArgument, artifactPathFor } from './paths.mjs';
import { predicateFor } from './pins.mjs';
import { renderBrief } from './reading.mjs';
import { buildContext, beginRun, exitCodeFor, inquestCountsIn, nextPhase, runPhase, runThrough, startRun, PHASES, PHASE_GUIDANCE, PHASE_EXPECTS, UNCOVERED_WORKLIST_FILE, WORKLIST_FILE } from './phases.mjs';
import { readArtifact, readJsonOrNull, readSpecification, digestOf } from './load.mjs';
import { buildReport } from './report.mjs';
import { railExitStoreFor, readRailExits } from './harness.mjs';
import { readStatus, openPhases, phaseState } from './run-state.mjs';
import { DEFAULT_WIDTH, treeReading } from './text.mjs';
import { DECLARATION_FILE, inquestQuestions, inquestRecordsIn, readDeclarationFile } from './readings.mjs';
import { ADHOC_DIRECTORY, loadAdhocChecks, promoteRecord, railExitTemplate, readCasesFile, runScaffoldCases, scaffoldCheck, writeRailExit, writeRailExits } from './adhoc.mjs';

/** The usage every refusal ends with, so a caller learns the shape without reading code. */
const USAGE = [
  'usage: node rail/phase.mjs <subcommand> <spec-file> [argument]',
  '  begin                      open the next generation, or verify an unchanged one',
  '  status                     report every phase and what it is waiting for',
  '  brief <name>               render one reader brief, naming the run worklist',
  '  run <phase>                enter one phase, perform it if the library can, and gate it',
  '  through [last-phase]       run from the first unfinished phase to the last',
  '  report                     print the closing report',
  '  scaffold <check> <defect>  write a check for a defect class with no analogue',
  '  promote <record> <spec>    propose lifting a rail exit into the declared checks',
].join('\n');

/** Resolve the specification argument, refusing everything else. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function resolveSpec(argv) {
  const parsed = parseSpecArgument([argv[0]]);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  return { ok: true, specPath: parsed.specPath, spec: readSpecification(parsed.specPath) };
}

/**
 * The invocation split into its one argument and the material that follows it.
 *
 * `/educe-sequences <spec-file>` takes one positional argument. Everything after the
 * first whitespace-delimited token — guidance typed into the invocation, and paths to
 * artifacts produced before this command existed — is material for the reading rather
 * than an argument, so it is separated here instead of being refused as a second one.
 */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function splitInvocation(text) {
  const trimmed = String(text ?? '').trim();
  const boundary = trimmed.search(/\s/);
  if (boundary === -1) return { specText: trimmed, material: '' };
  return { specText: trimmed.slice(0, boundary), material: trimmed.slice(boundary).trim() };
}

/**
 * Whether a token of the material is a path rather than prose.
 *
 * A rooted token is a path when it is written like one — an extension after its last
 * separator — or when it names a file that is there; a relative token has to be written
 * like one. The test is deliberately narrow, because a false positive refuses the
 * invocation over a word, and it is not allowed to be so narrow that a file the reader
 * supplied is quietly left unfiled: material the digest does not cover is material a
 * later reader cannot find, and the digest would then be a claim about a set of files
 * that never existed together. A word that merely begins with a slash and names nothing
 * — the name of this command, say — is prose, so guidance can mention it.
 */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function looksLikePath(token) {
  // Written like a file: the last segment carries an extension, and the token either starts
  // at a root or goes somewhere. A letter class would have made every path in a script the
  // reader's own language writes a word of prose, and a dropped path is material the digest
  // does not cover — a silence, which is the failure this classifier exists to avoid.
  const writtenLikeAPath = /\.[A-Za-z0-9]+$/.test(token);
  const goesSomewhere = /^(~\/|\.{1,2}\/|\/)/.test(token) || token.includes('/');
  // A bare name is a path only when it names a file: "v1.2" and "e.g." are written like
  // paths and are words, and refusing an invocation over one would trade a silence for a
  // false alarm.
  return (writtenLikeAPath && goesSomewhere) || existsSync(expandHome(token));
}

/**
 * A token written with a leading `~`, resolved against the home directory.
 *
 * Node does not expand `~` — the shell does, and an argument written into an invocation is
 * not the shell's to expand once it is one token of a string. So a path written the way a
 * reader writes paths was classified as a path and then reported as not existing, which
 * named the symptom and hid the cause.
 */
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
function expandHome(token) {
  if (!token.startsWith('~/')) return token;
  return join(homedir(), token.slice(2));
}

/** The paths a block of material names, so `begin` can file them or refuse them by name. */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
function namedPathsIn(material) {
  return material
    .split(/\s+/)
    .map((token) => token.replace(/[),;]+$/, ''))
    .filter((token) => token !== '' && looksLikePath(token))
    .map(expandHome);
}

/**
 * Open the next generation and report what it inherited.
 *
 * Five facts, because each answers a question the reader arrives with: which generation
 * this is and whether it opened one at all, what the run inherits (so a change is
 * visible as a different digest), how much material was filed, how much of the inherited
 * material no longer cites the text, and which phase comes next.
 */
// [::TICKET::] PX-242, PX-243, PX-244, PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244|PX-245) --for-spec --no-implementation-order`.
function beginCommand(rest) {
  const { specText, material } = splitInvocation(rest.join(' '));
  const parsed = parseSpecArgument([specText]);
  if (!parsed.ok) {
    process.stderr.write(`refused: ${parsed.reason}\n`);
    return 2;
  }

  const begun = beginRun({
    specPath: parsed.specPath,
    spec: readSpecification(parsed.specPath),
    material,
    namedPaths: namedPathsIn(material),
  });
  if (begun.ok !== true) {
    process.stderr.write(`refused: ${begun.refused}\n`);
    return 1;
  }

  const pending = nextPhase(begun.status);
  // The notice is a line, not an exit: a repeat over an unchanged set is reported so a
  // reader can see that re-asking moved nothing, and the generation opens either way.
  const noticed = begun.notice === null || begun.notice === undefined ? [] : [`notice: ${begun.notice}`];
  const measured = begun.coverage === null || begun.coverage === undefined
    ? []
    : [`superseded generation measured: ${coverageLine(begun.coverage)}`];
  process.stdout.write([
    `generation ${begun.generation} (${begun.mode === 'verification' ? 'verification' : 'new generation'})`,
    ...noticed,
    ...measured,
    `asset digest: ${begun.assets.digest}`,
    `supplied: ${begun.supplied.length} file(s)`,
    `invalidated: ${begun.invalidated.length} asset(s)`,
    `next: ${pending ?? '(none — every phase is done)'}`,
  ].join('\n') + '\n');
  return 0;
}

/**
 * What a phase is waiting for.
 *
 * Three cases, and they must not print alike: a done phase shows what it proved, a phase
 * that spent its limit shows that it halted and what refused it last — because the next
 * move there is to stop, not to render another brief — and anything else shows the file
 * its reader must produce.
 */
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
function waitingFor(phase, record) {
  if (record.status === 'done') return record.verdict;
  if (record.loops >= phase.maxLoops) return `HALTED — the last refusal was: ${record.verdict}`;
  return PHASE_EXPECTS[phase.id] ?? 'nothing';
}

/** Report every phase, its tag, its verdict and what it is waiting for. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function statusLines(status) {
  return PHASES.map((phase) => {
    const record = phaseState(status, phase.id);
    // The limit is printed beside the count so "no phase is above its limit" is a glance
    // rather than a comparison the reader has to hold sixteen numbers to make.
    const loops = `loops ${record.loops} of ${phase.maxLoops}`;
    return `phase ${String(phase.id).padStart(2)} [${phase.tag}] ${phase.name} — ${record.status} (${loops}) — ${waitingFor(phase, record)}`;
  });
}

/** Enter one phase and print its verdict, the back-edge and what it expects. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function runOne(context, id) {
  const result = runPhase(id, context);
  const lines = [
    `phase ${result.id} [${result.tag}] ${result.ok ? 'PASS' : 'FAIL'}`,
    `verdict: ${result.reason}`,
  ];
  if (result.halted) {
    lines.push('halted: this phase has spent its loop limit. Do not repeat the Step — name the phase, its loops and the refusal above, and stop.');
  } else if (!result.ok) {
    lines.push(`back to: phase ${result.backTo ?? '(none)'}`, `loops: ${result.loops}`);
    if (result.expects !== null) lines.push(`expects: ${result.expects}`);
    if (PHASE_GUIDANCE[result.id] !== undefined) lines.push(`reader brief: ${PHASE_GUIDANCE[result.id]}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  return exitCodeFor(result);
}

/**
 * The audit's questions, each carrying what the generation before answered.
 *
 * Built here rather than inside the renderer, so the renderer keeps doing one thing: it
 * is handed a list of questions and turns it into prose. A brief for any other role is
 * handed an empty list and is untouched by the substitution.
 */
// [::TICKET::] PX-243, PX-244, PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244|PX-248) --for-spec --no-implementation-order`.
function inquestQuestionsIn(directory, specPath) {
  const declaration = readDeclarationFile(join(directory, DECLARATION_FILE));
  if (!declaration.ok) return [];
  return inquestQuestions({
    declaration: declaration.declaration,
    previousAnswers: inquestRecordsIn(directory),
    escaped: escapedOperationsOf(readArtifact(artifactPathFor(specPath)) ?? { operations: [] }),
  });
}

/** Print the closing report for a run. */
// [::TICKET::] PX-240, PX-241, PX-243, PX-244, PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241|PX-243|PX-244|PX-248) --for-spec --no-implementation-order`.
function report(context) {
  const status = readStatus(context.directory);
  if (status === null) {
    process.stderr.write('refused: no run has been opened for this specification\n');
    return 1;
  }
  const artifact = readArtifact(context.artifactPath);
  const rails = readRailExits(railExitStoreFor(context.directory));
  const { verdicts, summary } = artifact === null
    ? { verdicts: [], summary: null }
    // The report reads the same block the checks phase built, so it is handed the same
    // recorded value: a report over a different set would print a count the gate never saw.
    : checkAll({ specLines: context.spec.lines, artifact, recorded: { ...context.recorded, railExits: rails } });
  // A block that was refused produces no summary, and "incomplete" alone leaves the reader
  // to find out why. The verdicts are the reason, so they are named here as they are named
  // at every other surface.
  for (const verdict of verdicts) process.stderr.write(`refused: ${verdict.check}: ${verdict.reason}\n`);
  process.stdout.write(buildReport({
    status,
    summary,
    artifact: { path: context.artifactPath, digest: artifact === null ? '(none)' : digestOf(context.artifactPath) },
    inquest: { ...inquestCountsIn(context.directory, context.specPath), previous: status.history?.at(-1)?.inquest ?? null },
  }));
  return summary === null ? 1 : 0;
}

/**
 * Scaffold a check, execute its mutation, and record the rail exit.
 *
 * The write happens once. A second call re-executes rather than rewriting, because the
 * bodies between the two calls are the author's work and rewriting them would erase
 * it. The record is written only when the execution observed a red on the defect and a
 * silence on correct work, so a check that was never falsified leaves no record.
 */
// [::TICKET::] PX-241, PX-244, PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-241|PX-244|PX-243) --for-spec --no-implementation-order`.
async function scaffold(context, [check, defect]) {
  const modulePath = join(context.directory, ADHOC_DIRECTORY, `${check}.mjs`);
  const exists = existsSync(modulePath);

  if (!exists) {
    const written = scaffoldCheck({ directory: context.directory, check, defect, refuses: 'a reading of the kind this defect produced' });
    if (!written.ok) {
      process.stderr.write(`refused: ${written.problems.join('; ')}\n`);
      return 1;
    }
    process.stdout.write(`wrote ${written.modulePath}\nwrote ${written.casesPath}\n`);
  }

  const executed = await runScaffoldCases({
    directory: context.directory,
    check,
    artifact: readArtifact(context.artifactPath),
    specLines: context.spec.lines,
  });
  if (!executed.ok) {
    process.stderr.write(`refused: ${executed.problems.join('; ')}\n`);
    process.stdout.write(`write the two bodies in ${modulePath}, then run this command again\n`);
    return 1;
  }

  const cases = readCasesFile(context.directory, check);
  writeRailExit(railExitTemplate({ check, defect, cases, executed: executed.executed }), railExitStoreFor(context.directory));
  process.stdout.write(`recorded rail exit ${check}#${defect.length} with executed ${JSON.stringify(executed.executed)}\n`);
  return 0;
}

/**
 * Propose lifting a rail exit into the declared checks.
 *
 * This is the one act the command performs on its own history rather than on the
 * specification, and it is a proposal: the record is marked promoted and the splice is
 * printed, and no source file is written, because editing the rail is a change made
 * under a ticket rather than by a run. The file the splice must edit is named, so the
 * reader has somewhere to take it.
 */
// [::TICKET::] PX-244, PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-244|PX-243) --for-spec --no-implementation-order`.
function promote(context, [id, secondSpecification]) {
  const store = railExitStoreFor(context.directory);
  const promoted = promoteRecord(readRailExits(store), id, { secondSpecification: secondSpecification ?? '' });
  if (promoted.ok !== true) {
    process.stderr.write(`refused: ${promoted.problems.join('; ')}\n`);
    return 2;
  }
  writeRailExits(readRailExits(store).map((held) => (held.id === promoted.record.id ? promoted.record : held)), store);
  process.stdout.write([
    `promoted ${promoted.record.id}`,
    `splice into: rail/engine.mjs, in the CHECKS array`,
    `condition: ${promoted.record.promotionCondition}`,
    JSON.stringify(promoted.record, null, 2),
  ].join('\n') + '\n');
  return 0;
}

/** The entry point. */
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
export async function main(argv) {
  const [subcommand, ...rest] = argv;
  if (subcommand === undefined) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  // `begin` resolves the argument itself: it is the one subcommand that takes material
  // after the specification path, and it is the only opener that may inherit a state
  // written against an earlier revision of the text.
  if (subcommand === 'begin') return beginCommand(rest);

  const resolved = resolveSpec(rest);
  if (!resolved.ok) {
    process.stderr.write(`refused: ${resolved.reason}\n`);
    return 2;
  }

  const run = startRun({ specPath: resolved.specPath, spec: resolved.spec });
  if (run.refused !== undefined) {
    // The state beside this specification belongs to another revision or another
    // specification, so no phase runs: continuing would record verdicts against a
    // text their citations were not taken from.
    process.stderr.write(`refused: ${run.refused}\n`);
    return 1;
  }
  // Loaded once, here, because the loading can fail and the failure has to reach the
  // checks gate rather than be discovered by it.
  const adhoc = await loadAdhocChecks({ directory: run.directory });
  const context = buildContext({
    specPath: resolved.specPath,
    spec: resolved.spec,
    run: { directory: run.directory, status: run.status },
    recorded: {
      railExits: readRailExits(railExitStoreFor(run.directory)),
      adhocChecks: adhoc.checks,
      adhocProblems: adhoc.problems,
    },
  });

  switch (subcommand) {
    case 'status': {
      const pending = nextPhase(run.status);
      process.stdout.write(`${statusLines(run.status).join('\n')}\n`);
      // "every phase is done" is not the end of a run any more: it is the state a new
      // generation is opened over, so the line says which command opens one rather than
      // leaving a reader to conclude there is nothing left to do.
      process.stdout.write(`next: ${pending ?? '(none — run begin to open the next generation)'}\n`);
      process.stdout.write(`open: ${openPhases(run.status).join(', ') || '(none)'}\n`);
      return 0;
    }
    case 'brief': {
      const name = rest[1];
      try {
        // The predicate is read from the declaration and the specification here, because a
        // brief is the one place a reader meets the criterion: rendering it without one
        // would hand over a question whose answer nothing can check. A declaration that is
        // missing is named rather than defaulted, for the same reason.
        // A declaration that is absent or not yet whole is the state the phase that asks
        // for one runs in, so it is not a refusal: the brief states what to declare. A
        // declaration that is present is used, because a generation inherits the previous
        // one's criterion until its reader states another.
        const declared = readDeclarationFile(join(context.directory, DECLARATION_FILE));
        const predicate = declared.ok ? predicateFor(declared.declaration.predicate.limbs, context.spec.lines) : undefined;
        // The worklist path is the run's, not the caller's: a brief that named a file the
        // reader cannot open would send it looking for material that does not exist.
        // The tree is what the artifact in hand already reads, and it is empty before one
        // exists: a first generation's briefs are exactly as long as they were without it.
        // The lenient reader, because a brief is not the run's own state machine: before this
        // ticket it never opened the artifact at all, and a half-written copy beside the
        // specification is no reason to refuse a reader the shape of its question. Absent and
        // unparseable are the same answer here — there is no tree to show.
        const artifact = readJsonOrNull(context.artifactPath);
        process.stdout.write(`${renderBrief({
          briefName: name,
          worklistPath: join(context.directory, name === 'uncovered' ? UNCOVERED_WORKLIST_FILE : WORKLIST_FILE),
          predicate,
          orientation: {
            previousAnswers: inquestQuestionsIn(context.directory, context.specPath),
            tree: artifact === null ? '' : treeReading(artifact, [], DEFAULT_WIDTH),
          },
        })}\n`);
        return 0;
      } catch (error) {
        process.stderr.write(`refused: ${error.message}\n`);
        return 1;
      }
    }
    case 'run': {
      const id = Number.parseInt(rest[1], 10);
      if (!Number.isInteger(id)) {
        process.stderr.write(`refused: \`run\` takes a phase number\n${USAGE}\n`);
        return 2;
      }
      return runOne(context, id);
    }
    case 'through': {
      const last = rest[1] === undefined ? PHASES.length : Number.parseInt(rest[1], 10);
      const outcome = runThrough(context, last);
      for (const result of outcome.results) {
        process.stdout.write(`phase ${String(result.id).padStart(2)} [${result.tag}] ${result.ok ? 'PASS' : (result.halted ? 'HALTED' : 'FAIL')} — ${result.reason}\n`);
        if (!result.ok) {
          process.stdout.write(result.halted
            ? 'halted: this phase has spent its loop limit. Do not repeat the Step — name the phase, its loops and the refusal above, and stop.\n'
            : `back to: phase ${result.backTo ?? '(none)'}\nexpects: ${result.expects}\n`);
          break;
        }
      }
      return exitCodeFor(outcome);
    }
    case 'report':
      return report(context);
    case 'scaffold':
      return await scaffold(context, rest.slice(1));
    case 'promote':
      return promote(context, rest.slice(1));
    default:
      process.stderr.write(`refused: unknown subcommand "${subcommand}"\n${USAGE}\n`);
      return 2;
  }
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('phase.mjs')) {
  process.exitCode = await main(process.argv.slice(2));
}
