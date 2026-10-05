// PX-233 @verifies C004
// [::TICKET::] PX-233 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-233 --for-spec --no-implementation-order`.
/**
 * The four artifacts a package directory may already hold.
 *
 * A grill that asks what these already answer spends a human round to learn
 * nothing. The scanner is therefore read-only and content-driven: the reader is
 * injected so the module stays pure, and an entry is produced only when the
 * artifact's content decides something. A file that exists and says nothing
 * contributes nothing — presence is not a ground.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PRIOR_ARTIFACTS, priorDecisions } from '../../../.claude/scripts/question-gate/prior-decisions.mjs';

const PACKAGE = '/fixture/pkg';
const NEIGHBOUR = '/fixture/neighbour';

const CONTENT = {
  [`${PACKAGE}/RFC-SEED.md`]: '## §1 Identity/Position\n\nsoul-side owns the key.\n',
  [`${PACKAGE}/INFO-RFC-SEED.md`]: 'session_store: declared at src/api/session_storage.rs\n',
  [`${PACKAGE}/EXPLAIN-RFC-SEED.md`]:
    '### 先に決めた\n- 決定: the store is a file\n- 根拠: WORKSPACIFY-ALLOCATE-MANIFEST.json#implementation_order\n- 覆す条件: a level moves\n',
  [`${PACKAGE}/RFC-AUTH.md`]: '## Design\n\nThe store is a file.\n',
  [`${NEIGHBOUR}/EXPLAIN-RFC-SEED.md`]:
    '### 先に決めた\n- 決定: the network package owns the relay\n- 根拠: RFC-NETWORK.md#§2\n- 覆す条件: the boundary is dropped\n',
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
