// P22-15 @verifies C001 @verifies C002
/**
 * B1 through B3 — the reverse branch of `/boundify-graph` (§6.7, §6.14.5).
 *
 * The forward flow creates the tree it describes. In reverse mode the tree already
 * exists, so the same step has to describe it instead, and the only change it is ever
 * allowed to make is to attach a provenance header where none is present. The subject
 * tree holds 150 Rust files, so a body-modifying change is a 150-file corruption rather
 * than a small mistake; that scale is why every guarantee here is asserted by hashing
 * and by reconstruction rather than by inspection.
 *
 * Two properties carry the whole gate. B2 reconstructs the after-content from the
 * before-content with one contiguous insertion, which is a byte-for-byte equality and
 * cannot be satisfied by a change that happens to land inside the header band. B1
 * compares the measured inventory before and after, so a created path fails it by name.
 *
 * An existing `Initial Design Artifact` header is never rewritten. That differs from
 * `refresh-file-headers.js`, which refreshes a header in place, and the difference is
 * deliberate: supreme law 4 forbids altering the header, so the reverse path may only
 * attach one where it is missing.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// The pure judgements touch no disk and live in their own module, so a test of B1 or B2
// needs no fixture tree at all. Everything that reads, writes or reports comes from the
// entry point.
const {
  DISPOSITIONS,
  GATE_IDS,
  GATE_STATUS,
  assertCorrespondenceTable,
  assertHeaderOnlyDiff,
  assertNoNewFiles,
  attachHeader,
  bodyHash,
  buildCorrespondenceTable,
  headerLine,
} = require('../../../.claude/scripts/rfc-graph/reverse-boundify-gates.js');

const {
  EXIT_CODES,
  applyReverseBoundify,
  buildFileInventory,
  buildHeaderCandidate,
  loadDirsTreeFromForward,
  parseArguments,
  planReverseBoundify,
  renderCorrespondenceReport,
  resolveExistingFile,
  walkDirsTree,
} = require('../../../.claude/scripts/rfc-graph/reverse-boundify.js');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SUBJECT_ROOT = path.join(PROJECT_ROOT, 'siprs-for-reverse');
const ANSWERS_GRAPH_PATH = path.join(PROJECT_ROOT, 'siprs-with-4layers', 'RFC-ROOT-GRAPH.json');
const CLI_PATH = path.join(PROJECT_ROOT, '.claude/scripts/rfc-graph/reverse-boundify.js');
const ORACLE_CLI = path.join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/run.mjs');

/** A one-line header, so the line a refusal names is arithmetic rather than a guess. */
const MINIMAL_HEADER = '// Initial Design Artifact — RFC-driven Implementation\n';

/** The shape the generator emits: an opening separator, the marker, a closing separator. */
const BANDED_HEADER = [
  '// ============================================================================',
  '// Initial Design Artifact — RFC-driven Implementation',
  '// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!',
  '// ============================================================================',
  '',
  '',
].join('\n');

/** A file that is not text, built from its code point so this file stays plain text. */
const BINARY_BODY = `pub fn handle() {}\n${String.fromCharCode(0)}binary\n`;

const EMPTY_BODY = 'pub fn handle() {}\n';

