// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
// PX-222 @verifies C003
// PX-222 @verifies C008
// PX-225 @verifies C005
//
// The digest is what lets a re-run keep a section or reopen it. It has to depend on the
// facts a section rests on and on nothing else: a digest that moved when an unrelated
// section moved would reopen a section for no reason and throw away the human's thinking,
// and a digest that failed to move when a feeding fact moved would present a stale
// judgement as current.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPLAIN_SECTION_FACTS,
  INFO_SECTION_IDS,
  computeFrameDigests,
  computeInfoDigests,
  movedFactNames,
  readDigestBlock,
  renderDigestBlock,
} from '../../../.claude/scripts/explain-seed/lib/digest.mjs';
import { FRAME_SECTIONS } from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import { INFO_SECTION_TITLES, renderInfo } from '../../../.claude/scripts/explain-seed/lib/render.mjs';
import { syntheticFacts, syntheticInfoSections, syntheticProjection } from '../helpers/synthetic-facts.mjs';

test('C003 invariant: every EXPLAIN section declares which INFO sections feed it, and only known ids', () => {
  assert.deepEqual(
    EXPLAIN_SECTION_FACTS.map((entry) => entry.id),
    FRAME_SECTIONS.map((section) => section.id),
    'the mapping covers the frame sections in order',
  );
  for (const entry of EXPLAIN_SECTION_FACTS) {
    assert.ok(entry.restsOn.length > 0, `${entry.id} rests on at least one INFO section`);
    for (const infoId of entry.restsOn) assert.ok(INFO_SECTION_IDS.includes(infoId), `${infoId} is a known INFO section`);
  }
});

test('C003 invariant: a section digest is a function of its feeding INFO sections and nothing else', () => {
  const base = computeFrameDigests(syntheticInfoSections());
  const unrelatedMoved = computeFrameDigests(syntheticInfoSections({ I1: '## 1. この文書が確かめたこと\n\n- workspace root: `/tmp/other`\n' }));

  assert.deepEqual(unrelatedMoved, base, 'INFO 1 feeds no explanation section, so nothing reopens');

  const positionMoved = computeFrameDigests(syntheticInfoSections({ I2: '## 2. 全体の中での位置\n\n全体は 3 パッケージで構成されています。\n' }));
  const moved = Object.keys(positionMoved).filter((id) => positionMoved[id].digest !== base[id].digest);

  assert.deepEqual(moved, ['E1', 'E2'], 'only the sections that rest on INFO 2 reopen');
});

test('C003 invariant: each section records its own digest and the digest of every fact it rests on', () => {
  const digests = computeFrameDigests(syntheticInfoSections());
  const infoDigests = computeInfoDigests(syntheticInfoSections());

  for (const entry of EXPLAIN_SECTION_FACTS) {
    assert.match(digests[entry.id].digest, /^[0-9a-f]{64}$/);
    assert.deepEqual(
      digests[entry.id].facts.map((fact) => fact.id),
      entry.restsOn,
    );
    for (const fact of digests[entry.id].facts) assert.equal(fact.digest, infoDigests[fact.id]);
  }
  assert.deepEqual(Object.keys(infoDigests), INFO_SECTION_IDS, 'every INFO section is digested, feeding or not');
});

test('C003 postcondition: the digest block round-trips and names the facts it was built from', () => {
  const digests = computeFrameDigests(syntheticInfoSections());
  const document = ['# 文書', '', renderDigestBlock(digests)].join('\n');
  const recorded = readDigestBlock(document);

  assert.deepEqual(recorded, digests);
  assert.match(renderDigestBlock(digests), /<!-- explain-seed:facts/, 'the block names its own schema');
});

test('C008 invariant: a document with no digest block, or an unreadable one, records nothing rather than guessing', () => {
  assert.equal(readDigestBlock('# 文書\n'), null);
  assert.equal(readDigestBlock('# 文書\n\n<!-- explain-seed:facts\n{ not json\n-->\n'), null);
  assert.equal(readDigestBlock('# 文書\n\n<!-- explain-seed:facts\n-->\n'), null);
});

test('C008 postcondition: the moved facts are named, so a reopened section can say what changed', () => {
  const recorded = computeFrameDigests(syntheticInfoSections());
  const computed = computeFrameDigests(
    syntheticInfoSections({
      I2: '## 2. 全体の中での位置\n\n全体は 3 パッケージで構成されています。\n',
      I7: '## 7. 禁じられた依存と非干渉\n\n- pkg-0001 → pkg-0002 は禁止（理由コード: layer-direction）\n',
    }),
  );

  assert.deepEqual(movedFactNames({ recorded, computed }), { E1: ['I2'], E2: ['I2'], E6: ['I7'], E7: ['I7'] });
  assert.deepEqual(movedFactNames({ recorded, computed: recorded }), {});
});

// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
test('C005 postcondition: a moved neighbour decision reopens exactly the three sections that rest on it', () => {
  const recorded = computeFrameDigests(syntheticInfoSections({ I10: '## 10.\n\n- boundary-001: refuse with a coded error\n' }));
  const computed = computeFrameDigests(syntheticInfoSections({ I10: '## 10.\n\n- boundary-001: clamp and accept\n' }));

  const moved = Object.keys(computed).filter((id) => computed[id].digest !== recorded[id].digest);
  assert.deepEqual(moved, ['E1', 'E5', 'E6'], 'the introduction counts the items, the human section holds them, the pre-decisions record them');
  assert.deepEqual(movedFactNames({ recorded, computed }), { E1: ['I10'], E5: ['I10'], E6: ['I10'] });
});

test('C005 invariant: the tenth section feeds E1, E5 and E6 and nothing else', () => {
  const restingOnSettlements = EXPLAIN_SECTION_FACTS.filter((entry) => entry.restsOn.includes('I10')).map((entry) => entry.id);

  assert.deepEqual([...restingOnSettlements].sort(), ['E1', 'E5', 'E6']);
});

test('C005 invariant: the ids the digest knows are the ids the renderer emits', () => {
  const facts = syntheticFacts();
  const { sections } = renderInfo({
    projection: syntheticProjection(),
    workspace: facts.workspace,
    seedPath: facts.seedPath,
    verified: { specification: 'a'.repeat(64), stageOneManifest: 'b'.repeat(64), seed: 'c'.repeat(64) },
  });

  assert.deepEqual([...INFO_SECTION_IDS], Object.keys(INFO_SECTION_TITLES), 'the titles and the ids name one set');
  assert.deepEqual([...INFO_SECTION_IDS], Object.keys(sections), 'and the renderer emits exactly that set');
});
