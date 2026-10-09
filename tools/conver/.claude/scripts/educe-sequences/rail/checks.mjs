// The check constructor library (PX-241, contracts C001, C002).
//
// Every check this rail declares is one of six shapes, and the shapes are what the
// Gaia record reduces to when its twenty-one checks are classified: two records must
// agree, the apparatus output must cover its input, every member must fall in exactly
// one declared bucket, every declared name must be reached, a claim must cite a
// carrier, and a claim must be grounded in the line it names. Before this module the
// shapes were fused into the checks themselves, so writing a new check meant copying
// an old one.
//
// A constructor takes two things: the **contract** — the id, the defect that produced
// the check and the reading it refuses — and the **shape**, which is the part particular
// to this check. Two rules hold for every constructor. It refuses without the
// originating defect, because a check whose origin is forgotten is the first one deleted
// when it turns red. And it never decides: each returns verdicts naming a subject and a
// reason, and never treats a name appearing near a region, a plain span intersection or
// a coverage relation as evidence about what a line says.
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
import { uncoveredRanges } from './coverage.mjs';
import { PIN_RULES, flattenPins, rederivePin } from './pins.mjs';

/**
 * The pin kinds a check may be built for.
 *
 * Derived from the flattener rather than listed, so this module carries no second
 * copy of the pin vocabulary. The probe holds one member of each list, because a
 * list flattens to no pin at all when it is empty and a kind would go missing.
 */
const PIN_SHAPE_PROBE = Object.freeze({ predicate: {}, rowSchema: {}, enumerations: [{}], forms: [{}], blocks: [] });
export const PIN_KINDS = Object.freeze([...new Set(flattenPins(PIN_SHAPE_PROBE).map((pin) => pin.kind))]);

const DEFAULT_SCOPE = 'every artifact';

/** One verdict, in the one shape every check reports. */
function verdict(id, subject, reason) {
  return { check: id, subject, reason };
}

/** Refuse a check that would be unattributable, which is a check nobody can act on. */
function requireAttribution({ id, defect, refuses }) {
  if (typeof id !== 'string' || id.trim() === '') throw new Error('the check has no id');
  if (typeof defect !== 'string' || defect.trim() === '') throw new Error(`the check "${id}" has no originating defect`);
  if (typeof refuses !== 'string' || refuses.trim() === '') throw new Error(`the check "${id}" does not say what reading it refuses`);
}

/** A check is its contract plus the reading it performs, and nothing else. */
function checkOf(contract, run) {
  return {
    id: contract.id,
    originatingDefect: contract.defect,
    refuses: contract.refuses,
    scope: contract.scope ?? DEFAULT_SCOPE,
    run,
  };
}

/** The name a verdict uses for a member, so a refusal points at something a reader can find. */
function labelOf(member, label) {
  if (typeof label === 'function') return label(member);
  return member?.id ?? String(member);
}

/** A bucket set given either literally or as a function of the context. */
function bucketsIn(buckets, context) {
  return typeof buckets === 'function' ? buckets(context) : buckets;
}