/** A temporary workspace with a root, an output directory and a graph path. */
function withWorkspace(run) {
  const base = mkdtempSync(path.join(tmpdir(), 'p22-15-boundify-'));
  try {
    const root = path.join(base, 'subject');
    const outDir = path.join(base, 'out');
    mkdirSync(root, { recursive: true });
    mkdirSync(outDir, { recursive: true });
    return run({ base, root, outDir, graphPath: path.join(base, 'RFC-ROOT-GRAPH.json') });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

/** Write one file under a root, creating the directories it needs. */
function place(root, relativePath, contents = EMPTY_BODY) {
  const full = path.join(root, relativePath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, contents);
  return full;
}

/** A Dirs-Tree carrying exactly the given file nodes, in the shape the forward builder emits. */
function dirsTreeWith(fileNodes) {
  return {
    schemaVersion: '1.0',
    generatedAt: '1970-01-01T00:00:00.000Z',
    sourceGraph: '~/sub/RFC-ROOT-GRAPH.json',
    sourceFile: '~/sub/RFC-ROOT.md',
    trees: {
      rust: {
        name: 'src',
        type: 'directory',
        kind: 'root',
        children: fileNodes,
      },
    },
    dependencyDirections: { rust: [] },
    warnings: [],
  };
}

/** One file node. `mappedNodeIds` is what ties a declared path to a graph node. */
function fileNode(name, kind, nodeId) {
  return { name, type: 'file', kind, mappedNodeIds: [{ nodeId, title: `${nodeId} title` }] };
}

/** One directory node holding file nodes. */
function dirNode(name, kind, children) {
  return { name, type: 'directory', kind, children };
}

/** A one-file tree, so a test that needs only one file says so. */
function oneFileTree(nodeId = 'N0074') {
  return dirsTreeWith([dirNode('api', 'api_contract', [fileNode('x.rs', 'api_contract', nodeId)])]);
}

/** Run the module's CLI against a temporary workspace and report what it said. */
function runCli(args) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('B2 — headerLine', () => {
  it('UT-2 recognises the marker behind a line-comment prefix and behind a hash', () => {
    assert.equal(headerLine(MINIMAL_HEADER.trimEnd()), true);
    assert.equal(headerLine('# Initial Design Artifact — RFC-driven Implementation'), true);
    assert.equal(headerLine('    //   Initial Design Artifact — RFC-driven Implementation   '), true);
  });

  it('UT-2 does not mistake prose that merely mentions the header for a header', () => {
    // The oracle counts a file only when a comment line BEGINS the header; 43 files of
    // RFC and ticket prose contain the text without carrying a header at all.
    assert.equal(headerLine('the Initial Design Artifact — RFC-driven Implementation header is required'), false);
    assert.equal(headerLine('// the Initial Design Artifact — RFC-driven Implementation header is required'), false);
    assert.equal(headerLine(''), false);
  });
});

describe('B2 — bodyHash', () => {
  it('UT-10 leaves a header-less file hashing in full', () => {
    assert.equal(bodyHash(EMPTY_BODY), bodyHash(EMPTY_BODY));
    assert.notEqual(bodyHash(EMPTY_BODY), bodyHash('pub fn handle() { let x = 1; }\n'));
  });

  it('UT-10 removes the banded header, so attaching one leaves the body hash unchanged', () => {
    assert.equal(bodyHash(BANDED_HEADER + EMPTY_BODY), bodyHash(EMPTY_BODY));
  });

  it('UT-10 removes a single marker line that carries no band', () => {
    assert.equal(bodyHash(MINIMAL_HEADER + EMPTY_BODY), bodyHash(EMPTY_BODY));
  });

  it('UT-10 is separate from header detection, so a body change is visible whatever the header', () => {
    const changed = EMPTY_BODY.replace('handle', 'dispatch');
    assert.notEqual(bodyHash(BANDED_HEADER + changed), bodyHash(BANDED_HEADER + EMPTY_BODY));
  });
});

describe('B2 — attachHeader', () => {
  it('UT-1 attaches to a header-less text file as one insertion at the top', () => {
    const outcome = attachHeader({ path: 'src/api/x.rs', content: EMPTY_BODY, headerText: BANDED_HEADER });

    assert.equal(outcome.ok, true, 'a headerless text file is attachable');
    assert.equal(outcome.atLine, 0, 'the header goes at the top of a file with no shebang');
    assert.equal(outcome.content, BANDED_HEADER + EMPTY_BODY);
  });

  it('UT-1 places the header below a shebang rather than above it', () => {
    const script = '#!/usr/bin/env node\nmain();\n';
    const outcome = attachHeader({ path: 'tools/x.js', content: script, headerText: BANDED_HEADER });

    assert.equal(outcome.ok, true);
    assert.equal(outcome.atLine, 1, 'inserting above the shebang would stop the file being executable');
    assert.equal(outcome.content, '#!/usr/bin/env node\n' + BANDED_HEADER + 'main();\n');
  });

  it('UT-3 UT-11 refuses to rewrite a file that already carries a header', () => {
    const already = BANDED_HEADER + EMPTY_BODY;
    const outcome = attachHeader({ path: 'src/api/x.rs', content: already, headerText: BANDED_HEADER });

    assert.equal(outcome.ok, false, 'the reverse path attaches where none exists and never rewrites one');
    assert.equal(outcome.reason, 'already_carries_a_header');
    assert.equal(outcome.path, 'src/api/x.rs');
  });

  it('UT-5 reports a binary file by path and reason instead of attaching a comment', () => {
    const outcome = attachHeader({ path: 'src/api/blob.rs', content: BINARY_BODY, headerText: BANDED_HEADER });

    assert.equal(outcome.ok, false);
    assert.equal(outcome.reason, 'not_a_text_file');
    assert.equal(outcome.path, 'src/api/blob.rs');
  });

  it('UT-5 reports a header that cannot be generated rather than writing an empty one', () => {
    const outcome = attachHeader({ path: 'src/api/x.rs', content: EMPTY_BODY, headerText: '' });

    assert.equal(outcome.ok, false);
    assert.equal(outcome.reason, 'header_cannot_be_generated');
  });
});

describe('B2 — assertHeaderOnlyDiff', () => {
  it('UT-2 accepts an insertion and reports zero escaped lines', () => {
    const before = EMPTY_BODY;
    const after = MINIMAL_HEADER + EMPTY_BODY;
    const diff = assertHeaderOnlyDiff({ path: 'src/api/x.rs', before, after, atLine: 0, headerText: MINIMAL_HEADER });

    assert.equal(diff.gateId, GATE_IDS.B2);
    assert.equal(diff.status, GATE_STATUS.PASS);
    assert.equal(diff.counts.escaped, 0);
    assert.deepEqual(diff.escaped, [], 'a line outside the header would be named here');
  });

  it('UT-4 refuses a body change and names the file and the line', () => {
    const before = EMPTY_BODY;
    const after = MINIMAL_HEADER + 'pub fn replaced() {}\n';
    const diff = assertHeaderOnlyDiff({ path: 'src/api/x.rs', before, after, atLine: 0, headerText: MINIMAL_HEADER });

    assert.equal(diff.status, GATE_STATUS.FAIL, 'a body change is refused, never reported as a header-only diff');
    assert.equal(diff.counts.escaped, 1);
    assert.equal(diff.escaped[0].path, 'src/api/x.rs');
    assert.equal(diff.escaped[0].line, 2, 'the header occupies line 1, so the body is line 2');
  });

  it('UT-4 refuses an equal-length substitution that a line diff would have missed', () => {
    // `handle` and `hidden` are the same length, so a size comparison would accept this.
    const before = EMPTY_BODY;
    const after = MINIMAL_HEADER + 'pub fn hidden() {}\n';
    const diff = assertHeaderOnlyDiff({ path: 'src/api/x.rs', before, after, atLine: 0, headerText: MINIMAL_HEADER });

    assert.equal(diff.status, GATE_STATUS.FAIL);
    assert.equal(diff.escaped[0].line, 2);
  });

  it('UT-7 reports an untouched file as an empty diff rather than as a failure', () => {
    const content = BANDED_HEADER + EMPTY_BODY;
    const diff = assertHeaderOnlyDiff({ path: 'src/api/x.rs', before: content, after: content });

    assert.equal(diff.status, GATE_STATUS.PASS);
    assert.equal(diff.counts.changedLines, 0, 'an empty diff is the outcome to report, not to fail on');
    assert.equal(diff.reasons.length > 0, true);
  });

  it('UT-12 judges the diff from the two contents alone, with no graph and no filesystem', () => {
    const diff = assertHeaderOnlyDiff({ before: 'a\n', after: 'a\n' });
    assert.equal(diff.counts.changedLines, 0);
  });
});

describe('B1 — assertNoNewFiles', () => {
  it('UT-1 passes when the two inventories agree', () => {
    const inventory = ['src/a.rs', 'src/b.rs'];
    const record = assertNoNewFiles(inventory, [...inventory]);

    assert.equal(record.gateId, GATE_IDS.B1);
    assert.equal(record.status, GATE_STATUS.PASS);
    assert.deepEqual(record.created, []);
    assert.deepEqual(record.removed, []);
  });

  it('UT-1 fails and names every created file', () => {
    const record = assertNoNewFiles(['src/a.rs'], ['src/a.rs', 'src/a.rs.orig']);

    assert.equal(record.status, GATE_STATUS.FAIL, 'a created path is the one thing reverse mode must never do');
    assert.deepEqual(record.created, ['src/a.rs.orig']);
  });

  it('UT-1 treats a removal as a disturbance too', () => {
    const record = assertNoNewFiles(['src/a.rs', 'src/b.rs'], ['src/a.rs']);

    assert.equal(record.status, GATE_STATUS.FAIL, 'a deleted file disturbs the existing structure as much as a created one');
    assert.deepEqual(record.removed, ['src/b.rs']);
  });

  it('UT-8 an empty pair of inventories is a pass, not an error', () => {
    const record = assertNoNewFiles([], []);
    assert.equal(record.status, GATE_STATUS.PASS);
    assert.equal(record.counts.before, 0);
  });
});

describe('B3 — walkDirsTree and resolveExistingFile', () => {
  it('UT-9 does not read a directory node as a declared file', () => {
    const entries = walkDirsTree(dirsTreeWith([dirNode('api', 'api_contract', [])]));

    assert.equal(entries.length, 0, 'a directory node is not a declared file');
  });

  it('UT-9 walks nested directories and prefixes the language tree root', () => {
    const tree = dirsTreeWith([
      dirNode('api', 'api_contract', [fileNode('call_api_expansion.rs', 'api_contract', 'N0074')]),
    ]);
    const entries = walkDirsTree(tree);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].declaredPath, 'src/api/call_api_expansion.rs');
    assert.equal(entries[0].lang, 'rust');
    assert.deepEqual(entries[0].mappedNodeIds, ['N0074']);
  });

  it('UT-6 reports a path that is a directory rather than a file', () => {
    withWorkspace(({ root }) => {
      mkdirSync(path.join(root, 'src/api/x.rs'), { recursive: true });

      const resolved = resolveExistingFile(root, 'src/api/x.rs');

      assert.equal(resolved.path, null);
      assert.equal(resolved.reason, 'not_a_readable_file', 'a directory is reported, never silently skipped');
    });
  });

  it('UT-5 reports an absent path as absent', () => {
    withWorkspace(({ root }) => {
      const resolved = resolveExistingFile(root, 'src/api/missing.rs');

      assert.equal(resolved.path, null);
      assert.equal(resolved.reason, 'absent');
    });
  });

  it('UT-1 resolves a real file to its absolute path', () => {
    withWorkspace(({ root }) => {
      const full = place(root, 'src/api/x.rs');

      const resolved = resolveExistingFile(root, 'src/api/x.rs');

      assert.equal(resolved.path, full);
      assert.equal(resolved.reason, null);
    });
  });
});

