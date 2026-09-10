// [::TICKET::] P22-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-10 --for-spec --no-implementation-order`.
/**
 * The forward artefacts, extended for the reverse rotation without moving a byte.
 *
 * ABOUT-REVERSE 6.12.2 settled where uncertainty lives: the canonical record
 * stays in a sidecar and each forward artefact carries only the minimum
 * reference it actually needs. This module is that ruling's single declaration
 * point. Every reverse-only field name is written here once, so a later addition
 * cannot be made on one artefact and forgotten on another — and so the set of
 * fields a forward output must never carry has exactly one definition.
 *
 * Two properties are load-bearing, and both follow from the shape of the code
 * rather than from care taken at each call site:
 *
 *   - In forward mode the artefact is returned *itself*, not a copy. A copy that
 *     happened to serialise identically today could stop doing so tomorrow; an
 *     unchanged reference cannot. `manifest_hash` participates in the WIG and in
 *     reload, so this is the difference between a provable claim and a hopeful one.
 *   - An artefact kind that is not declared cannot be extended at all. Layer C —
 *     `*-GRAPH.json` and `*-Dirs-Tree.json` — is deliberately absent from the
 *     declaration, because those artefacts are consumed by tools outside this
 *     phase and must gain nothing.
 *
 * The reverse field names come from ABOUT-REVERSE 6.12.3: layer A (RFC-SEED §1
 * and the canonical RFC) is mandatory, layer B (omission, RESIDUE, Tickets and
 * the residual) is optional, and layer C is empty by construction.
 */
import { WorkSpacifyTreeError } from '../../workspacify-tree/lib/errors.mjs';
import { canonicalSerialize } from '../../workspacify-tree/lib/canonical-json.mjs';
import { SEED_REQUIRED_SECTIONS } from '../../workspacify-allocate/lib/seed-model.mjs';

/**
 * The gate this module reports under. It is the artefact-schema gate: the seed
 * renderer already raises `G3.6` for a malformed machine section, and a reverse
 * field on an artefact that must not carry one is the same class of defect.
 */
export const REVERSE_EXTENSION_GATE_ID = 'G3.6';

/**
 * How many headings an RFC-SEED has.
 *
 * Read from the seed model rather than written as a literal, so the check in
 * `seed-parse.mjs` and every consumer of this constant cannot disagree about it.
 */
export const headingCount = SEED_REQUIRED_SECTIONS.length;

/** The artefact kinds that may carry reverse provenance. Layer C is not among them. */
export const FORWARD_ARTIFACT_KINDS = Object.freeze({
  RESIDUAL: 'residual',
  RFC_SEED: 'rfc_seed',
  OMISSION: 'omission',
  RESIDUE: 'residue',
  TICKET: 'ticket',
});

/** The two rotations. An input that names neither is forward (ABOUT-REVERSE 6.0). */
export const MODE = Object.freeze({ FORWARD: 'forward', REVERSE: 'reverse' });

/** The origins a ticket can record (ABOUT-REVERSE 6.8, gate S6). */
export const TICKET_ORIGIN_KINDS = Object.freeze(['reverse', 'forward', 'evolution', 'omission', 'residue']);

/** The one origin that names the rotation which already ran. */
export const FORWARD_ORIGIN_KIND = 'forward';

/**
 * The reverse-only fields of each artefact kind.
 *
 * A field named here is optional: it appears when the run is in reverse mode and
 * is absent otherwise. The two lists that repeat a name across kinds — RESIDUE
 * and omission — repeat it deliberately, because a RESIDUE is not an omission and
 * the two may diverge later.
 */
export const REVERSE_FIELD_NAMES = Object.freeze({
  [FORWARD_ARTIFACT_KINDS.RESIDUAL]: Object.freeze(['normative_context', 'incomplete_for_scope']),
  [FORWARD_ARTIFACT_KINDS.RFC_SEED]: Object.freeze(['reverse_index', 'sidecar_reference']),
  [FORWARD_ARTIFACT_KINDS.OMISSION]: Object.freeze([
    'affected_claim_ids',
    'origin_residual_ids',
    'scope_ref',
    'oracle_gap_ref',
  ]),
  [FORWARD_ARTIFACT_KINDS.RESIDUE]: Object.freeze([
    'affected_claim_ids',
    'origin_residual_ids',
    'scenario_ref',
    'next_route',
  ]),
  [FORWARD_ARTIFACT_KINDS.TICKET]: Object.freeze([
    'driving_claim_ids',
    'driving_residual_ids',
    'counterexample_plan_ids',
    'origin_kind',
    'staleness_ref',
  ]),
});

