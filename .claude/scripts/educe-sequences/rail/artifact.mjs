// Composing the artifact from the specification and one run's readings (PX-240).
//
// The declaration says what to look for and the readings say what was found; both
// arrive from the reading phases, because even the predicate limbs are a reading and a
// library that shipped them would be carrying one specification's values. Joining the
// two is the one place an entry meets the reading that judged it, which is what makes
// the neighbour a recorded fact rather than something the engine rediscovers.
import { basename } from 'node:path';

import { readArtifactSchema } from './load.mjs';
import { establishPins } from './pins.mjs';
import { digestOfSupplied } from './supplied.mjs';

/** The command a reader is told to run to check the artifact later. */
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
export const VERIFY_COMMAND = 'node .claude/scripts/educe-sequences/rail/run.mjs <spec-file>';

/**
 * Compose the artifact.
 *
 * The recorded path is the file name, not the path the run was invoked with: the
 * artifact sits beside the specification, so its own location plus this name identifies
 * the revision, and a committed artifact that named a home directory would depend on
 * the machine that produced it as well as on its input.
 *
 * The supplied digest is recorded because the reproducibility guarantee is over the
 * specification *and* the material the reading was taken with: a hint that changes the
 * reading while leaving the text alone would otherwise leave the artifact looking
 * reproducible when it is not. A run given nothing records the digest of nothing, which
 * is the same value a verification computes beside a specification with no run.
 */
// [::TICKET::] PX-240, PX-242, PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-242|PX-248) --for-spec --no-implementation-order`.
export function buildArtifact({ specPath, spec, declaration, readings, supplied = digestOfSupplied([]), suppliedDocuments = {} }) {
  const pins = establishPins(spec.lines, declaration, suppliedDocuments);
  const readingFor = new Map(readings.sequences.map((reading) => [reading.subject, reading]));

  return {
    // The version is read from the schema rather than written here, so a schema change
    // and the artifacts it produces cannot disagree about which contract they carry.
    schema_version: readArtifactSchema().schema_version,
    spec: { path: basename(specPath), sha256: spec.sha256, lines: spec.lineCount },
    supplied: { digest: supplied },
    pins,
    sequences: declaration.entries.map((entry) => {
      const reading = readingFor.get(entry.id);
      return {
        ...entry,
        outcome: reading?.outcome ?? null,
        ...(reading?.neighbour === undefined ? {} : { neighbour: reading.neighbour }),
      };
    }),
    steps: readings.steps,
    operations: readings.operations,
    adjudications: readings.adjudications,
    sections: declaration.sections,
    exemptions: declaration.exemptions,
    verify: { command: VERIFY_COMMAND, expected_exit: 0 },
  };
}
