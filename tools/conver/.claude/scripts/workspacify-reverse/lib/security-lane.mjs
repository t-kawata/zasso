// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
/**
 * Phase 4 — the security lane, and the human authority it requires.
 *
 * Reverse rotation reads a project that already works and asks what its
 * contracts are. For most propositions the code is good evidence. For a small
 * class it is not, and that asymmetry is the whole reason this module exists: a
 * missing or incorrect authorization check, tenant filter, secret handling,
 * deletion guard or audit record is **invisible in the code that is present**. A
 * claim extracted from such code therefore says what the program currently does,
 * which is exactly what this phase must not promote into what it ought to do
 * (ABOUT-REVERSE 7.6, F15).
 *
 * Two properties make the requirement enforceable rather than advisory.
 *
 * The first is that the lane is a structural separation, not a flag. Lane claims
 * and ordinary claims live in two lists, and `assertLanesAreSeparate` refuses a
 * classification in which they overlap — so the ordinary canonisation path has
 * nothing to accept a lane claim from. A gate that can be skipped is
 * indistinguishable, afterwards, from one that was satisfied.
 *
 * The second is that a claim the classifier cannot settle is **reported**, never
 * defaulted to the ordinary lane. Defaulting there would read as "no risk found"
 * when the truth is "the risk was not readable", and that is the one direction of
 * error this lane cannot absorb.
 *
 * What the classifier reads is the claim's anchor, not its statement. The three
 * claim families the ledger holds describe their subject in a fixed sentence
 * ("the condition asserted at src/api/x.rs:12 holds"), so the statement almost
 * never names the risk; the risk lives in the source text the anchor points at.
 * Classification is therefore a pure function of the ledger and the tree it names.
 *
 * Authority is not defined here. G5 and this lane share one refusal, imported
 * from the grill that records normative decisions, so the two cannot drift into
 * disagreeing about who may hold authority.
 */
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

import { EVIDENCE_MODES } from './analysis-tech.mjs';
import { formatAnchor } from './claim-ledger.mjs';
import { recordAuthority } from '../../grill-me-for-rfc/normative-decision.js';

/**
 * Which lane a claim ended up in.
 *
 * `security` and `ordinary` are settled outcomes and are kept in separate lists.
 * `unclassified` is not a third lane: it is the report of a claim the classifier
 * could not settle, and it is deliberately not merged into either.
 */
export const LANE_MEMBERSHIP = Object.freeze({
  SECURITY: 'security',
  ORDINARY: 'ordinary',
  UNCLASSIFIED: 'unclassified',
});

/**
 * The five cross-cutting risk categories this ticket names.
 *
 * Kept apart from `RISK_CATEGORIES` so the design's own list of five — the one
 * 6.13 Phase 4 draws as a cross-cutting lane, and the one the invariants name —
 * survives as a named constant rather than being widened in place.
 */
export const CROSS_CUTTING_RISK_CATEGORIES = Object.freeze([
  'authorization',
  'tenancy',
  'secrets',
  'deletion',
  'audit',
]);

/**
 * Every risk category the lane recognises.
 *
 * The union of the cross-cutting five and the wider list the constraints state
 * ("safety, authorization, money, deletion, cryptography or audit"), so neither
 * enumeration is silently narrowed by the other. Adding a category is one entry
 * here and one vocabulary row below — never a new branch.
 */
export const RISK_CATEGORIES = Object.freeze([
  ...CROSS_CUTTING_RISK_CATEGORIES,
  'safety',
  'money',
  'cryptography',
]);

/**
 * The terms each category is recognised by.
 *
 * A term matches a whole word segment or a whole collapsed identifier, never a
 * substring — `log_level` names `level` and not `log`, and a bare `log` is not
 * an audit record. The vocabulary is deliberately precise rather than broad:
 * every claim that lands in the lane costs a human decision, so a term earns its
 * place by naming the risk and not merely rhyming with it.
 */
