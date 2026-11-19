// [::TICKET::] PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-452 --for-spec --no-implementation-order`.
// [::TICKET::] PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-451 --for-spec --no-implementation-order`.
/**
 * parse-toml-subset.test.cjs — local workspace-map reader.
 * @verifies C005
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { parseTomlSubset } = require('../../.claude/scripts/crystalize-readme/parse-toml-subset.js');

describe('C005 — workspace-map TOML subset', () => {
  it('reads [[unit]] tables with paths, role, and interfaces', () => {
    const text = [
      '# workspace map',
      '[[unit]]',
      'id = "pkg-a"',
      'paths = ["crates/core/a", "crates/core/a/**"]',
      'role = "core"',
      'interfaces = ["cli"]',
      '',
      '[[unit]]',
      'id = "pkg-b"',
      'paths = ["/**"]',
      'role = "cli"',
    ].join('\n');

    const doc = parseTomlSubset(text);
    assert.equal(doc.unit.length, 2);
    assert.equal(doc.unit[0].id, 'pkg-a');
    assert.deepEqual(doc.unit[0].paths, ['crates/core/a', 'crates/core/a/**']);
    assert.equal(doc.unit[0].role, 'core');
    assert.deepEqual(doc.unit[1].interfaces, undefined);
  });

  it('reads nested tables and comments without losing values', () => {
    const text = [
      '[workspace]',
      'name = "demo" # inline comment',
      'count = 3',
      'enabled = true',
    ].join('\n');
    const doc = parseTomlSubset(text);
    assert.equal(doc.workspace.name, 'demo');
    assert.equal(doc.workspace.count, 3);
    assert.equal(doc.workspace.enabled, true);
  });
});

describe('C015 — unsupported syntax is reported, not misparsed', () => {
  it('reports UNSUPPORTED_TOML_SYNTAX for a multi-line array and a triple-quoted string', () => {
    for (const source of ['paths = [\n  "a",\n]\n', 'description = """multi"""\n']) {
      assert.throws(() => parseTomlSubset(source), (error) => error.code === 'UNSUPPORTED_TOML_SYNTAX');
    }
  });

  it('keeps the supported [[unit]] subset working', () => {
    const doc = parseTomlSubset('[[unit]]\nid = "pkg-a"\npaths = ["crates/a", "crates/a/**"]\nrole = "core"\n');
    assert.equal(doc.unit[0].id, 'pkg-a');
    assert.deepEqual(doc.unit[0].paths, ['crates/a', 'crates/a/**']);
    assert.equal(doc.unit[0].role, 'core');
  });
});
