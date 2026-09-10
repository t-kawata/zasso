// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
/**
 * R7's validator and R8's emitter: the origin spec, and what it refuses to say.
 *
 * Two rules shape this module, and both are about not overstating.
 *
 * The first is the provenance chain. A clause is `normative` because a human
 * recorded a decision, not because the implementation and its tests agree with
 * each other — they descend from the same design and corroborate nothing
 * independently, which is failure F11 read in the reverse direction. A clause
 * whose chain is broken is therefore demoted to `unresolved` and handed to the
 * grill, never emitted as a norm with a missing link. The same holds for
 * evidence: a claim whose `file:line` cannot be located is not `observed`,
 * because `observed` means a fact read from the text, and a reference to a line
 * that is not there was not read from anything. Demotion is always counted and
 * always stated; a silent drop would read as "considered and settled".
 *
 * The second is the round trip. The Markdown is what a reader and every
 * downstream command consumes, so it has to re-parse to the structure it was
 * rendered from — otherwise it is prose that merely looks structured. That is
 * made provable rather than hoped for by giving every variable-content line a
 * fixed structural prefix (`- key: value`, `  - item`, `### heading`), so no
 * value can be mistaken for another construct. One ambiguity survives that
 * scheme — an empty scalar and a list opener render alike — and it is resolved
 * by the only thing that distinguishes them in the document: a list opener is
 * followed by indented items and an empty scalar is not. Anything that would
 * still break the round trip, such as a value spanning two lines, is refused at
 * render time rather than silently corrupted.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PROVENANCE_CLASSES } from './provenance.mjs';
import { compareText } from './holdout-ledger.mjs';

export const ORIGIN_SPEC_SCHEMA_VERSION = 1;
export const ORIGIN_SPEC_KIND = 'origin-long-spec';

/**
 * The chain a `normative` clause must carry whole (ABOUT-REVERSE 5.5).
 *
 * `RFC clause → claim_id → normative_decision_id → residual_id →
 * evidence_bundle_hash → evidence records`. The RFC clause end is the spec's
 * own position, so the links checked here are the five that live inside a
 * claim; a missing one anywhere means the norm has no recorded author and the
 * clause is an authority the machine invented.
 */
export const PROVENANCE_CHAIN_LINKS = Object.freeze([
  'claim_id',
  'normative_decision_id',
  'residual_id',
  'evidence_bundle_hash',
  'evidence_records',
]);

/** Why a claim lost the classification it arrived with. */
export const DEMOTION_REASONS = Object.freeze({
  brokenProvenanceChain: 'broken_provenance_chain',
  unlocatableEvidence: 'unlocatable_evidence',
});

/** The sections whose entries the parser reads back. The others are read past. */
const CLAIMS_SECTION = 'Claims';
const DEMOTIONS_SECTION = 'Demotions';
const SCOPE_SECTION = 'Scope';

/** ATX levels: one title, one level for sections, one for each claim. */
const TITLE_LEVEL = 1;
const SECTION_LEVEL = 2;
const ENTRY_LEVEL = 3;

/** The scalar fields a claim always renders, in the order a reader meets them. */
const CLAIM_SCALAR_FIELDS = Object.freeze(['claim_type', 'scope', 'statement', 'falsification']);

/**
 * The scalar fields a claim renders only when it has something to say.
 *
 * `residual_id` and `evidence_bundle_hash` are here because a chain is only a
 * chain if it survives being written down. A normative clause whose links the
 * renderer dropped would come back as a norm with no recorded decision — the
 * invented authority the chain exists to refuse, reintroduced by a formatting
 * decision.
 */
const CLAIM_OPTIONAL_FIELDS = Object.freeze([
  'grill_question',
  'normative_decision_id',
  'residual_id',
  'evidence_bundle_hash',
  'review_state',
  'normative_authority',
]);

