// PX-368 @verifies C001
// @verifies C002
// @verifies C003
// @verifies C006
// The integration point is the no-argument run: preflight discovers the optional inputs,
// session-init records them, and Step 5 writes COMPLETE from the report. README is absent
// on purpose; a package that has reached Tickets.json must be evolvable without it.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PREFLIGHT = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/preflight.cjs');
const SESSION_INIT = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/session-init.js');
const VERIFY_STEP = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/verify-step.js');

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'px368-no-arg-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** A package that has reached Tickets.json but not crystalize-readme. */
// [::TICKET::] PX-368 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-368 --for-spec --no-implementation-order`.
function makeEvolvablePackage(name) {
  const directory = path.join(tmpRoot, name);
  const srcDir = path.join(directory, 'src');
  fs.mkdirSync(path.join(srcDir, 'api'), { recursive: true });

  fs.writeFileSync(path.join(directory, 'RFC.md'), [
    '# Doc', '', '## Auth', '',
    '## Distribution ledger', '',
    'This document is canonical over the material it was written from.', '',
    '| Unit | Kind | Owner | RFC location | Ground |',
    '|---|---|---|---|---|',
    '| op-Produce | operation | pkg-0001 | §Auth | stated |',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(directory, 'SEQUENCES.md'), '# Sequences\n');
  fs.writeFileSync(path.join(directory, 'SEQUENCES.json'), JSON.stringify({
    packageId: 'pkg-0001',
    ownedOperationUnits: [{ unitId: 'op-Produce', operationId: 'Produce' }],
    ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [],
  }));
  fs.writeFileSync(path.join(directory, 'RFC-GRAPH.json'), JSON.stringify({
    sourceFile: 'RFC.md', mainLanguage: 'rust',
    nodes: [{ id: 'N0002', title: 'Auth module', summary: 'Auth', slug: 'auth', kind: 'api_contract', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['Auth'] }, { refId: 'REF003', heading: 2, texts: ['Distribution ledger'] }], language: 'rust', unitIds: ['op-Produce'] }],
    edges: [],
  }));
  fs.writeFileSync(path.join(srcDir, 'api', 'auth.rs'), [
    '// Initial Design Artifact — RFC-driven Implementation',
    '// Mapped node(s):',
    '//   - NODE_ID=N0002: Auth module',
    '// units: op-Produce',
    'pub fn auth() {}',
  ].join('\n'));
  fs.writeFileSync(path.join(directory, 'RFC-Dirs-Tree.json'), JSON.stringify({
    schemaVersion: 1, sourceGraph: 'RFC-GRAPH.json', sourceFile: 'RFC.md',
    trees: { rust: { name: 'src', type: 'directory', kind: 'root', children: [
      { name: 'api', type: 'directory', kind: 'architecture', mappedNodeIds: [], children: [
        { name: 'auth.rs', type: 'file', kind: 'api_contract', mappedNodeIds: [{ nodeId: 'N0002', title: 'Auth module' }] },
      ] },
    ] } },
    dependencyDirections: { rust: [] },
  }));
  fs.writeFileSync(path.join(directory, 'Tickets.json'), JSON.stringify({
    title: 'Evolution', round: 1,
    metadata: { source: 'RFC.md', resolvedPaths: { rfcPath: 'RFC.md', graphPath: 'RFC-GRAPH.json', dirsTreePath: 'RFC-Dirs-Tree.json' } },
    phases: [{ id: 0, name: 'Phase 0', tickets: [
      { id: 1, phaseId: 0, status: 'todo', title: 'Auth', nodeIds: ['N0002', 'op-Produce'], scope: [], testUnit: [], testIntegration: [], testExceptions: [], changes: [] },
    ] }],
  }));
  return directory;
}

describe('PX-368 no-argument evolution', () => {
  it('C001/C002/C003: zero-argument preflight discovers the view, records no README, and proceeds', () => {
    const directory = makeEvolvablePackage('no-readme');
    const result = spawnSync(process.execPath, [PREFLIGHT, '--tickets=Tickets.json'], { cwd: directory, encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /README_PRESENT=false/);
    assert.match(result.stdout, /SEQUENCES_PRESENT=true/);
    assert.match(result.stdout, /MATERIAL_PATHS=.*SEQUENCES\.md/);
    assert.doesNotMatch(result.stdout, /Missing files:/);
  });

  it('C006: the recorded run reaches COMPLETE from the per-package report', () => {
    const directory = makeEvolvablePackage('complete');
    const preflight = spawnSync(process.execPath, [PREFLIGHT, '--tickets=Tickets.json'], { cwd: directory, encoding: 'utf8' });
    assert.equal(preflight.status, 0, preflight.stderr);
    const materialLine = preflight.stdout.split('\n').find((line) => line.startsWith('MATERIAL_PATHS='));
    const materialPaths = materialLine.slice('MATERIAL_PATHS='.length);

    const rfcPath = path.join(directory, 'RFC.md');
    const init = spawnSync(process.execPath, [SESSION_INIT, rfcPath, `--material-paths=${materialPaths}`, '--readme-present=false', '--sequences-present=true'], { encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const sessionDir = JSON.parse(init.stdout).sessionDir;
    const status = JSON.parse(fs.readFileSync(path.join(sessionDir, 'Status.json'), 'utf8'));
    assert.equal(status.readmePresent, false);
    assert.ok(status.materialPaths.some((materialPath) => materialPath.endsWith('SEQUENCES.md')));

    const verify = spawnSync(process.execPath, [
      VERIFY_STEP,
      `--rfc=${rfcPath}`,
      `--graph=${path.join(directory, 'RFC-GRAPH.json')}`,
      `--dirs-tree=${path.join(directory, 'RFC-Dirs-Tree.json')}`,
      `--src=${path.join(directory, 'src')}`,
      '--tickets=Tickets.json',
      `--session-dir=${sessionDir}`,
    ], { cwd: directory, encoding: 'utf8' });

    assert.equal(verify.status, 0, verify.stdout + verify.stderr);
    const report = JSON.parse(fs.readFileSync(path.join(sessionDir, 'DRILL-REPORT.json'), 'utf8'));
    assert.equal(report.state, 'COMPLETE');
    assert.ok(report.p1.gates.every((gate) => gate.exitCode === 0));
  });
});
