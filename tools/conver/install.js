#!/usr/bin/env node
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
/**
 * install.js — mirror a conver project's `.claude` tree into a target and resolve its environment.
 *
 * Usage:
 *   install.js                      # install into ./.claude
 *   install.js -t /path/to/.claude  # install into an explicit target
 *
 * The script locates itself through import.meta.url, so it runs correctly from
 * any current directory, and it never opens stdin: a prompt cannot be answered
 * by an automated session, and a user facing several hundred questions answers
 * them wrongly.
 *
 * The source is the only authority. Every file it holds is written to the target,
 * and every target file it does not hold is removed. Deciding file by file from a
 * record of the previous installation was tried and failed silently: one stale file
 * broke every later invocation while the installer reported the tree up to date.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import installDeps from './install-deps.cjs';
import envManifest from './env-manifest.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR_NAME = '.claude';
/**
 * Paths the mirror never reads or removes.
 *
 * `settings.local.json` accumulates the permissions of the project that holds it, so conver's
 * copy is a starting point rather than an authority. `node_modules` is written by dependency
 * resolution, and deleting it would undo that work on every run. `.DS_Store` is Finder metadata.
 */
const SYNC_EXCLUDES = Object.freeze(['settings.local.json', 'node_modules', '.DS_Store']);
const BASELINE_RELATIVE_PATH = 'tests/workspacify-tree/baselines/manifest-hashes.json';

// The installer is a command line tool, so stdout is its product rather than a
// debugging channel: the report a user reads and the exit code are the interface.
const print = (line) => process.stdout.write(`${line}\n`);
const printError = (line) => process.stderr.write(`${line}\n`);

/**
 * Parse the command line.
 *
 * `-y` is still accepted and still means "do not ask" — there is simply nothing
 * left to ask, because the installer decides every overwrite itself.
 *
 * @param {string[]} argv - process.argv
 * @returns {{ targetDir: string|null, noInstallDeps: boolean } | null} null on a usage error
 */
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const args = argv.slice(2);
  let targetDir = null;
  let noInstallDeps = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-t' || arg === '--target') {
      i++;
      if (i >= args.length) {
        printError('error: -t must be followed by a target path');
        return null;
      }
      targetDir = path.resolve(args[i]);
    } else if (arg === '-y') {
      // Accepted for compatibility; the installer no longer prompts.
    } else if (arg === '--no-install-deps') {
      noInstallDeps = true;
    } else {
      printError(`error: unknown option: ${arg}`);
      return null;
    }
  }

  return { targetDir: targetDir ?? path.join(process.cwd(), SOURCE_DIR_NAME), noInstallDeps };
}

// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
function showUsage() {
  print('usage:');
  print('  install.js                       install into ./.claude');
  print('  install.js -t /path/to/.claude   install into an explicit target');
  print('');
  print('options:');
  print('  -t, --target <path>   target directory (defaults to ./.claude)');
  print('  -y                    accepted for compatibility; the installer never prompts');
  print('  --no-install-deps     skip dependency resolution');
}

/**
 * Mirror the source tree into the target with rsync.
 *
 * rsync is what expresses "make the target equal the source" directly; a copy loop would
 * have to grow its own deletion and exclusion rules, which is the code this replaced.
 *
 * @param {string} sourceDir
 * @param {string} targetDir
 */
function mirrorTree(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const rsyncArgs = [
    '--archive',
    '--delete',
    ...SYNC_EXCLUDES.map((name) => `--exclude=${name}`),
    `${sourceDir}${path.sep}`,
    `${targetDir}${path.sep}`,
  ];
  const result = spawnSync('rsync', rsyncArgs, { encoding: 'utf8' });

  if (result.error) {
    throw new Error(`rsync could not be run (${result.error.message}); install rsync to mirror the .claude tree`);
  }
  if (result.status !== 0) {
    throw new Error(`rsync exited with status ${result.status}: ${(result.stderr || '').trim()}`);
  }
}

/**
 * Resolve the declared dependencies of the installed `.claude`, without
 * destroying anything that was already there.
 *
 * The sentence is the resolver's to write: it is the only code that knows which case was
 * met, and a table here mapping statuses to sentences would be a second place for the two
 * to drift apart.
 */