/**
 * The list fields a claim renders, and whether their items are located spans.
 *
 * A span item is written as `` `file:line` (mode) `` and read back as one; the
 * others are plain strings. Declaring the vocabulary once is what keeps the
 * renderer and the parser from drifting apart field by field.
 */
const CLAIM_LIST_FIELDS = Object.freeze([
  Object.freeze({ name: 'evidence', itemsAreSpans: true }),
  Object.freeze({ name: 'support', itemsAreSpans: false }),
  Object.freeze({ name: 'counterevidence', itemsAreSpans: false }),
  Object.freeze({ name: 'evidence_records', itemsAreSpans: true }),
  Object.freeze({ name: 'basis', itemsAreSpans: false }),
]);

const LIST_ITEM_INDENT = '  ';
const FIELD_PATTERN = /^- ([a-z_]+):\s*(.*)$/;
const LIST_ITEM_PATTERN = /^ {2}- (.*)$/;
const EVIDENCE_PATTERN = /^`(.+):(\d+)` \((\w+)\)$/;
const ENTRY_HEADING_PATTERN = /^(Claim|Demotion) `(.+)`$/;

/** The fixed line the document opens with when the population held no claim. */
const EMPTY_SENTENCE =
  'This origin spec is empty. The population it was built from held no claim: that is an explicit empty '
  + 'result from a run that looked, not a short report that might have dropped something.';

/**
 * Refuse a value the Markdown could not carry back.
 *
 * A newline inside a value would end the field's line, and the re-parse would
 * recover something the renderer never wrote — so the round trip would hold
 * only by luck. Refusing is the honest answer: the caller splits the text.
 */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function assertSingleLine(value, field) {
  if (typeof value !== 'string') {
    throw new Error(`the origin spec's ${field} must be a string; it is a ${typeof value}`);
  }
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error(
      `the origin spec's ${field} spans more than one line, so the Markdown would not re-parse to the `
      + 'structure it was rendered from',
    );
  }
}

/** `file:line` wrapped so a reader can act on it, with the mode it was read in. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function renderEvidenceItem(item) {
  return `\`${item.source_span.file}:${item.source_span.line}\` (${item.evidence_mode})`;
}

/** The evidence line read back into the span and mode it was rendered from. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function parseEvidenceItem(text) {
  const matched = EVIDENCE_PATTERN.exec(text);
  if (matched === null) {
    throw new Error(`an evidence line does not carry a locatable span: ${JSON.stringify(text)}`);
  }
  return {
    source_span: { file: matched[1], line: Number.parseInt(matched[2], 10) },
    evidence_mode: matched[3],
  };
}

/**
 * A field that carries nothing is `null`, not an empty string.
 *
 * The two would render alike and the difference would be invisible in the
 * document, so the spec fixes one of them: an empty question is no question,
 * and a claim that has none is served without one rather than with a blank line
 * a reader has to interpret.
 */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function orNull(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** An evidence item reduced to the span and mode the document carries. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function toEvidenceItem(item) {
  return {
    source_span: { file: item.source_span.file, line: item.source_span.line },
    evidence_mode: item.evidence_mode,
  };
}

/** One claim as the spec carries it, keeping the ledger's evidence shape. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function normaliseClaim(claim) {
  if (claim === null || typeof claim !== 'object') {
    throw new Error('every origin-spec claim must be an object');
  }
  return {
    claim_id: claim.claim_id,
    claim_type: claim.claim_type,
    scope: claim.scope ?? '',
    statement: claim.statement ?? '',
    falsification: claim.falsification ?? '',
    evidence: (claim.evidence ?? []).map(toEvidenceItem),
    support: [...(claim.support ?? [])],
    counterevidence: [...(claim.counterevidence ?? [])],
    grill_question: orNull(claim.grill_question),
    normative_decision_id: orNull(claim.normative_decision_id),
    residual_id: orNull(claim.residual_id),
    evidence_bundle_hash: orNull(claim.evidence_bundle_hash),
    evidence_records: (claim.evidence_records ?? []).map(toEvidenceItem),
    basis: [...(claim.basis ?? [])],
    review_state: orNull(claim.review_state),
    normative_authority: orNull(claim.normative_authority),
  };
}

/**
 * Assemble the origin spec from what the analysis produced.
 *
 * Claims are carried across whole and nothing is summarised here, because a
 * summary of a claim is itself a claim nobody can falsify. Validation and
 * demotion are a separate pass, so a caller can run the same checks over a spec
 * a human wrote.
 *
 * @param {{root: string, ledger: object, treeHash?: string}} params
 */
export function buildOriginSpec({ root, ledger, treeHash = '' } = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error('an origin spec must name the root of the population it describes');
  }
  if (ledger === null || typeof ledger !== 'object' || !Array.isArray(ledger.claims)) {
    throw new Error('an origin spec is built from a claim ledger; the ledger handed over carries no claims');
  }

  const title = `ORIGIN-LONG-SPEC — ${root}`;
  assertSingleLine(title, 'title');

  return {
    schema_version: ORIGIN_SPEC_SCHEMA_VERSION,
    kind: ORIGIN_SPEC_KIND,
    root,
    title,
    tree_hash: treeHash,
    claims: [...ledger.claims]
      .sort((left, right) => compareText(left.claim_id, right.claim_id))
      .map(normaliseClaim),
    demotions: [],
  };
}

