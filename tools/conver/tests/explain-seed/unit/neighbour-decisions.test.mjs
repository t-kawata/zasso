// PX-225 @verifies C001
// PX-225 @verifies C002
//
// A boundary has exactly two ends, so the question one end asks is the question the other end
// asks. This module reads the answer the neighbour already wrote, and the whole of its
// difficulty is telling "the neighbour has not decided" from "the neighbour's document cannot
// be read": the first is ordinary, the second must re-ask and say so rather than settle a
// question on a guess.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  collectSettledDecisions,
  readSettledDecisions,
} from '../../../.claude/scripts/explain-seed/lib/neighbour-decisions.mjs';
import {
  EXPLAIN_FILE_NAME,
  materializeAdjacentLevelWorkspace,
  materializeExplainSeedWorkspace,
  writeNeighbourExplanation,
} from '../helpers/explain-seed-workspace.mjs';

/** The two ends of the one boundary the fixture records. */
const PARTIES = Object.freeze({
  boundaries: [{ id: 'boundary-001', counterpart: 'pkg-0002' }],
  pathOf: { 'pkg-0001': 'crates/protocol/alpha', 'pkg-0002': 'crates/protocol/beta' },
});

/** A neighbour explanation in which the one question has been answered. */
const DECIDED_BY_BETA = [
  '## 人間が決めること（ここだけ）',
  '',
  '### 判断 H1 — boundary-001',
  '- 誰の体験が変わるか:',
  '  却下の形は面を作る開発者の体験を変える。',
  '<!-- 人間の判断 -->',
  '却下はエラーコードで返す。',
  '真偽値で読み飛ばせないようにする。',
].join('\n');

/** A neighbour explanation the command wrote, in which nothing has been written yet. */
const UNDECIDED_BY_BETA = [
  '## 人間が決めること（ここだけ）',
  '',
  '### 判断 H1 — boundary-001',
  '- 誰の体験が変わるか:',
  '  [::MUST-FILL::] 誰の体験が変わるか。',
  '<!-- 人間の判断 -->',
].join('\n');

/** Every file under a root with its bytes, so a run that writes can be told from one that does not. */
// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
function fingerprint(root) {
  return Object.fromEntries(
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const path = join(entry.parentPath, entry.name);
        return [relative(root, path), readFileSync(path, 'utf8')];
      }),
  );
}

test('C001 postcondition: the reader returns the decision written for each boundary id', () => {
  const decisions = readSettledDecisions({ documentText: DECIDED_BY_BETA });

  assert.equal(decisions.get('boundary-001'), '却下はエラーコードで返す。\n真偽値で読み飛ばせないようにする。');
  assert.equal(decisions.size, 1);
});

test('C001 postcondition: a placeholder with nothing under it is not a decision', () => {
  assert.equal(readSettledDecisions({ documentText: UNDECIDED_BY_BETA }).size, 0);
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C001 postcondition: a question of the current shape names its boundary on its bound-points line', () => {
  const currentShape = [
    '## 人間が決めること（ここだけ）',
    '',
    '### 判断 Q1',
    '- 誰の体験が変わるか:',
    '  却下の形は面を作る開発者の体験を変える。',
    '- 束ねた論点:',
    '  boundary-001',
    '<!-- 人間の判断 -->',
    '却下はエラーコードで返す。',
  ].join('\n');

  const decisions = readSettledDecisions({ documentText: currentShape });

  assert.equal(decisions.get('boundary-001'), '却下はエラーコードで返す。', 'the reader follows the heading reference or the bound points, whichever the document carries');
});

