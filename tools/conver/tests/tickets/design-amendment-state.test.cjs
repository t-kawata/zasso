'use strict';

/**
 * PX-400 — per-artifact state resolution.
 *
 * Every artifact is independently present, absent, ambiguous or unreadable.
 * Absence is a state, never a thrown error, because the README invariant says
 * an incomplete conver project is input, not a refusal condition.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  ARTIFACT_KINDS,
  ARTIFACT_STATES,
  OWNER_REQUIREMENTS,
  resolveArtifactState,
  resolveArtifactStates,
  resolvePackageState,
} = require('../../.claude/scripts/tickets/lib/design-amendment-state.js');

// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function tempPackage(files = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px400-state-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, name), content);
  }
  return directory;
}

const PRESENT_DESIGN = {
  'RFC.md': '# RFC\n\n## Clause\n',
  'RFC-GRAPH.json': '{"nodes":[]}',
  'RFC-Dirs-Tree.json': '{"trees":[]}',
  'Tickets.json': '{"phases":[]}',
};

test('C001: every artifact is absent in an empty directory without throwing', () => {
  const directory = tempPackage();

  const states = resolveArtifactStates({ cwd: directory });

  assert.deepEqual(states.map((entry) => entry.kind), [
    ARTIFACT_KINDS.SPEC, ARTIFACT_KINDS.RFC, ARTIFACT_KINDS.GRAPH,
    ARTIFACT_KINDS.DIRS_TREE, ARTIFACT_KINDS.TICKETS,
  ]);
  assert.deepEqual(states.map((entry) => entry.state), Array(5).fill(ARTIFACT_STATES.ABSENT));
  assert.equal(states.every((entry) => entry.path !== undefined), true);
});

test('C001: every present artifact resolves independently', () => {
  const directory = tempPackage(PRESENT_DESIGN);

  const states = resolveArtifactStates({ cwd: directory });

  assert.equal(states.find((entry) => entry.kind === ARTIFACT_KINDS.RFC).state, ARTIFACT_STATES.PRESENT);
  assert.equal(states.find((entry) => entry.kind === ARTIFACT_KINDS.GRAPH).state, ARTIFACT_STATES.PRESENT);
  assert.equal(states.find((entry) => entry.kind === ARTIFACT_KINDS.DIRS_TREE).state, ARTIFACT_STATES.PRESENT);
  assert.equal(states.find((entry) => entry.kind === ARTIFACT_KINDS.TICKETS).state, ARTIFACT_STATES.PRESENT);
  assert.equal(states.find((entry) => entry.kind === ARTIFACT_KINDS.SPEC).state, ARTIFACT_STATES.ABSENT);
});

test('C001: the workspace SPEC is resolved from the tree manifest input', () => {
  const directory = tempPackage({
    'WORKSPACIFY-TREE-MANIFEST.json': '{"input":{"spec_path":"DESIGN.md"}}',
    'DESIGN.md': '# Design\n',
  });

  const state = resolveArtifactState({ kind: ARTIFACT_KINDS.SPEC, cwd: directory });

  assert.equal(state.state, ARTIFACT_STATES.PRESENT);
  assert.equal(state.path, path.join(directory, 'DESIGN.md'));
});

test('C010: two graph candidates are ambiguous, not guessed', () => {
  const directory = tempPackage({
    'A-GRAPH.json': '{"nodes":[]}',
    'B-GRAPH.json': '{"nodes":[]}',
  });

  const state = resolveArtifactState({ kind: ARTIFACT_KINDS.GRAPH, cwd: directory });

  assert.equal(state.state, ARTIFACT_STATES.AMBIGUOUS);
  assert.equal(state.code, 'AMBIGUOUS_GRAPH');
});

test('C010: unparsable JSON is unreadable, not absent', () => {
  const directory = tempPackage({ 'RFC-GRAPH.json': '{not json' });

  const state = resolveArtifactState({ kind: ARTIFACT_KINDS.GRAPH, cwd: directory });

  assert.equal(state.state, ARTIFACT_STATES.UNREADABLE);
  assert.equal(state.code, 'UNREADABLE_ARTIFACT');
});

test('C002: owner requirements name the existing hard prerequisites', () => {
  assert.deepEqual(OWNER_REQUIREMENTS.graphify, ['rfc']);
  assert.deepEqual(OWNER_REQUIREMENTS.boundify, ['graph']);
  assert.deepEqual(OWNER_REQUIREMENTS.split, ['graph', 'dirs-tree']);
  assert.deepEqual(OWNER_REQUIREMENTS['workspacify-tree'], ['spec']);
  assert.equal(OWNER_REQUIREMENTS.amendment, undefined);
});

test('C001: the package state reuses the canon-state classifier', async () => {
  const directory = tempPackage();

  const classification = await resolvePackageState(directory);

  assert.equal(classification.state, 'standalone');
});
