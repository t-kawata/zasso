// [::TICKET::] PX-248, PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-248|PX-249) --for-spec --no-implementation-order`.
// Write the rendering beside the specification (PX-248, PX-249).
//
// `run.mjs` has told the reader to run this module since the rendering path was declared,
// and the module did not exist: the promise was printed on every successful run and nothing
// could keep it. What it writes is a view and never a store — nothing reads the rendering
// back, and the freshness check re-renders and compares bytes rather than comparing parsed
// fields, so a change in whitespace a reader would not notice still fails.
//
// A rendering is a product artifact like the artifact itself, so it is written only from a
// verification that passed. Drawing from records nothing has checked is the fabrication this
// command exists to catch, and it is the harder one to notice because a picture looks
// complete whatever it was drawn from.
import { writeFileSync } from 'node:fs';

import { renderArtifact } from './harness.mjs';
import { parseSpecArgument, renderPathFor } from './paths.mjs';
import { verifyArtifact } from './run.mjs';

/** The exit codes the command contract declares. */
export const RENDER_EXIT = Object.freeze({ OK: 0, REFUSED: 1, MISUSED: 2 });

/**
 * Render the artifact beside a specification.
 *
 * @param {string[]} argv — the arguments after the script name
 * @param {{railExits?: unknown[], inquest?: unknown[]}} options — the records a test supplies
 * @returns {Promise<{exitCode: number, renderingPath: string|null, reason: string}>}
 */
// [::TICKET::] PX-248, PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-248|PX-249) --for-spec --no-implementation-order`.
export async function renderCommand(argv, options = {}) {
  const parsed = parseSpecArgument(argv);
  if (!parsed.ok) return { exitCode: RENDER_EXIT.MISUSED, renderingPath: null, reason: parsed.reason };

  const verified = await verifyArtifact(parsed.specPath, options);
  if (verified.refusals.length > 0) {
    return { exitCode: RENDER_EXIT.REFUSED, renderingPath: null, reason: verified.refusals[0] };
  }
  if (verified.artifact === null) {
    return { exitCode: RENDER_EXIT.REFUSED, renderingPath: null, reason: `no artifact is beside ${parsed.specPath}, so there is nothing to render` };
  }

  const renderingPath = renderPathFor(parsed.specPath);
  writeFileSync(renderingPath, renderArtifact(verified.artifact));
  return { exitCode: RENDER_EXIT.OK, renderingPath, reason: `wrote ${renderingPath}` };
}

// Command-line entry: `node rail/render.mjs <spec-file>`.
if (process.argv[1] !== undefined && process.argv[1].endsWith('render.mjs')) {
  const outcome = await renderCommand(process.argv.slice(2));
  (outcome.exitCode === RENDER_EXIT.OK ? process.stdout : process.stderr).write(`${outcome.reason}\n`);
  process.exitCode = outcome.exitCode;
}