export const RISK_CATEGORY_VOCABULARY = Object.freeze({
  authorization: Object.freeze([
    'auth', 'authz', 'authn', 'authorize', 'authorization', 'authenticate', 'authentication',
    'permission', 'permissions', 'acl', 'principal', 'privilege', 'forbidden', 'unauthorized',
    'role', 'roles', 'login', 'logout', 'session', 'token',
  ]),
  tenancy: Object.freeze([
    'tenant', 'tenancy', 'realm', 'multitenant', 'orgid', 'workspaceid',
  ]),
  secrets: Object.freeze([
    'secret', 'secretstring', 'credential', 'credentials', 'password', 'passwd', 'apikey',
    'privatekey', 'bearer', 'jwt', 'hmac', 'cipher', 'encrypt', 'decrypt', 'salt',
  ]),
  deletion: Object.freeze([
    'delete', 'deleteaccount', 'removeaccount', 'erase', 'purge', 'unlink', 'revoke', 'destroy',
  ]),
  audit: Object.freeze([
    'audit', 'journal', 'appendonly', 'tamper', 'eventlog',
  ]),
  safety: Object.freeze([
    'safety', 'unsafeisolation', 'memorysafety', 'undefinedbehavior', 'soundness',
  ]),
  money: Object.freeze([
    'payment', 'billing', 'invoice', 'currency', 'balance', 'pricing',
  ]),
  cryptography: Object.freeze([
    'crypto', 'cryptography', 'signature', 'verifysignature', 'keyagreement', 'certificate',
  ]),
});

/**
 * Paths that are declared risk-bearing whatever their lines happen to say.
 *
 * A declaration, not a detection: the vocabulary above finds risk in text, and
 * this says that everything inside a named surface is in the lane even where a
 * particular line reads as neutral. Both are data, so adding a surface is an
 * entry rather than a branch.
 */
export const RISK_SURFACES = Object.freeze([
  Object.freeze({ prefix: 'src/security/', category: 'authorization' }),
  Object.freeze({ prefix: 'tests/verify_unsafe_isolation.rs', category: 'safety' }),
  Object.freeze({ prefix: 'tests/ownership_ffi_boundary.rs', category: 'safety' }),
]);

/**
 * How many distinct observation channels a lane claim's falsification needs.
 *
 * ABOUT-REVERSE 7.4 item 12 settles this by independent means and by risk rather
 * than by the number of evidence records, so it is a declared budget and not a
 * function of how much evidence happens to have been collected.
 */
export const LANE_FALSIFICATION_BUDGET = 2;

/**
 * The evidence mode that observes nothing beyond the text already read.
 *
 * Taken from the shared vocabulary rather than re-spelled, so a mode added there
 * is not left out of the falsification budget by a second spelling drifting.
 */
export const SOURCE_STATIC_MODE = EVIDENCE_MODES[0];

/**
 * The rule the classification was made under, carried beside it.
 *
 * Stored with the result so a human can see which membership rule produced a
 * lane claim and correct the rule later without re-deriving what it did.
 */
export const LANE_POLICY = Object.freeze([
  'A claim is in the security lane when the source text at its anchor — the file path, the provider member or the line itself — names one of the risk categories.',
  'A lane claim is canonised only with a human authority record naming a stable role, team or council identifier, and a falsification plan that observes behaviour rather than re-reading the text.',
  'A claim the classifier cannot settle is reported, never placed in the ordinary lane.',
].join(' '));

/** A Rust character literal or lifetime prefix, removed before scanning for quotes. */
const CHAR_LITERAL = /'(?:\\.|[^'\\])'/g;

/** One lower-case word segment of an identifier or path, keeping SCREAMING_SNAKE whole. */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function segmentsOf(word) {
  return word
    // The look-behind splits camelCase only where a lower-case or digit meets an
    // upper-case letter, so `PATH_AUTH_TOKEN` yields `auth` and `token` rather
    // than the letters p, a, t, h.
    .split(/(?<=[a-z0-9])(?=[A-Z])/)
    .map((segment) => segment.toLowerCase())
    .filter((segment) => segment.length > 0);
}

