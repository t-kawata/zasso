// PX-222 @verifies C001
// PX-222 @verifies C002
// PX-222 @verifies C003
// PX-222 @verifies C007
// PX-222 @verifies C008
// PX-222 @verifies C009
// PX-222 @verifies C010
// PX-224 @verifies C004
//
// `/explain-seed` is given one seed path and does everything else itself. It resolves the
// workspace, verifies every hash the artefacts record, writes the facts to
// `INFO-RFC-SEED.md` and prints the same bytes, and maintains `EXPLAIN-RFC-SEED.md` — a
// frame the AI fills, holding one place for the human to write wherever a human must
// decide. `check` is the gate that decides whether the AI may report.
//
// The workspace here is assembled from fixtures, so the suite never touches the real
// workspace the command was written for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXPLAIN_FILE_NAME,
  INFO_DOCUMENT_FILE_NAME,
  SPEC_FILE_NAME,
  TREE_MANIFEST_FILE_NAME,
  materializeExplainSeedWorkspace,
  snapshotWorkspace,
} from '../helpers/explain-seed-workspace.mjs';
import { fillAllButOneMarker, fillEveryMarker } from '../helpers/fill-frame.mjs';
import {
  MAX_DOCUMENT_CHARS,
} from '../../../.claude/scripts/explain-seed/lib/render.mjs';
import {
  ABSENT_RESIDUALS_STATEMENT,
  COUNT_LABEL,
  FRAME_SECTIONS,
  HUMAN_ITEM_HEADING,
  PARTY_LABEL,
} from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import { findHumanPlaceholders, findOpenMarkers, isPlaceholderLine } from '../../../.claude/scripts/explain-seed/lib/markers.mjs';

const RUN = fileURLToPath(new URL('../../../.claude/scripts/explain-seed/run.mjs', import.meta.url));
const HUMAN_NOTE = '人間の判断: 現場では拒否のほうが自然だと考える。';

