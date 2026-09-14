/**
 * Design 1.2's invariant, measured rather than asserted.
 *
 * 1.2 is the load-bearing sentence of the whole design: **none of the four patterns may
 * be blocked or aborted on the grounds that the project is an incomplete conver project**.
 * Incompleteness is the input, not a refusal condition. 5.7 records six formulations that
 * violate it — each written down before being removed, which is the evidence that the
 * invariant is one well-intentioned edit away from being broken silently, against exactly
 * the project the rotation exists for.
 *
 * Nothing read the gate table against the code, so this module reads the declarations
 * twice, independently. A family's *declaration sites* state which gates exist; its *gate
 * sites* are where those gates actually produce records. The two are compared, so a gate
 * declared and never emitted and a gate emitted without a declaration are both named
 * rather than absorbed into a smaller set nobody looks at. On this repository the first
 * run of that comparison named A6, which `REVERSE_GATE_IDS` declares and no gate emits.
 *
 * The audit observes. It adds no gate, refuses nothing, and its failure mode is a failing
 * test rather than a refused run — which is the whole point, because a gate that enforced
 * this invariant would have to refuse something, and refusing is what 1.2 forbids.
 *
 * [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The paragraph this audit measures a chain against. Named so a finding can cite it. */
export const INVARIANT_SOURCE = 'docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md §1.2';

/**
 * How a gate's identity is written on a record.
 *
 * `gateId` is the reverse chain's property. `rule` is what the claim ledger's demotion
 * carries — design 6.14.7 gives that refusal a number and a name, and the name is written
 * the same way an identifier is, so it is read the same way.
 */
export const GATE_IDENTITY_PROPERTIES = Object.freeze(['gateId', 'rule']);

/**
 * Where each family declares its gates, and where those gates actually run.
 *
 * These are module paths rather than identifiers. The identifiers are read out of the
 * named declaration at each site, so adding a gate to a module is enough for the audit to
 * see it and no second copy of the list exists to drift. `split` is the clearest case for
 * why the two site kinds are separate: `test-mapping.js` declares S1 to S6 and only ever
 * emits S2, while `reverse-split.js` emits the other five.
 */
export const GATE_FAMILIES = Object.freeze([
  Object.freeze({
    family: 'reverse-tree',
    declarationSites: Object.freeze([
      Object.freeze({ module: '.claude/scripts/workspacify-tree/lib/reverse-mode.mjs', declaration: 'REVERSE_GATE_IDS' }),
      Object.freeze({ module: '.claude/scripts/workspacify-tree/lib/structure-parity.mjs', declaration: 'STRUCTURE_GATE_IDS' }),
      Object.freeze({ module: '.claude/scripts/workspacify-tree/lib/architecture-delta.mjs', declaration: 'ARCHITECTURE_DELTA_GATE_ID' }),
    ]),
    gateSites: Object.freeze([
      '.claude/scripts/workspacify-tree/lib/reverse-mode.mjs',
      '.claude/scripts/workspacify-tree/lib/structure-parity.mjs',
      '.claude/scripts/workspacify-tree/lib/architecture-delta.mjs',
    ]),
  }),
  Object.freeze({
    family: 'reverse-allocate',
    declarationSites: Object.freeze([
      Object.freeze({ module: '.claude/scripts/workspacify-allocate/lib/reverse-mode.mjs', declaration: 'REVERSE_GATE_IDS' }),
    ]),
    gateSites: Object.freeze(['.claude/scripts/workspacify-allocate/lib/reverse-mode.mjs']),
  }),
  Object.freeze({
    family: 'normative',
    declarationSites: Object.freeze([
      Object.freeze({ module: '.claude/scripts/grill-me-for-rfc/normative-decision.js', declaration: 'GATE_IDS' }),
    ]),
    gateSites: Object.freeze(['.claude/scripts/grill-me-for-rfc/normative-decision.js']),
  }),
  Object.freeze({
    family: 'grounding',
    declarationSites: Object.freeze([
      Object.freeze({ module: '.claude/scripts/rfc-graph/grounding-check.js', declaration: 'GF1_GATE_ID' }),
    ]),
    gateSites: Object.freeze(['.claude/scripts/rfc-graph/grounding-check.js']),
  }),
  Object.freeze({
    family: 'contract-diff',
    declarationSites: Object.freeze([
      Object.freeze({ module: '.claude/scripts/rfc-graph/contract-diff.js', declaration: 'GF2_GATE_ID' }),
    ]),
    gateSites: Object.freeze(['.claude/scripts/rfc-graph/contract-diff.js']),
  }),
  Object.freeze({
    family: 'boundify',
    declarationSites: Object.freeze([
      Object.freeze({ module: '.claude/scripts/rfc-graph/reverse-boundify-gates.js', declaration: 'GATE_IDS' }),
    ]),
    gateSites: Object.freeze(['.claude/scripts/rfc-graph/reverse-boundify-gates.js']),
  }),
  Object.freeze({
    family: 'split',
    declarationSites: Object.freeze([
      Object.freeze({ module: '.claude/scripts/tickets/lib/test-mapping.js', declaration: 'GATE_IDS' }),
    ]),
    gateSites: Object.freeze([
      '.claude/scripts/tickets/lib/test-mapping.js',
      '.claude/scripts/tickets/lib/reverse-split.js',
    ]),
  }),
  Object.freeze({
    family: 'claim-ledger',
    declarationSites: Object.freeze([
      Object.freeze({ module: '.claude/scripts/workspacify-reverse/lib/claim-ledger.mjs', declaration: 'RULE_ID' }),
    ]),
    gateSites: Object.freeze(['.claude/scripts/workspacify-reverse/lib/claim-ledger.mjs']),
  }),
]);