/** Whether the evidence a claim rests on is on disk at the line it names. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function evidenceIsLocatable(item, root) {
  const span = item?.source_span;
  if (span === undefined || typeof span.file !== 'string' || !Number.isInteger(span.line)) return false;
  const located = join(root, span.file);
  if (!existsSync(located)) return false;
  return readFileSync(located, 'utf8').split('\n').length >= span.line;
}

/** The links a normative clause is missing, in the chain's own order. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function missingChainLinks(claim) {
  return PROVENANCE_CHAIN_LINKS.filter((link) => {
    const value = claim[link];
    if (link === 'evidence_records') return !Array.isArray(value) || value.length === 0;
    return typeof value !== 'string' || value.length === 0;
  });
}

/** The question a demoted claim hands to the grill, phrased so either answer is refutable. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function demotionQuestion(claim, reason, missing) {
  if (reason === DEMOTION_REASONS.brokenProvenanceChain) {
    return `"${claim.statement}" was proposed as a norm, but its provenance chain is broken (${missing.join(', ')} `
      + 'is not recorded). Who decided this, and on what recorded decision?';
  }
  return `The evidence for "${claim.statement}" could not be located at the line it names. Does the source `
    + 'still show this, and where?';
}

/**
 * The spec with every claim checked against the material it claims to rest on.
 *
 * Refusals are demotions, not deletions. A claim that arrived as `normative`
 * without a whole chain becomes `unresolved` and carries a question; a claim
 * that arrived as `observed` on evidence that is not at the stated location
 * becomes `unresolved` for the same reason. Both are recorded in `demotions`,
 * so what could not be settled is stated rather than inferred from a shorter
 * list.
 */
