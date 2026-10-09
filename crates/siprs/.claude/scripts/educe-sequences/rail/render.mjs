// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
// Write the rendering beside the specification (PX-248).
//
// `run.mjs` has told the reader to run this module since the rendering path was declared,
// and the module did not exist: the promise was printed on every successful run and nothing
// could keep it. What it writes is a view and never a store — nothing reads the rendering
// back, and the freshness check re-renders and compares bytes rather than comparing parsed
// fields, so a change in whitespace a reader would not notice still fails.
import { writeFileSync } from 'node:fs';

import { renderArtifact } from './harness.mjs';
import { readArtifact } from './load.mjs';
import { artifactPathFor, parseSpecArgument, renderPathFor } from './paths.mjs';

/** The exit codes the command contract declares. */
export const RENDER_EXIT = Object.freeze({ OK: 0, REFUSED: 1, MISUSED: 2 });

/**
 * Render the artifact beside a specification.
 *
 * @param {string[]} argv — the arguments after the script name
 * @returns {{exitCode: number, renderingPath: string|null, reason: string}}
 */
export function renderCommand(argv) {
  const parsed = parseSpecArgument(argv);
  if (!parsed.ok) return { exitCode: RENDER_EXIT.MISUSED, renderingPath: null, reason: parsed.reason };

  const artifact = readArtifact(artifactPathFor(parsed.specPath));
  if (artifact === null) {
    return { exitCode: RENDER_EXIT.REFUSED, renderingPath: null, reason: `no artifact is beside ${parsed.specPath}, so there is nothing to render` };
  }

  const renderingPath = renderPathFor(parsed.specPath);
  writeFileSync(renderingPath, renderArtifact(artifact));
  return { exitCode: RENDER_EXIT.OK, renderingPath, reason: `wrote ${renderingPath}` };
}

// Command-line entry: `node rail/render.mjs <spec-file>`.
if (process.argv[1] !== undefined && process.argv[1].endsWith('render.mjs')) {
  const outcome = renderCommand(process.argv.slice(2));
  (outcome.exitCode === RENDER_EXIT.OK ? process.stdout : process.stderr).write(`${outcome.reason}\n`);
  process.exitCode = outcome.exitCode;
}
