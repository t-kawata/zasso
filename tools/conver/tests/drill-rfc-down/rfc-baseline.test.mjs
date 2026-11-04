// PX-365 @verifies C003
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  captureSnapshot,
  stripFormulaLedger,
  verifyAppendOnly,
} from '../../.claude/scripts/drill-rfc-down/rfc-evolution.js';

const SCRIPT = fileURLToPath(new URL('../../.claude/scripts/drill-rfc-down/rfc-evolution.js', import.meta.url));

// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'rfc-evolution-'));
  const rfcPath = join(root, 'RFC.md');
  writeFileSync(rfcPath, '# RFC\n\n## Design\n\nprose\n', 'utf8');
  return { root, rfcPath };
}

test('C003 invariant: capture --if-absent preserves the original baseline', () => {
  const fixture = workspace();
  const first = captureSnapshot(fixture.rfcPath);
  writeFileSync(fixture.rfcPath, `${readFileSync(fixture.rfcPath, 'utf8')}\n## Added\n\nnew\n`, 'utf8');
  const second = captureSnapshot(fixture.rfcPath, { ifAbsent: true });

  assert.equal(second.unchanged, true);
  assert.equal(second.snapshot.hash, first.hash);
});

test('C003 invariant: the generated Formula ledger is excluded from append-only, prose is not', () => {
  const baseline = ['# RFC', '', '## Design', '', 'prose', '', '## Formula ledger', '', 'old row'];
  const regenerated = ['# RFC', '', '## Design', '', 'prose', '', '## Added', '', 'new', '', '## Formula ledger', '', 'new row'];

  assert.equal(verifyAppendOnly(stripFormulaLedger(baseline), stripFormulaLedger(regenerated)).ok, true);
  assert.equal(stripFormulaLedger(regenerated).includes('new row'), false);
  assert.equal(stripFormulaLedger(regenerated).includes('new'), true);
});

test('C003 error: a prose line changed after capture is still an append-only violation', () => {
  const baseline = ['# RFC', '', '## Design', '', 'prose', '', '## Formula ledger', '', 'old row'];
  const tampered = ['# RFC', '', '## Design', '', 'changed', '', '## Formula ledger', '', 'new row'];
  const result = verifyAppendOnly(stripFormulaLedger(baseline), stripFormulaLedger(tampered));

  assert.equal(result.ok, false);
  assert.ok(result.missingBaseline.includes('prose'));
});

test('C003 error: check-capture names a concurrent RFC change', () => {
  const fixture = workspace();
  const capture = spawnSync(process.execPath, [SCRIPT, 'capture', '--if-absent', fixture.rfcPath], { encoding: 'utf8' });
  assert.equal(capture.status, 0, capture.stderr);
  writeFileSync(fixture.rfcPath, `${readFileSync(fixture.rfcPath, 'utf8')}\n## External\n\nchanged\n`, 'utf8');
  const result = spawnSync(process.execPath, [SCRIPT, 'check-capture', fixture.rfcPath], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /RFC_CHANGED_SINCE_CAPTURE/);
});

test('C003 normal: verify --allow-empty accepts an unchanged RFC', () => {
  const fixture = workspace();
  assert.equal(spawnSync(process.execPath, [SCRIPT, 'capture', fixture.rfcPath], { encoding: 'utf8' }).status, 0);
  const result = spawnSync(process.execPath, [SCRIPT, 'verify', fixture.rfcPath, '--allow-empty'], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
});