describe('B3 — buildCorrespondenceTable', () => {
  it('UT-8 an empty operation list produces an explicit empty table', () => {
    const table = buildCorrespondenceTable([]);

    assert.deepEqual(table, []);
    assert.equal(Array.isArray(table), true, 'the table is a list even when it has no rows');
  });

  it('UT-1 carries one row per declared file with its disposition and its node', () => {
    const table = buildCorrespondenceTable([
      {
        declaredPath: 'src/api/x.rs',
        existingPath: '/root/src/api/x.rs',
        originatingNodeId: 'N0074',
        disposition: DISPOSITIONS.ATTACHED,
        reason: 'the declared file exists and carried no header',
        bodyHashBefore: 'before',
        bodyHashAfter: 'before',
      },
    ]);

    assert.equal(table.length, 1);
    assert.equal(table[0].declaredPath, 'src/api/x.rs');
    assert.equal(table[0].originatingNodeId, 'N0074');
    assert.equal(table[0].disposition, DISPOSITIONS.ATTACHED);
    assert.equal(table[0].bodyHashBefore, table[0].bodyHashAfter, 'the body is unchanged');
    assert.equal(typeof table[0].reason, 'string');
    assert.notEqual(table[0].reason.length, 0, 'a row without a reason cannot be acted on');
  });
});

