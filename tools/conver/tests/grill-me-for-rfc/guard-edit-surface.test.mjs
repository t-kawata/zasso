// PX-239 @verifies C001
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
/**
 * The edit boundary, decided by name.
 *
 * A grill that may correct a neighbour's RFC must still never write a stage-1
 * input: the seed's hash is recorded in INFO-RFC-SEED.md and the chain is compared
 * at generation time, so a rewrite here breaks a gate somewhere else. The guard
 * answers one question about one path, and it answers by default-deny — the
 * allow-list is a list a human grows, never a guess the script makes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GRILL_GUARD_EDIT_SURFACE, runCommand } from '../question-gate/helpers/fixture-workspace.mjs';

/** The basenames this command never writes, matched by name at any depth. */
const FROZEN_BASENAMES = [
  'RFC-SEED.md',
  'INFO-RFC-SEED.md',
  'EXPLAIN-RFC-SEED.md',
  'WORKSPACIFY-ALLOCATE-MANIFEST.json',
  'WORKSPACIFY-TREE-MANIFEST.json',
  'GaiaSekkeiShiyousho_v3.md',
];

/** The basenames this command generates, and may therefore correct anywhere. */
const GENERATED_BASENAMES = ['RFC.md', 'DesignTree.json', 'CheckList.md', 'Status.json'];

test('C001 postcondition: a generated basename is allowed, wherever it sits', () => {
  for (const basename of GENERATED_BASENAMES) {
    const result = runCommand(GRILL_GUARD_EDIT_SURFACE, [`/tmp/pkg/${basename}`]);

    assert.equal(result.status, 0, `${basename} must be editable: ${result.stderr}`);
  }
});

test('C001 postcondition: every frozen basename is refused and the alternative is stated', () => {
  for (const basename of FROZEN_BASENAMES) {
    const result = runCommand(GRILL_GUARD_EDIT_SURFACE, [`/tmp/pkg/${basename}`]);

    assert.equal(result.status, 1, `${basename} must be refused`);
    assert.match(result.stderr, new RegExp(basename.replace(/\./g, '\\.')), 'the refused name is given');
    assert.match(result.stderr, /owning RFC/, 'the alternative is stated, not left to be inferred');
  }
});

test('C001 invariant: the boundary is default-deny', () => {
  const result = runCommand(GRILL_GUARD_EDIT_SURFACE, ['/tmp/pkg/NOTES.md']);

  assert.equal(result.status, 1, 'an unlisted path is not silently allowed');
  assert.match(result.stderr, /unknown path/);
});

test('C001 invariant: the rule matches by basename, at any depth', () => {
  const deep = runCommand(GRILL_GUARD_EDIT_SURFACE, ['/a/b/c/WORKSPACIFY-TREE-MANIFEST.json']);
  const shallow = runCommand(GRILL_GUARD_EDIT_SURFACE, ['WORKSPACIFY-TREE-MANIFEST.json']);

  assert.equal(deep.status, 1);
  assert.equal(shallow.status, 1, 'the rule is about the name, not the path prefix');
  assert.match(shallow.stderr, /WORKSPACIFY-TREE-MANIFEST\.json/, 'the name is what the rule matched');
});

test('C001 invariant: the versioned specification is matched by pattern, not by one version', () => {
  const older = runCommand(GRILL_GUARD_EDIT_SURFACE, ['/tmp/GaiaSekkeiShiyousho_v1.md']);
  const newer = runCommand(GRILL_GUARD_EDIT_SURFACE, ['/tmp/GaiaSekkeiShiyousho_v12.md']);

  assert.equal(older.status, 1, 'every version of the specification is an input');
  assert.equal(newer.status, 1);
  assert.match(newer.stderr, /GaiaSekkeiShiyousho_v12\.md/);
});

test('C001 invariant: a refusal carries the rule that produced it', () => {
  const frozen = runCommand(GRILL_GUARD_EDIT_SURFACE, ['/tmp/RFC-SEED.md', '--why']);
  const unknown = runCommand(GRILL_GUARD_EDIT_SURFACE, ['/tmp/NOTES.md', '--why']);

  assert.equal(frozen.status, 1);
  assert.match(frozen.stdout + frozen.stderr, /frozen|input/i, 'the matched rule is named');

  assert.equal(unknown.status, 1, 'an unmatched path still refuses under --why');
  assert.match(unknown.stdout + unknown.stderr, /no rule|unknown path/i);
});

test('C001 invariant: the guard reads a name and never the filesystem', () => {
  const missing = runCommand(GRILL_GUARD_EDIT_SURFACE, ['/nonexistent/place/RFC.md']);

  assert.equal(missing.status, 0, 'a path that does not exist is still a legal target name');
});

test('C001 precondition: a missing argument is a usage error, not a silent allow', () => {
  const result = runCommand(GRILL_GUARD_EDIT_SURFACE, []);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage/i);
});
