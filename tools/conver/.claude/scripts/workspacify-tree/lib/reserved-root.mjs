/**
 * The reserved root: the one directory name the workspacify family writes beneath a subject.
 *
 * The declaration lives outside the reverse tree on purpose. The forward rotation
 * must not depend on the reverse tree — `tests/lib/layer-direction.mjs` computes
 * that edge from the sources on every run and refuses it — and both later stages
 * need this name: the reverse analysis publishes beneath it, and the tree and
 * allocate rotations have to leave it out of what they judge. Declaring it here,
 * where the reverse tree may import it, keeps the dependency pointing the way the
 * layers are allowed to point.
 *
 * One binding serves both roles, and that is the point: the destination is
 * permitted beneath the subject only because no walk descends into it, so the
 * name a run writes to and the name a walk skips have to be the same value rather
 * than two literals that agree today. Measured drift between them would be a run
 * that changed what it measured.
 *
 * The binding is the ROOT, not the leaf. Every exclusion that reads it matches a
 * directory name at any depth, so naming the root is what makes everything
 * beneath it unreachable — and naming the leaf as well would put a second,
 * generic name into a list every measured project is read against, for no gain.
 */
// [::TICKET::] PX-214 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-214 --for-spec --no-implementation-order`.
import { join } from 'node:path';

/** The root a workspacify command publishes beneath, relative to the subject it measured. */
export const RESERVED_ROOT_NAME = 'workspacify';

/** The directory beneath the reserved root that an analysis publishes into. */
export const RESERVED_REVERSE_SUBDIRECTORY = 'reverse';

/**
 * The directory beneath the reserved root that the tree rotation stages into.
 *
 * The forward rotation stages exactly one document — the decisions JSON the gate
 * approves and the finalize applies — and it lives here rather than at a path the
 * running AI invents. Two invocations that chose their own paths could read two
 * different files while claiming one approval; a derived path is what makes "the
 * semantics approved are the semantics applied" a property of the binding rather
 * than of the caller's memory.
 */
export const RESERVED_TREE_SUBDIRECTORY = 'tree';

/** The directory beneath the reserved root that the allocate rotation stages into. */
export const RESERVED_ALLOCATE_SUBDIRECTORY = 'allocate';

/**
 * The name each forward rotation stages its decisions document under.
 *
 * One name for both is deliberate. The document is staging — the published manifest
 * is the record of what was decided — so it carries the name of what it is rather
 * than of the stage that wrote it, and a reader meeting it in either directory
 * reads the same word.
 */
export const RESERVED_DECISIONS_FILE_NAME = 'DECISIONS.json';

/**
 * The name the reverse analysis publishes its origin spec under.
 *
 * Stage two resolves the recorded `input.spec_path`, which is a basename, against
 * the manifest's directory and refuses a specification that is not there. The
 * rotation reads it from here, and places it beside the manifest before anything
 * else runs.
 */
export const RESERVED_ORIGIN_SPEC_FILE_NAME = 'ORIGIN-LONG-SPEC.md';

/**
 * The name the analysis publishes its measured dependency edges under.
 *
 * The stage two reverse rotation judges T4 over exactly this measurement, and it
 * is the analysis run's own document rather than something the caller supplies —
 * so the rotation reads it where it was published, instead of being handed a path
 * that names the same file by a second spelling.
 */
export const RESERVED_MEASURED_EDGES_FILE_NAME = 'DEPENDENCIES.json';

/** The directory beneath `root` that the reverse analysis publishes into. */
// [::TICKET::] PX-214 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-214 --for-spec --no-implementation-order`.
export function reservedReverseDirectory(root) {
  return join(root, RESERVED_ROOT_NAME, RESERVED_REVERSE_SUBDIRECTORY);
}

/**
 * The decisions document the tree rotation reads, as a function of its subject.
 *
 * The subject is the directory the command is run in, because that is where the
 * manifest is published and therefore what the run is about. Nothing else is an
 * input: no argument, no environment variable and no pre-existing file can move
 * it, which is what makes the gate's approval and the finalize's application
 * answers about the same file.
 */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
export function reservedTreeDecisionsPath(root) {
  return join(root, RESERVED_ROOT_NAME, RESERVED_TREE_SUBDIRECTORY, RESERVED_DECISIONS_FILE_NAME);
}

/**
 * The decisions document the allocate rotation reads, as a function of its subject.
 *
 * The subject is the workspace root, which for every allocate subcommand is the
 * directory the stage-one manifest was found in — §2.1 and §2.2 put the fifth layer
 * there, and the manifest's own location is what names it.
 */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
export function reservedAllocateDecisionsPath(root) {
  return join(root, RESERVED_ROOT_NAME, RESERVED_ALLOCATE_SUBDIRECTORY, RESERVED_DECISIONS_FILE_NAME);
}

/**
 * The decisions document the reverse rotation reads, as a function of its subject.
 *
 * The subject is the directory the command is run in, because that is where the
 * analysis published and therefore what the decisions are about. The reverse
 * rotation gained this document later than the other two, and it is derived the
 * same way for the same reason: the gate that checks the decisions and the Step
 * that must answer them have to be reading and writing one file, and a path the
 * caller could name is a path two callers can disagree about while each believes
 * it approved the same semantics.
 */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
export function reservedReverseDecisionsPath(root) {
  return join(root, RESERVED_ROOT_NAME, RESERVED_REVERSE_SUBDIRECTORY, RESERVED_DECISIONS_FILE_NAME);
}
