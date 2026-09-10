/**
 * The return path — resolving a shortfall back to the uncertainty that produced it.
 *
 * ABOUT-REVERSE 1.3 records three kinds of gap and gives each its own instrument. A gap
 * found by `/find-omissions` and a shortfall recorded by `/crystalize-readme` are both
 * gaps *of the original hypothesis, norm or scope* — not "not enough tests" — and a count
 * cannot carry that. 6.12.3 layer B therefore gives the omission `affected_claim_ids` and
 * `origin_residual_ids`, and the RESIDUE `scenario_ref` and `next_route`; 6.10.1 gives the
 * edges the two commands are the return half of. This module is that half.
 *
 * Three properties are load-bearing, and each follows from the shape of the code rather
 * than from care taken at a call site:
 *
 *   - **Resolution is separated from emission.** A reference is checked against the
 *     registry it claims to come from before it is written, so a dangling identifier
 *     never reaches the output. A pointer to nothing is worse than no pointer: it reads
 *     as a chain that exists.
 *   - **In forward mode the artefact is returned *itself*, not a copy.** `/crystalize-readme`
 *     produces the RESIDUE whose count of zero is the stated success condition of the whole
 *     reverse rotation, so the forward shape is the thing this phase is measured by. An
 *     unchanged reference cannot serialise differently today or tomorrow; a copy that
 *     happens to match now is only a hopeful claim. `assertForwardShapeUnchanged` states
 *     that obligation once, so both commands are held to the same words.
 *   - **An unresolvable reference is returned as a finding, not thrown.** The caller
 *     reports it. What is thrown is a caller defect: a kind that carries no return
 *     reference, a field the kind does not declare, or a forward artefact that was handed
 *     one anyway.
 *
 * The field names are a projection of the single declaration in
 * `workspacify-reverse/lib/forward-extensions.mjs` (`REVERSE_FIELD_NAMES`), which P22-10
 * settled. The projection is deliberate: `.claude/scripts/tickets/` is the forward
 * rotation's tree and must not load the reverse tree's modules, because the design reads
 * the dependency the other way (6.12.2 — the reverse side reads forward artefacts).
 * `tests/tickets/reverse/return-refs.test.cjs` therefore proves the two agree instead of
 * assuming it, and fails loudly if a later addition moves one and not the other.
 *
 * The identifier shapes come from the producers: `claim-ledger.mjs`'s `buildClaimId()`
 * writes `clm-<stem>-<type>-<line>`, and residual, scenario and route names are opaque
 * words resolved against the registry that holds them.
 */
'use strict';

/** The kinds that carry a return reference. Layer C is absent by construction. */
const RETURN_REFERENCE_KINDS = Object.freeze({
  OMISSION: 'omission',
  RESIDUE: 'residue',
});

/**
 * The return references each kind carries, in the order they are written.
 *
 * A projection of `REVERSE_FIELD_NAMES` for the two layer B kinds — see the module note.
 */
const RETURN_REFERENCE_FIELDS = Object.freeze({
  omission: Object.freeze(['affected_claim_ids', 'origin_residual_ids']),
  residue: Object.freeze(['scenario_ref', 'next_route']),
});

/**
 * The routes a RESIDUE may travel next.
 *
 * ABOUT-REVERSE 6.10.1's RESIDUE row names R3.5, R5 and R6; `grill` is the R7.5 row and
 * the value `rfc-graph/contract-diff.js` already emits as `UNEXPLAINED_NEXT_ROUTE`. A
 * route outside this list is reported rather than written, because an undeclared route
 * would point the reader at a step that does not exist.
 */
const NEXT_ROUTES = Object.freeze(['R3.5', 'R5', 'R6', 'grill']);

/**
 * The shape `claim-ledger.mjs`'s `buildClaimId(seed, kind, lineNumber)` produces.
 *
 * Checked here rather than left to the registry lookup, so a malformed identifier is
 * reported as malformed instead of as merely unknown — the two need different fixes.
 */
const CLAIM_ID_PATTERN = /^clm-.+-(boundary_crossing|invariant|failure_contract)-\d+$/;

/** The reference a value belongs to when the caller does not name one. */
const CANONICAL_REFERENCE = Object.freeze({
  claim: 'affected_claim_ids',
  residual: 'origin_residual_ids',
  scenario: 'scenario_ref',
  route: 'next_route',
});

