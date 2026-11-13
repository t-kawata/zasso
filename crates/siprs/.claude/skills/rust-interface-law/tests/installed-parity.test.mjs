import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..', '..', '..');
const verifier = join(repoRoot, '.claude/scripts/amend-rfc-up/verify-law-skill.mjs');
const aliasPath = join(root, '..', 'rust-interface-law.path-alias.json');
const INSTALLED_ROOTS = ['dist/', 'okf/', 'source/', 'templates/', 'tests/fixtures/runtime/'];

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(entryPath));
    else if (statSync(entryPath).isFile()) files.push(entryPath);
  }
  return files;
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function digest(tree) {
  const digest = createHash('sha256');
  for (const file of listFiles(tree)
    .map((file) => relative(tree, file).replace(/\\/g, '/'))
    .filter((file) => INSTALLED_ROOTS.some((prefix) => file.startsWith(prefix)))
    .sort()) {
    digest.update(file).update('\0').update(readFileSync(join(tree, file))).update('\n');
  }
  return digest.digest('hex');
}

test('C005 installed mode passes and source/installed SHA match', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'law-installed-'));
  try {
    const source = join(workspace, 'source-law');
    cpSync(root, source, { recursive: true });
    const target = join(workspace, 'target');
    execFileSync(process.execPath, [join(source, 'install.js'), target], { encoding: 'utf8' });
    const installed = join(target, '.claude/skills/rust-interface-law');
    const output = execFileSync(process.execPath, [
      verifier,
      '--skill', installed,
      '--mode', 'installed',
      '--path-alias', aliasPath,
      '--out', join(target, 'verification.json'),
    ], { encoding: 'utf8' });
    assert.match(output, /"ok":true/);
    assert.equal(digest(installed), digest(source));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