/** The sentences inside a reason, so a match cannot straddle two unrelated statements. */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function sentencesOf(message) {
  return String(message)
    .split(/[.;\n]/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** Whether one sentence names a mechanism *and* requires it, which is what makes it a step. */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function requiresMechanismStep(message, mechanism) {
  return sentencesOf(message).some(
    (sentence) =>
      mechanism.test(sentence)
      && /\b(?:step|workflow)\b/i.test(sentence)
      && /\b(?:must|requir(?:e|es|ed)|precondition|before|first|needs?)\b/i.test(sentence),
  );
}

/**
 * The six formulations 5.7 records as tried, measured and rejected.
 *
 * Each is data — `{ id, description, sample, matches }` — so a finding names the
 * formulation rather than quoting a regex, and adding a seventh is adding a row. `sample`
 * is the sentence the fixture uses to drive the check; the suite asserts that each row
 * matches its own sample, so a predicate and its sample cannot drift apart.
 *
 * The three step formulations share a shape, and therefore a predicate: 5.7 rejected them
 * because each would make a mechanism something the rotation *must run*, so the sentence
 * has to name the mechanism, call it a step or a workflow, and require it. Without the
 * third clause the check fires on any path containing the words — this repository holds
 * `.claude/scripts/drill-rfc-down/verify-step.js`, which is a filename, not a precondition.
 */
export const FORBIDDEN_REFUSALS = Object.freeze([
  Object.freeze({
    id: 'not-a-conver-project',
    description: 'A gate that stops the run because the subject is not a conver project',
    sample: 'the subject is not a conver project, so no rotation is attempted',
    matches: (message) => /is\s+not\s+a\s+conver\s+project|isn'?t\s+a\s+conver\s+project|no\s+conver\s+project/i.test(message),
  }),
  Object.freeze({
    id: 'holdout-isolation-precondition',
    description: '`holdout isolation` as a precondition',
    sample: 'holdout isolation is a precondition of this run',
    matches: (message) =>
      /holdout\s+isolation[^.]*\b(?:precondition|before|first|required)\b/i.test(message)
      || /\b(?:precondition|before|first|required)\b[^.]*holdout\s+isolation/i.test(message),
  }),
  Object.freeze({
    id: 'scrub-detect-verify-step',
    description: '`scrub` / `detect` / `verify` as workflow steps',
    sample: 'the workflow must run a scrub step before the measurement',
    matches: (message) => requiresMechanismStep(message, /\b(?:scrub|detect|verify)\b/i),
  }),
  Object.freeze({
    id: 'oracle-compare-step',
    description: '`oracle compare` as a workflow step',
    sample: 'oracle compare is a step the workflow requires in this rotation',
    matches: (message) => requiresMechanismStep(message, /\boracle\s+compare\b/i),
  }),
  Object.freeze({
    id: 'regression-check-precondition',
    description: '`run.mjs regression check` as a precondition',
    sample: 'a regression check is a precondition of every reverse run',
    matches: (message) =>
      /regression\s+check[^.]*\b(?:precondition|before|first|required)\b/i.test(message)
      || /\b(?:precondition|before|first|required)\b[^.]*regression\s+check/i.test(message),
  }),
  Object.freeze({
    id: 'must-already-be-complete',
    description: 'Any statement that the project must already be a complete conver project',
    sample: 'the project must already be a complete conver project before the rotation may start',
    matches: (message) =>
      /must\s+(?:already\s+)?be\s+a\s+complete\s+conver\s+project|requires?\s+a\s+complete\s+conver\s+project/i.test(message),
  }),
]);

/**
 * The four states a gate's outcome can be in.
 *
 * `recorded-disagreement` and `refused` are different statements about the same number of
 * differences, and keeping them apart is the point: 2.4 says a recorded inconsistency is
 * not a contradiction, so a gate that reports a difference and continues has not refused.
 */
export const GATE_OUTCOMES = Object.freeze({
  PASSED: 'passed',
  RECORDED_DISAGREEMENT: 'recorded-disagreement',
  REFUSED: 'refused',
  NEVER_REFUSING: 'never-refusing',
});

/** The statuses that mean a gate refused rather than recorded. */
export const REFUSAL_STATUSES = Object.freeze(['FAIL', 'BLOCKED', 'REVIEW_REQUIRED']);

/**
 * The count a record carries when it did not record the differences it found.
 *
 * T5 and GF2 both report `counts.unrecorded`, and both PASS when it is zero. Reading the
 * classification off this field rather than off the difference count is what makes the
 * boundary invariant turn on the record instead of on the number.
 */
export const UNRECORDED_COUNT_FIELD = 'unrecorded';

/** The count a record carries when it found differences at all. */
export const DIFFERENCE_COUNT_FIELD = 'differences';

/** A gate identifier as the modules write it: an uppercase word, optionally numbered. */
const GATE_IDENTIFIER = /^[A-Z][A-Za-z0-9]*(?:-\d+)?$/;

/** Read a file, or say why it could not be read. */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function readModule(absPath) {
  try {
    return { text: readFileSync(absPath, 'utf8'), reason: null };
  } catch (error) {
    return { text: null, reason: `${error.code ?? 'error'}: the module could not be read` };
  }
}

/**
 * The statement a named declaration is written as.
 *
 * Balanced rather than line-based, because `Object.freeze({ T1: 'T1', ... })` spans a
 * line and a single-value declaration does not. Stopping at the first `;` outside any
 * bracket handles both without a parser.
 */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function declarationStatement(source, name) {
  const match = new RegExp(`\\bconst\\s+${name}\\s*=`).exec(source);
  if (match === null) return null;

  const start = match.index + match[0].length;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{' || character === '[' || character === '(') depth += 1;
    else if (character === '}' || character === ']' || character === ')') depth -= 1;
    else if (character === ';' && depth === 0) return source.slice(start, index);
    else if (character === '\n' && depth === 0) return source.slice(start, index);
  }
  return source.slice(start);
}

/** Every single-quoted string inside a fragment, in source order. */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function quotedStrings(fragment) {
  return [...fragment.matchAll(/'([^'\\\n]*)'/g)].map((match) => match[1]);
}

/** The identifiers a declaration site states, read from the constant it names. */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function readDeclaration(source, declaration) {
  const statement = declarationStatement(source, declaration);
  if (statement === null) return null;
  return [...new Set(quotedStrings(statement).filter((value) => GATE_IDENTIFIER.test(value)))];
}

/** The single-value constants a module declares, so `gateId: SOME_ID` can be resolved. */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function declaredConstants(source) {
  const constants = new Map();
  for (const match of source.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*'([^']+)'/g)) {
    constants.set(match[1], match[2]);
  }
  return constants;
}

/**
 * The identifiers a gate site actually produces.
 *
 * Four ways a module writes a gate's identity, all read: the member access
 * (`REVERSE_GATE_IDS.T6`), the record property (`` gateId: 'T6' ``), the record property
 * naming a constant declared in the same module (`gateId: GF1_GATE_ID`), and the literal
 * handed to a record constructor (`gateRecord('T1', …)`). Reading only one of them would
 * make a family look empty for a reason that has nothing to do with its gates.
 */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function readIdentifiersUsed(source) {
  const identityProperties = GATE_IDENTITY_PROPERTIES.join('|');
  const constants = declaredConstants(source);
  const found = new Set();

  for (const match of source.matchAll(/\b[A-Z0-9_]*GATE_IDS\.([A-Za-z0-9]+)/g)) found.add(match[1]);
  for (const match of source.matchAll(new RegExp(`\\b(?:${identityProperties})\\s*:\\s*'([^']+)'`, 'g'))) found.add(match[1]);
  for (const match of source.matchAll(/\bgateRecord\(\s*'([^']+)'/g)) found.add(match[1]);
  for (const match of source.matchAll(new RegExp(`\\b(?:${identityProperties})\\s*:\\s*([A-Z][A-Z0-9_]*)`, 'g'))) {
    const resolved = constants.get(match[1]);
    if (resolved !== undefined) found.add(resolved);
  }

  return [...found].filter((value) => GATE_IDENTIFIER.test(value));
}

/**
 * Every gate the reverse chain declares, and every gate it produces.
 *
 * The two sets are built from different reads of the same modules and reported
 * separately, because the whole value of the audit is the difference between them. An
 * unreadable module is reported by path with its reason rather than skipped: a family
 * that vanishes from the enumeration would shrink the audit's subject silently, which is
 * the shape the audit exists to catch in the gates themselves.
 */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
export function enumerateReverseGates({ projectRoot } = {}) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw new Error('enumerateReverseGates must be given the project root to read the declarations from');
  }

  const declaredByGateId = new Map();
  const usedByGateId = new Map();
  const unreadable = [];
  const sources = new Map();

  const sourceOf = (module) => {
    if (!sources.has(module)) sources.set(module, readModule(join(projectRoot, module)));
    return sources.get(module);
  };

  for (const family of GATE_FAMILIES) {
    for (const site of family.declarationSites) {
      const { text, reason } = sourceOf(site.module);
      if (text === null) {
        unreadable.push({ family: family.family, module: site.module, reason });
        continue;
      }
      const identifiers = readDeclaration(text, site.declaration);
      if (identifiers === null) {
        unreadable.push({
          family: family.family,
          module: site.module,
          reason: `no \`const ${site.declaration}\` declaration was found in the module`,
        });
        continue;
      }
      for (const gateId of identifiers) {
        if (!declaredByGateId.has(gateId)) declaredByGateId.set(gateId, { family: family.family, module: site.module });
      }
    }

    for (const module of family.gateSites) {
      const { text, reason } = sourceOf(module);
      if (text === null) {
        unreadable.push({ family: family.family, module, reason });
        continue;
      }
      for (const gateId of readIdentifiersUsed(text)) {
        if (!usedByGateId.has(gateId)) usedByGateId.set(gateId, { family: family.family, sourceFile: module });
      }
    }
  }

  // An unreadable module travels in `gates` rather than beside it, so the audit cannot
  // be handed an enumeration that reads as a chain with no gates. A family the audit
  // could not look at is a finding, and a caller that dropped it would be dropping the
  // failure rather than the noise.
  const gates = [
    ...[...new Set([...declaredByGateId.keys(), ...usedByGateId.keys()])]
      .sort()
      .map((gateId) => {
        const declared = declaredByGateId.get(gateId) ?? null;
        const used = usedByGateId.get(gateId) ?? null;
        return {
          gateId,
          family: (declared ?? used).family,
          sourceFile: used === null ? null : used.sourceFile,
          declared: declared !== null,
          enumerated: used !== null,
        };
      }),
    ...unreadable.map((row) => ({
      gateId: null,
      family: row.family,
      sourceFile: null,
      declared: false,
      enumerated: false,
      module: row.module,
      unreadable: row.reason,
    })),
  ];

  const declaredGateIds = [...declaredByGateId.keys()].sort();
  const enumeratedGateIds = [...usedByGateId.keys()].sort();

  return {
    families: GATE_FAMILIES.map((family) => ({
      family: family.family,
      declaredGateIds: declaredGateIds.filter((gateId) => declaredByGateId.get(gateId).family === family.family),
      enumeratedGateIds: enumeratedGateIds.filter((gateId) => usedByGateId.get(gateId).family === family.family),
    })),
    declaredGateIds,
    enumeratedGateIds,
    declaredOnly: declaredGateIds.filter((gateId) => !usedByGateId.has(gateId)),
    enumeratedOnly: enumeratedGateIds.filter((gateId) => !declaredByGateId.has(gateId)),
    gates,
    unreadable,
  };
}

/** Whether a record says its gate refused rather than recorded what it found. */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function recordRefused(record) {
  if (REFUSAL_STATUSES.includes(record?.status)) return true;
  return countOf(record?.counts?.[UNRECORDED_COUNT_FIELD]) > 0;
}

/** A count off a record, treating anything that is not a number as none. */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function countOf(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * The reasons a gate refused with, and none of the reasons it passed with.
 *
 * A PASS record carries a reason too — T6 in forward mode says the provenance is
 * deliberately absent — so reading every reason would report a gate that never refused as
 * refusing. Only a record that refused contributes, which is what makes the check a check
 * over refusal reasons rather than over all messages.
 */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
export function collectRefusalReasons(gate) {
  const records = gate.records ?? (gate.record === undefined ? [] : [{ record: gate.record }]);
  return records
    .filter((entry) => recordRefused(entry.record))
    .flatMap((entry) => entry.record.reasons ?? []);
}

/**
 * Which of the four states a gate record landed in.
 *
 * The order matters. A refusal status is a refusal whatever the counts say. An unrecorded
 * disagreement is a refusal whatever the status says, because 2.4 defines a contradiction
 * as an *unrecorded* inconsistency. Only then does a recorded difference become
 * `recorded-disagreement`, and only a record carrying no reason at all is `never-refusing`
 * — a legitimate state for a gate that only ever reports, which is not a finding.
 */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
export function classifyGateOutcome(record) {
  if (recordRefused(record)) return GATE_OUTCOMES.REFUSED;
  if (countOf(record?.counts?.[DIFFERENCE_COUNT_FIELD]) > 0) return GATE_OUTCOMES.RECORDED_DISAGREEMENT;
  if (!Array.isArray(record?.reasons) || record.reasons.length === 0) return GATE_OUTCOMES.NEVER_REFUSING;
  return GATE_OUTCOMES.PASSED;
}

/**
 * The audit: every declared gate enumerated, every refusal reason read against 5.7.
 *
 * Four kinds of finding, and only the first is about the invariant itself: a refusal
 * carrying a forbidden formulation; a gate declared and never enumerated; a gate
 * enumerated and never declared; a module that could not be read. The rest is reported and
 * counted — the classification of every gate over every representative it was run on — so
 * a caller can see what was measured, not only what went wrong.
 */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
export function auditAgainstInvariant({ gates = [], reasons = [] } = {}) {
  const findings = [];
  const perFormulation = Object.fromEntries(FORBIDDEN_REFUSALS.map((row) => [row.id, 0]));

  for (const gate of gates) {
    if (gate.declared === true && gate.enumerated === false) {
      findings.push({
        kind: 'declared-not-enumerated',
        gateId: gate.gateId,
        family: gate.family,
        sourceFile: gate.sourceFile,
        message: `${gate.gateId} is declared by the ${gate.family} family and no gate in it emits the identifier`,
      });
    }
    if (gate.declared === false && gate.enumerated === true) {
      findings.push({
        kind: 'enumerated-not-declared',
        gateId: gate.gateId,
        family: gate.family,
        sourceFile: gate.sourceFile,
        message: `${gate.gateId} is emitted at ${gate.sourceFile} and no ${gate.family} declaration names it`,
      });
    }
  }

  for (const row of reasons) {
    for (const formulation of FORBIDDEN_REFUSALS) {
      if (!formulation.matches(row.message)) continue;
      perFormulation[formulation.id] += 1;
      findings.push({
        kind: 'forbidden-refusal',
        gateId: row.gateId,
        family: row.family,
        sourceFile: row.sourceFile,
        formulationId: formulation.id,
        representative: row.representative ?? null,
        message: `${row.gateId} refuses at ${row.sourceFile} with "${row.message}", which is §5.7's "${formulation.description}"`,
      });
    }
  }

  const classification = gates.flatMap((gate) =>
    (gate.records ?? []).map((entry) => ({
      representative: entry.representative ?? null,
      gateId: gate.gateId,
      family: gate.family,
      sourceFile: gate.sourceFile,
      outcome: classifyGateOutcome(entry.record),
    })),
  );

  const counts = Object.fromEntries(
    Object.values(GATE_OUTCOMES).map((outcome) => [
      outcome,
      classification.filter((row) => row.outcome === outcome).length,
    ]),
  );

  const unreadable = gates
    .filter((gate) => gate.unreadable !== undefined)
    .map((gate) => ({
      kind: 'unreadable-module',
      gateId: gate.gateId ?? null,
      family: gate.family,
      module: gate.module,
      message: `${gate.module} could not be read, so the ${gate.family} family's gates could not be checked: ${gate.unreadable}`,
    }));

  const allFindings = [...findings, ...unreadable];

  return {
    passed: allFindings.length === 0,
    findings: allFindings,
    perFormulation,
    classification,
    counts,
  };
}

/**
 * The audit as Markdown, because the reader is deciding what to repair.
 *
 * The verbs come first: what was read, what was classified, what was found. The outcome
 * vocabulary is declared with its tally including the zeroes, so a class that nothing
 * landed in is visible as nothing rather than absent.
 */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
export function renderInvariantAudit(audit) {
  const lines = [
    `# Incompleteness invariant audit — ${INVARIANT_SOURCE}`,
    '',
    `Outcome: **${audit.passed ? 'no findings' : `${audit.findings.length} finding(s)`}**`,
    '',
    '## Classification',
    '',
  ];

  for (const outcome of Object.values(GATE_OUTCOMES)) {
    lines.push(`- ${outcome}: ${audit.counts[outcome] ?? 0}`);
  }

  lines.push('', '## Per gate', '');
  const byGate = new Map();
  for (const row of audit.classification) {
    const rows = byGate.get(row.gateId) ?? [];
    rows.push(row);
    byGate.set(row.gateId, rows);
  }
  for (const [gateId, rows] of [...byGate.entries()].sort()) {
    const outcomes = [...new Set(rows.map((row) => row.outcome))].sort();
    lines.push(`- ${gateId} (${rows[0].family}, ${rows[0].sourceFile}) — ${outcomes.join(', ')} over ${rows.length} run(s)`);
  }

  lines.push('', '## Findings', '');
  if (audit.findings.length === 0) {
    lines.push('None. No gate in the reverse chain refuses with a §5.7 formulation.');
  } else {
    for (const finding of audit.findings) {
      lines.push(`- **${finding.kind}** — ${finding.message}`);
    }
  }

  lines.push('', '## Refusal reasons per formulation', '');
  for (const row of FORBIDDEN_REFUSALS) {
    lines.push(`- ${row.id}: ${audit.perFormulation[row.id] ?? 0} — ${row.description}`);
  }

  lines.push('');
  return lines.join('\n');
}