/** Whether one text names any term of a vocabulary, as a whole segment or a whole identifier. */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function namesAnyTerm(text, vocabulary) {
  for (const word of String(text).split(/[^A-Za-z0-9]+/)) {
    if (word.length === 0) continue;
    const segments = segmentsOf(word);
    if (segments.some((segment) => vocabulary.includes(segment))) return true;
    if (vocabulary.includes(segments.join(''))) return true;
  }
  return false;
}

/** The declared risk categories a text names. */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function categoriesNamedIn(text) {
  const named = new Set();
  if (typeof text !== 'string' || text.length === 0) return named;
  for (const category of RISK_CATEGORIES) {
    if (namesAnyTerm(text, RISK_CATEGORY_VOCABULARY[category] ?? [])) named.add(category);
  }
  return named;
}

/** The categories a declared risk surface assigns to a path or provider. */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function surfaceCategoriesOf(text) {
  const named = new Set();
  if (typeof text !== 'string' || text.length === 0) return named;
  for (const surface of RISK_SURFACES) {
    if (text.startsWith(surface.prefix)) named.add(surface.category);
  }
  return named;
}

/**
 * Split one source line into the code it executes and the prose it displays.
 *
 * A risk term inside a string literal or a comment is a mention, not an action:
 * `timeout_msg.contains("destroy")` names a shutdown phase rather than a deletion
 * the code performs. The two are returned separately so the caller can classify on
 * the one and report the other, instead of reading a message as a behaviour.
 */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function splitAnchorLine(line) {
  const scan = line.replace(CHAR_LITERAL, ' ');
  let code = '';
  let prose = '';
  let index = 0;
  let inString = false;

  while (index < scan.length) {
    const character = scan[index];
    if (inString) {
      prose += character;
      if (character === '\\') {
        prose += scan[index + 1] ?? '';
        index += 2;
        continue;
      }
      if (character === '"') inString = false;
      index += 1;
      continue;
    }
    if (character === '"') {
      inString = true;
      prose += character;
      index += 1;
      continue;
    }
    if (character === '/' && scan[index + 1] === '/') {
      prose += scan.slice(index);
      break;
    }
    code += character;
    index += 1;
  }
  return { code, prose };
}

/** Whether a resolved path is inside the population it was resolved against. */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function isWithinRoot(root, absolutePath) {
  const rootPath = resolve(root);
  return absolutePath === rootPath || absolutePath.startsWith(`${rootPath}${sep}`);
}

/**
 * Read anchors from the population the ledger was built over.
 *
 * Two questions are answered separately because they mean different things: an
 * anchor outside the population names nothing that was measured, and an anchor
 * inside it whose line cannot be read is text that is missing. Collapsing them
 * would let a claim about something outside the corpus be classified from its own
 * path, which reads as a measurement while being none.
 */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function createAnchorReader(root) {
  const byPath = new Map();

  return {
    /** Whether the anchor names a member of the population. */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
    contains(relativePath) {
      return isWithinRoot(root, resolve(root, relativePath));
    },

    /** The anchor line, or null when it cannot be read. */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
    lineAt(relativePath, lineNumber) {
      const absolutePath = resolve(root, relativePath);
      if (!isWithinRoot(root, absolutePath)) return null;

      if (!byPath.has(relativePath)) {
        try {
          byPath.set(relativePath, readFileSync(absolutePath, 'utf8').split('\n'));
        } catch {
          byPath.set(relativePath, null);
        }
      }

      const lines = byPath.get(relativePath);
      if (lines === null || !Number.isInteger(lineNumber)) return null;
      if (lineNumber < 1 || lineNumber > lines.length) return null;
      return lines[lineNumber - 1];
    },
  };
}