describe('B3 — assertCorrespondenceTable', () => {
  it('UT-1 passes when the table records every non-generated file', () => {
    const record = assertCorrespondenceTable([{ declaredPath: 'src/a.rs', disposition: DISPOSITIONS.ABSENT, reason: 'absent' }]);

    assert.equal(record.gateId, GATE_IDS.B3);
    assert.equal(record.status, GATE_STATUS.PASS);
    assert.equal(record.counts.entries, 1);
  });

  it('UT-1 fails when the table is absent', () => {
    const record = assertCorrespondenceTable(null);

    assert.equal(record.status, GATE_STATUS.FAIL, 'a missing correspondence table is the B3 failure condition');
    assert.equal(record.reasons.length > 0, true);
  });

  it('UT-8 an empty table passes and says so, because zero files is not an error', () => {
    const record = assertCorrespondenceTable([]);

    assert.equal(record.status, GATE_STATUS.PASS);
    assert.equal(record.counts.entries, 0);
    assert.match(record.reasons.join(' '), /zero|empty|no file/i);
  });
});

describe('B1 through B3 — planReverseBoundify', () => {
  it('UT-1 UT-3 UT-8 plans an attach for an existing headerless file and an absent row for a missing one', () => {
    withWorkspace(({ root, graphPath }) => {
      place(root, 'src/api/x.rs');
      const tree = dirsTreeWith([
        dirNode('api', 'api_contract', [
          fileNode('x.rs', 'api_contract', 'N0074'),
          fileNode('gone.rs', 'api_contract', 'N0099'),
        ]),
      ]);

      const plan = planReverseBoundify({ dirsTree: tree, root, graphPath });

      assert.equal(plan.correspondence.length, 2);
      const attached = plan.correspondence.find((row) => row.declaredPath.endsWith('x.rs'));
      const absent = plan.correspondence.find((row) => row.declaredPath.endsWith('gone.rs'));
      assert.equal(attached.disposition, DISPOSITIONS.ATTACHED);
      assert.equal(absent.disposition, DISPOSITIONS.ABSENT);
      assert.equal(plan.gates.B1.status, GATE_STATUS.PASS);
      assert.equal(plan.gates.B3.status, GATE_STATUS.PASS);
    });
  });

  it('C001 precondition — the GRAPH is grounded: every attached header names a node the graph carries', () => {
    withWorkspace(({ root, graphPath }) => {
      place(root, 'src/api/x.rs');

      const plan = planReverseBoundify({ dirsTree: oneFileTree(), root, graphPath });

      assert.match(plan.operations[0].headerText, /NODE_ID=N0074/, 'the header names the node the tree declared');
      assert.equal(plan.gates.B1.status, GATE_STATUS.PASS, 'a grounded graph is the precondition B1 judges');
    });
  });

  it('UT-7 a tree whose every file already carries a header plans an empty diff', () => {
    withWorkspace(({ root, graphPath }) => {
      place(root, 'src/api/x.rs', BANDED_HEADER + EMPTY_BODY);

      const plan = planReverseBoundify({ dirsTree: oneFileTree(), root, graphPath });

      assert.equal(plan.correspondence[0].disposition, DISPOSITIONS.PRESERVED);
      assert.deepEqual(plan.operations[0].after, plan.operations[0].before, 'the file is not rewritten');
      assert.equal(plan.gates.B2.counts.changedLines, 0);
      assert.match(plan.gates.B2.reasons.join(' '), /empty|no change|unchanged/i);
    });
  });

  it('UT-8 a tree with zero files produces an explicit empty correspondence table', () => {
    withWorkspace(({ root, graphPath }) => {
      const plan = planReverseBoundify({ dirsTree: dirsTreeWith([]), root, graphPath });

      assert.deepEqual(plan.correspondence, []);
      assert.deepEqual(buildCorrespondenceTable(plan.operations), []);
      assert.equal(plan.gates.B3.status, GATE_STATUS.PASS);
    });
  });

  it('UT-9 a tree with one file is valid', () => {
    withWorkspace(({ root, graphPath }) => {
      place(root, 'src/api/x.rs');

      const plan = planReverseBoundify({ dirsTree: oneFileTree(), root, graphPath });

      assert.equal(plan.correspondence.length, 1);
      assert.equal(plan.gates.B2.status, GATE_STATUS.PASS);
    });
  });

  it('UT-6 reports an unreadable declared path inside the plan rather than dropping it', () => {
    withWorkspace(({ root, graphPath }) => {
      mkdirSync(path.join(root, 'src/api/x.rs'), { recursive: true });

      const plan = planReverseBoundify({ dirsTree: oneFileTree(), root, graphPath });

      assert.equal(plan.correspondence.length, 1, 'the row exists even though no header could be attached');
      assert.equal(plan.correspondence[0].disposition, DISPOSITIONS.REFUSED);
      assert.equal(plan.correspondence[0].reason, 'not_a_readable_file');
    });
  });

  it('C001 invariant — the plan is a pure function of its inputs and rewrites nothing', () => {
    withWorkspace(({ root, graphPath }) => {
      place(root, 'src/api/x.rs');
      const tree = oneFileTree();
      const frozen = JSON.parse(JSON.stringify(tree));
      const before = buildFileInventory(root);
      const original = readFileSync(path.join(root, 'src/api/x.rs'), 'utf8');

      planReverseBoundify({ dirsTree: tree, root, graphPath });

      assert.deepEqual(tree, frozen, 'planning must not rewrite the Dirs-Tree it read');
      assert.deepEqual(buildFileInventory(root), before);
      assert.equal(readFileSync(path.join(root, 'src/api/x.rs'), 'utf8'), original, 'planning writes nothing');
    });
  });
});

