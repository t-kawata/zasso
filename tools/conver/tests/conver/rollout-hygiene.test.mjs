// PX-363 @verifies C001
// [::TICKET::] PX-363 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-363 --for-spec --no-implementation-order`.
/**
 * Deployment and command hygiene.
 *
 * The formula gates are only effective once installed, and the command files are the
 * instructions every later run reads. These tests hold the install copies to the source
 * and the command vocabulary to metavariables rather than ticket ids.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const COMMAND_DIRECTORY = join(PACKAGE_ROOT, '.claude/commands');
const HOME = homedir();

const INSTALL_TARGETS = [
  join(HOME, 'shyme/zasso/.claude'),
  join(HOME, 'shyme/zasso/crates/siprs/.claude'),
  join(HOME, 'shyme/gaia/.claude'),
  join(HOME, 'shyme/conver/.claude'),
  join(HOME, 'shyme/crystal/.claude'),
];

const INSTALLED_FILES = [
  'scripts/spec-formula/index.mjs',
  'scripts/grill-me-for-rfc/check-formula-coverage.js',
  'scripts/grill-me-for-rfc/check-formula-completeness.js',
  'scripts/grill-me-for-rfc/verify-source-identity.js',
  'scripts/smooth-sequences/lib/checks-spec-completeness.mjs',
  'scripts/rfc-graph/attach-formula-ids.js',
  'scripts/tickets/merge-formulas-to-tickets.js',
  'commands/grill-me-for-rfc.md',
  'commands/smooth-sequences.md',
];

// [::TICKET::] PX-363 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-363 --for-spec --no-implementation-order`.
function digest(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

test('C001 postcondition: every installed target carries the new gates byte-identically', () => {
  for (const target of INSTALL_TARGETS) {
    if (!existsSync(target)) continue;
    for (const relative of INSTALLED_FILES) {
      const sourcePath = join(PACKAGE_ROOT, '.claude', relative);
      const targetPath = join(target, relative);
      assert.equal(existsSync(targetPath), true, `${relative} missing in ${target}`);
      assert.equal(digest(targetPath), digest(sourcePath), `${relative} differs in ${target}`);
    }
  }
});

test('C001 invariant: no command markdown carries a ticket id', () => {
  const offenders = [];
  for (const name of readdirSync(COMMAND_DIRECTORY).filter((entry) => entry.endsWith('.md'))) {
    const text = readFileSync(join(COMMAND_DIRECTORY, name), 'utf8');
    for (const match of text.matchAll(/PX-[0-9]+/g)) offenders.push(`${name}:${match[0]}`);
  }
  assert.deepEqual(offenders, []);
});

test('C001 invariant: no command markdown carries a change-history block', () => {
  const offenders = [];
  for (const name of readdirSync(COMMAND_DIRECTORY).filter((entry) => entry.endsWith('.md'))) {
    const text = readFileSync(join(COMMAND_DIRECTORY, name), 'utf8');
    const historyLines = text.split('\n')
      .filter((line) => /change history/i.test(line) && !/co-change history/i.test(line));
    if (historyLines.length > 0 || /formerly known as/i.test(text)) offenders.push(name);
  }
  assert.deepEqual(offenders, []);
});

test('C001 precondition: the formula gates are present in the source command tree', () => {
  for (const relative of INSTALLED_FILES) {
    assert.equal(existsSync(join(PACKAGE_ROOT, '.claude', relative)), true, relative);
  }
});
