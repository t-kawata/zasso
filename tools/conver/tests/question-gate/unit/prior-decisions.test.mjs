// PX-233 @verifies C004
// @verifies C001
// @verifies C002
// [::TICKET::] PX-233 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-233 --for-spec --no-implementation-order`.
/**
 * The four artifacts a package directory may already hold.
 *
 * A grill that asks what these already answer spends a human round to learn
 * nothing. The scanner is therefore read-only and content-driven: the reader is
 * injected so the module stays pure, and an entry is produced only when the
 * artifact's content decides something. A file that exists and says nothing
 * contributes nothing — presence is not a ground.
 *
 * The heading the reader looks for is the one the frame writes, ordinal and record
 * included. A fixture spelling the producer never emits would allow a reader that
 * cannot see real documents to pass, which is how that defect survived until now.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRIOR_ARTIFACTS, priorDecisions, priorScan } from '../../../.claude/scripts/question-gate/prior-decisions.mjs';
import {
  PREDECIDED_ITEM_HEADING,
  REFERENCE_SEPARATOR,
  isItemHeading,
  splitItems,
} from '../../../.claude/scripts/explain-seed/lib/items.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/**
 * An explanation body in the shape the frame writes: the token, the ordinal, and
 * the record the item is about, with the decision and its ground beneath.
 *
 * The test builds its input with the producer's own format rather than pasting a
 * document, because the property under test is that the reader recovers whatever
 * the producer writes — including a document that does not exist yet.
 */
// [::TICKET::] PX-237 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-237 --for-spec --no-implementation-order`.
function explanationWrittenByFrame(records) {
  return records
    .map((record, index) =>
      [
        `${PREDECIDED_ITEM_HEADING} A${index + 1}${REFERENCE_SEPARATOR}${record.reference}`,
        '',
        `- 決定: ${record.decision}`,
        `- 根拠: ${record.ground}`,
        '- 覆す条件:',
        '',
      ].join('\n'),
    )
    .join('\n');
}

const PACKAGE = '/fixture/pkg';
const NEIGHBOUR = '/fixture/neighbour';

const CONTENT = {
  [`${PACKAGE}/RFC-SEED.md`]: '## §1 Identity/Position\n\nsoul-side owns the key.\n',
  [`${PACKAGE}/INFO-RFC-SEED.md`]: 'session_store: declared at src/api/session_storage.rs\n',
  // The heading is the one the frame writes — the token, the ordinal, and the record
  // after the separator. A bare token is a spelling no producer emits, so a fixture
  // written that way would agree with a reader that cannot see the real documents.
  [`${PACKAGE}/EXPLAIN-RFC-SEED.md`]:
    '### 先に決めた A1 — contract-boundary-083\n- 決定: the store is a file\n- 根拠: WORKSPACIFY-ALLOCATE-MANIFEST.json#implementation_order\n- 覆す条件: a level moves\n',
  [`${PACKAGE}/RFC-AUTH.md`]: '## Design\n\nThe store is a file.\n',
  [`${NEIGHBOUR}/EXPLAIN-RFC-SEED.md`]:
    '### 先に決めた A7 — contract-boundary-001\n- 決定: the network package owns the relay\n- 根拠: RFC-NETWORK.md#§2\n- 覆す条件: the boundary is dropped\n',
};

const LISTING = {
  [PACKAGE]: ['RFC-SEED.md', 'INFO-RFC-SEED.md', 'EXPLAIN-RFC-SEED.md', 'RFC-AUTH.md'],
  [NEIGHBOUR]: ['EXPLAIN-RFC-SEED.md'],
};

const readerOver = (content) => (path) => content[path] ?? null;
const lister = (directory) => LISTING[directory] ?? [];

test('C004 postcondition: the three seed artifacts are the ones looked for, plus the canonical RFC', () => {
  assert.deepEqual(PRIOR_ARTIFACTS, ['RFC-SEED.md', 'INFO-RFC-SEED.md', 'EXPLAIN-RFC-SEED.md']);
});

test('C004 postcondition: each artifact reports the decisions it carries, with its source', () => {
  const entries = priorDecisions({ directory: PACKAGE, readFile: readerOver(CONTENT), listDirectory: lister });

  const decided = entries.find((entry) => entry.artifact === 'EXPLAIN-RFC-SEED.md');
  assert.equal(decided.kind, 'decision');
  assert.equal(decided.decision, 'the store is a file');
  assert.equal(decided.ground, 'WORKSPACIFY-ALLOCATE-MANIFEST.json#implementation_order');
  assert.equal(decided.source, `${PACKAGE}/EXPLAIN-RFC-SEED.md`);

  const fromCanon = entries.find((entry) => entry.artifact === 'RFC-AUTH.md');
  assert.equal(fromCanon.kind, 'decision', 'the canonical RFC grounds decisions too');
});