/** Run the command and keep both sinks as bytes. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function runExplainSeed(argv, { cwd, env } = {}) {
  return spawnSync(process.execPath, [RUN, ...argv], {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    encoding: 'buffer',
  });
}

/** The ids a document cites, and the ids the manifests actually hold. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function citedIds(document) {
  return [...document.matchAll(/\b(?:contract-boundary|boundary|pkg|obj|claim|req)-\d{3,6}\b/g)].map((match) => match[0]);
}

// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function knownIds({ tree, allocate }) {
  return new Set([
    ...(tree.workspace?.packages ?? []).map((entry) => entry.id),
    ...(tree.inventory?.objects ?? []).map((entry) => entry.id),
    ...(tree.inventory?.claims ?? []).map((entry) => entry.id),
    ...(tree.inventory?.invariants ?? []).map((entry) => entry.id),
    ...(tree.inventory?.terms ?? []).map((entry) => entry.id),
    ...(tree.dependencies?.boundaries ?? []).map((entry) => entry.id),
    ...(allocate.contract_registry ?? []).map((entry) => entry.contract_id),
  ]);
}

/** The INFO and EXPLAIN of one workspace, as text. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function documentsOf(workspace) {
  return {
    info: readFileSync(workspace.infoPath, 'utf8'),
    explain: existsSync(workspace.explainPath) ? readFileSync(workspace.explainPath, 'utf8') : null,
  };
}

/** Put a person's own note under the first placeholder, the way an operator would. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function withHumanNote(documentText) {
  const lines = [];
  let written = false;
  for (const line of documentText.split('\n')) {
    lines.push(line);
    if (!written && isPlaceholderLine(line)) {
      lines.push(HUMAN_NOTE);
      written = true;
    }
  }
  return lines.join('\n');
}

/** Author the frame the way the AI does, and write it back. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function authorFrame(workspace) {
  const authored = fillEveryMarker(readFileSync(workspace.explainPath, 'utf8'));
  writeFileSync(workspace.explainPath, authored, 'utf8');
  return authored;
}

test('C001 precondition: the command is given one seed path and an operation, and nothing else', () => {
  const workspace = materializeExplainSeedWorkspace();
  const run = runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });

  assert.equal(run.status, 0, run.stderr.toString('utf8'));
});

test('C001 postcondition: the workspace root, the manifests and the specification are all resolved from the seed', () => {
  const workspace = materializeExplainSeedWorkspace();
  const run = runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  const { info } = documentsOf(workspace);

  assert.equal(run.status, 0, run.stderr.toString('utf8'));
  assert.ok(info.includes(workspace.root), 'the facts name the workspace root they resolved');
  assert.ok(info.includes(TREE_MANIFEST_FILE_NAME), 'the facts name the stage-one manifest');
  assert.ok(info.includes('WORKSPACIFY-ALLOCATE-MANIFEST.json'), 'the facts name the stage-two manifest');
  assert.ok(info.includes(SPEC_FILE_NAME), 'the facts name the specification');
  assert.match(info, new RegExp(workspace.manifests.tree.integrity.manifest_hash), 'the stage-one self-hash is stated');
});

test('C001 invariant: no environment variable can move the output or the inputs', () => {
  const workspace = materializeExplainSeedWorkspace();
  const plain = runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  const redirected = runExplainSeed(['info', workspace.seedPath], {
    cwd: workspace.root,
    env: { EXPLAIN_SEED_OUTPUT: join(tmpdir(), 'elsewhere.md'), EXPLAIN_SEED_MANIFEST: '/nope' },
  });

  assert.deepEqual(redirected.stdout, plain.stdout);
  assert.equal(redirected.status, plain.status);
  assert.equal(existsSync(join(tmpdir(), 'elsewhere.md')), false);
});

test('C001 postcondition: the facts reach two sinks and the explanation is a different artefact', () => {
  const workspace = materializeExplainSeedWorkspace();
  const run = runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  const { info, explain } = documentsOf(workspace);

  assert.deepEqual(readFileSync(workspace.infoPath), run.stdout, 'one rendering, two sinks');
  assert.match(info, /^# /, 'the facts open with a first-level heading');
  assert.notEqual(explain, null, 'the explanation is written beside the facts');
  assert.notDeepEqual(explain, info, 'the explanation is not the record');
});

test('C001 invariant: the facts are regenerated every run, so an edited INFO is not preserved', () => {
  const workspace = materializeExplainSeedWorkspace();
  runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  const first = readFileSync(workspace.infoPath, 'utf8');
  writeFileSync(workspace.infoPath, '# tampered\n', 'utf8');

  const second = runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });

  assert.equal(second.status, 0, second.stderr.toString('utf8'));
  assert.equal(readFileSync(workspace.infoPath, 'utf8'), first, 'the facts are regenerated, never merged with what was there');
  assert.deepEqual(readFileSync(workspace.infoPath), second.stdout);
});

test('C001 invariant: a seed that does not record every path it needs fails by field name and writes nothing', () => {
  const workspace = materializeExplainSeedWorkspace();
  const original = readFileSync(workspace.seedPath, 'utf8');
  writeFileSync(workspace.seedPath, original.replace('"stage1_manifest"', '"stage1_manifest_broken"'), 'utf8');

  const failed = runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });

  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr.toString('utf8'), /stage1_manifest/, 'the missing field is named');
  assert.equal(existsSync(workspace.infoPath), false);
  assert.equal(existsSync(workspace.explainPath), false);

  writeFileSync(workspace.seedPath, original, 'utf8');
});

test('C001 invariant: a seed that resolves no workspace at all fails rather than inventing one', () => {
  const workspace = materializeExplainSeedWorkspace();
  rmSync(join(workspace.root, TREE_MANIFEST_FILE_NAME));

  const failed = runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });

  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr.toString('utf8'), new RegExp(TREE_MANIFEST_FILE_NAME));
  assert.equal(existsSync(workspace.infoPath), false);
});

test('C002 postcondition: every id the facts cite resolves against a manifest', () => {
  const workspace = materializeExplainSeedWorkspace();
  runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  const { info } = documentsOf(workspace);
  const known = knownIds(workspace.manifests);
  const cited = citedIds(info);

  assert.ok(cited.length > 0, 'the facts cite the artefacts they describe');
  for (const id of cited) assert.ok(known.has(id), `${id} must resolve against a manifest`);
});

test('C002 postcondition: the specification is quoted at the range the manifest records', () => {
  const workspace = materializeExplainSeedWorkspace();
  runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  const { info } = documentsOf(workspace);
  const object = workspace.manifests.tree.inventory.objects[0];
  const reference = object.source_refs[0];
  const quoted = readFileSync(join(workspace.root, SPEC_FILE_NAME), 'utf8').slice(reference.byte_start, reference.byte_end);

  assert.ok(info.includes(object.canonical_name), 'the owned record is named');
  assert.ok(info.includes(quoted), 'the specification text is quoted verbatim');
  assert.match(info, new RegExp(`${reference.line_start}`), 'the quotation carries its line number');
});

test('C002 invariant: the facts carry no explanation vocabulary, so nothing in them explains or advises', () => {
  const workspace = materializeExplainSeedWorkspace();
  runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  const { info } = documentsOf(workspace);

  for (const banned of ['[::MUST-FILL::]', '<!-- 判断内容を人間が書き込む -->', PARTY_LABEL, COUNT_LABEL]) {
    assert.equal(info.includes(banned), false, `INFO must not contain ${banned}`);
  }
});

test('C002 invariant: the facts are English and the explanation is Japanese, in the documents a reader opens', () => {
  const workspace = materializeExplainSeedWorkspace();
  runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  const { info, explain } = documentsOf(workspace);
  const japaneseLine = /[぀-ヿ一-鿿]/;

  const authored = info
    .split('\n')
    .filter((line) => japaneseLine.test(line))
    .filter((line) => !line.startsWith('  > ') && !line.includes('`'));
  assert.deepEqual(authored, [], 'the only Japanese left in the facts is quoted data, never a sentence the tool wrote');
  assert.ok(japaneseLine.test(explain), 'the explanation is written in the language of the person reading it');
});

test('C002 postcondition: a package that owns nothing to report is told so, rather than left with an empty section', () => {
  const workspace = materializeExplainSeedWorkspace({ handoff: { ownsResiduals: false, recordsRiskyBoundaries: false } });
  runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  const { explain } = documentsOf(workspace);

  assert.ok(explain.includes(ABSENT_RESIDUALS_STATEMENT), 'the human-decision section states the absence in full');
});

test('C002 postcondition: the facts stay readable however much the package carries, and say what they trimmed', () => {
  const workspace = materializeExplainSeedWorkspace({ fixture: { scale: { extraObjects: 300, extraContracts: 40, clauseLength: 2000 } } });
  runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  const { info } = documentsOf(workspace);

  assert.ok(info.length <= MAX_DOCUMENT_CHARS, `the facts are ${info.length} characters, past the ${MAX_DOCUMENT_CHARS} a reader is asked to read`);
  assert.match(info, /…and \d+ more/, 'a trimmed list states how many entries it left out');
  assert.match(info, /…\(\d+ more characters omitted\)/, 'trimmed prose states how many characters it left out');
});

test('C002 invariant: a reference the manifest cannot resolve is a failure that names the missing record', () => {
  const workspace = materializeExplainSeedWorkspace();
  const manifestPath = join(workspace.root, TREE_MANIFEST_FILE_NAME);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const removed = manifest.inventory.objects[0];
  manifest.inventory.objects = manifest.inventory.objects.slice(1);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const failed = runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });

  assert.notEqual(failed.status, 0, 'an unresolvable reference is a failure, not a silent omission');
  assert.match(failed.stderr.toString('utf8'), new RegExp(removed.id), 'the missing record is named');
  assert.equal(existsSync(workspace.infoPath), false);
});

test('C003 postcondition: the frame carries its seven sections in order, all open, one placeholder per decision', () => {
  const workspace = materializeExplainSeedWorkspace();
  runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  const { explain } = documentsOf(workspace);
  const positions = FRAME_SECTIONS.map((section) => explain.indexOf(`## ${section.title}`));

  assert.ok(positions.every((position) => position >= 0), 'every frame section is present');
  assert.deepEqual([...positions].sort((left, right) => left - right), positions, 'in the declared order');
  assert.ok(findOpenMarkers(explain).length > 0, 'a fresh frame asks to be written');
  assert.equal(
    findHumanPlaceholders(explain).length,
    explain.split('\n').filter((line) => line.startsWith(HUMAN_ITEM_HEADING)).length,
    'one place for the human per item that asks them to decide',
  );
});

test('C007 postcondition: check exits 0 once every marker is resolved against the facts on disk', () => {
  const workspace = materializeExplainSeedWorkspace();
  runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  authorFrame(workspace);

  const verdict = runExplainSeed(['check', workspace.seedPath], { cwd: workspace.root });

  assert.equal(verdict.status, 0, verdict.stdout.toString('utf8') + verdict.stderr.toString('utf8'));
});

test('C007 postcondition: one marker left open fails, naming the section that holds it', () => {
  const workspace = materializeExplainSeedWorkspace();
  runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  const partial = fillAllButOneMarker(readFileSync(workspace.explainPath, 'utf8'), {
    after: `## ${FRAME_SECTIONS[1].title}`,
    marker: '[::MUST-FILL::] 検証用に残したマーカー',
  });
  writeFileSync(workspace.explainPath, partial, 'utf8');

  const verdict = runExplainSeed(['check', workspace.seedPath], { cwd: workspace.root });

  assert.notEqual(verdict.status, 0);
  assert.match(verdict.stdout.toString('utf8'), new RegExp(FRAME_SECTIONS[1].title), 'the offending section is named');
});

test('C007 postcondition: a recorded open item that disappeared fails, naming the id', () => {
  const workspace = materializeExplainSeedWorkspace({ handoff: { ownsResiduals: true } });
  runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  writeFileSync(workspace.explainPath, authorFrame(workspace).split('residual-000001').join('（記録なし）'), 'utf8');

  const verdict = runExplainSeed(['check', workspace.seedPath], { cwd: workspace.root });

  assert.notEqual(verdict.status, 0);
  assert.match(verdict.stdout.toString('utf8'), /residual-000001/, 'the id that vanished is named');
});

test('C007 postcondition: check reads the explanation and recomputes the facts, so it does not require the facts document', () => {
  const workspace = materializeExplainSeedWorkspace();
  runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  authorFrame(workspace);
  rmSync(workspace.infoPath);

  const verdict = runExplainSeed(['check', workspace.seedPath], { cwd: workspace.root });

  assert.equal(verdict.status, 0, 'the gate verifies against the manifests, not against a sibling document');
});

test('C007 precondition: check on a seed with no explanation at all fails, naming the path it looked for', () => {
  const workspace = materializeExplainSeedWorkspace();
  runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  rmSync(workspace.explainPath);

  const verdict = runExplainSeed(['check', workspace.seedPath], { cwd: workspace.root });

  assert.notEqual(verdict.status, 0);
  assert.match(verdict.stderr.toString('utf8'), new RegExp(EXPLAIN_FILE_NAME));
});

test('C008 postcondition: an unchanged re-run keeps every filled explanation and every human note', () => {
  const workspace = materializeExplainSeedWorkspace();
  runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  const authored = withHumanNote(authorFrame(workspace));
  writeFileSync(workspace.explainPath, authored, 'utf8');

  const second = runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  const { explain } = documentsOf(workspace);

  assert.equal(second.status, 0, second.stderr.toString('utf8'));
  assert.ok(explain.includes(HUMAN_NOTE), 'the human note survives an unchanged run');
  assert.equal(findOpenMarkers(explain).length, 0, 'a kept explanation is not re-opened for writing');
  assert.match(second.stderr.toString('utf8'), /kept 7, reopened 0/, 'the run reports what it kept and what it reopened');
});

test('C008 postcondition: a re-run after one fact moved reopens only the sections that rest on it', () => {
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
  const workspace = materializeExplainSeedWorkspace();
  runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  writeFileSync(workspace.explainPath, withHumanNote(authorFrame(workspace)), 'utf8');

  // One fact INFO 2 states moves: the second package sits in another layer, so the whole is now
  // two layers rather than one. Only INFO 2 states the layer count, so only the sections resting
  // on INFO 2 reopen. The published order is deliberately left alone here: an order that
  // disagreed with its own edges is refused outright rather than drawn, which is asserted below.
  const treePath = join(workspace.root, 'WORKSPACIFY-TREE-MANIFEST.json');
  const tree = JSON.parse(readFileSync(treePath, 'utf8'));
  tree.workspace.packages.find((entry) => entry.id === 'pkg-0002').layer = 'adapters';
  writeFileSync(treePath, `${JSON.stringify(tree, null, 2)}\n`, 'utf8');

  const third = runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  const { explain } = documentsOf(workspace);

  assert.equal(third.status, 0, third.stderr.toString('utf8'));
  assert.ok(explain.includes(HUMAN_NOTE), 'the human note is kept even where the facts moved');
  assert.match(third.stderr.toString('utf8'), /reopened 2/, 'the run reports how many sections it reopened');
  assert.match(third.stderr.toString('utf8'), new RegExp(FRAME_SECTIONS[1].title), 'and names the reopened section');
});

test('C004 invariant: an order that disagrees with its own edges is refused, and no document is written', () => {
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
  const workspace = materializeExplainSeedWorkspace();

  // The published order is reversed, so it no longer follows from the canonical edges. The
  // command reads its order from the tool that owns the rule, and that tool refuses to draw an
  // order it cannot derive — so this is a broken manifest, not a position to explain.
  const manifestPath = join(workspace.root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.implementation_order.levels = [['pkg-0002'], ['pkg-0001']];
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const refused = runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });

  assert.equal(refused.status, 1);
  assert.equal(refused.stdout.toString('utf8'), '', 'no facts are printed');
  assert.equal(refused.stderr.toString('utf8').trim().split('\n').length, 1, 'one line names the artefact');
  assert.match(refused.stderr.toString('utf8'), /^\[explain-seed\] .*implementation_order/);
  assert.equal(existsSync(workspace.infoPath), false);
  assert.equal(existsSync(workspace.explainPath), false);
});

test('C009 postcondition: a mismatch in any recorded hash is named and fails before anything is written', () => {
  const tamperCases = [
    {
      name: 'specification',
      tamper: (workspace) => writeFileSync(join(workspace.root, SPEC_FILE_NAME), `${readFileSync(join(workspace.root, SPEC_FILE_NAME), 'utf8')}\n<!-- drift -->\n`, 'utf8'),
      expected: /source_spec|specification/i,
    },
    {
      name: 'seed',
      tamper: (workspace) => writeFileSync(workspace.seedPath, readFileSync(workspace.seedPath, 'utf8').replace('Do not rewrite them.', 'Do not rewrite them!'), 'utf8'),
      expected: /seed_index|seed/i,
    },
    {
      name: 'stage-one manifest',
      tamper: (workspace) => {
        const path = join(workspace.root, TREE_MANIFEST_FILE_NAME);
        const manifest = JSON.parse(readFileSync(path, 'utf8'));
        manifest.integrity.manifest_hash = 'ab'.repeat(32);
        writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      },
      expected: /stage1_manifest|stage-one manifest/i,
    },
  ];

  for (const tamperCase of tamperCases) {
    const workspace = materializeExplainSeedWorkspace();
    const restore = snapshotWorkspace(workspace.root);
    try {
      tamperCase.tamper(workspace);
      const failed = runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });

      assert.notEqual(failed.status, 0, `${tamperCase.name} mismatch must fail`);
      assert.match(failed.stderr.toString('utf8'), tamperCase.expected, `${tamperCase.name} is named`);
      assert.equal(existsSync(workspace.infoPath), false, 'no facts are published from unverified inputs');
      assert.equal(existsSync(workspace.explainPath), false, 'no explanation is published from unverified inputs');
    } finally {
      restore();
      rmSync(`${workspace.root}.snapshot`, { recursive: true, force: true });
      rmSync(workspace.root, { recursive: true, force: true });
    }
  }
});

test('C010 postcondition: the facts are written in all four pre-existing cases, and the explanation is created or merged', () => {
  for (const pre of ['neither', 'info', 'explain', 'both']) {
    const workspace = materializeExplainSeedWorkspace();
    if (pre === 'info' || pre === 'both') writeFileSync(workspace.infoPath, '# stale\n', 'utf8');
    if (pre === 'explain' || pre === 'both') writeFileSync(workspace.explainPath, `## ${FRAME_SECTIONS[0].title}\n\n- 壊れた前回\n`, 'utf8');

    const run = runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });

    assert.equal(run.status, 0, `${pre}: ${run.stderr.toString('utf8')}`);
    assert.match(readFileSync(workspace.infoPath, 'utf8'), /^# /, `${pre}: the facts are written`);
    assert.ok(readFileSync(workspace.explainPath, 'utf8').includes(FRAME_SECTIONS[0].title), `${pre}: the frame is written`);
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

test('C010 invariant: an earlier document changes what is preserved and never what is verified', () => {
  const workspace = materializeExplainSeedWorkspace();
  writeFileSync(join(workspace.root, SPEC_FILE_NAME), `${readFileSync(join(workspace.root, SPEC_FILE_NAME), 'utf8')}\n<!-- drift -->\n`, 'utf8');

  const bare = runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });
  writeFileSync(workspace.explainPath, `## ${FRAME_SECTIONS[0].title}\n\n- 前回の説明\n`, 'utf8');
  const withPrevious = runExplainSeed(['info', workspace.seedPath], { cwd: workspace.root });

  assert.notEqual(bare.status, 0);
  assert.equal(withPrevious.status, bare.status, 'the same tampering fails the same way');
  assert.deepEqual(withPrevious.stderr, bare.stderr, 'an earlier document changes nothing about verification');
  assert.equal(existsSync(workspace.infoPath), false);
});