/** Whether a reference names many identifiers or one. */
const REFERENCE_ARITY = Object.freeze({ LIST: 'list', SINGLE: 'single' });

/**
 * What each reference field holds: the kind of identifier, and how many of them.
 *
 * The arity is declared rather than inferred from whatever arrived, because a
 * `scenario_ref` that quietly became a list would be read downstream as a scenario
 * that is an array of scenarios. Refusing the wrong shape is the same obligation as
 * refusing an identifier that resolves to nothing.
 */
const REFERENCE_FIELDS = Object.freeze({
  affected_claim_ids: Object.freeze({ kind: 'claim', arity: REFERENCE_ARITY.LIST }),
  origin_residual_ids: Object.freeze({ kind: 'residual', arity: REFERENCE_ARITY.LIST }),
  scenario_ref: Object.freeze({ kind: 'scenario', arity: REFERENCE_ARITY.SINGLE }),
  next_route: Object.freeze({ kind: 'route', arity: REFERENCE_ARITY.SINGLE }),
});

/**
 * What each kind of identifier is called, where it is looked up, and how it is shaped.
 *
 * `shape` is null where the design fixes no shape: a residual, scenario or route name is
 * an opaque word, and inventing a grammar for it here would refuse names the registry
 * legitimately holds.
 */
const IDENTIFIER_KINDS = Object.freeze({
  claim: Object.freeze({
    noun: 'claim identifier',
    registry: 'claim ledger',
    shape: CLAIM_ID_PATTERN,
  }),
  residual: Object.freeze({
    noun: 'residual identifier',
    registry: 'residual registry',
    shape: null,
  }),
  scenario: Object.freeze({
    noun: 'scenario identifier',
    registry: 'confirmed scenarios',
    shape: null,
  }),
  route: Object.freeze({
    noun: 'declared next route',
    registry: 'declared routes',
    shape: null,
  }),
});

/** The value a reference that resolved nothing is held against. */
const NOTHING_KNOWN = new Set();

/** A route is selected from a fixed list, so its finding names the list rather than a lookup. */
const ROUTE_KIND = 'route';

