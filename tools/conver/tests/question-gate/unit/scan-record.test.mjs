// @verifies C002
//
// What a run read is not the same fact as what a run was told. An artifact that is
// present and readable but decides nothing vanishes from a record derived from the
// entries it produced, and the gate then refuses an honest settle trace that names
// it. The two states the record must keep apart are "read and contributed nothing"
// and "could not be read": they mean opposite things to whoever reads the scan.
// [::TICKET::] PX-237 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-237 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DRILL_SETTLE_RUN,
  GRILL_SETTLE_RUN,
  disposeFixture,
  materializeGrillFixture,
  readTree,
  runCommand,
} from '../helpers/fixture-workspace.mjs';

import { priorScan } from '../../../.claude/scripts/question-gate/prior-decisions.mjs';

const PACKAGE = '/fixture/pkg';

/** An explanation in the heading the frame writes, so the item is a real one. */
const WRITTEN_BY_FRAME = [
  '### 先に決めた A1 — contract-boundary-083',
  '',
  '- 決定: the store is a file',
  '- 根拠: RFC-SEED.md#§1',
  '- 覆す条件:',
  '',
].join('\n');

/** An artifact that is readable and decides nothing: the silent case. */
const DECIDES_NOTHING = '# an explanation with no item yet\n';

test('C002 postcondition: a readable artifact that decides nothing is recorded as read', () => {
  const scanned = priorScan({
    directory: PACKAGE,
    readFile: (path) => (path === `${PACKAGE}/EXPLAIN-RFC-SEED.md` ? DECIDES_NOTHING : null),
    listDirectory: () => ['EXPLAIN-RFC-SEED.md'],
  });

  assert.deepEqual(scanned.entries, [], 'it decides nothing');
  assert.ok(scanned.artifactsRead.includes('EXPLAIN-RFC-SEED.md'), 'and is still a thing the run read');
});

test('C002 invariant: an artifact that could not be read is never reported as read', () => {
  const scanned = priorScan({
    directory: PACKAGE,
    readFile: () => null,
    listDirectory: () => ['EXPLAIN-RFC-SEED.md'],
  });

  assert.deepEqual(scanned.artifactsRead, [], 'nothing was read, so nothing is claimed');
  assert.deepEqual(scanned.entries, [], 'and nothing is salvaged into a guess');
});

test('C002 postcondition: priorScan.artifacts names every readable artifact the grill run read', () => {
  const fixture = materializeGrillFixture();
  try {
    writeFileSync(join(fixture.rfcDir, 'EXPLAIN-RFC-SEED.md'), WRITTEN_BY_FRAME, 'utf8');
    runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'prior']);

    const scan = readTree(fixture.rfcDir).priorScan;
    // The directory holds exactly two readable files: the explanation this test wrote,
    // and the RFC the fixture's own step wrote. Both are recorded — including RFC.md,
    // which is read and decides nothing. "Names every readable artifact" is what the
    // test is called, so the exact set is what it checks; `includes` would have passed
    // while RFC.md was still missing.
    assert.deepEqual([...scan.artifacts].sort(), ['EXPLAIN-RFC-SEED.md', 'RFC.md']);
    assert.ok(scan.decisions.length > 0, 'the pre-decided item is read as a decision');
    assert.equal(scan.decisions[0].ground, 'RFC-SEED.md#§1', 'with the ground the item states');
    assert.deepEqual(scan.unreadable, [], 'a readable artifact is never reported as unreadable');
  } finally {
    disposeFixture(fixture);
  }
});

test('C002 postcondition: the drill binary records the artifacts it read on the same fixture', () => {
  // The drill-specific layout — the package directory above the session directory — is
  // held by tests/drill-rfc-down/settle/settle-run.test.mjs. This case drives the drill
  // binary over the shared fixture to show the same core rule reaches both commands.
  const fixture = materializeGrillFixture();
  try {
    writeFileSync(join(fixture.rfcDir, 'EXPLAIN-RFC-SEED.md'), WRITTEN_BY_FRAME, 'utf8');
    runCommand(DRILL_SETTLE_RUN, [fixture.rfcDir, 'prior']);

    const scan = readTree(fixture.rfcDir).priorScan;
    assert.ok(scan.artifacts.includes('EXPLAIN-RFC-SEED.md'), 'both commands read the same way');
    assert.ok(scan.decisions.length > 0);
  } finally {
    disposeFixture(fixture);
  }
});

test('C002 boundary: an artifact that yields no entries is named and is not reported as unreadable', () => {
  const fixture = materializeGrillFixture();
  try {
    writeFileSync(join(fixture.rfcDir, 'EXPLAIN-RFC-SEED.md'), DECIDES_NOTHING, 'utf8');
    runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'prior']);

    const scan = readTree(fixture.rfcDir).priorScan;
    assert.ok(scan.artifacts.includes('EXPLAIN-RFC-SEED.md'), 'read, so recorded');
    assert.deepEqual(scan.unreadable, [], 'and not confused with unreadable');
  } finally {
    disposeFixture(fixture);
  }
});
