// PX-261 @verifies C002
// A ground is what makes a recorded judgment reviewable, so it has to point at something a
// reader can open. The resolver answers one question — does every reference this ground
// carries name something the artifact holds — and it answers it from the artifact, never
// from a list of forms this repository writes down.
//
// It deliberately cannot answer the question one step further on: whether the line a ground
// cites says what the ground says it says. That limit is stated rather than implied, because
// a resolver that read as if it had checked the claim would be worse than no resolver.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  REFERENCE_FORMS,
  findReferences,
  resolveGround,
  sectionIdentifiersOf,
} from '../../.claude/scripts/sequences-slice/lib/obligation-ground.mjs';

/** An artifact whose identifiers a ground can name, at the shapes the live corpus writes. */
// [::TICKET::] PX-261, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
/** The identifiers a fixture artifact holds, named rather than spelled at the parameter list. */
// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
const FIXTURE_SECTIONS = Object.freeze([{ id: 's1', firstLine: 1, lastLine: 9 }]);
const FIXTURE_OPERATIONS = Object.freeze([{ id: 'CreateForum' }]);
const FIXTURE_SEQUENCES = Object.freeze([{ id: 'G-1' }]);

// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
function artifactWith({ lines = 15971, sections = FIXTURE_SECTIONS, operations = FIXTURE_OPERATIONS, sequences = FIXTURE_SEQUENCES } = {}) {
  return { spec: { lines, path: 'SyntheticSpec.md' }, sections, operations, sequences };
}

test('C002 a ground citing a line, a line range, a section or an artifact id resolves', () => {
  const artifact = artifactWith();

  assert.deepEqual(resolveGround('the specification states it on line 412', artifact), { resolved: true, unresolved: [] });
  assert.deepEqual(resolveGround('the region is a blank line 255-255', artifact), { resolved: true, unresolved: [] });
  assert.deepEqual(resolveGround('lines 255-260 carry nothing', artifact), { resolved: true, unresolved: [] });
  assert.deepEqual(resolveGround('the specification states it in section s1', artifact), { resolved: true, unresolved: [] });
  assert.deepEqual(resolveGround('CreateForum owes it', artifact), { resolved: true, unresolved: [] });
  assert.deepEqual(resolveGround('G-1 is the sequence it belongs to', artifact), { resolved: true, unresolved: [] });
});

test('C002 a ground carrying no reference at all is unresolved rather than silently accepted', () => {
  const artifact = artifactWith();

  assert.deepEqual(resolveGround('it is obviously required', artifact), { resolved: false, unresolved: [] });
  assert.deepEqual(resolveGround('', artifact), { resolved: false, unresolved: [] });
  assert.deepEqual(resolveGround('the transport column is the interface', artifact), { resolved: false, unresolved: [] });
});

test('C002 a ground carrying one resolvable and one unresolvable reference is unresolved', () => {
  const artifact = artifactWith();

  assert.deepEqual(resolveGround('line 412 and section s99', artifact), { resolved: false, unresolved: ['s99'] });
  assert.deepEqual(resolveGround('stated in s1 and op-Nope', artifact), { resolved: false, unresolved: ['op-Nope'] });
  assert.deepEqual(resolveGround('line 412 and line 99999', artifact), { resolved: false, unresolved: ['line 99999'] });
});

test('C002 a reference outside the artifact is named, and the line count is the artifact own', () => {
  const artifact = artifactWith();

  assert.deepEqual(resolveGround('line 99999', artifact), { resolved: false, unresolved: ['line 99999'] });
  assert.deepEqual(resolveGround('line 0', artifact), { resolved: false, unresolved: ['line 0'] });
  assert.deepEqual(resolveGround('line 15971', artifact), { resolved: true, unresolved: [] }, 'the last line of the document resolves');
  assert.deepEqual(resolveGround('section s99', artifact), { resolved: false, unresolved: ['s99'] });
  assert.deepEqual(resolveGround('line 15972', artifact), { resolved: false, unresolved: ['line 15972'] });
});

test('C002 the resolver is total over an artifact carrying no sections and no operations', () => {
  const bare = { spec: { lines: 10 } };

  assert.deepEqual(resolveGround('line 3', bare), { resolved: true, unresolved: [] });
  assert.deepEqual(resolveGround('line 11', bare), { resolved: false, unresolved: ['line 11'] });
  // An artifact that holds no identifier cannot confirm one, so a name it never carried is
  // prose to it. The ground still fails, because a ground citing nothing is not evidence.
  assert.deepEqual(resolveGround('section s1', bare), { resolved: false, unresolved: [] });
  assert.deepEqual(resolveGround('CreateForum', bare), { resolved: false, unresolved: [] });
});

test('C002 an artifact carrying no line count resolves no line, and does not throw', () => {
  assert.deepEqual(resolveGround('line 3', { sections: [], operations: [], sequences: [] }), { resolved: false, unresolved: ['line 3'] });
});

test('C002 the reference forms are one frozen list, spelled once', () => {
  assert.equal(Array.isArray(REFERENCE_FORMS), true);
  assert.equal(Object.isFrozen(REFERENCE_FORMS), true);
  assert.equal(REFERENCE_FORMS.length > 0, true);
});