/** The lane a single claim belongs to, with the reason when it could not be settled. */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function classifyClaimRisk(claim, anchorReader) {
  const span = claim?.evidence?.[0]?.source_span ?? null;
  const anchorPath = typeof span?.file === 'string' ? span.file : '';
  const provider = typeof claim?.provider === 'string' ? claim.provider : '';

  if (anchorPath.length === 0) {
    return {
      membership: LANE_MEMBERSHIP.UNCLASSIFIED,
      categories: [],
      anchor: null,
      reason: 'the claim carries no anchor, so the text that would settle its risk category was never named',
    };
  }

  if (!anchorReader.contains(anchorPath)) {
    return {
      membership: LANE_MEMBERSHIP.UNCLASSIFIED,
      categories: [],
      anchor: anchorPath,
      reason: `the anchor at ${anchorPath} lies outside the population this ledger was built over, so nothing about `
        + 'this claim was measured and its risk category is not readable from the path that names it',
    };
  }

  // An anchor with no line number is cited as the file alone, never as
  // `file:undefined`, because a reader has to be able to tell a missing line
  // from one that was read and found neutral.
  const anchor = Number.isInteger(span?.line) ? formatAnchor(anchorPath, span.line) : anchorPath;
  const line = anchorReader.lineAt(anchorPath, span?.line);
  const { code, prose } = line === null ? { code: '', prose: '' } : splitAnchorLine(line);

  const named = new Set([
    ...categoriesNamedIn(anchorPath),
    ...categoriesNamedIn(provider),
    ...categoriesNamedIn(code),
    ...surfaceCategoriesOf(anchorPath),
    ...surfaceCategoriesOf(provider),
  ]);

  if (named.size > 0) {
    return {
      membership: LANE_MEMBERSHIP.SECURITY,
      categories: RISK_CATEGORIES.filter((category) => named.has(category)),
      anchor,
      reason: '',
    };
  }

  const mentionedInProse = categoriesNamedIn(prose);
  if (mentionedInProse.size > 0) {
    const categories = RISK_CATEGORIES.filter((category) => mentionedInProse.has(category));
    return {
      membership: LANE_MEMBERSHIP.UNCLASSIFIED,
      categories,
      anchor,
      reason: `the line at ${anchor} names ${categories.join(', ')} only inside a string literal or a comment, `
        + 'where the code neither performs nor omits the check; whether this is a risk proposition is a human call',
    };
  }

  if (line === null) {
    return {
      membership: LANE_MEMBERSHIP.UNCLASSIFIED,
      categories: [],
      anchor,
      reason: `the source text at ${anchor} could not be read, so this claim is reported rather than proved ordinary`,
    };
  }

  return { membership: LANE_MEMBERSHIP.ORDINARY, categories: [], anchor, reason: '' };
}

/**
 * Classify a claim ledger into the security lane, the ordinary lane, and the claims
 * that could not be settled.
 *
 * The ledger must name its population root, because the risk a claim carries is
 * read from the source text at its anchor and a ledger without a root has no text
 * to read. Refusing that input is the difference between a lane that measured
 * nothing and a lane that found nothing.
 *
 * @param {{ root: string, claims: Array<object> }} ledger
 * @returns {object} the classification, its counts, its per-category measurement and its policy
 */
