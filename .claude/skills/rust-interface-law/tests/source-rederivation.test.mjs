import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactText, sha256 } from '../scripts/lib/redact.mjs';

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

test('C002 lock spans and content hashes re-derive from the source', () => {
  for (const atom of lock.atoms) {
    const original = join(sourceRoot, aliasMap.aliases[atom.source]);
    const lines = linesOf(readFileSync(original, 'utf8'));
    const spanText = lines.slice(atom.span.start_line - 1, atom.span.end_line).join('\n');
    assert.equal(sha256(spanText), atom.source_sha256, atom.id);
    assert.equal(sha256(redactText(spanText, redaction)), atom.content_sha256, atom.id);
  }
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
  assert.equal(readFileSync(join(root, 'okf/source.md'), 'utf8'), expected);
  assert.equal(readFileSync(join(root, 'okf/source.baseline.md'), 'utf8'), expected);
});

test('C002 ingest verify and rebuild are byte-identical', () => {
  const aliasPath = join(root, '..', 'rust-interface-law.path-alias.json');
  const verify = execFileSync(process.execPath, [join(root, 'scripts/ingest.mjs'), 'verify', '--alias', aliasPath], {
    cwd: sourceRoot,
    encoding: 'utf8',
  });
  assert.match(verify, /verify: 19 files, 2733 atoms, 7125 lines/);
  const rebuild = execFileSync(process.execPath, [join(root, 'scripts/cli.mjs'), 'rebuild', '--root', root, '--alias', aliasPath], {
    cwd: sourceRoot,
    encoding: 'utf8',
  });
  assert.match(rebuild, /rebuild: byte-identical/);
  assert.ok(existsSync(join(root, 'okf/source.md')));
});