/** Refused because the caller asked for something the design does not allow. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
class ReturnReferenceRefused extends Error {
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
  constructor(message) {
    super(message);
    this.name = 'ReturnReferenceRefused';
  }
}

/** A usable name is a non-empty string; anything else cannot be an identifier. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function isUsableName(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** How a value is shown in a finding: quoted and type-unambiguous, so `42` is not read as `"42"`. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function display(value) {
  return JSON.stringify(value);
}

/** The registry a reference of this kind is resolved against. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function knownFor(kind, known) {
  if (known === null || typeof known !== 'object') {
    return NOTHING_KNOWN;
  }
  if (kind === 'claim') {
    return known.claims ?? NOTHING_KNOWN;
  }
  if (kind === 'residual') {
    return known.residuals ?? NOTHING_KNOWN;
  }
  if (kind === 'scenario') {
    return known.scenarios ?? NOTHING_KNOWN;
  }
  return NOTHING_KNOWN;
}

/** The reference field names a kind declares, or a refusal naming the declared kinds. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function declaredFields(kind) {
  const fields = Object.hasOwn(RETURN_REFERENCE_FIELDS, kind) ? RETURN_REFERENCE_FIELDS[kind] : null;
  if (fields === null) {
    throw new ReturnReferenceRefused(
      `"${kind}" carries no return reference; the declared kinds are `
        + `${Object.values(RETURN_REFERENCE_KINDS).join(', ')}`,
    );
  }
  return fields;
}

/** A field the kind does not declare has no meaning here, so supplying one is a caller defect. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function assertFieldsAreDeclared(references, fields, kind) {
  const undeclared = Object.keys(references).filter((field) => !fields.includes(field));
  if (undeclared.length > 0) {
    throw new ReturnReferenceRefused(
      `the ${kind} declares no return reference named ${undeclared.join(', ')}; `
        + `the declared references are ${fields.join(', ')}`,
    );
  }
}

/**
 * Resolve one reference to an identifier the registry actually holds.
 *
 * Returns the identifier, or the finding that explains why it could not be resolved.
 * It never throws for an unusable value: an unresolvable reference is a fact to report,
 * not a defect to interrupt on — reporting is the whole point of the return chain.
 *
 * @param {unknown} value - the identifier as the analysis wrote it
 * @param {{ kind: string, known?: object|null, reference?: string|null }} options
 * @returns {{ identifier: string|null, finding: object|null }}
 * @throws {ReturnReferenceRefused} for a kind that resolves nothing
 */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function resolveReturnRef(value, { kind, known = null, reference = null } = {}) {
  const descriptor = Object.hasOwn(IDENTIFIER_KINDS, kind) ? IDENTIFIER_KINDS[kind] : null;
  if (descriptor === null) {
    throw new ReturnReferenceRefused(
      `"${kind}" is not a kind of return reference; the declared kinds are `
        + `${Object.keys(IDENTIFIER_KINDS).join(', ')}`,
    );
  }

  const field = reference ?? CANONICAL_REFERENCE[kind];
  const finding = (reason) => ({ reference: field, kind, value, reason });

  if (kind === ROUTE_KIND) {
    if (!isUsableName(value) || !NEXT_ROUTES.includes(value)) {
      return {
        identifier: null,
        finding: finding(
          `${display(value)} is not a ${descriptor.noun}; the ${descriptor.registry} are `
            + `${NEXT_ROUTES.join(', ')}`,
        ),
      };
    }
    return { identifier: value, finding: null };
  }

  if (!isUsableName(value)) {
    return {
      identifier: null,
      finding: finding(`${display(value)} is not a ${descriptor.noun}`),
    };
  }

  if (descriptor.shape !== null && !descriptor.shape.test(value)) {
    return {
      identifier: null,
      finding: finding(
        `${display(value)} is not a ${descriptor.noun}; the shape the claim ledger `
          + 'builds is clm-<stem>-<type>-<line>',
      ),
    };
  }

  if (!knownFor(kind, known).has(value)) {
    return {
      identifier: null,
      finding: finding(`${display(value)} was not found in the ${descriptor.registry}`),
    };
  }

  return { identifier: value, finding: null };
}

/** The one reference a scalar field carries, or the empty list for a field left unset. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function suppliedValues(supplied) {
  if (supplied === undefined || supplied === null) {
    return { values: [], isList: false };
  }
  if (Array.isArray(supplied)) {
    return { values: supplied, isList: true };
  }
  return { values: [supplied], isList: false };
}

/** How a reference arrived, in the words a report uses. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function describeArity(isList) {
  return isList ? 'a list of identifiers' : 'a single identifier';
}

/** Whether what arrived is the shape the field declares. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function arityMatches(declared, isList) {
  return (declared === REFERENCE_ARITY.LIST) === isList;
}

/**
 * Attach the return references a reverse artefact names, or hold a forward artefact still.
 *
 * In reverse mode only the references that resolved are written, and every reference that
 * did not is returned as a finding carrying the artefact it was attached to. When nothing
 * resolved the artefact is returned unchanged: an omission with no originating uncertainty
 * is a legal and expected state, not a failure, so it is not given an empty field that
 * would read as a chain that was followed.
 *
 * In forward mode the artefact is returned *itself* and any return reference — on the
 * artefact or offered as an argument — is refused rather than dropped, because a silence
 * there would let a forward output drift into a reverse shape unnoticed.
 *
 * @param {object} artefact - the omission or the RESIDUE
 * @param {{ kind: string, mode?: string, references?: object, known?: object }} options
 * @returns {{ artefact: object, attached: string[], findings: object[] }}
 * @throws {ReturnReferenceRefused} on an undeclared kind, an undeclared field, or a forward artefact carrying a return reference
 */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function attachReturnRefs(artefact, { kind, mode, references = {}, known = null } = {}) {
  const subject = artefact ?? {};
  const fields = declaredFields(kind);
  assertFieldsAreDeclared(references, fields, kind);

  const offered = Object.keys(references).filter((field) => references[field] !== undefined);
  const isReverse = mode === 'reverse';

  if (!isReverse) {
    const contaminated = [...new Set([
      ...fields.filter((field) => Object.hasOwn(subject, field)),
      ...offered,
    ])];
    if (contaminated.length > 0) {
      throw new ReturnReferenceRefused(
        `a forward ${kind} must not carry return reference(s): ${contaminated.join(', ')}. `
          + 'These appear only when the run is in reverse mode; remove them, or declare the reverse origin.',
      );
    }
    return { artefact, attached: [], findings: [] };
  }

  const resolved = {};
  const attached = [];
  const findings = [];

  for (const field of fields) {
    const declaration = REFERENCE_FIELDS[field];
    const { values, isList } = suppliedValues(references[field]);
    if (values.length === 0) {
      continue;
    }

    if (!arityMatches(declaration.arity, isList)) {
      findings.push({
        reference: field,
        kind: declaration.kind,
        value: references[field],
        artefact,
        reason: `${field} carries ${describeArity(declaration.arity === REFERENCE_ARITY.LIST)}, `
          + `but ${describeArity(isList)} was supplied; the field is written as `
          + `${declaration.arity === REFERENCE_ARITY.LIST ? 'a list' : 'one identifier'}`,
      });
      continue;
    }

    const kept = [];
    for (const value of values) {
      const { identifier, finding } = resolveReturnRef(value, {
        kind: declaration.kind,
        known,
        reference: field,
      });
      if (identifier === null) {
        findings.push({ ...finding, artefact });
      } else if (!kept.includes(identifier)) {
        kept.push(identifier);
      }
    }

    if (kept.length > 0) {
      resolved[field] = isList ? kept : kept[0];
      attached.push(field);
    }
  }

  if (attached.length === 0) {
    return { artefact, attached, findings };
  }

  return { artefact: { ...subject, ...resolved }, attached, findings };
}

