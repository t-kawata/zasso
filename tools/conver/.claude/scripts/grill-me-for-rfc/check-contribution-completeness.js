#!/usr/bin/env node
/**
 * check-contribution-completeness.js [workspace-root]
 *
 * The argument, or the current directory when omitted, is the workspace root itself.
 * The workspace-wide contribution gate: every operation a package owns and marks active
 * must declare registry_contribution=required, or not_required with a ground, and must
 * be recorded by its owner's distribution ledger. The gate is shared with
 * /smooth-sequences so the two surfaces cannot disagree about one workspace.
 *
 * Exit 0 — every contribution is accounted for, or the artifact is v2 and the check is
 *          withheld with a named reason.
 * Exit 1 — at least one finding; each is printed with its repair.
 * Exit 2 — the workspace could not be read.
 */
import { checkContributionCompleteness, contributionWithheld } from '../smooth-sequences/lib/checks-layer-a.mjs';
import { indexArtifact } from '../smooth-sequences/lib/index.mjs';
import { SmoothSequencesError } from '../smooth-sequences/lib/errors.mjs';
import { assertWorkspaceRoot, loadWorkspace } from '../smooth-sequences/lib/workspace.mjs';

const EXIT_PASS = 0;
const EXIT_FINDINGS = 1;
const EXIT_MISUSE = 2;

// [::TICKET::] PX-273, PX-275, PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-275|PX-276) --for-spec --no-implementation-order`.
function main(argv) {
  try {
    const root = assertWorkspaceRoot(argv[0] ?? process.cwd());
    const index = indexArtifact(loadWorkspace(root));
    const findings = checkContributionCompleteness(index);
    if (findings.length === 0) {
      const withheld = contributionWithheld(index);
      process.stdout.write(withheld.length === 0
        ? 'proved: every owned active operation declares its contribution and is recorded by its owner\n'
        : `withheld: ${withheld.map((entry) => `${entry.check} (${entry.reason})`).join(', ')}\n`);
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