export function validateOriginSpec(spec, { root } = {}) {
  if (spec === null || typeof spec !== 'object' || !Array.isArray(spec.claims)) {
    throw new Error('validateOriginSpec needs the spec it is to check; it was given no spec with claims');
  }
  const base = typeof root === 'string' && root.length > 0 ? root : spec.root;
  if (typeof base !== 'string' || base.length === 0) {
    throw new Error('checking a spec against the material requires the root the evidence is relative to');
  }

  const demotions = [...(spec.demotions ?? [])];
  const claims = spec.claims.map((claim) => {
    if (!PROVENANCE_CLASSES.includes(claim.claim_type)) {
      throw new Error(
        `"${claim.claim_type}" is not one of the four provenance values (${PROVENANCE_CLASSES.join(', ')}): `
        + `claim ${claim.claim_id}`,
      );
    }

    const unlocatable = (claim.evidence ?? []).filter((item) => !evidenceIsLocatable(item, base));
    if (unlocatable.length > 0) {
      const reason = DEMOTION_REASONS.unlocatableEvidence;
      const missing = unlocatable
        .map((item) => `${item.source_span?.file ?? 'unknown'}:${item.source_span?.line ?? '?'}`)
        .join(', ');
      demotions.push({ claim_id: claim.claim_id, from: claim.claim_type, to: 'unresolved', reason, missing });
      return {
        ...claim,
        claim_type: 'unresolved',
        grill_question: orNull(claim.grill_question) ?? demotionQuestion(claim, reason, []),
      };
    }

    if (claim.claim_type === 'observed' && (claim.evidence ?? []).length === 0) {
      throw new Error(`claim ${claim.claim_id} is observed but carries no evidence: observed means read from the text`);
    }

    if (claim.claim_type === 'inferred' && (claim.basis ?? []).length === 0) {
      throw new Error(
        `claim ${claim.claim_id} is inferred but states no basis: an inference must say what it infers from, or it `
        + 'is an assertion wearing an inference label',
      );
    }

    if (claim.claim_type === 'normative') {
      const missing = missingChainLinks(claim);
      if (missing.length > 0) {
        const reason = DEMOTION_REASONS.brokenProvenanceChain;
        demotions.push({
          claim_id: claim.claim_id,
          from: 'normative',
          to: 'unresolved',
          reason,
          missing: missing.join(', '),
        });
        return {
          ...claim,
          claim_type: 'unresolved',
          grill_question: orNull(claim.grill_question) ?? demotionQuestion(claim, reason, missing),
        };
      }
    }

    if (claim.claim_type === 'unresolved' && (claim.grill_question ?? '').length === 0) {
      throw new Error(
        `claim ${claim.claim_id} is unresolved but carries no grill_question: the human grill must be asked something`,
      );
    }

    return claim;
  });

  return { ...spec, claims, demotions, root: base };
}

/** How many claims carry each provenance value. Derived, never stored. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function provenanceSummary(claims) {
  const summary = Object.fromEntries(PROVENANCE_CLASSES.map((name) => [name, 0]));
  for (const claim of claims) summary[claim.claim_type] += 1;
  return summary;
}

/** The `- evidence:` / `  - item` block for one list field, or nothing when it is empty. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function renderListField(lines, field, items) {
  if (items.length === 0) return;
  lines.push(`- ${field}:`);
  for (const item of items) {
    assertSingleLine(item, field);
    lines.push(`${LIST_ITEM_INDENT}- ${item}`);
  }
}

/**
 * The origin spec as Markdown.
 *
 * Rendering is a pure function of the spec: it reads no file, consults no clock
 * and mutates nothing, which is what lets the round trip be asserted without
 * touching the filesystem.
 */