/**
 * The artefact with its declared return references removed.
 *
 * An artefact arriving from the analysis already carries the references it *proposes* —
 * that is where `rfc-graph/contract-diff.js` records them. Stripping them before
 * resolution is what makes "reported rather than emitted" true of the artefact and not
 * only of the report: a reference the ledger did not confirm must not survive into the
 * output by being left where it was found.
 *
 * @param {object} artefact
 * @param {string} kind
 * @returns {object} a new artefact carrying none of the kind's return references
 */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function withoutReturnRefs(artefact, kind) {
  const fields = RETURN_REFERENCE_FIELDS[kind] ?? [];
  return Object.fromEntries(
    Object.entries(artefact ?? {}).filter(([key]) => !fields.includes(key)),
  );
}

/**
 * Report unresolved return references in plain English, for the AI to read before it decides.
 *
 * The machine may say that a reference did not resolve; it may not say what that means for
 * the analysis. So this states the facts in the order the references appear and stops there.
 *
 * @param {object[]} findings - the findings from `attachReturnRefs`
 * @param {{ subject?: string, considered?: number|null }} [options] - `subject` is a plural noun
 * @returns {string}
 */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function renderReturnRefFindings(findings, { subject = 'omissions', considered = null } = {}) {
  const unresolved = findings ?? [];

  if (unresolved.length === 0) {
    if (considered === 0) {
      return `No ${subject} were detected, so no return references were recorded.`;
    }
    const counted = considered === null ? '' : ` ${considered} ${subject} considered;`;
    return `Every return reference resolved.${counted} no dangling identifier was emitted.`;
  }

  const lines = [
    `${unresolved.length} return reference(s) could not be resolved and were not written:`,
    '',
  ];
  for (const finding of unresolved) {
    const where = finding.artefact === undefined ? '' : ` (attached to ${describeArtefact(finding.artefact)})`;
    lines.push(`- ${finding.reference}: ${finding.value}${where} — ${finding.reason}`);
  }
  lines.push('');
  lines.push(
    'Resolve each against the registry it names, or record that it has no origin — a shortfall '
      + 'whose ancestry is unknown is a fact worth keeping, not a field to invent.',
  );
  return lines.join('\n');
}