test('C002 postcondition: a neighbour decision becomes one settled record naming its document', () => {
  const workspace = materializeExplainSeedWorkspace();
  const documentPath = writeNeighbourExplanation({ workspace, packageId: 'pkg-0002', documentText: DECIDED_BY_BETA });

  const { settled, unreadable } = collectSettledDecisions({ root: workspace.root, packageId: 'pkg-0001', ...PARTIES });

  assert.deepEqual(unreadable, []);
  assert.equal(settled.length, 1);
  assert.equal(settled[0].boundary_id, 'boundary-001');
  assert.equal(settled[0].counterpart, 'pkg-0002');
  assert.equal(settled[0].counterpart_name, 'beta');
  assert.equal(settled[0].document, relative(workspace.root, documentPath));
  assert.equal(settled[0].decision, '却下はエラーコードで返す。\n真偽値で読み飛ばせないようにする。');
});

test('C002 postcondition: a neighbour that has not been explained yet is ordinary, not a fault', () => {
  const workspace = materializeExplainSeedWorkspace();

  assert.deepEqual(collectSettledDecisions({ root: workspace.root, packageId: 'pkg-0001', ...PARTIES }), {
    settled: [],
    unreadable: [],
  });
});

test('C002 postcondition: a neighbour that decided nothing settles nothing and is not a fault', () => {
  const workspace = materializeExplainSeedWorkspace();
  writeNeighbourExplanation({ workspace, packageId: 'pkg-0002', documentText: UNDECIDED_BY_BETA });

  assert.deepEqual(collectSettledDecisions({ root: workspace.root, packageId: 'pkg-0001', ...PARTIES }), {
    settled: [],
    unreadable: [],
  });
});

test('C002 postcondition: a document that is not a readable file is named and settles nothing', () => {
  const workspace = materializeExplainSeedWorkspace();
  mkdirSync(join(workspace.root, PARTIES.pathOf['pkg-0002'], EXPLAIN_FILE_NAME), { recursive: true });

  const { settled, unreadable } = collectSettledDecisions({ root: workspace.root, packageId: 'pkg-0001', ...PARTIES });

  assert.deepEqual(settled, []);
  assert.equal(unreadable.length, 1);
  assert.equal(unreadable[0].document, join(PARTIES.pathOf['pkg-0002'], EXPLAIN_FILE_NAME));
  assert.equal(typeof unreadable[0].reason, 'string');
  assert.ok(unreadable[0].reason.length > 0, 'the reason says what could not be read');
});

test('C002 postcondition: a document with no human section is not one this command wrote', () => {
  const workspace = materializeExplainSeedWorkspace();
  writeNeighbourExplanation({ workspace, packageId: 'pkg-0002', documentText: '# RFC-SEED の解説: beta\n\n## 先に決めておいたこと\n\n### 先に決めた A1 — contract_registry\n' });

  const { settled, unreadable } = collectSettledDecisions({ root: workspace.root, packageId: 'pkg-0001', ...PARTIES });

  assert.deepEqual(settled, []);
  assert.equal(unreadable.length, 1);
});

test('C002 postcondition: an item offering two places to write is refused rather than guessed at', () => {
  const workspace = materializeExplainSeedWorkspace();
  writeNeighbourExplanation({
    workspace,
    packageId: 'pkg-0002',
    documentText: DECIDED_BY_BETA.replace('<!-- 人間の判断 -->', '<!-- 人間の判断 -->\n<!-- 人間の判断 -->'),
  });

  const { settled, unreadable } = collectSettledDecisions({ root: workspace.root, packageId: 'pkg-0001', ...PARTIES });

  assert.deepEqual(settled, []);
  assert.equal(unreadable.length, 1);
});

test('C002 invariant: a question with two answers is not decided, and both documents are named', () => {
  // Four packages, so a second neighbour exists to answer the same boundary differently.
  const workspace = materializeAdjacentLevelWorkspace();
  writeNeighbourExplanation({ workspace, packageId: 'pkg-0002', documentText: DECIDED_BY_BETA });
  const answeredDifferently = DECIDED_BY_BETA.replace('却下はエラーコードで返す。', '却下は真偽値で返す。');
  writeNeighbourExplanation({ workspace, packageId: 'pkg-0003', documentText: answeredDifferently });

  const { settled, unreadable } = collectSettledDecisions({
    root: workspace.root,
    packageId: 'pkg-0001',
    boundaries: [
      { id: 'boundary-001', counterpart: 'pkg-0002' },
      { id: 'boundary-001', counterpart: 'pkg-0003' },
    ],
    pathOf: { ...PARTIES.pathOf, 'pkg-0003': 'crates/protocol/gamma' },
  });

  assert.deepEqual(settled, [], 'one id, two answers, so nothing is settled');
  assert.deepEqual(
    unreadable.map((entry) => entry.document).sort(),
    [join('crates/protocol/beta', EXPLAIN_FILE_NAME), join('crates/protocol/gamma', EXPLAIN_FILE_NAME)].sort(),
    'both documents are named',
  );
});

