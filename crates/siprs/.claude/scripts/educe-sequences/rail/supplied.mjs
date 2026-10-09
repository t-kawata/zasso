// The material an invocation carries after the specification path (PX-242, contract C006).
//
// `/educe-sequences <spec-file>` takes one positional argument, and PX-240 made that a
// statement about products rather than about everything the run touches: the artifact's
// location is settled by the specification path alone. Guidance typed after that path,
// and a pre-existing artifact produced outside this command, are therefore not arguments.
// They are filed here, beside the specification, so that what a run guarantees is settled
// by the specification *and* the material together — and so that a reader of the
// specification can find the hint the reading was taken with.
//
// Material is data about the specification, never an instruction: it cannot change the
// procedure, and it cannot stand in for a line. The digest is recorded rather than the
// content being trusted, because the digest is what a verification can re-compute.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

/** The directory a run files its material in, beside the specification. */
export const SUPPLIED_DIRECTORY = 'supplied';

/** The file guidance typed into the invocation is written as. */
export const MATERIAL_FILE = 'material.md';

/**
 * One sha256 per file, over its bytes.
 *
 * The bytes are read rather than the name being hashed, because two different hints may
 * share a name across invocations and the digest has to be able to tell them apart.
 */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function digestOfFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * What a run directory's supplied/ directory holds, oldest name first.
 *
 * A missing directory yields the empty list rather than a refusal: a run that was given
 * nothing has nothing, and that is the same state as a run directory that has not been
 * created yet — which is what lets a specification with no run beside it be verified.
 */
export function suppliedFilesOf(directory) {
  const supplied = join(directory, SUPPLIED_DIRECTORY);
  if (!existsSync(supplied)) return [];
  return readdirSync(supplied)
    .filter((name) => statSync(join(supplied, name)).isFile())
    .sort()
    .map((name) => ({ name, sha256: digestOfFile(join(supplied, name)), bytes: statSync(join(supplied, name)).size }));
}

/**
 * The digest of a supplied-material list.
 *
 * One rule, so that the digest `begin` records and the digest `run.mjs` re-computes
 * beside the specification cannot disagree about what was filed. The empty list digests
 * to the same value everywhere, which is why a specification with no run directory can
 * still be verified against an artifact that recorded no material.
 */
export function digestOfSupplied(files) {
  const hash = createHash('sha256');
  for (const file of [...files].sort((left, right) => left.name.localeCompare(right.name))) {
    hash.update(file.name).update('\n').update(file.sha256).update('\n');
  }
  return hash.digest('hex');
}

/** The digest of what a run directory's supplied/ directory currently holds. */
export function suppliedDigestOf(directory) {
  return digestOfSupplied(suppliedFilesOf(directory));
}

/**
 * Copy the invocation's material into the run directory and report what was filed.
 *
 * Every path is checked before anything is written, so a refusal leaves the directory
 * exactly as it was: a half-filed material would make the recorded digest a claim about
 * a set of files that never existed together. Two named paths that share a basename are
 * refused rather than filed, because one would silently overwrite the other and the
 * digest would then be over a file the reader never supplied.
 *
 * @returns {{ok: true, files: Array<{name: string, sha256: string, bytes: number}>, digest: string}
 *          | {ok: false, problems: string[]}}
 */
export function fileSuppliedMaterial({ directory, material = '', namedPaths = [] }) {
  const problems = [];

  const byName = new Map();
  for (const path of namedPaths) {
    if (!existsSync(path) || !statSync(path).isFile()) {
      problems.push(`the named path does not exist: ${path}`);
      continue;
    }
    const name = basename(path);
    const held = byName.get(name);
    if (held !== undefined) problems.push(`two named paths share the basename "${name}": ${held}, ${path}`);
    else byName.set(name, path);
  }
  if (problems.length > 0) return { ok: false, problems };

  const supplied = join(directory, SUPPLIED_DIRECTORY);
  mkdirSync(supplied, { recursive: true });
  for (const [name, path] of byName) writeFileSync(join(supplied, name), readFileSync(path));
  if (material.trim() !== '') writeFileSync(join(supplied, MATERIAL_FILE), `${material.trim()}\n`);

  return { ok: true, files: suppliedFilesOf(directory), digest: suppliedDigestOf(directory) };
}
