// PX-365 @verifies C003
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertStagingBaseline,
  prepareStaging,
  readStagingBaseline,
} from '../../.claude/scripts/drill-rfc-down/lib/staging-baseline.js';

// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'staging-baseline-'));
  const realPath = join(root, 'Tickets.json');
  const stagingPath = `${realPath}.staging.json`;
  writeFileSync(realPath, '{"round":7}\n', 'utf8');
  return { root, realPath, stagingPath };
}

test('C003 postcondition: stage copies the real artifact and records its digest', () => {
  const { realPath, stagingPath } = fixture();
  const result = prepareStaging(realPath, stagingPath, { round: 7 });

  assert.equal(result.resumed, false);
  assert.equal(readFileSync(stagingPath, 'utf8'), readFileSync(realPath, 'utf8'));
  assert.equal(readStagingBaseline(stagingPath).round, 7);
  assert.equal(assertStagingBaseline(stagingPath, realPath).ok, true);
});

test('C003 invariant: a valid staging resumes instead of being overwritten', () => {
  const { realPath, stagingPath } = fixture();
  prepareStaging(realPath, stagingPath);
  writeFileSync(stagingPath, '{"round":7,"design":"staged"}\n', 'utf8');
  const result = prepareStaging(realPath, stagingPath);

  assert.equal(result.resumed, true);
  assert.match(readFileSync(stagingPath, 'utf8'), /design/);
});

test('C003 invariant: a real artifact changed after staging is refused and the real bytes stay intact', () => {
  const { realPath, stagingPath } = fixture();
  prepareStaging(realPath, stagingPath);
  writeFileSync(realPath, '{"round":8}\n', 'utf8');
  const result = assertStagingBaseline(stagingPath, realPath);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'STALE_STAGING_BASELINE');
  assert.match(result.action, /re-stage/);
});

test('C003 postcondition: a stale staging is discarded and re-staged', () => {
  const { realPath, stagingPath } = fixture();
  prepareStaging(realPath, stagingPath);
  writeFileSync(realPath, '{"round":8}\n', 'utf8');
  const result = prepareStaging(realPath, stagingPath);

  assert.equal(result.resumed, false);
  assert.equal(result.discarded, true);
  assert.equal(readFileSync(stagingPath, 'utf8'), readFileSync(realPath, 'utf8'));
});
