// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * C005 — index and log are written in the OKF structure, deterministically.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBundle } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';
import { writeDirectoryIndexes } from '../../../.claude/scripts/amend-rfc-up/okf-core/authoring/index.mjs';
import { writeLog } from '../../../.claude/scripts/amend-rfc-up/okf-core/authoring/log.mjs';
import { createBasicBundle } from '../lib/fixture-v2.mjs';

test('C005: index is a linked list, not a table', async () => {
  const fixture = createBasicBundle();
  const outDir = mkdtempSync(join(tmpdir(), 'okf-index-'));
  try {
    const bundle = await loadBundle(fixture.root);
    writeDirectoryIndexes({ bundle, outDir });
    const index = readFileSync(join(outDir, 'index.md'), 'utf8');
    assert.match(index, /^- \[/m);
    assert.doesNotMatch(index, /\| ID \|/);
    assert.match(index, /rules\/index\.md|\.\/rules\/index\.md/);
  } finally {
    fixture.cleanup();
    rmSync(outDir, { recursive: true, force: true });
  }
});

test('C005: log headings are dates and newest comes first', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'okf-log-'));
  try {
    writeLog({
      outDir,
      entries: [
        { date: '2026-11-13', text: 'current' },
        { date: '2026-11-12', text: 'previous' },
      ],
    });
    const log = readFileSync(join(outDir, 'log.md'), 'utf8');
    assert.ok(log.indexOf('## 2026-11-13') < log.indexOf('## 2026-11-12'));
    assert.doesNotMatch(log, /spec_version/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test('C005: the same inputs produce identical index bytes', async () => {
  const fixture = createBasicBundle();
  const first = mkdtempSync(join(tmpdir(), 'okf-index-a-'));
  const second = mkdtempSync(join(tmpdir(), 'okf-index-b-'));
  try {
    const bundle = await loadBundle(fixture.root);
    writeDirectoryIndexes({ bundle, outDir: first });
    writeDirectoryIndexes({ bundle, outDir: second });
    assert.equal(readFileSync(join(first, 'index.md'), 'utf8'), readFileSync(join(second, 'index.md'), 'utf8'));
  } finally {
    fixture.cleanup();
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});
