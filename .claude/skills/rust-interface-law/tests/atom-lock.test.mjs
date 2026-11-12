import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseDocument, parseBlocks } from '../scripts/lib/atoms.mjs';
import { attributeCoverage } from '../scripts/lib/coverage.mjs';
import { parseRegistryTable, assertBijection } from '../scripts/lib/registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf8');
const noRedaction = [];

test('extract registry row as Rule atom', () => {
  const doc = parseDocument({ path: 'rule-table.md', text: fixture('rule-table.md'), redaction: noRedaction });
  const rules = doc.atoms.filter((a) => a.type === 'Rule');
  assert.equal(rules.length, 2);
  assert.deepEqual(rules.map((a) => a.id), ['A-01', 'B-02']);
  assert.equal(rules[0].classification, 'normative');
});

test('extract fenced block as CodeBlock atom', () => {
  const doc = parseDocument({ path: 'code-block.md', text: fixture('code-block.md'), redaction: noRedaction });
  const code = doc.atoms.filter((a) => a.type === 'CodeBlock');
  assert.equal(code.length, 1);
  assert.match(code[0].text, /pub struct/);
});

test('extract table as Table atom', () => {
  const doc = parseDocument({ path: 'table.md', text: fixture('table.md'), redaction: noRedaction });
  assert.equal(doc.atoms.filter((a) => a.type === 'Table').length, 1);
});

// @verifies C006
test('normative prose candidate', () => {
  const doc = parseDocument({ path: 'normative.md', text: fixture('normative.md'), redaction: noRedaction });
  const paragraph = doc.atoms.find((a) => a.type === 'Paragraph');
  assert.equal(paragraph.classification, 'normative');
  assert.match(paragraph.reason, /MUST/);
});

// @verifies C002
test('identity survives line shift', () => {
  const base = '## H\n\nMUST keep.\n';
  const shifted = '\n\n\n' + base;
  const baseDoc = parseDocument({ path: 'x.md', text: base, redaction: noRedaction });
  const shiftedDoc = parseDocument({ path: 'x.md', text: shifted, redaction: noRedaction });
  const baseParagraph = baseDoc.atoms.find((atom) => atom.type === 'Paragraph');
  const shiftedParagraph = shiftedDoc.atoms.find((atom) => atom.type === 'Paragraph');
  assert.equal(baseParagraph.id, shiftedParagraph.id);
  assert.equal(baseParagraph.content_sha256, shiftedParagraph.content_sha256);
});

test('text change changes content hash', () => {
  const keptDoc = parseDocument({ path: 'x.md', text: 'MUST keep.\n', redaction: noRedaction });
  const changedDoc = parseDocument({ path: 'x.md', text: 'MUST change.\n', redaction: noRedaction });
  assert.notEqual(keptDoc.atoms[0].content_sha256, changedDoc.atoms[0].content_sha256);
});

// @verifies C003
test('coverage partitions every line', () => {
  const doc = parseDocument({ path: 'normative.md', text: fixture('normative.md'), redaction: noRedaction });
  assert.equal(doc.coverage.gaps.length, 0);
  assert.equal(doc.coverage.overlaps.length, 0);
  assert.equal(doc.coverage.attributed, doc.lines);
});

// @verifies C004
test('registry bijection', () => {
  const text = fixture('rule-table.md');
  const blocks = parseBlocks(text);
  const table = blocks.find((b) => b.kind === 'table' && b.headers.includes('ID'));
  const registry = parseRegistryTable(table);
  const doc = parseDocument({ path: 'rule-table.md', text, redaction: noRedaction });
  assert.doesNotThrow(() => assertBijection(doc.atoms, registry));
  assert.throws(() => assertBijection(doc.atoms.filter((a) => a.id !== 'A-01'), registry), /missing/);
});

// @verifies C005
test('deterministic output', () => {
  const text = fixture('rule-table.md');
  const firstRun = parseDocument({ path: 'rule-table.md', text, redaction: noRedaction });
  const secondRun = parseDocument({ path: 'rule-table.md', text, redaction: noRedaction });
  assert.deepEqual(firstRun.atoms, secondRun.atoms);
  assert.deepEqual(firstRun.coverage, secondRun.coverage);
});

test('empty file yields zero atoms', () => {
  const doc = parseDocument({ path: 'empty.md', text: '', redaction: noRedaction });
  assert.equal(doc.atoms.length, 0);
  assert.equal(doc.lines, 0);
});

test('heading-only file yields structural atoms only', () => {
  const doc = parseDocument({ path: 'heading-only.md', text: fixture('heading-only.md'), redaction: noRedaction });
  assert.ok(doc.atoms.every((a) => a.type === 'Heading' || a.type === 'Blank'));
});

test('CRLF normalizes deterministically', () => {
  const raw = fixture('crlf.md');
  const lf = raw.replace(/\r\n/g, '\n');
  const crlfDoc = parseDocument({ path: 'crlf.md', text: raw, redaction: noRedaction });
  const lfDoc = parseDocument({ path: 'crlf.md', text: lf, redaction: noRedaction });
  assert.deepEqual(
    crlfDoc.atoms.map((atom) => atom.content_sha256),
    lfDoc.atoms.map((atom) => atom.content_sha256),
  );
});

test('EOF without trailing newline captured', () => {
  const doc = parseDocument({ path: 'x.md', text: 'MUST end', redaction: noRedaction });
  assert.equal(doc.lines, 1);
  assert.equal(doc.atoms.length, 1);
});

test('coverage rejects overlap and gap', () => {
  const atoms = [
    { span: { start_line: 1, end_line: 1 } },
    { span: { start_line: 1, end_line: 2 } },
  ];
  const coverage = attributeCoverage(atoms, 3);
  assert.equal(coverage.overlaps.length, 1);
  assert.equal(coverage.gaps.length, 1);
});
