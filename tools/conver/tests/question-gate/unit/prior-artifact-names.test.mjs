// PX-234 @verifies C001
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
/**
 * The four names a package directory is searched for.
 *
 * A run that misses one of these asks the human something the file already answered.
 * The names are asserted rather than assumed because the canonical RFC has two
 * spellings — `RFC.md` where the document is the package's only RFC, and
 * `RFC-<SLUG>.md` where several sit side by side — and a pattern that matched only
 * the second was invisible to every test until this one existed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GRILL_SETTLE_RUN,
  disposeFixture,
  materializeGrillFixture,
  readTree,
  runCommand,
} from '../../question-gate/helpers/fixture-workspace.mjs';

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ARTIFACT_CONTENT = {
  'RFC.md': '## Design\n\nThe store is a file.\n',
  'RFC-SEED.md': '## §1 Identity/Position\n\nsoul-side owns the key.\n',
  'INFO-RFC-SEED.md': 'session_store: src/api/session_storage.rs\n',
  'EXPLAIN-RFC-SEED.md':
    '### 先に決めた\n- 決定: the store is a file\n- 根拠: RFC-SEED.md#§1\n- 覆す条件: a level moves\n',
};

const ALL_FOUR = Object.keys(ARTIFACT_CONTENT);

/** A package directory holding all four names, scanned by the driver itself. */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function scanAllFour() {
  const fixture = materializeGrillFixture();
  for (const [name, content] of Object.entries(ARTIFACT_CONTENT)) {
    writeFileSync(join(fixture.rfcDir, name), content, 'utf8');
  }
  runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'prior']);
  return { fixture, found: readTree(fixture.rfcDir).priorScan.artifacts };
}

test('C001 postcondition: all four names a package may hold are read', () => {
  const { fixture, found } = scanAllFour();
  try {
    for (const name of ALL_FOUR) {
      assert.ok(found.includes(name), `${name} is read before any question is drafted`);
    }
  } finally {
    disposeFixture(fixture);
  }
});

test('C001 boundary: a directory holding only RFC.md still yields a decision', () => {
  const fixture = materializeGrillFixture();
  try {
    writeFileSync(join(fixture.rfcDir, 'RFC.md'), ARTIFACT_CONTENT['RFC.md'], 'utf8');
    const printed = runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'prior']).stdout;

    assert.match(printed, /RFC\.md/);
    assert.match(printed, /The store is a file/, 'what the RFC states is a decision it carries');
  } finally {
    disposeFixture(fixture);
  }
});

test('C001 boundary: the seed is not counted twice as the canonical RFC', () => {
  const { fixture, found } = scanAllFour();
  try {
    assert.equal(found.filter((name) => name === 'RFC-SEED.md').length, 1);
  } finally {
    disposeFixture(fixture);
  }
});