// [::TICKET::] P22-1, PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-1|PX-250) --for-spec --no-implementation-order`.
async function resolveDependenciesForTarget(sourceClaudeDir, targetDir) {
  const manifestPath = path.join(sourceClaudeDir, 'package.json');
  const dependencyEntries = Object.keys(installDeps.readManifestDependencies(manifestPath));
  const result = installDeps.resolveTargetDependencies({
    targetClaudeDir: targetDir,
    dependencyEntries,
    commandRunner: installDeps.defaultCommandRunner,
  });

  if (result.status === 'install-failed') {
    printError(`error: ${result.message} ${result.error}`);
    printError('use --no-install-deps to skip dependency resolution');
    process.exit(1);
  }

  print(result.message);
}

/**
 * Resolve every declared npm root and every declared external tool, write the
 * record, and print the report.
 *
 * The declaration describes the conver toolchain and lives beside install.js, so
 * the environment is resolved against conver's own project root rather than the
 * directory being installed into — a foreign project has no ENV-DEPS.json and
 * should not be asked for one.
 *
 * Forward readiness and reverse readiness are printed separately: one
 * undifferentiated verdict would hide the fact that the forward rotation works
 * while the reverse rotation's toolchain has not been chosen yet.
 *
 * @param {string} projectRoot - conver's own root, i.e. the directory holding ENV-DEPS.json
 */
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
function resolveAndReportEnvironment(projectRoot) {
  const declaration = envManifest.readDeclaration(projectRoot);

  if (envManifest.declarationIsEmpty(declaration)) {
    print('');
    print(envManifest.renderEnvironmentReport({ platform: process.platform, architecture: process.arch, nodeVersion: process.version, npmRoots: [], tools: [] }));
    return null;
  }

  const converged = envManifest.readConvergedTicketKeys(path.join(projectRoot, envManifest.TICKETS_FILE_NAME));
  const environment = { platform: process.platform, arch: process.arch, nodeVersion: process.version };
  const outcome = envManifest.resolveEnvironment({
    declaration,
    projectRoot,
    environment,
    commandRunner: installDeps.defaultCommandRunner,
    converged,
  });
  const record = envManifest.recordEnvironmentManifest({ outcome, projectRoot, environment });

  print('');
  print(envManifest.renderEnvironmentReport(record));
  return record;
}

/**
 * Prove readiness rather than claim it: when this project has a frozen forward
 * baseline, run the gate and report its verdict.
 */
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
function reportRegressionVerdict(projectRoot) {
  if (!fs.existsSync(path.join(projectRoot, BASELINE_RELATIVE_PATH))) {
    print('no forward baseline is frozen in this project, so there is no regression verdict to report');
    return;
  }
  const runScript = path.join(projectRoot, '.claude', 'scripts', 'workspacify-reverse', 'run.mjs');
  const result = spawnSync(process.execPath, [runScript, 'regression', 'check'], { cwd: projectRoot, encoding: 'utf8' });
  process.stdout.write(result.stdout ?? '');
  if (result.status !== 0) {
    print('the forward-rotation regression gate did not prove the tree unchanged; see the report above');
  }
}

// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
async function main() {
  const options = parseArgs(process.argv);
  if (!options) {
    showUsage();
    process.exit(1);
  }

  const { targetDir, noInstallDeps } = options;
  const sourceClaudeDir = path.join(__dirname, SOURCE_DIR_NAME);

  if (!fs.existsSync(sourceClaudeDir)) {
    printError(`error: ${sourceClaudeDir} was not found`);
    printError(`install.js must sit beside a ${SOURCE_DIR_NAME} directory`);
    process.exit(1);
  }

  print(`mirroring ${sourceClaudeDir} -> ${targetDir}`);

  try {
    mirrorTree(sourceClaudeDir, targetDir);
  } catch (error) {
    printError(`error: ${error.message}`);
    process.exit(1);
  }

  if (!noInstallDeps) {
    await resolveDependenciesForTarget(sourceClaudeDir, targetDir);
  }

  print(`mirrored into ${targetDir}`);

  const environmentRecord = resolveAndReportEnvironment(__dirname);
  if (environmentRecord && !envManifest.rotationIsReady(environmentRecord, 'forward')) {
    // A report that names what is missing but exits zero would read as ready, and
    // the one thing this entry point must never do is claim a readiness it lacks.
    printError('the forward rotation is not ready: resolve the entries named above, then run this again');
    process.exit(1);
  }

  reportRegressionVerdict(__dirname);
}

main().catch((error) => {
  printError(`unexpected error: ${error.message}`);
  process.exit(1);
});