export function classifySecurityLane(ledger) {
  if (ledger === null || typeof ledger !== 'object') {
    throw new Error(
      'classifySecurityLane needs the claim ledger it is to classify; it was given no claim ledger, and a lane '
        + 'classified from nothing would read as a lane with nothing in it',
    );
  }
  const { root, claims } = ledger;
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error(
      'a lane classification must name the root of the population it read, because the risk a claim carries is '
        + 'read from the source text at its anchor',
    );
  }
  if (!Array.isArray(claims)) {
    throw new Error('the claim ledger carries no list of claims, so there is nothing to classify');
  }

  const anchorReader = createAnchorReader(root);
  const security = [];
  const ordinary = [];
  const reported = [];
  const categories = Object.fromEntries(RISK_CATEGORIES.map((category) => [category, 0]));

  for (const claim of claims) {
    const verdict = classifyClaimRisk(claim, anchorReader);

    if (verdict.membership === LANE_MEMBERSHIP.SECURITY) {
      security.push({
        ...claim,
        lane: LANE_MEMBERSHIP.SECURITY,
        risk_categories: verdict.categories,
        anchor: verdict.anchor,
      });
      for (const category of verdict.categories) categories[category] += 1;
      continue;
    }

    if (verdict.membership === LANE_MEMBERSHIP.UNCLASSIFIED) {
      reported.push({
        ...claim,
        lane: LANE_MEMBERSHIP.UNCLASSIFIED,
        risk_categories: verdict.categories,
        anchor: verdict.anchor,
        reason: verdict.reason,
      });
      continue;
    }

    ordinary.push({ ...claim, lane: LANE_MEMBERSHIP.ORDINARY });
  }

  return {
    root,
    lane: { security, ordinary },
    reported,
    counts: {
      total: claims.length,
      security: security.length,
      ordinary: ordinary.length,
      unclassified: reported.length,
    },
    categories,
    empty: security.length === 0,
    note: security.length === 0
      ? 'no claim in this ledger names a risk surface or a risk term, so the security lane is empty. '
        + 'That is a measurement about this corpus, not a statement that it is safe.'
      : '',
    policy: LANE_POLICY,
  };
}

/**
 * Assert the two lanes have not been merged.
 *
 * This is the invariant the ordinary canonisation path relies on: a lane claim
 * must not be reachable from the ordinary list, and an ordinary entry must not
 * carry a risk category that would make a later reader treat it as gated. The
 * natural simplification — one list with a flag — is what this refuses.
 *
 * @param {object} classification
 * @returns {true}
 * @throws {Error} naming the overlap it found
 */
export function assertLanesAreSeparate(classification) {
  const security = classification?.lane?.security;
  const ordinary = classification?.lane?.ordinary;
  if (!Array.isArray(security) || !Array.isArray(ordinary)) {
    throw new Error(
      'the classification carries no security lane and ordinary lane to compare; a lane is two lists, never one '
        + 'list with a flag, because a flag can be read past',
    );
  }
  if (security === ordinary) {
    throw new Error(
      'the security lane and the ordinary lane are the same list, so only a flag separates them and a lane claim '
        + 'could be canonised by the ordinary path',
    );
  }

  const securityIds = new Set(security.map((entry) => entry.claim_id));
  const shared = ordinary.filter((entry) => securityIds.has(entry.claim_id));
  if (shared.length > 0) {
    throw new Error(
      `${shared.length} claim(s) appear in both the security lane and the ordinary lane: `
        + `${shared.map((entry) => entry.claim_id).join(', ')} — a claim reachable through the ordinary lane has `
        + 'its authority requirement skipped',
    );
  }

  const carryingRisk = ordinary.filter(
    (entry) => Array.isArray(entry.risk_categories) && entry.risk_categories.length > 0,
  );
  if (carryingRisk.length > 0) {
    throw new Error(
      `${carryingRisk.length} ordinary-lane claim(s) carry a risk category: `
        + `${carryingRisk.map((entry) => entry.claim_id).join(', ')} — a risk category on the ordinary path reads `
        + 'as a gate that was applied when none was',
    );
  }

  for (const entry of security) {
    if (entry.lane !== LANE_MEMBERSHIP.SECURITY) {
      throw new Error(
        `an entry in the security lane is labelled "${entry.lane}" rather than "${LANE_MEMBERSHIP.SECURITY}": `
          + `${entry.claim_id}`,
      );
    }
  }
  for (const entry of ordinary) {
    if (entry.lane !== LANE_MEMBERSHIP.ORDINARY) {
      throw new Error(
        `an entry in the ordinary lane is labelled "${entry.lane}" rather than "${LANE_MEMBERSHIP.ORDINARY}": `
          + `${entry.claim_id}`,
      );
    }
  }

  return true;
}

