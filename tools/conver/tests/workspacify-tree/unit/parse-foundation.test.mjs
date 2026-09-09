// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// [::TICKET::] PX-175: workspacify-tree Parsing & Integrity foundation tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-175 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WorkSpacifyTreeError, GATE_STATUS, EXIT_CODES } from '../../../.claude/scripts/workspacify-tree/lib/errors.mjs';
import { readSpecInput, isReadableRegularFile } from '../../../.claude/scripts/workspacify-tree/lib/fs-safe.mjs';
import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { normalizeTextBytes } from '../../../.claude/scripts/workspacify-tree/lib/normalization.mjs';
import { scanFenceStates } from '../../../.claude/scripts/workspacify-tree/lib/markdown.mjs';
import { parseAtxHeading, buildHeadingTree, collectHeadingWarnings } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { segmentAtHeadings, verifyReconstruction } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';
import { canonicalSerialize } from '../../../.claude/scripts/workspacify-tree/lib/canonical-json.mjs';

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));
const readFixture = (name) => readFileSync(join(FIXTURES, name));

test('errors: WorkSpacifyTreeError carries gateId and exitCode', () => {
  const err = new WorkSpacifyTreeError('boom', { gateId: 'G0', exitCode: 1 });
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'WorkSpacifyTreeError');
  assert.equal(err.gateId, 'G0');
  assert.equal(err.exitCode, 1);
  assert.equal(GATE_STATUS.COMPLETE, 'COMPLETE');
  assert.equal(EXIT_CODES.FAIL, 1);
});

// ---- C001: G0 Input lock ------------------------------------------------

test('C001 fs-safe: readSpecInput returns bytes for an existing regular file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-read-'));
  const specPath = join(dir, 'spec.md');
  writeFileSync(specPath, '# Title\n## A\n');
  const out = readSpecInput(specPath);
  assert.equal(out.absPath, specPath);
  assert.ok(out.rawBuffer instanceof Uint8Array);
  assert.equal(out.encoding, 'UTF-8');
  assert.equal(Buffer.from(out.bytes).toString('utf8'), '# Title\n## A\n');
});

test('C001 fs-safe [@verifies C001]: a path that points to a missing file throws G0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-read-'));
  const missing = join(dir, 'no-such-spec.md');
  assert.throws(
    () => readSpecInput(missing),
    (e) => e instanceof WorkSpacifyTreeError && e.gateId === 'G0'
  );
});

test('C001 fs-safe: a directory path throws G0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-read-'));
  assert.throws(
    () => readSpecInput(dir),
    (e) => e instanceof WorkSpacifyTreeError && e.gateId === 'G0'
  );
});

test('C001 fs-safe: an empty file throws G0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-read-'));
  const empty = join(dir, 'empty.md');
  writeFileSync(empty, '');
  assert.throws(
    () => readSpecInput(empty),
    (e) => e instanceof WorkSpacifyTreeError && e.gateId === 'G0'
  );
});

test('C001 fs-safe: invalid UTF-8 bytes throw G0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-read-'));
  const bad = join(dir, 'bad.md');
  writeFileSync(bad, Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x41]));
  assert.throws(
    () => readSpecInput(bad),
    (e) => e instanceof WorkSpacifyTreeError && e.gateId === 'G0'
  );
});

test('C001 invariant [@verifies C001]: an input validation failure never writes or replaces any manifest file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-inv-'));
  const specDir = join(dir, 'spec');
  mkdirSync(specDir);
  const manifestPath = join(specDir, 'WORKSPACIFY-TREE-MANIFEST.json');
  try {
    readSpecInput(join(dir, 'missing.md'));
  } catch {
    // expected input validation failure
  }
  assert.equal(existsSync(manifestPath), false);
  // isReadableRegularFile returns false for a missing file and true for a file
  assert.equal(isReadableRegularFile(join(dir, 'missing.md')), false);
  const okFile = join(dir, 'ok.md');
  writeFileSync(okFile, 'x');
  assert.equal(isReadableRegularFile(okFile), true);
});

// ---- C002: §4.3 hash and normalization ----------------------------------

test('C002 normalization [@verifies C002]: BOM and CRLF input is normalized to LF', () => {
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const input = Buffer.concat([bom, Buffer.from('title\r\n## A\r\nbody\r\n')]);
  const { bytes, hadBom, hadCrLf } = normalizeTextBytes(input);
  assert.equal(hadBom, true);
  assert.equal(hadCrLf, true);
  assert.equal(Buffer.from(bytes).toString('utf8'), 'title\n## A\nbody\n');
});

test('C002 normalization: trailing newline is preserved and CR-only is converted', () => {
  const noTrail = normalizeTextBytes(Buffer.from('# T\r## A'));
  assert.equal(Buffer.from(noTrail.bytes).toString('utf8'), '# T\n## A');
  const onlyNewline = normalizeTextBytes(Buffer.from('\n'));
  assert.equal(Buffer.from(onlyNewline.bytes).toString('utf8'), '\n');
});

test('C002 normalization: no-BOM input reports hadBom false', () => {
  const { hadBom } = normalizeTextBytes(Buffer.from('# T\n'));
  assert.equal(hadBom, false);
});

