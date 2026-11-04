// PX-368 @verifies C002
// The resolver is the one place a drill run decides what it reads. These tests pin the
// order (discovered defaults first), the additive argument rule, the presence branch for
// each optional input, and the resume rule that reads the session record instead of
// re-discovering.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveDrillMaterial, collectMaterialArguments } = require('../../.claude/scripts/drill-rfc-down/resolve-material.js');

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'px368-resolver-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** A package holding the two optional inputs the resolver may discover. */
// [::TICKET::] PX-368 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-368 --for-spec --no-implementation-order`.
function makePackage(name, { readme = false, view = false } = {}) {
  const packageDir = path.join(tmpRoot, name);
  fs.mkdirSync(packageDir, { recursive: true });
  if (readme) fs.writeFileSync(path.join(packageDir, 'README.md'), '# Package\n\n<::RESIDUE::>note\n');
  if (view) {
    fs.writeFileSync(path.join(packageDir, 'SEQUENCES.md'), '# Sequences\n');
    fs.writeFileSync(path.join(packageDir, 'SEQUENCES.json'), JSON.stringify({ packageId: 'pkg', ownedOperationUnits: [] }));
  }
  return packageDir;
}

describe('collectMaterialArguments', () => {
  it('expands a directory to its files and keeps the top-level argument for the summary', () => {
    const packageDir = makePackage('walk');
    const docs = path.join(packageDir, 'docs');
    fs.mkdirSync(docs);
    fs.writeFileSync(path.join(docs, 'a.md'), 'a');
    fs.writeFileSync(path.join(docs, 'b.md'), 'b');

    const { materialPaths, materialSummary } = collectMaterialArguments([docs], packageDir);

    assert.deepEqual(materialPaths.sort(), [path.join(docs, 'a.md'), path.join(docs, 'b.md')].sort());
    assert.deepEqual(materialSummary, [{ path: docs, type: 'directory', fileCount: 2 }]);
  });

  it('refuses a missing argument and an empty directory by name', () => {
    const packageDir = makePackage('walk-errors');
    assert.throws(() => collectMaterialArguments(['missing.md'], packageDir), /Material path not found/);
    const empty = path.join(packageDir, 'empty');
    fs.mkdirSync(empty);
    assert.throws(() => collectMaterialArguments([empty], packageDir), /Empty material directory/);
  });
});

describe('resolveDrillMaterial', () => {
  it('C002 postcondition: discovered entries come first, arguments are appended, duplicates keep their first position', () => {
    const packageDir = makePackage('order', { readme: true, view: true });
    const notePath = path.join(packageDir, 'note.md');
    fs.writeFileSync(notePath, 'a design note');

    const answer = resolveDrillMaterial({
      packageDir,
      sessionDir: path.join(packageDir, 'drills'),
      arguments: [notePath, path.join(packageDir, 'README.md')],
      cwd: packageDir,
    });

    assert.equal(answer.resumed, false);
    assert.deepEqual(answer.discovered, [path.join(packageDir, 'README.md'), path.join(packageDir, 'SEQUENCES.md')]);
    assert.deepEqual(answer.addedArguments, [notePath]);
    assert.deepEqual(answer.materialPaths, [
      path.join(packageDir, 'README.md'),
      path.join(packageDir, 'SEQUENCES.md'),
      notePath,
    ]);
    assert.equal(new Set(answer.materialPaths).size, answer.materialPaths.length);
  });

  it('C002 invariant: an argument never removes a discovered path', () => {
    const packageDir = makePackage('subset', { readme: true, view: true });
    const answer = resolveDrillMaterial({
      packageDir,
      sessionDir: path.join(packageDir, 'drills'),
      arguments: [path.join(packageDir, 'README.md'), path.join(packageDir, 'SEQUENCES.md')],
      cwd: packageDir,
    });

    for (const discoveredPath of answer.discovered) {
      assert.ok(answer.materialPaths.includes(discoveredPath));
    }
    assert.deepEqual(answer.addedArguments, []);
  });

  it('C003 boundary: README and sequences presence branch independently', () => {
    const both = resolveDrillMaterial({ packageDir: makePackage('both', { readme: true, view: true }), sessionDir: path.join(tmpRoot, 'none'), arguments: [], cwd: tmpRoot });
    const neither = resolveDrillMaterial({ packageDir: makePackage('neither'), sessionDir: path.join(tmpRoot, 'none'), arguments: [], cwd: tmpRoot });

    assert.equal(both.readmePresent, true);
    assert.equal(both.sequencesPresent, true);
    assert.equal(neither.readmePresent, false);
    assert.equal(neither.sequencesPresent, false);
    assert.deepEqual(neither.materialPaths, []);
  });

  it('C002 normal: a resumed run reads the recorded list and does not reorder it', () => {
    const packageDir = makePackage('resume', { readme: true, view: true });
    const sessionDir = path.join(packageDir, 'drills');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'Status.json'), JSON.stringify({
      state: 'GRILLING',
      researchPath: '',
      rfcPath: '',
      rfcDir: '',
      reviewLoopCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      materialPaths: ['/recorded/b.md', '/recorded/a.md'],
    }));

    const answer = resolveDrillMaterial({ packageDir, sessionDir, arguments: ['/new/note.md'], cwd: tmpRoot });

    assert.equal(answer.resumed, true);
    assert.deepEqual(answer.materialPaths, ['/recorded/b.md', '/recorded/a.md']);
    assert.deepEqual(answer.addedArguments, []);
  });
});
