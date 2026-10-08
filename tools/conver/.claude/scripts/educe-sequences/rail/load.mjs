// reading the specification, the artifact and the schema (PX-240, contracts C001, C008, C013).
//
// Two rules are load-bearing here. A specification is read as bytes so the digest is
// over the file rather than over a decoded string, and its lines are split once, so a
// line number means one thing for the whole run. A listing is read together with the
// total it declares, so a truncated listing refuses instead of being read as whole:
// a worklist built from what was visible omitted thirty-four of seventy-four rows.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where the schema of the one artifact lives, relative to this module. */
export const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), 'artifact-schema.json');

/**
 * Split a document into addressable lines.
 *
 * One trailing newline is dropped so the count equals the lines a reader sees; two
 * are not, because a document that ends with a blank line has a blank last line and
 * pretending otherwise would shift every citation after it.
 */
export function splitLines(text) {
  const lines = text.split('\n');
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  return lines;
}

/** The SHA-256 of a file, over its bytes. */
export function digestOf(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** The SHA-256 of a buffer, so a caller holding bytes does not have to write them first. */
export function digestOfBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Read a specification into the shape every later stage consumes.
 *
 * @param {string} specPath
 * @returns {{path: string, sha256: string, lines: string[], lineCount: number, bytes: number}}
 */
export function readSpecification(specPath) {
  const bytes = readFileSync(specPath);
  const lines = splitLines(bytes.toString('utf8'));
  return { path: specPath, sha256: digestOfBytes(bytes), lines, lineCount: lines.length, bytes: bytes.length };
}

/** Read an artifact, or null when the path holds nothing. */
export function readArtifact(artifactPath) {
  return existsSync(artifactPath) ? JSON.parse(readFileSync(artifactPath, 'utf8')) : null;
}

/** Read the schema every artifact is validated against. */
export function readArtifactSchema() {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
}

/** The keys a record is missing, given the keys it must carry. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function missingKeys(record, required) {
  return required.filter((key) => record?.[key] === undefined);
}

/**
 * Report every way an artifact fails its declared shape.
 *
 * Returns problems rather than throwing, because the caller collects them into the
 * same verdict list a check reports into: a shape refusal and a check refusal must
 * reach the reader through one channel or the reader learns about them differently.
 *
 * @returns {Array<{pin: string|null, reason: string}>}
 */
export function validateArtifactShape(artifact, schema) {
  const problems = [];
  for (const key of missingKeys(artifact, schema.required)) {
    problems.push({ pin: null, reason: `the artifact has no ${key}` });
  }
  if (problems.length > 0) return problems;

  for (const key of missingKeys(artifact.spec, schema.spec.required)) {
    problems.push({ pin: `spec.${key}`, reason: `spec has no ${key}, so no citation in this artifact is anchored` });
  }
  for (const key of missingKeys(artifact.pins, schema.pins.required)) {
    problems.push({ pin: `pins.${key}`, reason: `pins has no ${key}` });
  }
  if (problems.length > 0) return problems;

  for (const key of missingKeys(artifact.pins.predicate, schema.pins.predicate.required)) {
    problems.push({ pin: `predicate.${key}`, reason: `pins.predicate has no ${key}` });
  }
  for (const key of missingKeys(artifact.pins.rowSchema, schema.pins.rowSchema.required)) {
    problems.push({ pin: `rowSchema.${key}`, reason: `pins.rowSchema has no ${key}` });
  }
  for (const [index, enumeration] of artifact.pins.enumerations.entries()) {
    for (const key of missingKeys(enumeration, schema.pins.enumerations.required)) {
      problems.push({ pin: `enumerations[${index}].${key}`, reason: `enumeration ${enumeration.name ?? index} has no ${key}` });
    }
  }
  for (const [index, form] of artifact.pins.forms.entries()) {
    for (const key of missingKeys(form, schema.pins.forms.required)) {
      problems.push({ pin: `forms[${index}].${key}`, reason: `form ${form.name ?? index} has no ${key}` });
    }
  }
  for (const [index, block] of artifact.pins.blocks.entries()) {
    for (const key of missingKeys(block, schema.pins.blocks.required)) {
      problems.push({ pin: `blocks[${index}].${key}`, reason: `block ${block.id ?? index} has no ${key}` });
    }
  }
  // A step is the carrier of both relations the artifact is checked for: which entry
  // realizes it and which operation it is an instance of. A step missing either field
  // would make the totality check read an absence as work that was never done, so the
  // shape gate names the step rather than leaving the operation to be blamed.
  for (const [index, step] of artifact.steps.entries()) {
    for (const key of missingKeys(step, schema.steps.required)) {
      problems.push({ pin: `steps[${index}].${key}`, reason: `step ${step.id ?? index} has no ${key}` });
    }
  }
  for (const key of missingKeys(artifact.verify, schema.verify.required)) {
    problems.push({ pin: `verify.${key}`, reason: `verify has no ${key}` });
  }
  return problems;
}

/**
 * Write an artifact, or report why it was not written.
 *
 * The caller decides whether a write happens; this function only performs one, so a
 * refusal upstream leaves the file untouched rather than half-written.
 */
export function writeArtifact(artifactPath, artifact) {
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

/**
 * Derive a set from a listing that declares its own total.
 *
 * A listing that stopped early prints a marker and a count. When the declared total
 * exceeds the entries present the marker is the evidence, so the set is refused and
 * the marker is named; reading the visible entries as the whole is the mistake this
 * exists to prevent.
 *
 * @param {{declaredTotal: number, entries: unknown[], truncationMarker?: string}} listing
 * @returns {{entries: unknown[]} | {refused: true, reason: string}}
 */
export function deriveSet(listing) {
  if (listing === null || typeof listing !== 'object' || !Number.isInteger(listing.declaredTotal)) {
    return { refused: true, reason: 'the listing declares no total, so nothing says whether it is whole' };
  }
  if (listing.declaredTotal > listing.entries.length) {
    const marker = listing.truncationMarker ?? 'no truncation marker';
    return {
      refused: true,
      reason: `the listing declares ${listing.declaredTotal} entries and carries ${listing.entries.length}; it stopped at "${marker}"`,
    };
  }
  return { entries: [...listing.entries] };
}
