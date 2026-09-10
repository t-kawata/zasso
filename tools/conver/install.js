#!/usr/bin/env node
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
/**
 * install.js — install a conver project's `.claude` tree and resolve its environment.
 *
 * Usage:
 *   install.js                      # install into ./.claude, deciding every file itself
 *   install.js -t /path/to/.claude  # install into an explicit target
 *
 * The script locates itself through import.meta.url, so it runs correctly from
 * any current directory, and it never opens stdin: a prompt cannot be answered
 * by an automated session, and a user facing several hundred questions answers
 * them wrongly.
 *
 * What to do with a file that already exists is decided by comparing the
 * target, the source and the record of the previous installation — never by
 * asking. A file the user changed is preserved and named; a file that differs
 * only because conver moved on is updated.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import installDeps from './install-deps.cjs';
import envManifest from './env-manifest.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR_NAME = '.claude';
const EXCLUDE_PATTERNS = ['.DS_Store', 'node_modules', installDeps.INSTALL_STATE_FILE_NAME];
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

/** Collect every file beneath a directory, as paths relative to a base directory. */
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
function collectFilesWithRelative(dirPath, baseDir) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (EXCLUDE_PATTERNS.includes(entry.name)) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesWithRelative(fullPath, baseDir));
    } else {
      files.push(path.relative(baseDir, fullPath));
    }
  }

  return files;
}

/** SHA-256 of a file's contents, or null when there is no file to read. */
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
function digestFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/**
 * Load what the previous installation recorded.
 *
 * Absent or unreadable, the record is empty: unknown provenance is resolved
 * toward safety rather than toward overwriting.
 *
 * @param {string} targetDir
 * @returns {{version: number, files: Record<string, string>}}
 */
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
function loadInstallState(targetDir) {
  const statePath = path.join(targetDir, installDeps.INSTALL_STATE_FILE_NAME);
  if (!fs.existsSync(statePath)) {
    return { version: 1, files: {} };
  }
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return { version: 1, files: state.files ?? {} };
  } catch {
    return { version: 1, files: {} };
  }
}

/**
 * Install one file, deciding from the target, the source and the record.
 *
 * @returns {{ action: 'install'|'unchanged'|'update'|'preserve', sourceDigest: string }}
 */
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
function installFile({ sourcePath, targetPath, previousSourceDigest }) {
  const sourceDigest = digestFile(sourcePath);
  const targetDigest = digestFile(targetPath);
  const action = installDeps.decideFileAction({
    targetExists: targetDigest !== null,
    targetDigest,
    sourceDigest,
    previousSourceDigest: previousSourceDigest ?? null,
  });

  if (action === 'install' || action === 'update') {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.cpSync(sourcePath, targetPath);
  }

  return { action, sourceDigest };
}

/** Report what happened, naming every file that was preserved. */
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
function showSummary({ counts, preservedNames, targetDir }) {
  const changed = counts.install + counts.update;
  print('');
  if (changed === 0 && counts.preserve === 0) {
    print(`nothing changed: all ${counts.unchanged} files in ${targetDir} already match the source`);
  } else {
    print(`installed into ${targetDir}`);
    print(`  new: ${counts.install}   updated: ${counts.update}   unchanged: ${counts.unchanged}   preserved: ${counts.preserve}`);
  }

  if (preservedNames.length > 0) {
    print('');
    print(`preserved ${preservedNames.length} file(s) you had modified — they were not overwritten:`);
    for (const name of preservedNames) {
      print(`  - ${name}`);
    }
  }
}

/**
 * Resolve the declared dependencies of the installed `.claude`, without
 * destroying anything that was already there.
 */
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
async function resolveDependenciesForTarget(sourceClaudeDir, targetDir) {
  const manifestPath = path.join(sourceClaudeDir, 'package.json');
  const dependencyEntries = Object.keys(installDeps.readManifestDependencies(manifestPath));
  const result = installDeps.resolveTargetDependencies({
    targetClaudeDir: targetDir,
    dependencyEntries,
    commandRunner: installDeps.defaultCommandRunner,
  });

  const summaryByStatus = {
    'no-dependencies': 'no dependencies are declared, so none were installed',
    resolved: 'every declared dependency already resolves; nothing was installed',
    'skipped-existing': 'an existing node_modules was left untouched; resolve its dependencies manually',
    installed: 'dependencies installed into the target .claude',
  };

  if (result.status === 'install-failed') {
    printError(`error: dependency installation failed and was rolled back: ${result.error}`);
    printError('use --no-install-deps to skip dependency resolution');
    process.exit(1);
  }

  print(summaryByStatus[result.status]);
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

  const files = collectFilesWithRelative(sourceClaudeDir, sourceClaudeDir);
  if (files.length === 0) {
    print('there is nothing to copy');
    return;
  }

  const previousState = loadInstallState(targetDir);
  const counts = { install: 0, update: 0, unchanged: 0, preserve: 0 };
  const preservedNames = [];
  const nextState = { version: 1, files: {} };

  print(`installing ${sourceClaudeDir} -> ${targetDir} (${files.length} files)`);

  for (const relativePath of files) {
    const sourcePath = path.join(sourceClaudeDir, relativePath);
    const targetPath = path.join(targetDir, relativePath);

    const { action, sourceDigest } = installFile({
      sourcePath,
      targetPath,
      previousSourceDigest: previousState.files[relativePath],
    });

    counts[action]++;
    if (action === 'preserve') {
      preservedNames.push(relativePath);
    } else {
      nextState.files[relativePath] = sourceDigest;
    }
  }

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, installDeps.INSTALL_STATE_FILE_NAME), `${JSON.stringify(nextState, null, 2)}\n`);

  if (!noInstallDeps) {
    await resolveDependenciesForTarget(sourceClaudeDir, targetDir);
  }

  showSummary({ counts, preservedNames, targetDir });

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