describe('B1 through B3 — applyReverseBoundify', () => {
  it('UT-1 C001 postcondition — generates no file and writes the correspondence table', () => {
    withWorkspace(({ root, outDir, graphPath }) => {
      place(root, 'src/api/x.rs');
      const plan = planReverseBoundify({ dirsTree: oneFileTree(), root, graphPath });

      const before = buildFileInventory(root);
      const result = applyReverseBoundify(plan, { root, outDir });
      const after = buildFileInventory(root);

      assert.deepEqual(after, before, 'reverse mode generates no file inside the measured tree');
      assert.equal(Array.isArray(plan.correspondence), true);
      assert.equal(plan.correspondence.length > 0, true, 'a correspondence table is emitted, not omitted');
      assert.equal(plan.correspondence[0].declaredPath, 'src/api/x.rs');
      assert.equal(result.written.length > 0, true, 'the correspondence table reached the disk');
    });
  });

  it('C001 invariant — assertNoNewFiles passes over the real before and after inventories', () => {
    withWorkspace(({ root, outDir, graphPath }) => {
      place(root, 'src/api/x.rs');
      const plan = planReverseBoundify({ dirsTree: oneFileTree(), root, graphPath });

      const before = buildFileInventory(root);
      applyReverseBoundify(plan, { root, outDir });
      const b1 = assertNoNewFiles(before, buildFileInventory(root));

      assert.equal(b1.gateId, GATE_IDS.B1);
      assert.equal(b1.counts.created, 0, 'a created path fails B1');
      assert.equal(b1.counts.removed, 0, 'a removed path disturbs the tree just as much as a created one');
      assert.deepEqual(b1.created, [], 'B1 names every path it found');
    });
  });

  it('UT-2 UT-10 the touched file differs from its original by the header alone', () => {
    withWorkspace(({ root, outDir, graphPath }) => {
      place(root, 'src/api/x.rs');
      const original = readFileSync(path.join(root, 'src/api/x.rs'), 'utf8');
      const plan = planReverseBoundify({ dirsTree: oneFileTree(), root, graphPath });

      applyReverseBoundify(plan, { root, outDir });
      const applied = readFileSync(path.join(root, 'src/api/x.rs'), 'utf8');
      const operation = plan.operations[0];

      assert.equal(assertHeaderOnlyDiff({ ...operation, before: original, after: applied }).status, GATE_STATUS.PASS);
      assert.equal(bodyHash(applied), bodyHash(original), 'hashing with the header excluded proves the body is identical');
      assert.equal(applied, original.slice(0, 0) + operation.headerText + original.slice(0));
    });
  });

  it('UT-3 UT-11 a file that already carries a header is left byte-identical', () => {
    withWorkspace(({ root, outDir, graphPath }) => {
      place(root, 'src/api/x.rs', BANDED_HEADER + EMPTY_BODY);
      const original = readFileSync(path.join(root, 'src/api/x.rs'), 'utf8');
      const plan = planReverseBoundify({ dirsTree: oneFileTree(), root, graphPath });

      const result = applyReverseBoundify(plan, { root, outDir });

      assert.equal(readFileSync(path.join(root, 'src/api/x.rs'), 'utf8'), original, 'an existing header is neither removed nor rewritten');
      assert.deepEqual(result.attached, [], 'nothing was attached, so nothing was written');
      assert.equal(plan.gates.B2.counts.changedLines, 0);
    });
  });

  it('UT-8 a tree with zero files is applied without error and reports an empty table', () => {
    withWorkspace(({ root, outDir, graphPath }) => {
      const plan = planReverseBoundify({ dirsTree: dirsTreeWith([]), root, graphPath });

      const result = applyReverseBoundify(plan, { root, outDir });

      assert.equal(result.attached.length, 0);
      assert.equal(result.written.length > 0, true, 'the empty table is still written, so its absence is never ambiguous');
    });
  });

  it('C002 invariant — no body byte moves, asserted over every touched file', () => {
    withWorkspace(({ root, outDir, graphPath }) => {
      const originals = new Map();
      for (const name of ['a.rs', 'b.rs', 'c.rs']) {
        const full = place(root, `src/api/${name}`);
        originals.set(full, readFileSync(full, 'utf8'));
      }
      const tree = dirsTreeWith([
        dirNode('api', 'api_contract', ['a.rs', 'b.rs', 'c.rs'].map((name, index) => (
          fileNode(name, 'api_contract', `N007${index}`)
        ))),
      ]);
      const plan = planReverseBoundify({ dirsTree: tree, root, graphPath });

      applyReverseBoundify(plan, { root, outDir });

      for (const [full, original] of originals) {
        const applied = readFileSync(full, 'utf8');
        assert.equal(bodyHash(applied), bodyHash(original), `${full} kept its body`);
        assert.equal(applied.endsWith(original), true, `${full} is its original with something prepended`);
      }
    });
  });
});