/**
 * Which rotation an input belongs to.
 *
 * `mode` is the general spelling and `origin_kind` is the one a ticket uses, so
 * both are read. An absent mode, an unrecognised origin kind and an explicit
 * `forward` all mean forward: the fields are refused in every case where the
 * input has not positively declared that it came from the reverse rotation.
 *
 * @param {object} [input] - artefact, ticket or options object
 * @returns {'forward'|'reverse'}
 */
export function reverseModeOf(input) {
  if (input?.mode === MODE.REVERSE) {
    return MODE.REVERSE;
  }
  const originKind = input?.origin_kind;
  const isDeclaredReverseOrigin = TICKET_ORIGIN_KINDS.includes(originKind) && originKind !== FORWARD_ORIGIN_KIND;
  return isDeclaredReverseOrigin ? MODE.REVERSE : MODE.FORWARD;
}

/**
 * The reverse field names declared for one artefact kind.
 *
 * @param {string} kind - a value of FORWARD_ARTIFACT_KINDS
 * @returns {readonly string[]}
 * @throws {WorkSpacifyTreeError} for a kind that declares no reverse provenance
 */
export function declaredReverseFieldNames(kind) {
  const names = Object.hasOwn(REVERSE_FIELD_NAMES, kind) ? REVERSE_FIELD_NAMES[kind] : null;
  if (names === null) {
    const declared = Object.values(FORWARD_ARTIFACT_KINDS).join(', ');
    throw new WorkSpacifyTreeError(
      `"${kind}" is not an artefact kind that carries reverse provenance; the declared kinds are ${declared}`,
      { gateId: REVERSE_EXTENSION_GATE_ID },
    );
  }
  return names;
}

/**
 * Which declared reverse fields an artefact is already carrying.
 *
 * Returns names, never a verdict: the caller decides what a contaminated
 * artefact means, and every caller in this repository decides it is an error.
 *
 * @param {object} artefact
 * @param {string} kind
 * @returns {string[]} the declared field names present on the artefact
 */
export function detectReverseContamination(artefact, kind) {
  const subject = artefact ?? {};
  return declaredReverseFieldNames(kind).filter((field) => Object.hasOwn(subject, field));
}

/**
 * Attach the reverse-only fields, or refuse the reverse fields outright.
 *
 * In reverse mode the caller supplies the values — this module declares the
 * vocabulary and never invents a value — and the result is a new object: the
 * input is not mutated. In forward mode the artefact is returned unchanged, and
 * a reverse-only field anywhere in sight is reported rather than dropped, since
 * silence would allow a forward output to drift into a reverse shape unnoticed.
 *
 * @param {object} artefact - the forward artefact
 * @param {{ kind: string, mode?: string, reverseFields?: object }} options
 * @returns {object} the artefact, extended in reverse mode and identical in forward mode
 * @throws {WorkSpacifyTreeError} on an undeclared kind, an undeclared field, or a reverse field in forward mode
 */
export function extendForwardArtifacts(artefact, { kind, mode, reverseFields = {} } = {}) {
  const declared = declaredReverseFieldNames(kind);
  assertFieldsAreDeclared(reverseFields, declared, kind);

  const supplied = suppliedFieldNames(reverseFields, declared);
  const contaminated = [...new Set([...detectReverseContamination(artefact, kind), ...supplied])];
  const withMode = typeof mode === 'string' ? { ...artefact, mode } : artefact;

  if (reverseModeOf(withMode) !== MODE.REVERSE) {
    if (contaminated.length > 0) {
      throw new WorkSpacifyTreeError(
        `a forward ${kind} must not carry reverse-only field(s): ${contaminated.join(', ')}. `
          + `These fields appear only when the run is in reverse mode; remove them, or declare the reverse origin.`,
        { gateId: REVERSE_EXTENSION_GATE_ID },
      );
    }
    return artefact;
  }

  const additions = Object.fromEntries(supplied.map((field) => [field, reverseFields[field]]));
  return { ...artefact, ...additions };
}

