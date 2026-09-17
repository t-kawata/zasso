// @verifies C001
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
/**
 * The schema, which is the list of what a design semantics has to say.
 *
 * The set is closed for the same reason the four provenance classes are: a document
 * whose required contents are open-ended cannot be checked for completeness, and
 * "the semantics is rich enough" would go back to being an impression. The test
 * therefore asserts the set itself — its size, its uniqueness, its partition into
 * groups, and that every item states both what it asks and what the machine does
 * about it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ITEMS_BY_GROUP,
  SEMANTICS_GROUPS,
  SEMANTICS_ITEMS,
  SEMANTICS_ITEM_COUNT,
  SEMANTICS_ITEM_KEYS,
  semanticsItem,
} from '../../../.claude/scripts/workspacify-reverse/lib/design-semantics-schema.mjs';

test('C001 precondition: the schema is a closed set of 21 items', () => {
  assert.equal(SEMANTICS_ITEMS.length, 21, 'the matrix has 21 item rows');
  assert.equal(SEMANTICS_ITEM_COUNT, 21, 'and the count the closure arithmetic reads is the same number');
  assert.equal(new Set(SEMANTICS_ITEM_KEYS).size, 21, 'no key repeats');
  assert.deepEqual(SEMANTICS_ITEM_KEYS, SEMANTICS_ITEMS.map((entry) => entry.key));
});

test('C001 precondition: every item states what is asked and what is checked', () => {
  for (const entry of SEMANTICS_ITEMS) {
    assert.ok(entry.requires.length > 0, `${entry.key} states what the author must write`);
    assert.match(entry.requires, /\?$/, `${entry.key} is phrased as the question it answers`);
    assert.ok(entry.checks.length >= 4, `${entry.key} carries the universal checks and its own`);
    assert.ok(entry.heading.length > 0, `${entry.key} has a heading a reader meets`);
    assert.equal(typeof entry.group, 'string', `${entry.key} belongs to a group`);
  }
});

test('C001 precondition: an item is looked up by key and nothing else', () => {
  const found = semanticsItem('identity');
  assert.equal(found.key, 'identity');
  assert.equal(semanticsItem('not-an-item'), undefined, 'an item outside the set does not resolve');
});

test('C001 postcondition: the groups partition the set in the order a reader meets them', () => {
  assert.deepEqual(
    ITEMS_BY_GROUP.flatMap((group) => group.items.map((entry) => entry.key)),
    SEMANTICS_ITEM_KEYS,
    'the groups concatenate to the whole set, so no item is unreachable by group',
  );
  for (const group of ITEMS_BY_GROUP) {
    assert.ok(group.items.length > 0, `${group.key} holds at least one item`);
    for (const entry of group.items) assert.equal(entry.group, group.key, `${entry.key} is in the group it claims`);
  }
  assert.deepEqual(ITEMS_BY_GROUP.map((group) => group.key), SEMANTICS_GROUPS.map((group) => group.key));
});

test('C001 postcondition: the checks that demand a counterpart are on the items that have one', () => {
  const naming = SEMANTICS_ITEMS.filter((entry) => entry.checks.includes('names')).map((entry) => entry.key);
  const covering = SEMANTICS_ITEMS.filter((entry) => entry.checks.includes('covers')).map((entry) => entry.key);

  assert.deepEqual(covering, ['boundary'], 'the boundary is the one item whose subject is the crossings themselves');
  assert.ok(naming.length >= 8, 'the items whose subject is a counterpart carry the check that demands one');
  for (const key of [...naming, ...covering]) {
    assert.equal(SEMANTICS_ITEM_KEYS.includes(key), true, `${key} is an item`);
  }
});

test('C001 boundary: every item is one a measurement cannot produce', () => {
  // The schema is a claim about what the analysis cannot say. An item whose answer a
  // stage already derives would be a reading that restates a claim, which the
  // not_restatement check would then refuse — so the set would be self-defeating.
  const derivedElsewhere = ['claim_id', 'claim_type', 'evidence', 'statement', 'falsification'];

  for (const entry of SEMANTICS_ITEMS) {
    assert.equal(
      derivedElsewhere.includes(entry.key),
      false,
      `${entry.key} is not a field of a measured claim`,
    );
  }
});
