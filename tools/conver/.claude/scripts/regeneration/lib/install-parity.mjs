/**
 * Install parity: the installed `.claude/scripts` tree must be byte-identical to the
 * source tree it was installed from.
 *
 * The source of truth is `tools/conver`; every consumer is a target. A direct edit in a
 * target is invisible to the next install and silently diverges, so the install step
 * refuses a target that carries a missing, extra or different script.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const SCRIPTS_RELATIVE = '.claude/scripts';
const SKIPPED_NAMES = new Set(['node_modules', '.git', '.DS_Store']);

/** Every file under one directory, as paths relative to it. */
// [::TICKET::] PX-310 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-310 --for-spec --no-implementation-order`.
function walkFiles(root, directory = root, acc = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIPPED_NAMES.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(root, path, acc);
    } else if (entry.isFile()) {
      acc.push(relative(root, path));
    }
  }
  return acc;
}

/** The sha256 of one file. */
// [::TICKET::] PX-310 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-310 --for-spec --no-implementation-order`.
function digestOf(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Throw INSTALL_PARITY_MISMATCH when the target differs from the source. */
export function assertInstallParity({ sourceRoot, targetRoot, scriptsRelative = SCRIPTS_RELATIVE }) {
  const sourceScripts = join(sourceRoot, scriptsRelative);
  const targetScripts = join(targetRoot, scriptsRelative);
  if (!existsSync(sourceScripts)) {
    throw new Error(`INSTALL_PARITY_MISMATCH: source scripts directory is missing: ${sourceScripts}`);
  }
  if (!existsSync(targetScripts)) {
    throw new Error(`INSTALL_PARITY_MISMATCH: target scripts directory is missing: ${targetScripts}`);
  }

  const sourceFiles = walkFiles(sourceScripts).sort();
  const targetFiles = walkFiles(targetScripts).sort();
  const sourceSet = new Set(sourceFiles);
  const targetSet = new Set(targetFiles);
  const missing = sourceFiles.filter((path) => !targetSet.has(path));
  const extra = targetFiles.filter((path) => !sourceSet.has(path));
  const changed = sourceFiles.filter((path) => targetSet.has(path)
    && digestOf(join(sourceScripts, path)) !== digestOf(join(targetScripts, path)));

  if (missing.length > 0 || extra.length > 0 || changed.length > 0) {
    const first = missing[0] ?? extra[0] ?? changed[0];
    const kind = missing.length > 0 ? 'missing' : extra.length > 0 ? 'extra' : 'differs';
    throw new Error(`INSTALL_PARITY_MISMATCH: ${first} ${kind}`);
  }
  return { ok: true, files: sourceFiles.length };
}

/** Parse `--source=`, `--target=` and `--scripts=`. */
// [::TICKET::] PX-310 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-310 --for-spec --no-implementation-order`.
function parse(argv) {
  const options = {};
  for (const argument of argv) {
    if (argument.startsWith('--source=')) options.sourceRoot = argument.slice('--source='.length);
    if (argument.startsWith('--target=')) options.targetRoot = argument.slice('--target='.length);
    if (argument.startsWith('--scripts=')) options.scriptsRelative = argument.slice('--scripts='.length);
  }
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parse(process.argv.slice(2));
  if (options.sourceRoot === undefined || options.targetRoot === undefined) {
    process.stderr.write('usage: install-parity.mjs --source=<root> --target=<root> [--scripts=.claude/scripts]\n');
    process.exitCode = 2;
  } else {
    try {
      const result = assertInstallParity(options);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = 0;
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