/**
 * Refuse an authority record that names nobody, or names a person.
 *
 * The refusal itself belongs to P22-13 and is called rather than copied, so G5
 * and this lane cannot come to different conclusions about the same record. A
 * personal name is rejected by that shared rule because people move on while the
 * authority and the duty to re-review do not.
 *
 * @param {{ authority_ref: string, authority_kind: string }} authorityRecord
 * @returns {Readonly<{ authority_kind: string, authority_ref: string }>}
 * @throws {Error} naming what the identifier is missing
 */
export function assertAuthorityRecorded(authorityRecord) {
  const authorityRef = authorityRecord?.authority_ref;
  const authorityKind = authorityRecord?.authority_kind;
  if (typeof authorityRef !== 'string' || authorityRef.length === 0) {
    throw new Error(
      'a lane claim cannot be canonised without a human authority record: record who holds the authority, as the '
        + 'stable identifier of a role, team or council',
    );
  }
  return recordAuthority(authorityRef, { authorityKind });
}

/**
 * Whether a falsification plan reaches beyond the text it was extracted from.
 *
 * A security proposition is about what happens when a check is absent, and
 * absence is invisible in the source that is present. Re-reading the text is
 * therefore not a falsification of it, however many times it is done: the plan
 * must name a channel that observes behaviour, and enough distinct channels to
 * meet the declared budget.
 *
 * @param {object} claim
 * @param {Array<{ channel: string, evidence_mode: string }>} falsificationPlan
 * @returns {boolean}
 */
export function isStrongFalsification(claim, falsificationPlan = []) {
  if (typeof claim?.falsification !== 'string' || claim.falsification.trim().length === 0) return false;

  const modes = new Set(
    (Array.isArray(falsificationPlan) ? falsificationPlan : [])
      .map((channel) => channel?.evidence_mode)
      .filter((mode) => EVIDENCE_MODES.includes(mode)),
  );
  if (modes.size < LANE_FALSIFICATION_BUDGET) return false;

  return [...modes].some((mode) => mode !== SOURCE_STATIC_MODE);
}

/**
 * Decide whether a lane claim may be canonised.
 *
 * A missing half is a refusal that names what is missing, so the report says
 * which of the two requirements is outstanding. A *wrong* authority is not a
 * missing one and is thrown rather than reported, because a personal name is a
 * record that must be replaced rather than a step that must be performed.
 *
 * @param {{ claim_id: string, lane: string, falsification?: string }} claim
 * @param {{ authorityRecord?: object|null, falsificationPlan?: Array<object> }} [input]
 * @returns {Readonly<object>} the decision, with `canonisation_blocked` and what is missing
 */
export function blockCanonisation(claim, { authorityRecord = null, falsificationPlan = [] } = {}) {
  const claimId = claim?.claim_id ?? '(unnamed claim)';

  const settledLane = claim?.lane;

  // Only an explicitly ordinary claim is outside this gate. A claim that never
  // went through classification has no settled membership, and answering "the gate
  // does not apply" there would let a high-risk claim pass by never being
  // classified — which is the whole failure the lane exists to prevent.
  if (settledLane !== LANE_MEMBERSHIP.SECURITY && settledLane !== LANE_MEMBERSHIP.ORDINARY) {
    return Object.freeze({
      canonisation_blocked: true,
      claim_id: claimId,
      missing: Object.freeze(['a lane membership settled by classification']),
      reason: `${claimId} carries no settled lane membership (it is ${JSON.stringify(settledLane)}), so whether the `
        + 'lane gate applies to it is unknown: classify the claim before canonising anything derived from it',
    });
  }

  if (settledLane === LANE_MEMBERSHIP.ORDINARY) {
    return Object.freeze({
      canonisation_blocked: false,
      claim_id: claimId,
      missing: Object.freeze([]),
      reason: 'the claim is in the ordinary lane, so the lane gate does not apply to it',
    });
  }

  const authority = authorityRecord === null ? null : assertAuthorityRecorded(authorityRecord);
  const missing = [];
  if (authority === null) missing.push('a human authority record');
  if (!isStrongFalsification(claim, falsificationPlan)) missing.push('a strong falsification');

  if (missing.length > 0) {
    return Object.freeze({
      canonisation_blocked: true,
      claim_id: claimId,
      missing: Object.freeze(missing),
      reason: `${claimId} concerns a risk category and cannot be canonised without ${missing.join(' and ')}`,
    });
  }

  return Object.freeze({
    canonisation_blocked: false,
    claim_id: claimId,
    missing: Object.freeze([]),
    authority,
    reason: `${claimId} carries a recorded authority and a falsification that observes behaviour, so it may be canonised`,
  });
}