test('C002 hash invariant [@verifies C002]: sha256Hex over normalized bytes equals the recorded source_hash', () => {
  const normalized = normalizeTextBytes(Buffer.from('title\n## A\nbody\n')).bytes;
  const sourceHash = sha256Hex(normalized);
  assert.equal(sourceHash, sha256Hex(Buffer.from('title\n## A\nbody\n')));
  assert.match(sourceHash, /^[0-9a-f]{64}$/);
});

test('hash: known SHA-256 vectors', () => {
  assert.equal(sha256Hex(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Hex(Buffer.alloc(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

// ---- C003: §7.1 ATX heading parsing -------------------------------------

test('headings: parseAtxHeading extracts level and text', () => {
  assert.deepEqual(parseAtxHeading('# Title'), { level: 1, text: 'Title' });
  assert.deepEqual(parseAtxHeading('### text ###'), { level: 3, text: 'text' });
  assert.deepEqual(parseAtxHeading('   ## indented'), { level: 2, text: 'indented' });
  assert.equal(parseAtxHeading('not a heading'), null);
  assert.equal(parseAtxHeading('#NoSpace'), null);
  assert.equal(parseAtxHeading('####### too many'), null);
});

test('headings: empty heading yields empty text (not a crash)', () => {
  assert.deepEqual(parseAtxHeading('##   '), { level: 2, text: '' });
  assert.deepEqual(parseAtxHeading('##'), { level: 2, text: '' });
});

test('C003 headings [@verifies C003]: hashes inside a code fence are ignored and duplicate headings keep unique ids', () => {
  const sourceText = '# Title\n```\n# not a heading\n```\n## Status\n## Status\n';
  const lines = sourceText.split('\n');
  const fenceStates = scanFenceStates(lines);
  const headings = buildHeadingTree(lines, fenceStates, { sourceText });
  // fences ignored
  assert.equal(headings.some((h) => h.text === 'not a heading'), false);
  // unique line-derived ids
  assert.equal(new Set(headings.map((h) => h.id)).size, headings.length);
  assert.ok(headings.every((h) => /^h-\d{6}$/.test(h.id)));
  // duplicate heading texts are kept with distinct ids
  const statuses = headings.filter((h) => h.text === 'Status');
  assert.equal(statuses.length, 2);
  assert.notEqual(statuses[0].id, statuses[1].id);
  // invariant: heading ids remain unique and parent child relations form a forest
  for (const heading of headings) {
    if (heading.parent_id) {
      assert.ok(headings.some((x) => x.id === heading.parent_id), 'parent exists');
    }
    for (const child of heading.children) {
      assert.equal(child.parent_id, heading.id);
    }
  }
  // byte ranges ascend monotonically
  for (let i = 1; i < headings.length; i++) {
    assert.ok(headings[i].byte_start > headings[i - 1].byte_start);
  }
});

test('C003 headings: parseAtxHeading handles closing hashes and indentation', () => {
  assert.deepEqual(parseAtxHeading('## Title ##'), { level: 2, text: 'Title' });
  assert.deepEqual(parseAtxHeading('## foo#bar'), { level: 2, text: 'foo#bar' });
});

test('C003 fence: scanFenceStates marks fenced content', () => {
  const lines = ['# Title', '```', '# inside', '```', '## After'];
  const states = scanFenceStates(lines);
  assert.equal(states[0].inFence, false);
  assert.equal(states[1].inFence, false); // opening fence delimiter
  assert.equal(states[2].inFence, true); // content inside fence
  assert.equal(states[3].inFence, false); // closing delimiter
  assert.equal(states[4].inFence, false);
});

test('C003 headings: level jump is reported as a warning candidate', () => {
  const sourceText = '# T\n#### Deep\n## Normal\n';
  const warnings = collectHeadingWarnings(sourceText.split('\n'));
  assert.ok(warnings.some((w) => w.kind === 'level-jump'), 'level jump recorded');
});

test('C003 headings: empty heading produces a warning and is excluded from the tree', () => {
  const sourceText = '# T\n##\n### A\n';
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  const warnings = collectHeadingWarnings(sourceText.split('\n'));
  assert.equal(headings.some((h) => h.text === ''), false);
  assert.ok(warnings.some((w) => w.kind === 'empty-heading'), 'empty heading recorded');
});

test('C003 headings: byte ranges are valid offsets into sourceText', () => {
  const sourceText = '# Title\n## One\n## Two\n';
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  assert.ok(headings.every((h) => h.byte_start >= 0 && h.byte_end > h.byte_start && h.byte_end <= Buffer.byteLength(sourceText)));
  assert.equal(Buffer.from(sourceText).subarray(headings[0].byte_start, headings[0].byte_end).toString('utf8'), '# Title');
});

// ---- C004: §7.2 segmentation and reconstruction --------------------------

test('C004 segmentation [@verifies C004]: any normalized markdown with a heading segments and reconstructs', () => {
  const sourceText = '# T\n## A\ncontent a\n## B\ncontent b\n';
  const sourceBytes = Buffer.from(sourceText, 'utf8');
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  const result = verifyReconstruction({ sourceBytes, sourceHash: sha256Hex(sourceBytes), segments });
  assert.equal(result.status, 'PASS');
  assert.equal(result.exactMatch, true);
  assert.equal(result.reconstructedHash, sha256Hex(sourceBytes));
});

test('C004 segmentation: preamble before first chapter is preserved', () => {
  const fixture = readFixture('multi-chapter-spec.md');
  const sourceText = fixture.toString('utf8');
  const sourceBytes = Buffer.from(sourceText, 'utf8');
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  const result = verifyReconstruction({ sourceBytes, sourceHash: sha256Hex(sourceBytes), segments });
  assert.equal(result.status, 'PASS');
  assert.equal(segments.length, 4); // preamble + 3 chapters
  assert.equal(segments[0].heading_id, null); // preamble segment
  // invariant: byte ranges are adjacent and cover the whole input
  assert.equal(segments[0].byte_start, 0);
  for (let i = 1; i < segments.length; i++) {
    assert.equal(segments[i].byte_start, segments[i - 1].byte_end);
  }
  assert.equal(segments[segments.length - 1].byte_end, sourceBytes.length);
  // each segment hash equals the hash of its own slice
  for (const segment of segments) {
    const slice = sourceBytes.subarray(segment.byte_start, segment.byte_end);
    assert.equal(segment.sha256, sha256Hex(slice));
  }
});

test('C004 segmentation: subheading ids list direct children of the anchor heading', () => {
  const sourceText = '# T\n## A\n### A1\n### A2\n## B\n';
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  const aSegment = segments.find((s) => s.title === 'A');
  assert.ok(aSegment);
  assert.equal(aSegment.subheading_ids.length, 2);
});

test('C004 segmentation error: no ATX heading throws G1.3', () => {
  const sourceText = 'plain text without any heading\n';
  assert.throws(
    () => segmentAtHeadings({ sourceText, headings: [] }, { segmentLevel: 2 }),
    (e) => e instanceof WorkSpacifyTreeError && e.gateId === 'G1.3'
  );
});

test('C004 reconstruction invariant [@verifies C004]: reconstruction hash equals source_hash and exact_match is true', () => {
  const sourceText = '# T\n## A\nx\n## B\ny\n';
  const sourceBytes = Buffer.from(sourceText, 'utf8');
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  const ok = verifyReconstruction({ sourceBytes, sourceHash: sha256Hex(sourceBytes), segments });
  assert.equal(ok.status, 'PASS');
  assert.equal(ok.reconstructedHash, sha256Hex(sourceBytes));
  assert.equal(ok.exactMatch, true);
});

test('C004 reconstruction: a tampered segment range yields FAIL', () => {
  const sourceText = '# T\n## A\nxxxx\n## B\nyyyy\n';
  const sourceBytes = Buffer.from(sourceText, 'utf8');
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  const broken = segments.map((s, i) => (i === 0 ? { ...s, byte_end: s.byte_end - 2 } : { ...s }));
  const result = verifyReconstruction({ sourceBytes, sourceHash: sha256Hex(sourceBytes), segments: broken });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.exactMatch, false);
});

// ---- C005: §12.1 canonical JSON ------------------------------------------

test('C005 canonical-json [@verifies C005]: an arbitrary JSON serializable object serializes canonically', () => {
  const sample = { z: 1, a: { n: 2, m: [3, 4] }, s: 'text' };
  const once = canonicalSerialize(sample);
  assert.match(once, /^\{\n  "a": \{\n/);
  assert.ok(once.indexOf('"z"') > once.indexOf('"a"'));
  assert.ok(once.endsWith('\n'));
  assert.equal(once.includes('\r'), false);
});

test('C005 canonical-json invariant [@verifies C005]: parse of the serialized text equals the input and reserializing is idempotent', () => {
  const sample = { z: 1, a: { n: 2, m: [3, 4] }, s: 'text' };
  const once = canonicalSerialize(sample);
  const twice = canonicalSerialize(JSON.parse(once));
  assert.equal(twice, once);
  assert.deepEqual(JSON.parse(once), sample);
});

test('canonical-json: 1-byte tamper changes the content hash', () => {
  const sample = { s: 'text' };
  const once = canonicalSerialize(sample);
  const tampered = once.replace('text', 'Text');
  assert.notEqual(sha256Hex(Buffer.from(tampered)), sha256Hex(Buffer.from(once)));
});

test('canonical-json: nested structures and arrays serialize deterministically', () => {
  const value = { b: [1, 2], a: { y: [], x: null }, t: true, n: 0 };
  const once = canonicalSerialize(value);
  assert.equal(canonicalSerialize(JSON.parse(once)), once);
  assert.equal(once.includes('\t'), false);
});

test('canonical-json error: non-serializable value throws WorkSpacifyTreeError', () => {
  assert.throws(() => canonicalSerialize({ big: 10n }), (e) => e instanceof WorkSpacifyTreeError);
  assert.throws(() => canonicalSerialize({ fn: () => {} }), (e) => e instanceof WorkSpacifyTreeError);
});