export function renderOriginSpec(spec) {
  if (spec === null || typeof spec !== 'object' || !Array.isArray(spec.claims)) {
    throw new Error('renderOriginSpec needs the spec it is to render; it was given no spec with claims');
  }

  const lines = [`${'#'.repeat(TITLE_LEVEL)} ${spec.title}`, ''];
  lines.push(
    'The claims this reverse rotation could and could not settle. Each one states what would falsify it,',
    'and the ones that could not be settled say what a human has to decide.',
    '',
  );

  lines.push(`${'#'.repeat(SECTION_LEVEL)} ${SCOPE_SECTION}`, '');
  for (const [key, value] of [
    ['schema_version', String(spec.schema_version)],
    ['kind', spec.kind],
    ['root', spec.root],
  ]) {
    assertSingleLine(value, key);
    lines.push(`- ${key}: ${value}`);
  }
  if (typeof spec.tree_hash === 'string' && spec.tree_hash.length > 0) {
    assertSingleLine(spec.tree_hash, 'tree_hash');
    lines.push(`- tree_hash: ${spec.tree_hash}`);
  }
  lines.push('');

  const summary = provenanceSummary(spec.claims);
  lines.push(`${'#'.repeat(SECTION_LEVEL)} Provenance`, '');
  for (const name of PROVENANCE_CLASSES) {
    lines.push(`- ${name}: ${summary[name]}`);
  }
  lines.push('');

  lines.push(`${'#'.repeat(SECTION_LEVEL)} ${CLAIMS_SECTION}`, '');
  if (spec.claims.length === 0) {
    lines.push(EMPTY_SENTENCE, '');
  }
  for (const claim of spec.claims) {
    lines.push(`${'#'.repeat(ENTRY_LEVEL)} Claim \`${claim.claim_id}\``, '');
    for (const field of CLAIM_SCALAR_FIELDS) {
      assertSingleLine(claim[field], `${claim.claim_id}.${field}`);
      lines.push(`- ${field}: ${claim[field]}`);
    }
    for (const field of CLAIM_OPTIONAL_FIELDS) {
      if (claim[field] === null) continue;
      assertSingleLine(claim[field], `${claim.claim_id}.${field}`);
      lines.push(`- ${field}: ${claim[field]}`);
    }
    for (const { name, itemsAreSpans } of CLAIM_LIST_FIELDS) {
      const items = claim[name] ?? [];
      renderListField(lines, name, itemsAreSpans ? items.map(renderEvidenceItem) : items);
    }
    lines.push('');
  }

  lines.push(`${'#'.repeat(SECTION_LEVEL)} ${DEMOTIONS_SECTION}`, '');
  if (spec.demotions.length === 0) {
    lines.push('No claim was demoted: every classification the spec carries was supported by the material.', '');
  }
  for (const demotion of spec.demotions) {
    lines.push(`${'#'.repeat(ENTRY_LEVEL)} Demotion \`${demotion.claim_id}\``, '');
    for (const field of ['from', 'to', 'reason', 'missing']) {
      assertSingleLine(demotion[field], `${demotion.claim_id}.${field}`);
      lines.push(`- ${field}: ${demotion[field]}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** One claim rebuilt from the fields its entry rendered. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function parseClaimEntry(entry) {
  const fields = entry.fields;
  return {
    claim_id: entry.id,
    claim_type: fields.claim_type ?? '',
    scope: fields.scope ?? '',
    statement: fields.statement ?? '',
    falsification: fields.falsification ?? '',
    evidence: (fields.evidence ?? []).map(parseEvidenceItem),
    support: [...(fields.support ?? [])],
    counterevidence: [...(fields.counterevidence ?? [])],
    grill_question: fields.grill_question ?? null,
    normative_decision_id: fields.normative_decision_id ?? null,
    residual_id: fields.residual_id ?? null,
    evidence_bundle_hash: fields.evidence_bundle_hash ?? null,
    evidence_records: (fields.evidence_records ?? []).map(parseEvidenceItem),
    basis: [...(fields.basis ?? [])],
    review_state: fields.review_state ?? null,
    normative_authority: fields.normative_authority ?? null,
  };
}

/**
 * The structure a rendered origin spec carries, read back.
 *
 * The parse is exact rather than best-effort, because every variable-content
 * line is prefixed by a fixed token and the one remaining ambiguity — an empty
 * scalar against a list opener — is settled by the lookahead that gives a list
 * opener its meaning: indented items. The Provenance section carries nothing
 * the spec does not derive from its claims, and is read past.
 */
export function parseOriginSpec(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) {
    throw new Error('parseOriginSpec needs the Markdown it is to read; it was given none');
  }

  const lines = markdown.split('\n');
  const scope = {};
  const claimEntries = [];
  const demotionEntries = [];
  let section = null;
  let target = null;
  let entry = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.startsWith(`${'#'.repeat(TITLE_LEVEL)} `)) {
      scope.title = line.slice(TITLE_LEVEL + 1);
      continue;
    }
    if (line.startsWith(`${'#'.repeat(SECTION_LEVEL)} `)) {
      section = line.slice(SECTION_LEVEL + 1);
      entry = null;
      target = section === SCOPE_SECTION ? scope : null;
      continue;
    }
    if (line.startsWith(`${'#'.repeat(ENTRY_LEVEL)} `)) {
      const heading = ENTRY_HEADING_PATTERN.exec(line.slice(ENTRY_LEVEL + 1));
      if (heading === null) {
        throw new Error(`an entry heading names neither a claim nor a demotion: ${JSON.stringify(line)}`);
      }
      entry = { kind: heading[1], id: heading[2], fields: {} };
      target = entry.fields;
      if (section === CLAIMS_SECTION) claimEntries.push(entry);
      else if (section === DEMOTIONS_SECTION) demotionEntries.push(entry);
      continue;
    }

    const item = LIST_ITEM_PATTERN.exec(line);
    if (item !== null) {
      const key = target === null ? null : openListKey(target);
      if (key !== null) target[key].push(item[1]);
      continue;
    }

    const field = FIELD_PATTERN.exec(line);
    if (field === null || target === null) continue;
    const [, key, value] = field;
    if (value === '') {
      // An empty value is a list opener only when indented items follow it;
      // otherwise it is a scalar that happens to be empty.
      const next = lines[index + 1] ?? '';
      if (LIST_ITEM_PATTERN.test(next)) target[key] = [];
      else target[key] = '';
      continue;
    }
    target[key] = key === 'schema_version' ? Number.parseInt(value, 10) : value;
  }

  return {
    schema_version: scope.schema_version ?? null,
    kind: scope.kind ?? null,
    root: scope.root ?? null,
    title: scope.title ?? null,
    tree_hash: scope.tree_hash ?? '',
    claims: claimEntries.map(parseClaimEntry),
    demotions: demotionEntries.map((found) => ({ claim_id: found.id, ...found.fields })),
  };
}

/**
 * The key of the list field the last emitted line opened, or `null`.
 *
 * A rendered list field is always the most recent key on its target whose value
 * is an array, and it is always the last key written before its items — so the
 * last array-valued key on the target is the open one.
 */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function openListKey(target) {
  const keys = Object.keys(target);
  for (let index = keys.length - 1; index >= 0; index -= 1) {
    if (Array.isArray(target[keys[index]])) return keys[index];
  }
  return null;
}

/**
 * The round-trip proof, as a value rather than a thrown assertion.
 *
 * The caller keeps both halves of the result, because "did it re-parse" and
 * "was anything moved while asking" are different questions, and a proof that
 * silently rearranged the spec would answer only the first.
 */
export function assertRoundTrip(spec) {
  const markdown = renderOriginSpec(spec);
  const reparsed = parseOriginSpec(markdown);
  return {
    equal: JSON.stringify(reparsed) === JSON.stringify(spec),
    headings: /^#{1,6} /m.test(markdown),
    reparsed,
  };
}

/**
 * The candidate document `oracle compare --stage r8` consumes.
 *
 * The comparison's unit is a heading, and the answer key holds the canonical
 * RFC's 252 section names. The subject tree carries no RFC at all — it was
 * stripped — so what is compared is the membership of this spec's claim
 * identifiers against that heading set. That measures naming rather than
 * whether a claim was found, which is why the region is named as unobserved
 * rather than left to read as a clean result.
 */
export function buildOriginSpecCandidate(spec, { language = 'unknown' } = {}) {
  return {
    stage: 'r8',
    corpus: { language },
    entries: spec.claims.map((claim) => ({
      name: claim.claim_id,
      value: null,
      evidence_mode: claim.evidence[0]?.evidence_mode ?? 'source_static',
    })),
    unobserved: [
      {
        region: "the canonical RFC's own section names",
        stoppedAtPhase: 'R8',
        reason:
          "the subject tree was stripped of its RFC, so the origin spec's claim names cannot be compared "
          + 'against heading text; the comparison is membership of the claim identifiers against the answer '
          + "key's heading set, and a mismatch measures naming rather than whether the claim was found",
      },
    ],
  };
}