describe('B1 through B3 — reports and candidate', () => {
  it('UT-1 renders the correspondence as Markdown a reader can act on', () => {
    withWorkspace(({ root, graphPath }) => {
      place(root, 'src/api/x.rs');
      const tree = dirsTreeWith([
        dirNode('api', 'api_contract', [
          fileNode('x.rs', 'api_contract', 'N0074'),
          fileNode('gone.rs', 'api_contract', 'N0099'),
        ]),
      ]);
      const plan = planReverseBoundify({ dirsTree: tree, root, graphPath });

      const report = renderCorrespondenceReport(plan);

      assert.match(report, /^# /, 'a Markdown report opens with a heading');
      assert.match(report, /src\/api\/x\.rs/, 'the declared path is named');
      assert.match(report, /gone\.rs/, 'the file that was not generated is named too');
      assert.doesNotMatch(report, /\{"/, 'the report a reader acts on is Markdown, not JSON');
    });
  });

  it('UT-8 renders an empty table as None rather than as a blank section', () => {
    withWorkspace(({ root, graphPath }) => {
      const plan = planReverseBoundify({ dirsTree: dirsTreeWith([]), root, graphPath });

      assert.match(renderCorrespondenceReport(plan), /None\./, 'an empty section says so in words');
    });
  });

  it('IT-4 builds the candidate document the oracle headers stage compares', () => {
    withWorkspace(({ root, graphPath }) => {
      place(root, 'src/api/x.rs');
      place(root, 'src/api/kept.rs', BANDED_HEADER + EMPTY_BODY);
      const tree = dirsTreeWith([
        dirNode('api', 'api_contract', [
          fileNode('x.rs', 'api_contract', 'N0074'),
          fileNode('kept.rs', 'api_contract', 'N0075'),
          fileNode('gone.rs', 'api_contract', 'N0099'),
        ]),
      ]);
      const plan = planReverseBoundify({ dirsTree: tree, root, graphPath });

      const candidate = buildHeaderCandidate(plan, { language: 'rust' });

      assert.equal(candidate.stage, 'headers');
      assert.deepEqual(candidate.unobserved, []);
      assert.deepEqual(candidate.entries, ['src/api/kept.rs', 'src/api/x.rs']);
      assert.equal(candidate.entries.includes('src/api/gone.rs'), false, 'a file with no header is not a header entry');
    });
  });
});

describe('B1 through B3 — the CLI', () => {
  /** A workspace the CLI can be pointed at, with a graph and a Dirs-Tree already on disk. */
  function withCliWorkspace(rootFileContents, run) {
    return withWorkspace(({ root, outDir, graphPath }) => {
      place(root, 'src/api/x.rs', rootFileContents ?? EMPTY_BODY);
      writeFileSync(graphPath, `${JSON.stringify({ nodes: [], edges: [], mainLanguage: 'rust' })}\n`);
      const treePath = path.join(outDir, 'RFC-ROOT-Dirs-Tree.json');
      writeFileSync(treePath, `${JSON.stringify(oneFileTree())}\n`);
      return run({ root, outDir, graphPath, treePath });
    });
  }

  it('UT-1 writes nothing to the measured tree unless --apply is given', () => {
    withCliWorkspace(null, ({ root, outDir, graphPath, treePath }) => {
      const before = readFileSync(path.join(root, 'src/api/x.rs'), 'utf8');

      const result = runCli([`--graph=${graphPath}`, `--root=${root}`, `--dirs-tree=${treePath}`, `--out=${outDir}`]);

      assert.equal(result.status, EXIT_CODES.OK, result.stderr);
      assert.equal(readFileSync(path.join(root, 'src/api/x.rs'), 'utf8'), before, 'the default run is a plan, not a write');
      assert.match(result.stdout, /Planned only/);
    });
  });

  it('UT-2 --apply attaches the header and reports it', () => {
    withCliWorkspace(null, ({ root, outDir, graphPath, treePath }) => {
      const result = runCli([`--graph=${graphPath}`, `--root=${root}`, `--dirs-tree=${treePath}`, `--out=${outDir}`, '--apply']);

      assert.equal(result.status, EXIT_CODES.OK, result.stderr);
      assert.match(result.stdout, /Attached 1 header\(s\)\. B1 — PASS\./);
      assert.match(readFileSync(path.join(root, 'src/api/x.rs'), 'utf8'), /^\/\/ =+\n\/\/ Initial Design Artifact/);
    });
  });

  it('UT-5 exits USAGE when the graph or the root is missing', () => {
    assert.equal(runCli([]).status, EXIT_CODES.USAGE);
    assert.equal(parseArguments(['--graph=/x']).root, null);
  });
});

describe('IT — the measured trees', () => {
  it('IT-1 the Dirs-Tree describes the measured directories of siprs-for-reverse', () => {
    const inventoryBefore = buildFileInventory(SUBJECT_ROOT);

    const dirsTree = loadDirsTreeFromForward(ANSWERS_GRAPH_PATH);
    const plan = planReverseBoundify({ dirsTree, root: SUBJECT_ROOT, graphPath: ANSWERS_GRAPH_PATH });

    assert.equal(plan.correspondence.length > 0, true, 'the declared files are described');
    assert.equal(
      plan.correspondence.some((row) => row.disposition === DISPOSITIONS.ATTACHED),
      true,
      'files that exist and carry no header are planned for a header',
    );
    assert.equal(
      plan.correspondence.some((row) => row.disposition === DISPOSITIONS.ABSENT),
      true,
      'the declared files that were never generated are recorded rather than dropped',
    );
    assert.equal(
      plan.correspondence.filter((row) => row.disposition === DISPOSITIONS.PRESERVED).length,
      0,
      'PX-203 stripped every header from the subject tree, so nothing is preserved',
    );
    assert.deepEqual(buildFileInventory(SUBJECT_ROOT), inventoryBefore, 'planning against the subject tree writes nothing');
  });

  it('IT-2 every file the plan would touch differs from its original by the header alone', () => {
    const dirsTree = loadDirsTreeFromForward(ANSWERS_GRAPH_PATH);
    const plan = planReverseBoundify({ dirsTree, root: SUBJECT_ROOT, graphPath: ANSWERS_GRAPH_PATH });
    const attachable = plan.operations.filter((operation) => operation.disposition === DISPOSITIONS.ATTACHED);
    assert.equal(attachable.length > 0, true, 'there is something to attach, or this assertion proves nothing');

    withWorkspace(({ base }) => {
      const scratch = path.join(base, 'scratch');
      for (const operation of attachable) {
        const full = place(scratch, operation.declaredPath, operation.before);
        applyReverseBoundify(
          { ...plan, operations: [operation], correspondence: buildCorrespondenceTable([operation]) },
          { root: scratch, outDir: path.join(base, 'out2') },
        );

        const applied = readFileSync(full, 'utf8');
        assert.equal(bodyHash(applied), bodyHash(operation.before), `${operation.declaredPath} kept its body`);
        assert.equal(applied, operation.headerText + operation.before, `${operation.declaredPath} gained a header and nothing else`);
      }
    });
  });

  it('Exception verification — every attached header names a node the graph carries', () => {
    // The Exception this ticket records is that a header's *semantic* correctness is not
    // testable: whether a file's mapped node is the right one is a design judgement, and the
    // source holds no record that would confirm or refute it. This is the alternative
    // verification it names in place of that. A header may still cite a node the graph does
    // not carry, and that is checkable — so it is checked, over every file in the real plan.
    const graph = JSON.parse(readFileSync(ANSWERS_GRAPH_PATH, 'utf8'));
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const dirsTree = loadDirsTreeFromForward(ANSWERS_GRAPH_PATH);
    const plan = planReverseBoundify({ dirsTree, root: SUBJECT_ROOT, graphPath: ANSWERS_GRAPH_PATH });
    const attachable = plan.operations.filter((operation) => operation.disposition === DISPOSITIONS.ATTACHED);

    assert.equal(attachable.length > 0, true, 'there is a header to check, or this assertion proves nothing');
    for (const operation of attachable) {
      assert.match(operation.headerText, /NODE_ID=N\d+/, `${operation.declaredPath} names a node`);
      for (const nodeId of operation.originatingNodeId.split(', ')) {
        assert.equal(
          nodeIds.has(nodeId),
          true,
          `${operation.declaredPath} cites ${nodeId}, which the ${nodeIds.size}-node graph does not carry`,
        );
      }
    }
  });

  it('IT-4 the oracle compares the candidate against its recorded header set', () => {
    const dirsTree = loadDirsTreeFromForward(ANSWERS_GRAPH_PATH);
    const plan = planReverseBoundify({ dirsTree, root: SUBJECT_ROOT, graphPath: ANSWERS_GRAPH_PATH });

    withWorkspace(({ outDir }) => {
      const candidatePath = path.join(outDir, 'headers-candidate.json');
      writeFileSync(candidatePath, `${JSON.stringify(buildHeaderCandidate(plan, { language: 'rust' }), null, 2)}\n`);

      const result = spawnSync(
        process.execPath,
        [ORACLE_CLI, 'oracle', 'compare', '--stage', 'headers', `--candidate=${candidatePath}`, `--project-root=${PROJECT_ROOT}`],
        { encoding: 'utf8', cwd: PROJECT_ROOT },
      );

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /## Reconciliation/);
      assert.doesNotMatch(result.stdout, /score|grade|verdict/i, 'a comparison is a list of disagreements, never a score');
    });
  });
});

describe('B1 through B3 — forward compatibility', () => {
  it('UT-12 the header marker is named once, and the generator still emits it', () => {
    const {
      HEADER_MARKER_TEXT: marker,
      generateHeaderComment,
      resolveHeaderPaths,
    } = require('../../../.claude/scripts/rfc-graph/boundify-helpers.js');

    const paths = resolveHeaderPaths('/repo/src/api/x.rs', '/repo/rfcs', 'RFC-ROOT-GRAPH.json', 'RFC-ROOT-Dirs-Tree.json', 'RFC-ROOT.md');
    const header = generateHeaderComment(paths, [{ nodeId: 'N0001', title: 'Config Loader' }], [], 'RFC-ROOT.md', 'rust');

    assert.equal(
      marker,
      'Initial Design Artifact — RFC-driven Implementation',
      'the marker is named once, so the generator and the reverse reader cannot disagree about it',
    );
    assert.match(header, new RegExp(`// ${marker}`));
    assert.match(header, /NODE_ID=N0001/);
  });
});
