// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
/**
 * Command entry point for /workspacify-reverse trace hygiene.
 *
 * Four subcommands, each deterministic:
 *   detect     — report the forward-rotation traces in a tree
 *   scrub      — remove the removable ones (or plan the removal with --dry-run)
 *   verify     — re-detect and exit non-zero when residue remains
 *   regression — freeze, or reproduce, the forward rotation's observable output
 *
 * The process performs no semantic judgement: which traces exist and whether
 * they are gone are facts, not opinions. Deciding what the cleaned tree then
 * means belongs to the reverse-rotation analysis, not here. The regression
 * gate speaks only of *proved* and *not proved* for the same reason.
 */
import process from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { detectForwardTraces } from './lib/detect-forward-traces.mjs';
import { planScrub, scrubForwardTraces } from './lib/scrub-forward-traces.mjs';
import { verifyScrub, exitCodeFor, renderVerification } from './lib/verify-scrub.mjs';
import { captureBaselines, checkBaselines, renderCaptureReport, renderCheckReport } from './lib/regression-gate.mjs';

/** The project this entry point belongs to: `.claude/scripts/workspacify-reverse` walked back to the root. */
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const SUBCOMMANDS = ['detect', 'scrub', 'verify', 'regression'];

const USAGE = [
  'Usage: run.mjs <detect|scrub|verify> <root> [options]',
  '       run.mjs regression <capture|check>',
  '',
  '  detect <root>                    Report L1-L4 traces as Markdown',
  '  scrub  <root> [--dry-run]        Report what would be removed',
  '  scrub  <root> --apply            Remove L1/L2 traces and rename keyed files',
  '  verify <root>                    Exit 0 when no trace remains, 1 otherwise',
  '  regression capture               Freeze the forward rotation as it behaves now',
  '  regression check                 Exit 0 when every frozen value is reproduced',
  '',
  'Options:',
  '  --apply                      Perform the removal (scrub only)',
  '  --dry-run                    Plan only; never write (scrub only)',
  '  --rename-ticket-keyed-files  Also strip ticket keys from file names',
  '  --json                       Emit a JSON sidecar in addition to Markdown',
].join('\n');

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

  return { ...common, root: second };
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

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.subcommand || !options.root || !SUBCOMMANDS.includes(options.subcommand)) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  if (options.subcommand === 'detect') return runDetect(options);
  if (options.subcommand === 'scrub') return runScrub(options);
  if (options.subcommand === 'regression') return runRegression(options);
  return runVerify(options);
}

process.exitCode = main();
