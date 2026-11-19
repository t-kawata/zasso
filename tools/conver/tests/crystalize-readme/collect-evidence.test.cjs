/**
 * collect-evidence.test.cjs — deterministic evidence and digests.
 * @verifies C005
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { collectEvidence } = require('../../.claude/scripts/crystalize-readme/collect-evidence.js');

let root;

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'px451-evidence-'));
});

after(() => fs.rmSync(root, { recursive: true, force: true }));

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function write(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, 'utf8');
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function makePackage() {
  const dir = fs.mkdtempSync(path.join(root, 'pkg-'));
  write(path.join(dir, 'RFC.md'), '# RFC\n\n## Design\n\nBody\n');
  write(path.join(dir, 'RFC-GRAPH.json'), JSON.stringify({ sourceFile: path.join(dir, 'RFC.md'), nodes: [], edges: [] }));
  write(path.join(dir, 'RFC-SEED.md'), '# Seed\n\n## Coupling Contracts\n');
  write(path.join(dir, 'examples/basic.rs'), 'fn main() {}\n');
  write(path.join(dir, 'src/lib.rs'), 'pub fn add_account() {}\n');
  return dir;
}

describe('C005 — evidence bundle', () => {
  it('produces stable digests for identical inputs', async () => {
    const dir = makePackage();
    const first = await collectEvidence({ packageRoot: dir, workspaceRoot: dir });
    const second = await collectEvidence({ packageRoot: dir, workspaceRoot: dir });
    assert.deepEqual(first.digests, second.digests);
    assert.match(first.digests.graph, /^[0-9a-f]{64}$/);
  });

  it('changes the digest when a referenced file changes', async () => {
    const dir = makePackage();
    const first = await collectEvidence({ packageRoot: dir, workspaceRoot: dir });
    write(path.join(dir, 'RFC-SEED.md'), '# Seed\n\nChanged\n');
    const second = await collectEvidence({ packageRoot: dir, workspaceRoot: dir });
    assert.notEqual(first.digests.seed, second.digests.seed);
  });

  it('reports the declared RFC surface and the implemented Rust surface', async () => {
    const dir = makePackage();
    write(path.join(dir, 'RFC.md'), [
      '# RFC',
      '',
      '```rust',
      'pub struct Account;',
      'pub fn add_account() {}',
      '```',
    ].join('\n'));
    const evidence = await collectEvidence({ packageRoot: dir, workspaceRoot: dir });
    assert.ok(Array.isArray(evidence.declaredSurface.items));
    assert.ok(Array.isArray(evidence.implementedSurface.items));
    assert.ok(evidence.implementedSurface.items.some((item) => item.name === 'add_account'));
  });

  it('lists examples with their digests', async () => {
    const dir = makePackage();
    const evidence = await collectEvidence({ packageRoot: dir, workspaceRoot: dir });
    assert.ok(evidence.examples.some((entry) => entry.path.endsWith('basic.rs')));
    assert.match(evidence.examples[0].digest, /^[0-9a-f]{64}$/);
  });
});

describe('C011 — package-scoped spec matching', () => {
  it('matches by package scope and excludes a same-basename package', async () => {
    const workspace = fs.mkdtempSync(path.join(root, 'scope-'));
    const pkgA = path.join(workspace, 'left', 'pkg');
    const pkgB = path.join(workspace, 'right', 'pkg');
    write(path.join(pkgA, 'RFC.md'), '# A\n');
    write(path.join(pkgB, 'RFC.md'), '# B\n');
    write(path.join(pkgA, 'RFC-GRAPH.json'), JSON.stringify({ sourceFile: path.join(pkgA, 'RFC.md'), nodes: [] }));
    write(path.join(pkgB, 'RFC-GRAPH.json'), JSON.stringify({ sourceFile: path.join(pkgB, 'RFC.md'), nodes: [] }));
    const specA = path.join(pkgA, 'specs', 'PX-A.md');
    const specB = path.join(pkgB, 'specs', 'PX-B.md');
    write(specA, '# PX-A\n');
    write(specB, '# PX-B\n');
    const ticketsPath = path.join(workspace, 'Tickets.json');
    write(ticketsPath, JSON.stringify({
      phases: [{
        tickets: [
          { id: 'PX-A', specPath: specA, default_files: [path.join(pkgA, 'src', 'lib.rs')] },
          { id: 'PX-B', specPath: specB, default_files: [path.join(pkgB, 'src', 'lib.rs')] },
        ],
      }],
    }));

    const evidence = await collectEvidence({
      packageRoot: pkgA,
      workspaceRoot: workspace,
      ticketsPath,
      unitId: 'left__pkg',
    });
    assert.deepEqual(evidence.specs.map((spec) => spec.ticket), ['PX-A']);
  });
});