/** Whitespace collapsed, so a quote broken across a line break is still comparable. */
function normalise(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

/**
 * A check that re-derives one pin kind and reports the pin's own verdict.
 *
 * The kind is checked against the flattener, so a check built for a kind no pin
 * carries is refused at construction rather than shipped as one that never fires.
 */
export function pinCheck(id, kind, defect, refuses) {
  requireAttribution({ id, defect, refuses });
  if (!PIN_KINDS.includes(kind)) {
    throw new Error(`the check "${id}" names pin kind "${kind}"; the kinds are ${PIN_KINDS.join(', ')}`);
  }
  return checkOf({ id, defect, refuses, scope: `every artifact, on the ${kind} pin` }, (context) => {
    for (const pin of flattenPins(context.artifact.pins).filter((candidate) => candidate.kind === kind)) {
      const result = rederivePin(pin, context.specLines);
      if (!result.ok) {
        return [{ check: id, pin: result.pin, subject: result.pin, rule: result.rule, line: result.line, reason: result.reason }];
      }
    }
    return [];
  });
}

/**
 * A check that two records which must agree do agree.
 *
 * The difference is symmetric and reported in both directions, because a name that
 * left the first record and a name that joined the second are different findings and
 * one count would make them identical.
 */
export function agreeOn(contract, { left, right, key = (record) => record.id, value = (record) => JSON.stringify(record) }) {
  requireAttribution(contract);
  return checkOf(contract, (context) => {
    const index = (records) => new Map(records.map((record) => [key(record), value(record)]));
    const first = index(left(context));
    const second = index(right(context));
    const verdicts = [];
    for (const [name, held] of first) {
      if (!second.has(name)) verdicts.push(verdict(contract.id, name, 'present in the first record and absent from the second'));
      else if (second.get(name) !== held) verdicts.push(verdict(contract.id, name, `the two records disagree: ${held} against ${second.get(name)}`));
    }
    for (const name of second.keys()) {
      if (!first.has(name)) verdicts.push(verdict(contract.id, name, 'present in the second record and absent from the first'));
    }
    return verdicts;
  });
}

/** How a run of lines is named in a verdict, so a refusal points at what to repair. */
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
function lineRangeLabel({ first, last }) {
  return first === last ? String(first) : `${first}-${last}`;
}

/**
 * A check that every line of the document belongs to a span.
 *
 * This is the shape for the unit the other coverage checks are counted in: the census
 * counts sections and the reach check counts operations, and neither counts lines, so a
 * document could be partitioned and adjudicated while the body of it was never read. The
 * verdicts are one per uncovered run rather than one per uncovered line, because a gap of
 * fourteen thousand lines is one finding and not fourteen thousand.
 */
export function coverEveryLine(contract, { spans, lineCount, label = lineRangeLabel }) {
  requireAttribution(contract);
  return checkOf(contract, (context) =>
    uncoveredRanges({ spans: spans(context) ?? [], lineCount: lineCount(context) })
      .map((range) => verdict(contract.id, label(range), contract.refuses)));
}

/**
 * A check that the apparatus output covers the apparatus input.
 *
 * This is the shape that sees what the apparatus never entered: a section no entry
 * starts inside, a claim no reader signed. Coverage is never read as reading — a
 * source the check cannot judge is reported, not skipped.
 */
export function coverEvery(contract, { sources, coveredBy, label }) {
  requireAttribution(contract);
  return checkOf(contract, (context) =>
    (sources(context) ?? [])
      .filter((source) => coveredBy(source, context) !== true)
      .map((source) => verdict(contract.id, labelOf(source, label), contract.refuses)));
}

/**
 * A check that every member falls in exactly one declared bucket and carries that
 * bucket's evidence.
 *
 * The evidence half is what stops the classification being satisfied by relabelling:
 * an operation marked positioned that no step names is refused rather than counted.
 */
export function placeEach(contract, { members, buckets, bucketOf, label }) {
  requireAttribution(contract);
  return checkOf(contract, (context) => {
    const declared = bucketsIn(buckets, context);
    return (members(context) ?? []).flatMap((member) => {
      const subject = labelOf(member, label);
      const placed = bucketOf(member, context);
      if (placed === null || placed === undefined) return [verdict(contract.id, subject, `no position: ${contract.refuses}`)];
      if (!declared.includes(placed.bucket)) {
        return [verdict(contract.id, subject, `position "${placed.bucket}" is not one of ${declared.join(', ')}`)];
      }
      if (placed.evidence === undefined || placed.evidence === null || placed.evidence === '') {
        return [verdict(contract.id, subject, `the ${placed.bucket} position carries no evidence`)];
      }
      return [];
    });
  });
}

/**
 * A check that every claim cites a line inside the span it belongs to, or one the span
 * records as a crossing.
 *
 * Coverage is not the relation this asks about: a span that contains a line has not read
 * it, and an apparatus that accepted coverage counted a claim as realized by an entry that
 * cited none of its lines. A separation is permitted once it is recorded, because a
 * procedure may be stated in one place and anchored in another — what is refused is the
 * absorption, which would make a span of a third of the document read as one reading.
 */
export function citeInside(contract, { claims, spanOf, crossings, label }) {
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
  requireAttribution(contract);
  return checkOf(contract, (context) =>
    (claims(context) ?? []).flatMap((claim) => {
      const subject = labelOf(claim, label);
      const span = spanOf(claim, context);
      if (span === null || span === undefined) return [verdict(contract.id, subject, `no span: ${contract.refuses}`)];
      if (!Number.isInteger(claim.line)) return [verdict(contract.id, subject, `the citation carries no integer line: ${contract.refuses}`)];
      if (claim.line >= span.firstLine && claim.line <= span.lastLine) return [];
      const recorded = (crossings(span, context) ?? []).some((crossing) => crossing.line === claim.line);
      return recorded ? [] : [verdict(contract.id, subject, `line ${claim.line} is outside ${span.id} ${span.firstLine}-${span.lastLine} and is not recorded as a crossing`)];
    }));
}

/**
 * A check that every declared name is reached, in both directions.
 *
 * The two directions are different findings — a claimed name nobody declares is a
 * fabricated name, and a declared name nothing reaches is missing work — so each
 * verdict carries its direction and the two are never summed. An entry whose steps
 * derive no operation is a third finding, because an entry that realizes nothing is
 * not a sequence.
 */
export function reachEvery(contract, { claimed, declared, exempt = () => false, entries, derivedBy, mustRealize = () => true, label }) {
  requireAttribution(contract);
  return checkOf(contract, (context) => {
    const declaredNames = new Set(declared(context) ?? []);
    const claimedNames = (claimed(context) ?? []).filter((name) => name !== undefined && name !== null);
    const verdicts = [];

    for (const name of new Set(claimedNames)) {
      if (!declaredNames.has(name)) {
        verdicts.push({ ...verdict(contract.id, name, `claimed by a step and declared by no operation: ${contract.refuses}`), direction: 'forward' });
      }
    }
    const reached = new Set(claimedNames);
    for (const name of declaredNames) {
      if (!reached.has(name) && exempt(name, context) !== true) {
        verdicts.push({ ...verdict(contract.id, name, `declared, reached by no step, and covered by no escape: ${contract.refuses}`), direction: 'backward' });
      }
    }
    if (typeof entries === 'function' && typeof derivedBy === 'function') {
      for (const entry of entries(context) ?? []) {
        if (mustRealize(entry, context) !== true) continue;
        if ((derivedBy(entry, context) ?? []).length === 0) {
          verdicts.push({ ...verdict(contract.id, labelOf(entry, label), 'no step derives an operation for this entry'), direction: 'unrealized' });
        }
      }
    }
    return verdicts;
  });
}

/**
 * A check that every claim cites a carrier that exists.
 *
 * A claim reaching outside its carrier set is the shape of a name bound because it
 * appeared nearby, so the carrier set is supplied by the caller and the check only
 * asks whether the name is in it. The set is resolved per claim rather than once:
 * one set holding every carrier in the artifact would allow the claim to cite the carrier
 * that belongs to a different subject, which is the defect itself.
 */
export function citeFrom(contract, { claims, carriers }) {
  requireAttribution(contract);
  return checkOf(contract, (context) =>
    (claims(context) ?? [])
      .filter((claim) => !new Set(carriers(claim, context) ?? []).has(claim.carrier))
      .map((claim) => verdict(contract.id, claim.subject, `${contract.refuses}: ${claim.carrier}`)));
}

/**
 * A check that every claim is grounded in the line it names.
 *
 * The quote is compared as a contiguous substring of the line after whitespace is
 * normalised, because a quote assembled from two places is the fabrication this asks
 * about, and the comparison has to be able to say so.
 */
export function groundIn(contract, { claims }) {
  requireAttribution(contract);
  return checkOf(contract, (context) =>
    (claims(context) ?? []).flatMap((claim) => {
      const line = context.specLines[claim.line - 1];
      if (typeof line !== 'string' || !normalise(line).includes(normalise(claim.quote))) {
        return [verdict(contract.id, claim.subject, `${contract.refuses}: line ${claim.line} does not carry the quote`)];
      }
      return [];
    }));
}

/** The rule names, re-exported so a reader can see what re-derivation means from here. */
export const CHECK_PIN_RULES = PIN_RULES;
