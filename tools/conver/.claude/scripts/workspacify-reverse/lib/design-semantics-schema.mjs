// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
/**
 * What a design semantics must say, as a closed set of items.
 *
 * A measurement states a fact about the text: a reference exists at a line, a
 * condition is asserted at a line. A design document states what those facts mean,
 * and that is a different kind of proposition — one the analysis cannot produce and
 * an engineer has to write. This file is the list of propositions that have to be
 * written, at every package, before the spec may be published.
 *
 * The list is one definition read by three readers: the validator that enforces it,
 * the locator that shows the author which cells are thin, and the tests. A second copy
 * anywhere would be a second thing to drift, and the drift would be invisible — the
 * schema is what makes "the semantics is complete" a checkable statement rather than
 * an impression.
 *
 * `requires` is phrased as the question the item answers, because the author's job is
 * to answer it in the subject's own terms and a noun phrase would leave the question
 * open. `checks` names the deterministic checks the validator runs for that item;
 * every item is grounded, refutable, distinct from the measurement and not reused
 * elsewhere, and the items that must name a counterpart carry `names`, while the one
 * whose subject is the boundary carries `covers`.
 */

/** The checks every item is held to, before its own. */
const UNIVERSAL_CHECKS = Object.freeze(['grounded', 'refutable', 'not_restatement', 'not_reused']);

/** One item: what it asks, and what the machine does about it. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function item(key, group, heading, requires, extraChecks = []) {
  return Object.freeze({
    key,
    group,
    heading,
    requires,
    checks: Object.freeze([...UNIVERSAL_CHECKS, ...extraChecks]),
  });
}

/** The groups, in the order a reader meets them. */
export const SEMANTICS_GROUPS = Object.freeze([
  Object.freeze({ key: 'existence', label: 'A existence', heading: 'What this is, and what it is for' }),
  Object.freeze({ key: 'behaviour', label: 'B behaviour', heading: 'What it guarantees' }),
  Object.freeze({ key: 'relation', label: 'C relation', heading: 'How it stands to the rest of the tree' }),
  Object.freeze({ key: 'judgement', label: 'D judgement', heading: 'What was chosen, and what was given up' }),
  Object.freeze({ key: 'understanding', label: 'E understanding', heading: 'How to read it' }),
]);

/**
 * The 21 items, in the order they are rendered.
 *
 * Each is a question the measurement cannot answer. That is the test for whether an
 * item belongs here: if a stage could derive it from the text, it is already in the
 * spec as a claim and repeating it as a reading would be the restatement the
 * `not_restatement` check refuses.
 */
export const SEMANTICS_ITEMS = Object.freeze([
  item('identity', 'existence', 'Identity',
    'What is this, what does it exist for, and what would be worse if it did not exist?'),
  item('domain_role', 'existence', 'Domain role',
    'Where does it sit in the domain vocabulary, which words does it define, and where are the words it shares with others defined?', ['names']),
  item('origin', 'existence', 'Origin',
    'Why is it shaped this way now, and what did it come through to get here?'),

  item('responsibility', 'behaviour', 'Responsibility',
    'What does it own, and what does it explicitly not own?'),
  item('invariants', 'behaviour', 'Invariants',
    'What must hold through every operation, and which packages assume it holds?', ['names']),
  item('contract', 'behaviour', 'Contract',
    'What does it promise a caller, and what does it require of one?'),
  item('failure_semantics', 'behaviour', 'Failure semantics',
    'What does a failure mean here, what is deliberately not recovered, and as whose error does it surface elsewhere?', ['names']),
  item('state_lifetime', 'behaviour', 'State and lifetime',
    'What state does it hold, who owns it, where is it created and destroyed, what is one atomic unit, and what would a torn state look like?'),
  item('concurrency', 'behaviour', 'Concurrency',
    'What is safe concurrently, what serialises, and what must never be shared?'),

  item('collaboration', 'relation', 'Collaboration',
    'Whom does it work with and towards what, why does it depend in this direction rather than the other, is each coupling intended or accidental, where does it sit in the runtime order, and which layer does it belong to and what does that layer forbid?', ['names']),
  item('boundary', 'relation', 'Boundary',
    'Why is the cut here, what alternative cut was rejected and why, and of the references that cross it, which are intended contracts and which are leaks?', ['covers']),
  item('ownership', 'relation', 'Ownership',
    'Who holds the canonical value, who holds a copy, and what happens when a copy goes stale?', ['names']),
  item('impact', 'relation', 'Impact',
    'What breaks when this changes, and what has to change with it?', ['names']),
  item('peers', 'relation', 'Peers',
    'What is its counterpart, how is the symmetry broken when one side moves, and is the same problem solved differently anywhere else?', ['names']),
  item('environment', 'relation', 'Environment',
    'What is its boundary with the outside world and what does it assume there, and how does it take part in the concerns that cut across every package?'),

  item('alternatives', 'judgement', 'Alternatives',
    'What design was not taken, why was it rejected, and what was given up to get what was kept?', ['names']),
  item('non_goals', 'judgement', 'Non-goals',
    'What does it deliberately not aim at, and where are its present limits?'),
  item('extension_points', 'judgement', 'Extension points',
    'Where may behaviour be added, and where must it never be?'),
  item('assumptions', 'judgement', 'Assumptions',
    'What does it assume without stating it, and what breaks when an assumption fails?'),

  item('mental_model', 'understanding', 'Mental model',
    'How should it be understood, what is it commonly mistaken for, and in what order should it be read?'),
  item('open_questions', 'understanding', 'Open questions',
    'What is not decided, and what would settle it?', ['names']),
]);

/** The keys alone, for the checks that ask whether an item is in the set. */
export const SEMANTICS_ITEM_KEYS = Object.freeze(SEMANTICS_ITEMS.map((entry) => entry.key));

/** The items by group, in the order the groups are declared. */
export const ITEMS_BY_GROUP = Object.freeze(
  SEMANTICS_GROUPS.map((group) => Object.freeze({
    ...group,
    items: Object.freeze(SEMANTICS_ITEMS.filter((entry) => entry.group === group.key)),
  })),
);

/** One item by key, or `undefined` — the lookup a refusal uses to name what it refused. */
export function semanticsItem(key) {
  return SEMANTICS_ITEMS.find((entry) => entry.key === key);
}

/** The size of the matrix one package owes, so the closure arithmetic has one source. */
export const SEMANTICS_ITEM_COUNT = SEMANTICS_ITEMS.length;