/** How an artefact is named in a report, by whatever identifier it carries. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function describeArtefact(artefact) {
  for (const key of ['contract_id', 'candidate_id', 'id']) {
    if (isUsableName(artefact?.[key])) {
      return `${key} ${artefact[key]}`;
    }
  }
  return 'an unnamed artefact';
}

/**
 * Assert that a forward artefact's shape did not move.
 *
 * Reference identity is checked first and is stronger than byte identity: an artefact that
 * was returned itself cannot serialise differently, while one that was copied and happens
 * to match serialises the same only by luck. A caller that finds this failing has a forward
 * output drifting into a reverse shape, which is the single thing ABOUT-REVERSE 6.0 forbids
 * this phase from doing.
 *
 * @param {object} before - the forward artefact as it was
 * @param {object} after - the artefact the flow produced
 * @param {{ label?: string }} [options]
 * @returns {true}
 * @throws {ReturnReferenceRefused} naming the keys gained, lost, or changed
 */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function assertForwardShapeUnchanged(before, after, { label = 'forward artefact' } = {}) {
  if (before === after) {
    return true;
  }

  const beforeKeys = Object.keys(before ?? {});
  const afterKeys = Object.keys(after ?? {});
  const gained = afterKeys.filter((key) => !beforeKeys.includes(key));
  const lost = beforeKeys.filter((key) => !afterKeys.includes(key));

  if (gained.length > 0) {
    throw new ReturnReferenceRefused(
      `${label} gained the key(s) ${gained.join(', ')}; a forward artefact carries exactly the fields it carried before`,
    );
  }
  if (lost.length > 0) {
    throw new ReturnReferenceRefused(
      `${label} lost the key(s) ${lost.join(', ')}; a forward artefact carries exactly the fields it carried before`,
    );
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new ReturnReferenceRefused(
      `${label} changed a value while keeping its keys; a forward artefact is unchanged in every field`,
    );
  }

  return true;
}

module.exports = {
  RETURN_REFERENCE_KINDS,
  RETURN_REFERENCE_FIELDS,
  NEXT_ROUTES,
  CLAIM_ID_PATTERN,
  ReturnReferenceRefused,
  resolveReturnRef,
  attachReturnRefs,
  withoutReturnRefs,
  renderReturnRefFindings,
  assertForwardShapeUnchanged,
};

// ---------------------------------------------------------------------------
// The command-line entry point.
//
// Both command files run this, so the invocation is the same for an omission and
// for a RESIDUE and only `--kind` differs. The artefact arrives on stdin as the
// analysis recorded it — with its references already on it, which is where
// `rfc-graph/contract-diff.js` puts them — and leaves with only the references
// that resolved. The report goes to stdout after the artefact, in plain English,
// because the human reads it and decides; this process states facts and never a
// verdict, so it exits 0 whether or not every reference resolved.
// ---------------------------------------------------------------------------

const { readFileSync } = require('node:fs');

/** Read a JSON document, or refuse naming the file rather than the line it broke on. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new ReturnReferenceRefused(`"${filePath}" could not be read as JSON: ${error.message}`);
  }
}

/** The claim ids a `CLAIM-LEDGER.json` holds, at `claims[].claim_id`. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function readClaimIds(filePath) {
  const ledger = readJsonFile(filePath);
  const claims = Array.isArray(ledger?.claims) ? ledger.claims : [];
  return claims.map((claim) => claim?.claim_id).filter(isUsableName);
}

/**
 * The scenario ids a `CRYSTALIZE-Status.json` holds, at `grill.sections[].id`.
 *
 * `loop-drive-readme.js` upserts exactly that path, so a section the grill confirmed
 * is a scenario a RESIDUE may name.
 */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function readScenarioIds(filePath) {
  const status = readJsonFile(filePath);
  const sections = Array.isArray(status?.grill?.sections) ? status.grill.sections : [];
  return sections.map((section) => section?.id).filter(isUsableName);
}

/**
 * The identifiers a registry holds, taken from a dot path such as `residuals.residual_id`.
 *
 * The path is a parameter rather than a fixed shape because `RESIDUAL-REGISTRY.json` is
 * named by ABOUT-REVERSE 6.12.3 and no script writes it yet. Guessing its shape here would
 * resolve nothing while appearing to work, so the caller names the path and an override is
 * one argument rather than one release.
 */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function readIdsAtPath(document, dotPath) {
  const segments = String(dotPath).split('.').filter((segment) => segment !== '');
  const idKey = segments.pop();
  let node = document;
  for (const segment of segments) {
    node = node?.[segment];
  }
  if (!Array.isArray(node)) {
    return [];
  }
  return node.map((entry) => (typeof entry === 'string' ? entry : entry?.[idKey])).filter(isUsableName);
}

