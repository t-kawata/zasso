// PX-384 @verifies C001
// A reading written by the shared writer carries the three freshness fields and a
// receipt, and a legacy row is never rewritten. The writer is the producer the smooth
// closure gate expects; a direct JSONL write is not evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as evidenceWriter from '../../.claude/scripts/shared-obligations/evidence-writer.mjs';
import { readManifestAt, sha256File } from '../../.claude/scripts/shared-obligations/evidence.mjs';
import { resolveReadingsObligations } from '../../.claude/scripts/shared-obligations/predicates.mjs';

const GENERATION = 7;
const GENERATION_STARTED_AT = '2026-11-06T00:00:00.000Z';
const NOW = new Date('2026-11-06T01:00:00.000Z');
const ARTIFACT_DIGEST = 'a'.repeat(64);

/** A workspace whose writer target is the six rail-written reading files. */
// [::TICKET::] PX-384 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-384 --for-spec --no-implementation-order`.
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'px384-reading-writer-'));
  return { root, remove: () => rmSync(root, { recursive: true, force: true }) };
}

/** One valid inquest record. */
// [::TICKET::] PX-384 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-384 --for-spec --no-implementation-order`.
function inquestRecord(overrides = {}) {
  return {
    subject: 's1',
    lens: 'omission',
    answer: 'No',
    path: 'spec.md',
    line: 2,
    quote: 'the clause',
    reader: 'educe-sequences/generation-7',
    ...overrides,
  };
}

/** Write one batch through the shared writer. */
// [::TICKET::] PX-384 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-384 --for-spec --no-implementation-order`.
function writeBatch(root, records, overrides = {}) {
  return evidenceWriter.writeReadingBatch({
    root,
    kind: 'inquest',
    records,
    artifactDigest: ARTIFACT_DIGEST,
    generation: GENERATION,
    generationStartedAt: GENERATION_STARTED_AT,
    now: NOW,
    ...overrides,
  });
}

test('C001 the writer stamps artifactDigest, readerGeneration and readAt and appends one receipt', () => {
  const space = workspace();
  try {
    const result = writeBatch(space.root, [inquestRecord()]);
    assert.equal(result.ok, true);
    const row = JSON.parse(readFileSync(join(space.root, 'educe-sequences', 'readings-inquest.jsonl'), 'utf8').trim());
    assert.equal(row.artifactDigest, ARTIFACT_DIGEST);
    assert.equal(row.readerGeneration, GENERATION);
    assert.equal(row.readAt, NOW.toISOString());
    const manifest = readManifestAt(join(space.root, 'educe-sequences'));
    const receipt = manifest.writeReceipts.find((entry) => entry.path === 'educe-sequences/readings-inquest.jsonl');
    assert.equal(receipt.generation, GENERATION);
    assert.equal(receipt.sha256, sha256File(join(space.root, 'educe-sequences', 'readings-inquest.jsonl')));
  } finally {
    space.remove();
  }
});

test('C001 the writer covers every rail-written reading kind', () => {
  const space = workspace();
  try {
    const records = {
      inquest: inquestRecord(),
      adversarial: { subject: 's1', outcome: 'excluded', reader: 'educe-sequences/generation-7' },
      span: { subject: 'A-1', steps: [], operations: [], reader: 'educe-sequences/generation-7' },
      uncovered: { subject: 'OpA', outcome: 'escaped', reader: 'educe-sequences/generation-7' },
      adjudicate: { subject: 'A-1', outcome: 'direct', reader: 'educe-sequences/generation-7' },
      reroute: { subject: 'A-1', outcome: 'direct', reader: 'educe-sequences/generation-7' },
    };
    for (const [kind, record] of Object.entries(records)) {
      const result = writeBatch(space.root, [record], { kind });
      assert.equal(result.ok, true, kind);
    }
  } finally {
    space.remove();
  }
});

test('C001 a rejected record writes neither a file nor a receipt', () => {
  const space = workspace();
  try {
    const result = writeBatch(space.root, [inquestRecord({ reader: '' })]);
    assert.equal(result.ok, false);
    assert.equal(result.rejected[0].code, 'MISSING_SIGNATURE');
    assert.equal(existsSync(join(space.root, 'educe-sequences', 'readings-inquest.jsonl')), false);
  } finally {
    space.remove();
  }
});

test('C001 a record that already carries a writer stamp is refused', () => {
  const space = workspace();
  try {
    const result = writeBatch(space.root, [inquestRecord({ readAt: NOW.toISOString() })]);
    assert.equal(result.ok, false);
    assert.equal(result.rejected[0].code, 'WRITER_STAMPED_FIELD');
  } finally {
    space.remove();
  }
});

test('C001 an empty batch writes an empty file and a receipt', () => {
  const space = workspace();
  try {
    const result = writeBatch(space.root, []);
    assert.equal(result.ok, true);
    assert.equal(readFileSync(join(space.root, 'educe-sequences', 'readings-inquest.jsonl'), 'utf8'), '');
    const manifest = readManifestAt(join(space.root, 'educe-sequences'));
    assert.equal(manifest.writeReceipts.some((entry) => entry.path === 'educe-sequences/readings-inquest.jsonl'), true);
  } finally {
    space.remove();
  }
});

