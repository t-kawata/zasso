/**
 * derive-graph-path.test.cjs — the package graph is derived, never passed.
 * @verifies C009
 * @verifies C009/precondition
 * @verifies C009/postcondition
 * @verifies C009/invariant
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveCrystalizeGraph } = require('../../.claude/scripts/crystalize-readme/derive-graph-path.js');

let root;

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'px451-graph-'));
});

after(() => fs.rmSync(root, { recursive: true, force: true }));

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function packageWith(files) {
  const dir = fs.mkdtempSync(path.join(root, 'pkg-'));
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body, 'utf8');
  }
  return dir;
}

describe('C009 — no-argument graph derivation', () => {
  it('resolves RFC-GRAPH.json from the package directory', () => {
    const dir = packageWith({ 'RFC-GRAPH.json': '{"nodes":[],"edges":[]}' });
    const result = resolveCrystalizeGraph({ cwd: dir, args: [] });
    assert.equal(result.ok, true);
    assert.equal(result.graphPath, path.join(dir, 'RFC-GRAPH.json'));
  });

  it('accepts the unique *-GRAPH.json when the canonical name is absent', () => {
    const dir = packageWith({ 'RFC-ROOT-GRAPH.json': '{"nodes":[],"edges":[]}' });
    const result = resolveCrystalizeGraph({ cwd: dir, args: [] });
    assert.equal(result.ok, true);
    assert.equal(result.graphPath, path.join(dir, 'RFC-ROOT-GRAPH.json'));
  });

  it('fails closed on MISSING and AMBIGUOUS', () => {
    const empty = packageWith({});
    assert.equal(resolveCrystalizeGraph({ cwd: empty, args: [] }).reason, 'MISSING');

    const two = packageWith({
      'A-GRAPH.json': '{}',
      'B-GRAPH.json': '{}',
    });
    assert.equal(resolveCrystalizeGraph({ cwd: two, args: [] }).reason, 'AMBIGUOUS');
  });

  it('rejects an operator-supplied graph path with UNEXPECTED_ARGUMENT', () => {
    const dir = packageWith({ 'RFC-GRAPH.json': '{}' });
    assert.throws(
      () => resolveCrystalizeGraph({ cwd: dir, args: ['RFC-GRAPH.json'] }),
      /UNEXPECTED_ARGUMENT/,
    );
  });
});