/**
 * One Markdown row per declared risk category, zeros included.
 *
 * Every category the classifier counts is printed — not only the cross-cutting
 * five — because a category that is counted but not shown would hide a lane
 * claim, and a hidden lane claim is the failure this whole module exists to
 * prevent.
 */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function renderCategoryRows(categories) {
  return RISK_CATEGORIES.map((category) => {
    const found = categories[category] ?? 0;
    const crossCutting = CROSS_CUTTING_RISK_CATEGORIES.includes(category);
    const reading = found === 0
      ? 'none found — a measurement about this corpus, not a statement that the surface is absent'
      : `${found} claim(s)`;
    return `- **${category}**${crossCutting ? ' (cross-cutting)' : ''} — ${reading}`;
  });
}

/** The section listing the lane claims and what each one still needs. */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function renderLaneClaims(security) {
  if (security.length === 0) return ['The security lane is empty.'];
  const lines = [];
  for (const entry of security) {
    lines.push(`- \`${entry.claim_id}\` — ${entry.risk_categories.join(', ')}`);
    lines.push(`  - anchor: ${entry.anchor}`);
    lines.push(`  - statement: ${entry.statement}`);
  }
  return lines;
}

/** The section listing the claims that could not be settled, with the reason. */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function renderReported(reported) {
  if (reported.length === 0) return ['No claim needed reporting: every claim was settled into one of the two lanes.'];
  const lines = [];
  for (const entry of reported) {
    lines.push(`- \`${entry.claim_id}\` — ${entry.reason}`);
  }
  return lines;
}

/**
 * The classification as the Markdown a human reads before holding authority.
 *
 * The per-category lines are printed even where the count is zero, because a
 * missing row cannot be told apart from a clean result, and the empty lane says
 * in words that it is a measurement rather than a clearance.
 *
 * @param {object} classification
 * @returns {string} Markdown
 */
export function renderLaneReport(classification) {
  const { counts, categories, lane, reported, note } = classification;
  const lines = [
    '# Security lane — what a human must approve before it is canonised',
    '',
    'A claim is in this lane when the source text at its anchor names authorization, tenancy, secrets,',
    'deletion or audit. For these propositions the code records what the program currently does, which is',
    'the weakest possible evidence for what it ought to do: a missing or incorrect check is invisible in',
    'the code that is present.',
    '',
    '## What was measured',
    '',
    `- claims read: ${counts.total}`,
    `- in the security lane: ${counts.security}`,
    `- in the ordinary lane: ${counts.ordinary}`,
    `- reported rather than settled: ${counts.unclassified}`,
    '',
    '## Where the risk was found',
    '',
    ...renderCategoryRows(categories),
    '',
    '## Claims awaiting a human authority and a strong falsification',
    '',
    ...renderLaneClaims(lane.security),
    '',
    '## Claims reported rather than classified',
    '',
    ...renderReported(reported),
    '',
    '## What the lane requires',
    '',
    classification.policy,
  ];

  if (note.length > 0) {
    lines.push('', '## Note', '', note);
  }

  return `${lines.join('\n')}\n`;
}
