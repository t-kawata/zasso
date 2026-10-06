// PX-238 @verifies C004
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
/**
 * Whether the canon stands alone.
 *
 * The grill rewrites RFC.md from its settled tree. That is safe while the RFC is
 * the only design artifact in the package, and unsafe once /graphify-rfc and
 * /boundify-graph have derived a graph, a directory tree and tickets from it: the
 * drill computes its delta against a baseline captured inside one drill run, so a
 * rewrite made outside that run is absorbed into the next baseline and reported as
 * no change. The guard answers one question — does this package already carry a
 * derived artifact — and this file asserts both answers, one artifact at a time so
 * that a check which only looks for the graph cannot pass.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GRILL_CANON_STATE, runCommand } from '../question-gate/helpers/fixture-workspace.mjs';

/** The three artifacts the upstream loop derives from a canonical RFC. */
const DERIVED_ARTIFACTS = ['RFC-GRAPH.json', 'RFC-Dirs-Tree.json', 'Tickets.json'];

/** A package directory holding an RFC and, optionally, one derived artifact. */
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
function makeCanon(artifact) {
  const dir = mkdtempSync(join(tmpdir(), 'px238-canon-'));
  writeFileSync(join(dir, 'RFC.md'), '# RFC\n\n## Design\n', 'utf8');
  if (artifact) writeFileSync(join(dir, artifact), '{}', 'utf8');
  return dir;
}

test('C004 precondition: a canon that stands alone passes the guard', () => {
  const result = runCommand(GRILL_CANON_STATE, [makeCanon()]);

  assert.equal(result.status, 0, result.stderr);
});

test('C004 postcondition: a package holding a graph is refused', () => {
  const result = runCommand(GRILL_CANON_STATE, [makeCanon('RFC-GRAPH.json')]);

  assert.equal(result.status, 1, '/graphify-rfc has derived a graph from this RFC');
  assert.match(result.stderr, /RFC-GRAPH\.json/, 'the artifact found is named');
});

test('C004 postcondition: a package holding a directory tree is refused', () => {
  const result = runCommand(GRILL_CANON_STATE, [makeCanon('RFC-Dirs-Tree.json')]);

  assert.equal(result.status, 1, '/boundify-graph has derived directory boundaries from this RFC');
  assert.match(result.stderr, /RFC-Dirs-Tree\.json/, 'the artifact found is named');
});

test('C004 postcondition: a package holding tickets is refused', () => {
  const result = runCommand(GRILL_CANON_STATE, [makeCanon('Tickets.json')]);

  assert.equal(result.status, 1, '/boundify-graph has split this RFC into tickets');
  assert.match(result.stderr, /Tickets\.json/, 'the artifact found is named');
});

test('C004 invariant: every derived artifact is checked, not only the graph', () => {
  for (const artifact of DERIVED_ARTIFACTS) {
    const result = runCommand(GRILL_CANON_STATE, [makeCanon(artifact)]);
    assert.equal(result.status, 1, `${artifact} alone must refuse the rewrite`);
    assert.match(
      result.stderr,
      new RegExp(artifact.replace('.', '\\.')),
      `${artifact} alone must be named as the reason`,
    );
  }
});

test('C004 invariant: the guard reads and never writes', () => {
  const dir = makeCanon('RFC-GRAPH.json');

  const first = runCommand(GRILL_CANON_STATE, [dir]);
  const second = runCommand(GRILL_CANON_STATE, [dir]);

  assert.equal(first.status, 1, first.stderr);
  assert.match(first.stderr, /RFC-GRAPH\.json/, 'the first call answered the question');
  assert.equal(second.status, 1, 'the answer is the same on a second call, so nothing was repaired');
  assert.equal(second.stderr, first.stderr, 'and it says the same thing');
});