test('C004 postcondition: a fact that grounds without deciding is reported as a ground', () => {
  const entries = priorDecisions({ directory: PACKAGE, readFile: readerOver(CONTENT), listDirectory: lister });
  const ground = entries.find((entry) => entry.artifact === 'INFO-RFC-SEED.md');

  assert.equal(ground.kind, 'ground');
  assert.equal(ground.decision, null, 'a fact carries no decision of its own');
  assert.match(ground.statement, /session_store/);
});

test('C004 invariant: a file that exists but decides nothing contributes no entry', () => {
  const entries = priorDecisions({ directory: PACKAGE, readFile: () => '# empty\n', listDirectory: lister });
  assert.deepEqual(entries, [], 'presence alone is not a ground');
});

test('C004 invariant: an artifact that cannot be read settles nothing and is not salvaged into a guess', () => {
  const entries = priorDecisions({ directory: PACKAGE, readFile: () => null, listDirectory: lister });

  assert.deepEqual(entries, [], 'an unreadable document yields no decision rather than a guess');
});

test('C004 postcondition: a neighbour directory is read and reported with its own path as source', () => {
  const entries = priorDecisions({ directory: PACKAGE, neighbours: [NEIGHBOUR], readFile: readerOver(CONTENT), listDirectory: lister });
  const neighbour = entries.find((entry) => entry.source.startsWith(NEIGHBOUR));

  assert.equal(neighbour.decision, 'the network package owns the relay');
  assert.equal(neighbour.ground, 'RFC-NETWORK.md#§2');
});

test('C004 invariant: the scanner reads through the injected reader and never writes', () => {
  const reads = [];
  const readFile = (path) => {
    reads.push(path);
    return CONTENT[path] ?? null;
  };

  priorDecisions({ directory: PACKAGE, neighbours: [NEIGHBOUR], readFile, listDirectory: lister });

  assert.ok(reads.length > 0, 'the artifacts are read');
  assert.ok(reads.every((path) => path.startsWith(PACKAGE) || path.startsWith(NEIGHBOUR)), 'only the named directories are read');
});

test('C001 postcondition: the reader recovers every item the writer wrote, with its ground', () => {
  const records = [
    { reference: 'contract-boundary-083', decision: 'the store is a file', ground: 'MANIFEST.json#implementation_order' },
    { reference: 'contract-boundary-084', decision: 'the relay is owned by the network package', ground: 'RFC-NETWORK.md#§2' },
    { reference: 'contract-boundary-085', decision: 'the key never leaves the device', ground: 'RFC-AUTH.md#§4' },
  ];
  const written = explanationWrittenByFrame(records);

  const entries = priorDecisions({
    directory: PACKAGE,
    readFile: readerOver({ [`${PACKAGE}/EXPLAIN-RFC-SEED.md`]: written }),
    listDirectory: lister,
  });

  assert.equal(entries.length, splitItems(written, PREDECIDED_ITEM_HEADING).length, 'as many items as the producer recognises');
  assert.deepEqual(entries.map((entry) => entry.decision), records.map((record) => record.decision));
  assert.deepEqual(entries.map((entry) => entry.ground), records.map((record) => record.ground));
});

test('C001 invariant: the reader recovers as many items as the producer recognises, for any count', () => {
  for (const count of [0, 1, 2, 5, 11]) {
    const records = Array.from({ length: count }, (_, index) => ({
      reference: `record-${index}`,
      decision: `decision ${index}`,
      ground: `ground-${index}`,
    }));
    const written = explanationWrittenByFrame(records);

    const entries = priorDecisions({
      directory: PACKAGE,
      readFile: readerOver({ [`${PACKAGE}/EXPLAIN-RFC-SEED.md`]: written }),
      listDirectory: lister,
    });

    assert.equal(entries.length, splitItems(written, PREDECIDED_ITEM_HEADING).length, `count ${count}`);
  }
});

test('C001 postcondition: a heading with no reference separator yields no id rather than a truncated one', () => {
  const items = splitItems(`${PREDECIDED_ITEM_HEADING}\n`, PREDECIDED_ITEM_HEADING);

  assert.equal(items.length, 1, 'a bare token still opens an item, so an older document is not orphaned');
  assert.equal(items[0].id, null);
});

test('C001 boundary: an indented heading is classified the same way by the consumer and the producer', () => {
  const indented = `  ${PREDECIDED_ITEM_HEADING} A1${REFERENCE_SEPARATOR}contract-boundary-083`;
  const written = `${indented}\n- 決定: the store is a file\n- 根拠: MANIFEST.json#implementation_order\n`;

  assert.equal(isItemHeading(indented, PREDECIDED_ITEM_HEADING), true, 'the predicate trims leading whitespace');

  const entries = priorDecisions({
    directory: PACKAGE,
    readFile: readerOver({ [`${PACKAGE}/EXPLAIN-RFC-SEED.md`]: written }),
    listDirectory: lister,
  });

  assert.equal(entries.length, splitItems(written, PREDECIDED_ITEM_HEADING).length);
  assert.equal(entries.length, 1);
});

