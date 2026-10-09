// The instrument carries no project's vocabulary (PX-248, C007).
//
// A rail that reads one project's registry by name serves that project and no other. The
// constraint is that everything project-specific reaches the rail as a declaration field or
// as supplied material, and this file holds it by reading the modules rather than trusting
// the promise: no module under `rail/` and no brief may name a project, a project file, a
// project operation or a transport.
//
// @verifies C007
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RAIL = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail');
const BRIEFS = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/briefs');

/**
 * The words that would tie the instrument to one project.
 *
 * A transport is named here by the vocabulary a project would declare for it rather than
 * by the bare word: `rest` is a rest parameter in this codebase and `cli` is not a word the
 * rail would ever need, so a scan for those would fire on ordinary identifiers and be a scan
 * nobody could keep green — and a green scan is the whole value of this test.
 */
const PROJECT_TOKENS = Object.freeze([
  'gaia',
  'procedure-registry',
  'sequence-manifest',
  'sequence-steps',
  'section-adjudications',
  'sequence-adjudications',
  'registry-completeness-checks',
  'totality-exemptions',
  'check-registry',
  'websocket',
  'RestEndpoint',
  'CliCommand',
  'WebSocketMethod',
]);

/** Every file beneath a root, as absolute paths. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function filesBeneath(root) {
  const found = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) found.push(...filesBeneath(full));
    else found.push(full);
  }
  return found;
}

/** The project tokens a file carries. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function projectTokensIn(filePath) {
  const text = readFileSync(filePath, 'utf8');
  return PROJECT_TOKENS.filter((token) => new RegExp(`\\b${token}\\b`, 'i').test(text));
}

test('C007 no module under rail/ and no brief names a project, a project file or a transport', () => {
  const hits = [...filesBeneath(RAIL), ...filesBeneath(BRIEFS)]
    .flatMap((file) => projectTokensIn(file).map((token) => `${file.slice(PROJECT_ROOT.length)}: ${token}`));

  assert.deepEqual(hits, []);
});

test('C007 the scan is not vacuous: an inserted project name reddens it', () => {
  const planted = join(mkdtempSync(join(tmpdir(), 'px248-generic-')), 'planted.mjs');
  writeFileSync(planted, 'const source = "procedure-registry.md";\n');

  assert.deepEqual(projectTokensIn(planted), ['procedure-registry']);
});

test('C007 every project-shaped value the rail consumes arrives as a declaration field', () => {
  const declaration = JSON.parse(readFileSync(join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/census/ledger.run.json'), 'utf8')).declaration;
  const borrowedNames = declaration.sourceEnumerations.map((entry) => entry.source);

  assert.equal(borrowedNames.every((name) => typeof name === 'string' && name.endsWith('.md')), true);
  assert.equal(Array.isArray(declaration.requiredMeasuredColumns), true, 'which columns must be measured is the caller\'s');
  assert.equal(Array.isArray(declaration.consumerFields), true, 'which fields a consumer reads is the caller\'s');
  for (const column of declaration.columns) {
    assert.equal(typeof column.decidedBy, 'string');
  }
});