/** The value of `--name=value`, or null when the argument is not that option. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function optionValue(argument, name) {
  const prefix = `--${name}=`;
  return argument.startsWith(prefix) ? argument.slice(prefix.length) : null;
}

/** Read one artefact from stdin, or refuse naming what is missing. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function readArtefactFromStdin() {
  const text = readFileSync(0, 'utf8');
  if (text.trim() === '') {
    throw new ReturnReferenceRefused(
      'no artefact arrived on stdin; pipe the omission or the RESIDUE as JSON, as the analysis recorded it',
    );
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ReturnReferenceRefused(`the artefact on stdin is not JSON: ${error.message}`);
  }
}

/** The refusal a command-line invocation earns when it is malformed. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function parseCliOptions(argv) {
  const options = {
    kind: null,
    mode: 'reverse',
    claimLedger: null,
    residualRegistry: null,
    residualIdPath: 'residuals.residual_id',
    scenarioStatus: null,
  };
  const recognised = {
    kind: (value) => { options.kind = value; },
    mode: (value) => { options.mode = value; },
    'claim-ledger': (value) => { options.claimLedger = value; },
    'residual-registry': (value) => { options.residualRegistry = value; },
    'residual-id-path': (value) => { options.residualIdPath = value; },
    'scenario-status': (value) => { options.scenarioStatus = value; },
  };

  for (const argument of argv) {
    const matched = Object.keys(recognised).find((name) => optionValue(argument, name) !== null);
    if (matched === undefined) {
      throw new ReturnReferenceRefused(
        `"${argument}" is not an option of this command; the options are `
          + `${Object.keys(recognised).map((name) => `--${name}=`).join(', ')}`,
      );
    }
    recognised[matched](optionValue(argument, matched));
  }

  if (options.kind === null) {
    throw new ReturnReferenceRefused(
      '--kind= is required: it names the artefact kind, and the declared kinds are '
        + `${Object.values(RETURN_REFERENCE_KINDS).join(', ')}`,
    );
  }
  return options;
}

/** Build the registries the references are resolved against, from the files named. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function buildKnown(options) {
  return {
    claims: options.claimLedger === null
      ? NOTHING_KNOWN
      : new Set(readClaimIds(options.claimLedger)),
    residuals: options.residualRegistry === null
      ? NOTHING_KNOWN
      : new Set(readIdsAtPath(readJsonFile(options.residualRegistry), options.residualIdPath)),
    scenarios: options.scenarioStatus === null
      ? NOTHING_KNOWN
      : new Set(readScenarioIds(options.scenarioStatus)),
  };
}

/** The references an artefact already carries, which is where the analysis recorded them. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function referencesOf(artefact, kind) {
  const fields = RETURN_REFERENCE_FIELDS[kind] ?? [];
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(artefact, field)).map((field) => [field, artefact[field]]));
}

/** The plural noun the report uses for one artefact of this kind. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function subjectFor(kind) {
  return kind === RETURN_REFERENCE_KINDS.RESIDUE ? 'RESIDUE' : 'omission';
}

/** Resolve one artefact's references and print the artefact, then the report. */
// [::TICKET::] P22-17 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-17 --for-spec --no-implementation-order`.
function runCli(argv) {
  const options = parseCliOptions(argv);
  const artefact = readArtefactFromStdin();

  // In reverse mode the artefact arrives carrying the references it proposes, so its own
  // fields are the input to resolution and must be stripped before the resolved subset is
  // written back. In forward mode it is handed over untouched, and carrying a reference at
  // all is refused rather than quietly removed.
  const result = options.mode === 'reverse'
    ? attachReturnRefs(withoutReturnRefs(artefact, options.kind), {
      kind: options.kind,
      mode: options.mode,
      references: referencesOf(artefact, options.kind),
      known: buildKnown(options),
    })
    : attachReturnRefs(artefact, { kind: options.kind, mode: options.mode });

  const report = renderReturnRefFindings(result.findings, {
    subject: subjectFor(options.kind),
    considered: 1,
  });
  process.stdout.write(`${JSON.stringify(result.artefact, null, 2)}\n\n${report}\n`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    if (error instanceof ReturnReferenceRefused) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