test('C001 error: a longer heading that merely begins with the token opens no item', () => {
  // `### 先に決めたことの補足` is a different heading, not this item's. Read as one, it
  // would carry no 決定 but the 根拠 beneath it would still be offered to the settlement
  // universe — a ground no record decided, which is what the gate exists to prevent.
  const longerHeading = `${PREDECIDED_ITEM_HEADING}ことの補足`;
  const written = [
    `${PREDECIDED_ITEM_HEADING} A1${REFERENCE_SEPARATOR}real-001`,
    '- 決定: the real decision',
    '- 根拠: RFC-SEED.md#1',
    '',
    longerHeading,
    '- 根拠: RFC-SEED.md#2',
    '',
  ].join('\n');

  assert.equal(isItemHeading(longerHeading, PREDECIDED_ITEM_HEADING), false);

  const entries = priorDecisions({
    directory: PACKAGE,
    readFile: readerOver({ [`${PACKAGE}/EXPLAIN-RFC-SEED.md`]: written }),
    listDirectory: lister,
  });

  assert.equal(entries.length, 1, 'only the item the frame wrote is read');
  assert.equal(entries[0].ground, 'RFC-SEED.md#1');
  assert.ok(
    !entries.some((entry) => entry.ground === 'RFC-SEED.md#2'),
    'a ground under a heading that is not this item never reaches the record',
  );
});

test('C001 error: prose that mentions the token opens no item', () => {
  const prose = `この節では ${PREDECIDED_ITEM_HEADING} の意味を述べる。`;
  const written = `${prose}\n- 決定: the store is a file\n- 根拠: MANIFEST.json#implementation_order\n`;

  assert.equal(isItemHeading(prose, PREDECIDED_ITEM_HEADING), false);

  const entries = priorDecisions({
    directory: PACKAGE,
    readFile: readerOver({ [`${PACKAGE}/EXPLAIN-RFC-SEED.md`]: written }),
    listDirectory: lister,
  });

  assert.deepEqual(entries, [], 'a sentence about the token is a sentence');
});

test('C001 error: an item whose 根拠 is blank or absent is not a settlement', () => {
  const texts = [
    `${PREDECIDED_ITEM_HEADING} A1${REFERENCE_SEPARATOR}r1\n- 決定: the store is a file\n- 根拠:   \n`,
    `${PREDECIDED_ITEM_HEADING} A1${REFERENCE_SEPARATOR}r1\n- 決定: the store is a file\n`,
  ];

  for (const written of texts) {
    const entries = priorDecisions({
      directory: PACKAGE,
      readFile: readerOver({ [`${PACKAGE}/EXPLAIN-RFC-SEED.md`]: written }),
      listDirectory: lister,
    });

    assert.deepEqual(entries, [], 'a decision with no ground settles nothing');
  }
});

// The document is a verbatim copy of what the frame wrote for a real package on
// 2026-10-06; `fixtures/README.md` records where it came from and that it must not be
// edited. A generated document is the only evidence of what the producer emits, so an
// assertion built on a hand-written approximation of one proves nothing about it.
test('C001 regression: the reader recovers every item of a document the real frame wrote', () => {
  const text = readFileSync(join(FIXTURES, 'EXPLAIN-RFC-SEED.md'), 'utf8');
  const written = text.split('\n').filter((line) => isItemHeading(line, PREDECIDED_ITEM_HEADING));

  const entries = priorDecisions({
    directory: '/fixture/pkg',
    readFile: (path) => (path === '/fixture/pkg/EXPLAIN-RFC-SEED.md' ? text : null),
    listDirectory: () => ['EXPLAIN-RFC-SEED.md'],
  });

  assert.ok(written.length > 0, 'the fixture carries pre-decided items');
  assert.equal(entries.length, written.length, 'the reader sees every item the producer wrote');
  assert.ok(
    entries.every((entry) => entry.decision !== '' && entry.ground !== ''),
    'each recovered item carries the decision it states and the ground it rests on',
  );
});

test('C002 postcondition: the artifacts read are reported whether or not they contributed', () => {
  const scanned = priorScan({
    directory: PACKAGE,
    readFile: readerOver({ [`${PACKAGE}/EXPLAIN-RFC-SEED.md`]: '# this explanation decides nothing yet\n' }),
    listDirectory: lister,
  });

  assert.deepEqual(scanned.entries, [], 'it contributes no entry');
  assert.ok(scanned.artifactsRead.includes('EXPLAIN-RFC-SEED.md'), 'but it is still recorded as read');
});

test('C002 invariant: an artifact that could not be read is not reported as read', () => {
  const scanned = priorScan({ directory: PACKAGE, readFile: () => null, listDirectory: lister });

  assert.deepEqual(scanned.artifactsRead, []);
  assert.deepEqual(scanned.entries, []);
});

test('C002 invariant: priorDecisions returns the entries and only the entries', () => {
  const scanned = priorScan({ directory: PACKAGE, readFile: readerOver(CONTENT), listDirectory: lister });
  const entries = priorDecisions({ directory: PACKAGE, readFile: readerOver(CONTENT), listDirectory: lister });

  assert.deepEqual(entries, scanned.entries);
});
