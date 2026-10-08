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
import { join } from 'node:path';
import process from 'node:process';

import { ENGINE_DECLARED_CHECK_COUNT } from './engine.mjs';
import { checkAll } from './engine.mjs';
import { readArtifact } from './load.mjs';
import { parseSpecArgument } from './paths.mjs';
import { renderBrief } from './reading.mjs';
import { buildContext, exitCodeFor, nextPhase, runPhase, runThrough, startRun, PHASES, PHASE_GUIDANCE, PHASE_EXPECTS } from './phases.mjs';
import { readSpecification, digestOf } from './load.mjs';
import { buildReport } from './report.mjs';
import { readRailExits } from './harness.mjs';
import { readStatus, openPhases, phaseState } from './run-state.mjs';
import { ADHOC_DIRECTORY, railExitTemplate, readCasesFile, runScaffoldCases, scaffoldCheck, writeRailExit } from './adhoc.mjs';

/** The usage every refusal ends with, so a caller learns the shape without reading code. */
const USAGE = [
  'usage: node rail/phase.mjs <subcommand> <spec-file> [argument]',
  '  status                     report every phase and what it is waiting for',
  '  brief <name>               render one reader brief, naming the run worklist',
  '  run <phase>                enter one phase, perform it if the library can, and gate it',
  '  through [last-phase]       run from the first unfinished phase to the last',
  '  report                     print the closing report',
  '  scaffold <check> <defect>  write a check for a defect class with no analogue',
].join('\n');

/** Resolve the specification argument, refusing everything else. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function resolveSpec(argv) {
  const parsed = parseSpecArgument([argv[0]]);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  return { ok: true, specPath: parsed.specPath, spec: readSpecification(parsed.specPath) };
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

/** Print the closing report for a run. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function report(context) {
  const status = readStatus(context.directory);
  if (status === null) {
    process.stderr.write('refused: no run has been opened for this specification\n');
    return 1;
  }
  const artifact = readArtifact(context.artifactPath);
  const rails = readRailExits();
  const { summary } = artifact === null
    ? { summary: null }
    : checkAll({ specLines: context.spec.lines, artifact, railExits: rails });
  process.stdout.write(buildReport({
    status,
    summary,
    artifactPath: context.artifactPath,
    digest: artifact === null ? '(none)' : digestOf(context.artifactPath),
    declaredChecks: ENGINE_DECLARED_CHECK_COUNT,
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
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
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
  writeRailExit(railExitTemplate({ check, defect, cases, executed: executed.executed }));
  process.stdout.write(`recorded rail exit ${check}#${defect.length} with executed ${JSON.stringify(executed.executed)}\n`);
  return 0;
}

/** The entry point. */
export async function main(argv) {
  const [subcommand, ...rest] = argv;
  if (subcommand === undefined) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

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
  const context = buildContext({
    specPath: resolved.specPath,
    spec: resolved.spec,
    run: { directory: run.directory, status: run.status },
    railExits: readRailExits(),
  });

  switch (subcommand) {
    case 'status': {
      const pending = nextPhase(run.status);
      process.stdout.write(`${statusLines(run.status).join('\n')}\n`);
      process.stdout.write(`next: ${pending ?? '(none — every phase is done)'}\n`);
      process.stdout.write(`open: ${openPhases(run.status).join(', ') || '(none)'}\n`);
      return 0;
    }
    case 'brief': {
      const name = rest[1];
      try {
        // The worklist path is the run's, not the caller's: a brief that named a file the
        // reader cannot open would send it looking for material that does not exist.
        process.stdout.write(`${renderBrief({ briefName: name, worklistPath: join(context.directory, 'worklist.txt') })}\n`);
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
    default:
      process.stderr.write(`refused: unknown subcommand "${subcommand}"\n${USAGE}\n`);
      return 2;
  }
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('phase.mjs')) {
  process.exitCode = await main(process.argv.slice(2));
}