/**
 * Assert that every field the kind declares is present.
 *
 * A caller that omitted one is told which one, by name. The alternative — filling
 * a declared field with a default — would manufacture provenance, which is the
 * one thing this module must never do.
 *
 * @param {object} artefact
 * @param {string} kind
 * @throws {WorkSpacifyTreeError} naming every declared field that is absent
 */
export function assertReverseAdditions(artefact, kind) {
  const subject = artefact ?? {};
  const missing = declaredReverseFieldNames(kind).filter((field) => subject[field] === undefined);
  if (missing.length > 0) {
    throw new WorkSpacifyTreeError(
      `the ${kind} artefact is missing its declared reverse field(s): ${missing.join(', ')}`,
      { gateId: REVERSE_EXTENSION_GATE_ID },
    );
  }
}

/**
 * Assert that two forms of one forward artefact are the same bytes.
 *
 * Text artefacts are compared as text, byte for byte. JSON artefacts are compared
 * through the repository's canonical serialisation, which is the form the
 * regression gate freezes a manifest digest over — so "identical" here means what
 * it means to the gate, not a weaker object equality.
 *
 * @param {string|object} before
 * @param {string|object} after
 * @param {{ label?: string }} [options]
 * @throws {WorkSpacifyTreeError} when the two forms differ
 */
export function assertForwardByteIdentity(before, after, { label = 'forward artefact' } = {}) {
  if (writtenFormOf(before) !== writtenFormOf(after)) {
    throw new WorkSpacifyTreeError(
      `${label} is not byte-identical to its pre-change form`,
      { gateId: REVERSE_EXTENSION_GATE_ID },
    );
  }
}

/**
 * The minimum reference a forward artefact carries back to the sidecar.
 *
 * A bundle hash and a count summary, and nothing else: the canonical record of
 * uncertainty is the sidecar's business, and an artefact that restated it would
 * be the expansion ABOUT-REVERSE 6.12.2 rejected.
 *
 * @param {{ bundleHash: string, counts?: object }} input
 * @returns {Readonly<{ sidecar_bundle_hash: string, counts: object }>}
 * @throws {WorkSpacifyTreeError} when the reference does not name a bundle
 */
export function sidecarReference({ bundleHash, counts = {} } = {}) {
  if (typeof bundleHash !== 'string' || bundleHash.trim() === '') {
    throw new WorkSpacifyTreeError(
      'a sidecar reference must name the bundle hash it points at',
      { gateId: REVERSE_EXTENSION_GATE_ID },
    );
  }
  return Object.freeze({ sidecar_bundle_hash: bundleHash, counts: Object.freeze({ ...counts }) });
}

/** The bytes a value has when written: text as itself, a JSON artefact canonically. */
// [::TICKET::] P22-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-10 --for-spec --no-implementation-order`.
function writtenFormOf(value) {
  return typeof value === 'string' ? value : canonicalSerialize(value);
}

/**
 * The declared fields a caller actually supplied.
 *
 * A declared field set to `undefined` is a field the caller did not supply, not a
 * supplied field whose value is nothing. Treating the two as one would let
 * `assertReverseAdditions` pass over a key whose value is absent — it would see the
 * key's presence and stop looking.
 */
// [::TICKET::] P22-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-10 --for-spec --no-implementation-order`.
function suppliedFieldNames(reverseFields, declared) {
  return declared.filter((field) => reverseFields[field] !== undefined);
}

/** A field the kind does not declare has no meaning here, so supplying one is a caller defect. */
// [::TICKET::] P22-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-10 --for-spec --no-implementation-order`.
function assertFieldsAreDeclared(reverseFields, declared, kind) {
  const undeclared = Object.keys(reverseFields).filter((field) => !declared.includes(field));
  if (undeclared.length > 0) {
    throw new WorkSpacifyTreeError(
      `${kind} declares no reverse field named ${undeclared.join(', ')}; the declared fields are ${declared.join(', ')}`,
      { gateId: REVERSE_EXTENSION_GATE_ID },
    );
  }
}
