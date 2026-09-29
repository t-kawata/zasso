#!/usr/bin/env node
/**
 * workspacify-order — the implementation order of a workspacify workspace, in the terminal.
 *
 * Usage:
 *   node .claude/scripts/workspacify-order/run.mjs
 *   node .claude/scripts/workspacify-order/run.mjs <path-to-RFC-SEED.md>
 *
 * Run from the workspace root. With no argument the root is found by walking up from the
 * current directory; with one argument it is found by walking up from that seed, and the
 * package the seed belongs to is marked in the plan and expanded below it.
 *
 * There are no flags: one input says what to show and where, and the workspace says
 * everything else. stdout is the picture and nothing else; a failure writes one line to
 * stderr and exits non-zero without having printed a partial plan.
 */
import { dirname, resolve } from 'node:path';

import { ERROR_PREFIX, WorkspacifyOrderError } from './lib/errors.mjs';
import { loadWorkspace, resolveWorkspaceRoot } from './lib/workspace.mjs';
import { buildModel, focusPackage } from './lib/levels.mjs';
import { render } from './lib/render.mjs';

const EXIT_OK = 0;
const EXIT_FAILURE = 1;

/** At most one seed path, because a plan can mark one directory at a time. */
const MAXIMUM_ARGUMENTS = 1;

/**
 * Resolve the workspace, derive the order, and write the picture.
 *
 * @param {string[]} argv — zero arguments or one seed path
 * @returns {number} the process exit code
 */
// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function renderImplementationOrder(argv) {
  if (argv.length > MAXIMUM_ARGUMENTS) {
    throw new WorkspacifyOrderError(
      `this command takes no argument or one seed path, and received ${argv.length}`,
      { artefact: 'argument' },
    );
  }

  const startDirectory = argv.length === 0 ? process.cwd() : dirname(resolve(argv[0]));
  const root = resolveWorkspaceRoot(startDirectory);
  const loaded = loadWorkspace(root);

  // The focus is settled before the model is built, so a seed that names nothing fails
  // before any work is spent and long before anything could reach stdout.
  const focusPackageId =
    argv.length === 0
      ? null
      : focusPackage({ root, seedPath: argv[0], packages: loaded.treeManifest.workspace.packages }).id;

  const model = buildModel({ root, ...loaded });
  process.stdout.write(render(model, focusPackageId));
  return EXIT_OK;
}

try {
  process.exitCode = renderImplementationOrder(process.argv.slice(2));
} catch (error) {
  if (error instanceof WorkspacifyOrderError) {
    process.stderr.write(`${ERROR_PREFIX} ${error.message}\n`);
    process.exitCode = EXIT_FAILURE;
  } else {
    throw error;
  }
}
