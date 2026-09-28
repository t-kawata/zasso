/**
 * One digest per explanation section, over the facts that section rests on.
 *
 * This is what lets a re-run keep a section or reopen it. The digest has to be a function
 * of the facts the section rests on and of nothing else: a digest that moved when an
 * unrelated section moved would reopen a section for no reason and throw away a person's
 * thinking, and one that failed to move when a feeding fact moved would present a stale
 * judgement as current.
 *
 * To tell those two apart the block records the digest of each INFO section separately as
 * well as the digest of the whole. That is what lets a reopened section say which fact
 * moved rather than only that something did.
 */
import { sha256Hex } from '../../workspacify-tree/lib/hash.mjs';

/** The nine sections of the facts document, in the order the renderer emits them. */
export const INFO_SECTION_IDS = Object.freeze(['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9']);

/**
 * Which facts each explanation section rests on.
 *
 * INFO 1 states the hashes the run verified. No explanation section rests on it: a hash
 * moving is a consequence of a fact moving, and the fact itself is digested where it
 * lives, so making the explanation depend on the verification block would reopen every
 * section whenever anything at all changed.
 */
export const EXPLAIN_SECTION_FACTS = Object.freeze([
  Object.freeze({ id: 'E1', info: Object.freeze(['I2', 'I3']) }),
  Object.freeze({ id: 'E2', info: Object.freeze(['I2']) }),
  Object.freeze({ id: 'E3', info: Object.freeze(['I3', 'I6']) }),
  Object.freeze({ id: 'E4', info: Object.freeze(['I4', 'I5']) }),
  Object.freeze({ id: 'E5', info: Object.freeze(['I9']) }),
  Object.freeze({ id: 'E6', info: Object.freeze(['I5', 'I7', 'I8']) }),
  Object.freeze({ id: 'E7', info: Object.freeze(['I7', 'I6']) }),
]);

/** The comment that opens the block recording those digests. */
export const DIGEST_BLOCK_OPEN = '<!-- explain-seed:facts';

/** The comment that closes it. */
export const DIGEST_BLOCK_CLOSE = '-->';

/** The schema name the block carries, so a future format can be told from this one. */
export const DIGEST_SCHEMA = 'explain-seed-facts-v1';

/** The digest of one piece of text. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function digestText(text) {
  return sha256Hex(Buffer.from(String(text), 'utf8'));
}

/**
 * The digest of every INFO section, feeding or not.
 *
 * @param {Record<string, string>} sections - the rendered INFO sections, keyed by id
 * @returns {Record<string, string>} one digest per section id
 */
export function computeInfoDigests(sections) {
  return Object.fromEntries(INFO_SECTION_IDS.map((id) => [id, digestText(sections[id] ?? '')]));
}

/**
 * The digest of every explanation section, with the digest of each fact behind it.
 *
 * @param {Record<string, string>} sections - the rendered INFO sections, keyed by id
 * @returns {Record<string, { digest: string, facts: Array<{ id: string, digest: string }> }>}
 */
export function computeFrameDigests(sections) {
  const infoDigests = computeInfoDigests(sections);
  return Object.fromEntries(
    EXPLAIN_SECTION_FACTS.map((entry) => [
      entry.id,
      {
        digest: digestText(entry.info.map((id) => sections[id] ?? '').join('\n')),
        facts: entry.info.map((id) => ({ id, digest: infoDigests[id] })),
      },
    ]),
  );
}

/** Whether a parsed block is the shape this module writes, rather than any JSON at all. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function isDigestRecord(parsed) {
  if (parsed === null || typeof parsed !== 'object' || parsed.schema !== DIGEST_SCHEMA) return false;
  if (parsed.sections === null || typeof parsed.sections !== 'object') return false;
  return EXPLAIN_SECTION_FACTS.every((entry) => {
    const section = parsed.sections[entry.id];
    if (section === undefined || !/^[0-9a-f]{64}$/.test(String(section.digest))) return false;
    return (
      Array.isArray(section.facts) &&
      entry.info.every((infoId) => section.facts.some((fact) => fact.id === infoId && /^[0-9a-f]{64}$/.test(String(fact.digest))))
    );
  });
}

/**
 * The block that records those digests, as it appears at the end of the document.
 *
 * @param {Record<string, object>} frameDigests
 * @returns {string}
 */
export function renderDigestBlock(frameDigests) {
  return [DIGEST_BLOCK_OPEN, JSON.stringify({ schema: DIGEST_SCHEMA, sections: frameDigests }), DIGEST_BLOCK_CLOSE].join('\n');
}

/**
 * The digests a document records, or nothing.
 *
 * A block that is absent, truncated or unreadable records nothing rather than a guess: the
 * merge then treats every section as reopened while still carrying a person's notes across
 * by their anchor, which is the safe direction — it re-asks a question rather than
 * presenting a stale answer as current.
 *
 * @param {string} documentText
 * @returns {Record<string, object>|null}
 */
export function readDigestBlock(documentText) {
  const text = String(documentText);
  const start = text.indexOf(DIGEST_BLOCK_OPEN);
  if (start < 0) return null;
  const end = text.indexOf(DIGEST_BLOCK_CLOSE, start + DIGEST_BLOCK_OPEN.length);
  if (end < 0) return null;

  const body = text.slice(start + DIGEST_BLOCK_OPEN.length, end).trim();
  if (body === '') return null;
  try {
    const parsed = JSON.parse(body);
    return isDigestRecord(parsed) ? parsed.sections : null;
  } catch {
    return null;
  }
}

/**
 * Which facts moved, per explanation section.
 *
 * @param {{ recorded: Record<string, object>|null, computed: Record<string, object> }} input
 * @returns {Record<string, string[]>} the INFO section ids that moved, per explanation section
 */
export function movedFactNames({ recorded, computed }) {
  if (recorded === null || recorded === undefined) return {};

  const moved = {};
  for (const entry of EXPLAIN_SECTION_FACTS) {
    const before = recorded[entry.id];
    const after = computed[entry.id];
    if (before === undefined || before.digest === after.digest) continue;

    const beforeFacts = new Map((before.facts ?? []).map((fact) => [fact.id, fact.digest]));
    const differing = entry.info.filter((infoId) => beforeFacts.get(infoId) !== after.facts.find((fact) => fact.id === infoId)?.digest);
    moved[entry.id] = differing.length > 0 ? differing : [...entry.info];
  }
  return moved;
}