test('C002 findReferences reports the references a ground carries, in the order it writes them', () => {
  const artifact = artifactWith();

  assert.deepEqual(findReferences('line 412 and section s1', artifact), ['line 412', 's1']);
  assert.deepEqual(findReferences('section s1 and line 412', artifact), ['s1', 'line 412']);
  assert.deepEqual(findReferences('nothing to cite', artifact), []);
  assert.deepEqual(findReferences('the region is a blank line 255-255', artifact), ['line 255-255']);
  assert.deepEqual(findReferences('it is obviously required', artifact), [], 'a sentence is words, not citations');
});

test('C002 a token of a family the artifact carries that the artifact does not hold is reported as dangling', () => {
  const artifact = artifactWith({ sections: [{ id: 's1' }, { id: 's2' }], sequences: [{ id: 'G-1' }, { id: 'B-69' }] });

  assert.deepEqual(resolveGround('the s10 region', artifact), { resolved: false, unresolved: ['s10'] }, 's10 is not s1 with a suffix');
  assert.deepEqual(resolveGround('section s99', artifact), { resolved: false, unresolved: ['s99'] });
  assert.deepEqual(resolveGround('G-999 is the sequence', artifact), { resolved: false, unresolved: ['G-999'] });
  assert.deepEqual(resolveGround('line 412 and section s99', artifact), { resolved: false, unresolved: ['s99'] });
});

test('C002 the families are derived from the artifact, so a project naming its sections otherwise is read by its own names', () => {
  const artifact = artifactWith({ sections: [{ id: 'h-000002' }], sequences: [{ id: 'G-1' }] });

  assert.deepEqual(resolveGround('h-000002 states it', artifact), { resolved: true, unresolved: [] });
  assert.deepEqual(resolveGround('h-000099 states it', artifact), { resolved: false, unresolved: ['h-000099'] });
  assert.deepEqual(resolveGround('the s99 region', artifact), { resolved: false, unresolved: [] }, 's is no family of this artifact, so s99 is prose');
});

test('C002 an unknown name sharing no shape with an artifact id is prose, and the ground fails for citing nothing', () => {
  const artifact = artifactWith({ sections: [{ id: 's1' }], operations: [{ id: 'CreateForum' }] });

  assert.deepEqual(resolveGround('CreateForumMembership is the operation', artifact), { resolved: false, unresolved: [] });
  assert.deepEqual(resolveGround('CreateForum owes it', artifact), { resolved: true, unresolved: [] });
});

test('C002 an id is matched as a whole token, so a longer name is never read as the id it starts with', () => {
  const artifact = artifactWith({ sections: [{ id: 's1' }], operations: [{ id: 'CreateForum' }] });

  assert.deepEqual(resolveGround('see CreateForum', artifact), { resolved: true, unresolved: [] });
  assert.deepEqual(resolveGround('see s1', artifact), { resolved: true, unresolved: [] });
});

// ---------------------------------------------------------------------------
// PX-263 — a section citation resolves against the document that carries it
// ---------------------------------------------------------------------------

// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
test('C001 a heading number is a label the document carries, and a citation of it resolves', () => {
  const document = ['# 3 Acceptance', '', '### 3.4.3 The boundary', 'text'].join('\n');
  const artifact = { spec: { lines: 10 }, sections: [], operations: [], sequences: [] };
  const labels = sectionIdentifiersOf(document);

  assert.ok(labels.has('3.4.3'), 'the numeric heading prefix is a label');
  assert.ok(labels.has('3'), 'an ancestor heading is a label too');
  assert.deepEqual(resolveGround('see §3.4.3', artifact, { sections: labels }), { resolved: true, unresolved: [] });
  assert.deepEqual(resolveGround('see §3.4.3', artifact), { resolved: false, unresolved: [] }, 'with sources omitted the citation stays prose, which is the previous answer exactly');
});

test('C001 a section citation the document does not carry is dangling once the labels are supplied', () => {
  const artifact = { spec: { lines: 10 }, sections: [], operations: [], sequences: [] };
  const labels = sectionIdentifiersOf('## 3 Acceptance\n### 3.4.3 The boundary\n');

  assert.deepEqual(resolveGround('see §9.9.9', artifact, { sections: labels }), { resolved: false, unresolved: ['9.9.9'] });
});

test('C001 supplying the labels changes no answer that was not a section citation', () => {
  const artifact = { spec: { lines: 10 }, sections: [{ id: 'h-000002' }], operations: [{ id: 'R-0001' }], sequences: [] };
  const labels = sectionIdentifiersOf('## 3 Acceptance\n### 3.4.3 The boundary\n');

  for (const ground of ['line 4', 'op-R-0001', 'h-000002', 'plain prose with no citation', 'line 4 and op-R-0001']) {
    assert.deepEqual(resolveGround(ground, artifact, { sections: labels }), resolveGround(ground, artifact), `"${ground}" is unaffected`);
  }
});

test('C001 a document with no numbered headings yields no labels rather than invented ones', () => {
  assert.deepEqual([...sectionIdentifiersOf('# Motivation\n## Conventions\n')], []);
  assert.deepEqual([...sectionIdentifiersOf('')], []);
  assert.ok(sectionIdentifiersOf('## 7.1 The shape\n').has('7.1'), 'a heading with a title after the number still yields the number');
});
