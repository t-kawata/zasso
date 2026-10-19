#!/usr/bin/env node
/**
 * check-contribution-completeness.js <workspace-root>
 *
 * The workspace-wide contribution gate: every operation a package owns and marks active
 * must have a Procedure Registry row, or a recorded not_required with a ground. A row
 * that names an operation the contributor does not own is reported in the other
 * direction. The gate is shared with /smooth-sequences so the two surfaces cannot
 * disagree about one workspace.
 *
 * Exit 0 — every contribution is accounted for.
 * Exit 1 — at least one finding; each is printed with its repair.
 * Exit 2 — the workspace could not be read.
 */
import { checkContributionCompleteness } from '../smooth-sequences/lib/checks-layer-a.mjs';
import { indexArtifact } from '../smooth-sequences/lib/index.mjs';
import { SmoothSequencesError } from '../smooth-sequences/lib/errors.mjs';
import { loadWorkspace, resolveWorkspaceRoot } from '../smooth-sequences/lib/workspace.mjs';

const EXIT_PASS = 0;
const EXIT_FINDINGS = 1;
const EXIT_MISUSE = 2;

// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
function main(argv) {
  try {
    const root = resolveWorkspaceRoot(argv[0] ?? process.cwd());
    const findings = checkContributionCompleteness(indexArtifact(loadWorkspace(root)));
    if (findings.length === 0) {
      process.stdout.write('proved: every owned active operation is contributed or grounded\n');
      return EXIT_PASS;
    }
    process.stderr.write(`contribution: ${findings.length} finding(s)\n`);
    for (const finding of findings) {
      process.stderr.write(`${finding.checkId}: ${finding.subject} — ${finding.reason}; repair: ${finding.repair}\n`);
    }
    return EXIT_FINDINGS;
  } catch (error) {
    if (error instanceof SmoothSequencesError) {
      process.stderr.write(`contribution: ${error.code}: ${error.message}${error.repair ? ` — ${error.repair}` : ''}\n`);
    } else {
      process.stderr.write(`contribution: ${error.message}\n`);
    }
    return EXIT_MISUSE;
  }
}

process.exitCode = main(process.argv.slice(2));
