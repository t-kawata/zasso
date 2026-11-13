// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactText, sha256 } from '../scripts/lib/redact.mjs';
import { generateLawBundle } from '../scripts/generate-law-bundle.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..', '..', '..');
const aliasMap = JSON.parse(readFileSync(join(root, '..', 'rust-interface-law.path-alias.json'), 'utf8'));
const sourceRoot = repoRoot;
const manifest = parseManifest(readFileSync(join(root, 'source/manifest.toml'), 'utf8'));
const redaction = JSON.parse(readFileSync(join(root, 'source/redaction.sha256.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'atoms.lock.json'), 'utf8'));
const coverage = JSON.parse(readFileSync(join(root, 'coverage.json'), 'utf8'));

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function parseManifest(text) {
  const files = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '[[file]]') {
      current = {};
      files.push(current);
      continue;
    }
    const match = line.match(/^([a-z0-9_]*)\s*=\s*"(.*)"$/);
    if (!match) continue;
    if (current && (match[1] === 'path' || match[1] === 'sha256')) current[match[1]] = match[2];
  }
  return files;
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function linesOf(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

test('C002 manifest hashes match the source bytes', () => {
  for (const file of manifest) {
    const original = join(sourceRoot, aliasMap.aliases[file.path]);
    assert.equal(sha256(readFileSync(original, 'utf8').replace(/\r\n/g, '\n')), file.sha256, file.path);
  }
});

test('C002 lock rules and source spans re-derive from the registry', () => {
  const ruleMap = JSON.parse(readFileSync(join(root, 'source/rule-concepts.json'), 'utf8'));
  assert.equal(Object.keys(ruleMap.byRule).length, 466);
  for (const rule of Object.values(ruleMap.byRule)) {
    assert.ok(aliasMap.aliases[rule.source_alias], rule.rule_id);
    assert.match(rule.source_span, /^\d+-\d+$/, rule.rule_id);
  }
  assert.equal((lock.rules ?? []).length, 466);
});

test('C002 coverage partitions every source line', () => {
  for (const file of coverage.files) {
    const original = join(sourceRoot, aliasMap.aliases[file.path]);
    const lineCount = linesOf(readFileSync(original, 'utf8')).length;
    assert.equal(file.lines, lineCount, file.path);
    assert.equal(file.attributed, file.lines, file.path);
    assert.deepEqual(file.gaps, [], file.path);
    assert.deepEqual(file.overlaps, [], file.path);
  }
});

test('C002 source view and baseline are regenerable', () => {
  const parts = ['# Source View', '', 'Generated from the source documents. Do not edit.', ''];
  for (const file of manifest) {
    const text = redactText(readFileSync(join(sourceRoot, aliasMap.aliases[file.path]), 'utf8'), redaction);
    parts.push(`# Source: ${file.path}`, '', text.replace(/\n+$/, ''), '');
  }
  const expected = parts.join('\n');
  assert.equal(readFileSync(join(root, 'source/source-view.md'), 'utf8'), expected);
  assert.equal(readFileSync(join(root, 'source/source.baseline.md'), 'utf8'), expected);
});

test('C002 two generations are byte-identical', () => {
  const first = mkdtempSync(join(tmpdir(), 'law-rederive-a-'));
  const second = mkdtempSync(join(tmpdir(), 'law-rederive-b-'));
  try {
    const sourcePaths = manifest.map((file) => file.path.split('/').pop());
    const sourcePath = join(repoRoot, 'docs/archive/IMPLEMENTATION-SPEC');
    generateLawBundle({ sourceRoot: sourcePath, sourcePaths, outDir: join(first, 'okf'), sourceDir: join(first, 'source'), date: '2026-11-13' });
    generateLawBundle({ sourceRoot: sourcePath, sourcePaths, outDir: join(second, 'okf'), sourceDir: join(second, 'source'), date: '2026-11-13' });
    assert.equal(readFileSync(join(first, 'source/rule-concepts.json'), 'utf8'), readFileSync(join(second, 'source/rule-concepts.json'), 'utf8'));
    assert.equal(readFileSync(join(first, 'atoms.lock.json'), 'utf8'), readFileSync(join(second, 'atoms.lock.json'), 'utf8'));
    assert.ok(existsSync(join(root, 'source/source-view.md')));
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});