test('C002 invariant: an id settles once however many times it is listed, and the decision is quoted', () => {
  const workspace = materializeExplainSeedWorkspace();
  writeNeighbourExplanation({ workspace, packageId: 'pkg-0002', documentText: DECIDED_BY_BETA });

  const { settled } = collectSettledDecisions({
    root: workspace.root,
    packageId: 'pkg-0001',
    boundaries: [
      { id: 'boundary-001', counterpart: 'pkg-0002' },
      { id: 'boundary-001', counterpart: 'pkg-0002' },
    ],
    pathOf: PARTIES.pathOf,
  });

  assert.equal(settled.length, 1);
  assert.equal(DECIDED_BY_BETA.includes(settled[0].decision), true, 'the decision is a substring of the neighbour bytes');
});

test('C002 invariant: reading a neighbour writes nothing anywhere in the workspace', () => {
  const workspace = materializeExplainSeedWorkspace();
  writeNeighbourExplanation({ workspace, packageId: 'pkg-0002', documentText: DECIDED_BY_BETA });
  const before = fingerprint(workspace.root);

  collectSettledDecisions({ root: workspace.root, packageId: 'pkg-0001', ...PARTIES });

  assert.deepEqual(fingerprint(workspace.root), before);
});

test('C002 invariant: a package that is a party to no boundary reads no file', () => {
  const workspace = materializeExplainSeedWorkspace();

  assert.deepEqual(
    collectSettledDecisions({ root: workspace.root, packageId: 'pkg-0001', boundaries: [], pathOf: PARTIES.pathOf }),
    { settled: [], unreadable: [] },
  );
});

test('C002 invariant: a boundary naming this package at both ends is not read back at itself', () => {
  const workspace = materializeExplainSeedWorkspace();
  // The document this run is about to write is not a neighbour's answer, however readable it is.
  writeNeighbourExplanation({ workspace, packageId: 'pkg-0001', documentText: DECIDED_BY_BETA });

  const { settled, unreadable } = collectSettledDecisions({
    root: workspace.root,
    packageId: 'pkg-0001',
    boundaries: [{ id: 'boundary-001', counterpart: 'pkg-0001' }],
    pathOf: PARTIES.pathOf,
  });

  assert.deepEqual(settled, []);
  assert.deepEqual(unreadable, [], 'and the package is not reported as a document that could not be read');
});

test('C002 postcondition: a counterpart the manifest records no path for is named and settles nothing', () => {
  const workspace = materializeExplainSeedWorkspace();

  const { settled, unreadable } = collectSettledDecisions({
    root: workspace.root,
    packageId: 'pkg-0001',
    boundaries: [{ id: 'boundary-001', counterpart: 'pkg-0009' }],
    pathOf: PARTIES.pathOf,
  });

  assert.deepEqual(settled, []);
  assert.equal(unreadable.length, 1);
  assert.equal(unreadable[0].document, 'pkg-0009 (no path recorded)');
  assert.match(unreadable[0].reason, /records no path for this package/);
});

test('C001 postcondition: an item carrying no placeholder at all decides nothing', () => {
  const decisions = readSettledDecisions({
    documentText: ['## 人間が決めること（ここだけ）', '', '### 判断 H1 — boundary-001', '- 誰の体験が変わるか: beta の開発者。'].join('\n'),
  });

  assert.equal(decisions.size, 0);
});