test('C001 two batches for one path keep one receipt with the current digest', () => {
  const space = workspace();
  try {
    writeBatch(space.root, [inquestRecord()]);
    writeBatch(space.root, [inquestRecord({ subject: 's2' })]);
    const manifest = readManifestAt(join(space.root, 'educe-sequences'));
    const receipts = manifest.writeReceipts.filter((entry) => entry.path === 'educe-sequences/readings-inquest.jsonl');
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].sha256, sha256File(join(space.root, 'educe-sequences', 'readings-inquest.jsonl')));
  } finally {
    space.remove();
  }
});

test('C002 the writer output closes a reading obligation', () => {
  const space = workspace();
  try {
    writeBatch(space.root, [inquestRecord()]);
    const row = JSON.parse(readFileSync(join(space.root, 'educe-sequences', 'readings-inquest.jsonl'), 'utf8').trim());
    const obligation = {
      id: 'READ:INQUEST:s1:omission',
      subject: 's1:omission',
      class: 'semantic',
      state: 'open',
      kind: 'reading',
    };
    const [resolved] = resolveReadingsObligations([obligation], {
      readings: { inquest: [row] },
      artifactDigest: ARTIFACT_DIGEST,
      linesByPath: { 'spec.md': ['', 'the clause'] },
      inheritedPolicy: 'block',
      generation: GENERATION,
      generationStartedAt: GENERATION_STARTED_AT,
    });
    assert.equal(resolved.state, 'closed');
  } finally {
    space.remove();
  }
});

test('C005 a legacy row is not rewritten by a new batch', () => {
  const space = workspace();
  const file = join(space.root, 'educe-sequences', 'readings-inquest.jsonl');
  const legacy = '{"subject":"old","lens":"omission","answer":"No","line":1,"quote":"a","reader":"claude-generation-1"}';
  try {
    mkdirSync(join(space.root, 'educe-sequences'), { recursive: true });
    writeFileSync(file, `${legacy}\n`);
    writeBatch(space.root, [inquestRecord({ subject: 'new' })]);
    const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean);
    assert.equal(rows[0], legacy);
    assert.equal(JSON.parse(rows[1]).readerGeneration, GENERATION);
  } finally {
    space.remove();
  }
});

test('C001 the documented CLI writes a reading file and its receipt', () => {
  const space = workspace();
  try {
    mkdirSync(join(space.root, 'educe-sequences'), { recursive: true });
    writeFileSync(join(space.root, 'educe-sequences', 'status.json'), JSON.stringify({
      generation: GENERATION,
      generationStartedAt: GENERATION_STARTED_AT,
    }));
    writeFileSync(join(space.root, 'example-sequences.json'), JSON.stringify({ spec: { path: 'spec.md' } }));
    writeFileSync(join(space.root, 'spec.md'), '# Specification\nthe clause\n');
    const staging = join(space.root, 'staging.jsonl');
    writeFileSync(staging, `${JSON.stringify(inquestRecord())}\n`);

    const output = execFileSync(process.execPath, [
      join(process.cwd(), '.claude', 'scripts', 'shared-obligations', 'evidence-writer.mjs'),
      `--root=${space.root}`,
      '--kind=inquest',
      `--input=${staging}`,
    ], { encoding: 'utf8' });

    assert.equal(JSON.parse(output).ok, true);
    assert.equal(existsSync(join(space.root, 'educe-sequences', 'readings-inquest.jsonl')), true);
    const manifest = readManifestAt(join(space.root, 'educe-sequences'));
    assert.equal(manifest.writeReceipts.some((entry) => entry.path === 'educe-sequences/readings-inquest.jsonl'), true);
  } finally {
    space.remove();
  }
});

test('C001 the rail readings CLI writes through the same writer', () => {
  const space = workspace();
  try {
    mkdirSync(join(space.root, 'educe-sequences'), { recursive: true });
    writeFileSync(join(space.root, 'educe-sequences', 'status.json'), JSON.stringify({
      generation: GENERATION,
      generationStartedAt: GENERATION_STARTED_AT,
    }));
    writeFileSync(join(space.root, 'example-sequences.json'), JSON.stringify({ spec: { path: 'spec.md' } }));
    writeFileSync(join(space.root, 'spec.md'), '# Specification\nthe clause\n');
    const staging = join(space.root, 'staging.jsonl');
    writeFileSync(staging, `${JSON.stringify(inquestRecord())}\n`);

    const output = execFileSync(process.execPath, [
      join(process.cwd(), '.claude', 'scripts', 'educe-sequences', 'rail', 'readings.mjs'),
      `--root=${space.root}`,
      '--kind=inquest',
      `--input=${staging}`,
    ], { encoding: 'utf8' });

    assert.equal(JSON.parse(output).ok, true);
    const row = JSON.parse(readFileSync(join(space.root, 'educe-sequences', 'readings-inquest.jsonl'), 'utf8').trim());
    assert.equal(row.readerGeneration, GENERATION);
  } finally {
    space.remove();
  }
});
