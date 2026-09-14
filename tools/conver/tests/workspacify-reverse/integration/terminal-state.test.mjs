// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
/**
 * The chain that produces the fifth layer, driven over the four pattern
 * representatives and over a subject it can actually ground.
 *
 * This is the observation design §7.3 records as unmeasured: "Nobody has ever
 * observed a project reaching the terminal state through the reverse rotation."
 * It runs the chain and measures the result against §2.3's declared inventory —
 * never against the exit codes, because an exit code is evidence that a program
 * finished and not that a structure is complete.
 *
 * **It runs over a copy.** The chain's reverse commands write `RFC-SEED.md` and
 * the allocate manifest into the tree they are pointed at (that is the write
 * allow-list, A2), so running it over the representatives themselves would edit
 * frozen instruments — and one of them, `siprs-with-4layers`, is the answer key
 * the oracle rests on. The copy is the subject; the representative is asserted
 * byte-identical afterwards, from a digest taken before the chain is given any
 * input to author.
 *
 * **The fifth layer is observed over a subject the tree step can ground.** The
 * reverse tree run refuses T4 over every one of the four representatives, and a
 * refused run publishes nothing, so no fourth layer ever reaches the allocate
 * step. The second half of this file drives the same two commands over a subject
 * whose partition its own measurement holds, which is where §2.2's layout is
 * observed being produced rather than assumed. That observation is cheap and runs
 * by default; the chain over four representatives costs what three commands over
 * four trees cost, so it is selected deliberately — set `WSP_TERMINAL_STATE` to
 * run it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PATTERN_REPRESENTATIVE_ROOTS } from '../../../.claude/scripts/workspacify-reverse/lib/language-representatives.mjs';
import {
  LADDER_POSITIONS,
  compareTerminalStates,
  measureTerminalState,
  renderTerminalStateReport,
  summariseStages,
} from '../../../.claude/scripts/workspacify-reverse/lib/terminal-state.mjs';
import { createScratchFrom, hashTree } from '../helpers/scratch.mjs';
import { buildGraphNodes } from '../helpers/graph-nodes.mjs';
import { decisionsPathFor } from '../helpers/decisions-authoring.mjs';
import { makeDecisions } from '../../workspacify-allocate/helpers/build-valid-manifest.mjs';
import { assembleManifest } from '../../../.claude/scripts/workspacify-tree/lib/render.mjs';
import { REVERSE_PROVENANCE_FIELD } from '../../../.claude/scripts/workspacify-tree/lib/reverse-mode.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** Where the chain's commands live. */
const COMMAND_ROOT = join(PROJECT_ROOT, '.claude', 'scripts');

/** The origin spec the tree command consumes. */
const ORIGIN_SPEC_FILE = 'ORIGIN-LONG-SPEC.md';

/**
 * The origin spec's machine-readable sidecar, published beside the Markdown.
 *
 * The command consumes the `.md`; the grounding anchors T3 judges are read from
 * the `.json`, because a file path is data and the prose is not.
 */
const ORIGIN_SPEC_JSON_FILE = 'ORIGIN-LONG-SPEC.json';

/** The dependency measurement the analysis publishes, which T4 is judged against. */
const DEPENDENCIES_FILE = 'DEPENDENCIES.json';

/** The node set T3 grounds, materialised because `--graph` takes a path. */
const GROUNDING_NODES_FILE = 'GROUNDING-NODES.json';

/** The record T5 judges, named by the operator because the run has no prior to diff against. */
const DELTA_FILE = 'ARCHITECTURE-DELTA.json';

/** The sidecars of an earlier `--through=r5.5` run, which the design's Appendix A.1 names. */
const SIDECAR_DIR = join(PROJECT_ROOT, 'tests', 'workspacify-reverse', 'analysis');

/** Where this observation's record is written, so it survives without being repeated. */
const RECORD_PATH = join(PROJECT_ROOT, 'tests', 'workspacify-reverse', 'analysis', 'TERMINAL-STATE.json');

/** A representative the chain cannot configure: it carries no source in any target language. */
const KNOWN_UNCONFIGURABLE = 'spec-only-project';

/** The representative whose decisions input is authored, so the reverse chain can reach its gates. */
const CONFIGURED_REPRESENTATIVE = 'siprs-for-reverse';

/** The fourth layer's manifest — the artefact the allocate step reads its plan from. */
const TREE_MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';

/** The fifth layer's manifest, written at the workspace root. */
const ALLOCATE_MANIFEST_FILE_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';

/** The fifth layer's per-package artefact. */
const SEED_FILE_NAME = 'RFC-SEED.md';

/** The characters a SHA-256 digest is written in, which is how a recorded hash is recognised. */
const SHA256_HEX_LENGTH = 64;

/**
 * The fixture pair that reaches COMPLETE through the forward gates.
 *
 * The four pattern representatives cannot ground a reverse run — measured, T4
 * refuses over each of them — and a refused run publishes nothing, so no fourth
 * layer ever reaches the allocate step. A subject built from this pair can be
 * grounded, which is what lets the fifth layer be observed at all.
 */
const GROUNDED_SPEC = join('tests', 'workspacify-tree', 'fixtures', 'objects-table.md');

/** The partition that fixture's measured tree holds, so T1 compares two sets that agree. */
const GROUNDED_DECISIONS = join('tests', 'workspacify-tree', 'fixtures', 'decisions-complete.json');

/** The sections a frozen decisions input carries, empty until a human's judgement fills them. */
const DECISIONS_SKELETON = Object.freeze({
  workspace: [], ownership: [], dependencies: [], adapters: [], approvals: [],
});

/** True when this observation was selected deliberately. */
const selected = process.env.WSP_TERMINAL_STATE === '1';

/** A throwaway directory, so no command publishes into the project. */
// [::TICKET::] P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-8 --for-spec --no-implementation-order`.
function scratchOutput() {
  const root = mkdtempSync(join(os.tmpdir(), 'wsp-p24-8-'));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/**
 * The frozen decisions input for one representative.
 *
 * A representative whose input has been authored keeps it: that input is the
 * judgement a run needs, and replacing it with an empty skeleton would throw away
 * the only thing that lets the chain reach its gates. The skeleton remains for the
 * representatives the chain cannot configure, where the absence is the finding —
 * and it is written beside the scratch copy rather than inside the representative,
 * because the representatives are frozen instruments and one of them is the answer
 * key the oracle rests on. A skeleton written into a subject would edit the very
 * instrument the digest exists to prove untouched.
 */
// [::TICKET::] P24-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-11 --for-spec --no-implementation-order`.
function decisionsFor(representative, scratchRoot) {
  const authored = decisionsPathFor(representative);
  if (existsSync(authored)) return authored;
  const path = join(scratchRoot, 'DECISIONS.json');
  if (!existsSync(path)) writeFileSync(path, `${JSON.stringify(DECISIONS_SKELETON, null, 2)}\n`, 'utf8');
  return path;
}

/** Run one command of the chain and report its exit status and output. */
// [::TICKET::] P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-8 --for-spec --no-implementation-order`.
function runChain(command, args) {
  const result = spawnSync(process.execPath, [join(COMMAND_ROOT, command), ...args], {
    cwd: PROJECT_ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' },
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * The four inputs `workspacify-tree reverse` reads, all of them the chain's own documents.
 *
 * The graph nodes are read from the origin spec's own evidence anchors; the measured
 * edges are the analysis run's `DEPENDENCIES.json`, untouched; the sidecars are the
 * bundle an earlier analysis published; and the delta is the record T5 judges, which
 * this run has no prior to take a seam from and which therefore names no mismatch.
 *
 * The graph is materialised beside the other documents because `--graph` takes a path:
 * a node set has to exist on disk before a command can be told to read it.
 */
// [::TICKET::] P24-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-11 --for-spec --no-implementation-order`.
function reverseInputsFor({ inputsRoot, workspaceRoot, preparedGraphPath = null }) {
  const graphPath = preparedGraphPath ?? join(inputsRoot, GROUNDING_NODES_FILE);
  if (preparedGraphPath === null) {
    writeFileSync(
      graphPath,
      `${JSON.stringify({ nodes: buildGraphNodes({ specPath: join(inputsRoot, ORIGIN_SPEC_JSON_FILE) }) }, null, 2)}\n`,
      'utf8',
    );
  }

  // The record T5 judges sits where §2.2 puts it: the workspace root, beside the
  // manifest it belongs to. A delta kept in the analysis scratch would leave the
  // fifth layer incomplete even on a run whose every gate answered PASS.
  const deltaPath = join(workspaceRoot, DELTA_FILE);
  if (!existsSync(deltaPath)) writeFileSync(deltaPath, `${JSON.stringify({ mismatches: [] }, null, 2)}\n`, 'utf8');

  return {
    graph: graphPath,
    measured: join(inputsRoot, DEPENDENCIES_FILE),
    sidecars: SIDECAR_DIR,
    delta: deltaPath,
  };
}

/**
 * The reverse command's argument list.
 *
 * The run is described in two parts, because the chain uses them for different
 * things. The **subject** is the tree the run is pointed at: it is where the fourth
 * and fifth layers are published, and it is read back afterwards to judge what was
 * produced. The **documents** are the analysis's own output, which the run reads by
 * path and never writes to.
 */
// [::TICKET::] P24-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-11 --for-spec --no-implementation-order`.
function reverseArgs({ subject, documents }) {
  const base = {
    spec: subject.specPath,
    decisions: documents.decisionsPath,
    root: subject.root,
    // The tree run publishes into the tree it was pointed at. §2.2 puts the fourth
    // layer at the workspace root, and the allocate step reads its plan from exactly
    // there, so a manifest published into an analysis scratch is a plan no seed can
    // be rendered from.
    out: subject.root,
    ...reverseInputsFor({
      inputsRoot: documents.inputsRoot,
      workspaceRoot: subject.root,
      preparedGraphPath: documents.graphPath,
    }),
  };

  return {
    base,
    args: argsFrom(base),
  };
}

/** The argument list for one resolved input set, each entry spelled as the command reads it. */
// [::TICKET::] P24-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-10 --for-spec --no-implementation-order`.
function argsFrom(resolved) {
  return Object.entries(resolved).map(([name, value]) => `--${name}=${value}`);
}

/** The verdict heading every chained command publishes for each gate it judged. */
const GATE_VERDICT_HEADING = /^## (\S+) — (\w+)$/;

/** The refusal an analysis run publishes for the stage that could not run, and the input it was handed. */
const STAGE_REFUSAL = /^Stage (\S+) could not run\.\n\s*Input: (.+)$/gm;

/** The line a successful analysis publishes, listing every stage it ran. */
const STAGES_PUBLISHED = /^Stages ([^.]+) published to /m;

/** The gate a reverse command names as the one it stopped at, and the reason beside it. */
const FAILED_GATE_SUMMARY = /^failed gate: (\S+)$/m;
const REFUSAL_REASON = /^reason: (.+)$/m;

/** The gates a reverse command lists as failing, when it printed no gate report. */
const FAILING_GATES_SUMMARY = /"failing":\[([^\]]*)\]/g;

/**
 * The stage records a chained command's output names, as `{stage, status, input}`.
 *
 * The three commands report in two shapes, and a chain that stopped short is only
 * legible if both are read. The analysis names a stage that could not run and the
 * input it was handed. The reverse commands publish one `## <gate> — <verdict>`
 * heading per gate, with the reasons they gave in the bullets below; when a run
 * stops before that report exists, the gate it stopped at is still named in the
 * summary it printed.
 *
 * A stage that refused carries what it refused on, so a reader learns where the
 * chain stopped and why, rather than having to re-run the command to find out.
 */
// [::TICKET::] P24-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-11 --for-spec --no-implementation-order`.
function stagesFrom(output) {
  const text = String(output ?? '');
  const stages = [];
  const recorded = new Set();

  const record = (stage, status, input) => {
    if (recorded.has(stage)) return;
    recorded.add(stage);
    stages.push({ stage, status, input });
  };

  for (const [, stage, input] of text.matchAll(STAGE_REFUSAL)) {
    record(stage, 'refused', input.trim());
  }
  const published = STAGES_PUBLISHED.exec(text);
  if (published !== null) {
    for (const stage of published[1].split(',').map((entry) => entry.trim().replace(/`/g, '')).filter(Boolean)) {
      record(stage, 'reached', null);
    }
  }

  let current = null;
  for (const line of text.split('\n')) {
    const heading = GATE_VERDICT_HEADING.exec(line);
    if (heading !== null) {
      current = recorded.has(heading[1])
        ? null
        : { stage: heading[1], status: heading[2] === 'PASS' ? 'reached' : 'refused', input: null };
      if (current !== null) {
        recorded.add(heading[1]);
        stages.push(current);
      }
      continue;
    }
    if (current !== null && current.input === null && line.startsWith('- ')) {
      current.input = line.slice(2).trim();
    }
  }

  const failed = FAILED_GATE_SUMMARY.exec(text);
  if (failed !== null) {
    const reason = REFUSAL_REASON.exec(text);
    record(failed[1], 'refused', reason === null ? null : reason[1]);
  }
  for (const summary of text.matchAll(FAILING_GATES_SUMMARY)) {
    for (const gate of summary[1].split(',').map((entry) => entry.trim().replace(/"/g, '')).filter(Boolean)) {
      record(gate, 'refused', null);
    }
  }
  return stages;
}

/**
 * Drive the tree step and the allocate step over one workspace.
 *
 * These are the two commands §2.1's fifth layer is made of: the tree run grounds a
 * partition on a project that already exists and records the provenance it
 * resolved against, and the allocate run renders one seed per package from that
 * record. Both are pointed at the same tree, because a fifth layer is a layout
 * inside one project and not two documents in two directories.
 *
 * The allocate step is only reached when the tree step published: a run whose gate
 * refused writes nothing, and a manifest that is not there is not a plan to render
 * seeds from. `through` stops the chain earlier when the observation needs a copy
 * that holds the fourth layer and not yet the fifth.
 *
 * @param {{ subject: object, documents: object, through?: 'tree'|'allocate' }} input
 * @returns {{ invocation: object, tree: object, allocate: object|null, stages: Array<object>, manifestPath: string }}
 */
// [::TICKET::] P24-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-11 --for-spec --no-implementation-order`.
function runReverseChain({ subject, documents, through = 'allocate' }) {
  const invocation = reverseArgs({ subject, documents });
  const tree = runChain('workspacify-tree/run.mjs', ['reverse', ...invocation.args]);
  const stages = stagesFrom(`${tree.stdout}\n${tree.stderr}`);

  const manifestPath = join(subject.root, TREE_MANIFEST_FILE_NAME);
  if (through === 'tree' || !existsSync(manifestPath)) {
    return { invocation, tree, allocate: null, stages, manifestPath };
  }

  const allocate = runChain('workspacify-allocate/run.mjs', [
    'reverse',
    `--root=${subject.root}`,
    `--decisions=${allocateDecisionsFor({ workspaceRoot: subject.root, inputsRoot: documents.inputsRoot })}`,
  ]);
  stages.push(...stagesFrom(`${allocate.stdout}\n${allocate.stderr}`));
  return { invocation, tree, allocate, stages, manifestPath };
}

test('IT: the chain reaches the terminal state over each representative, or says which stage refused', { skip: !selected }, () => {
  const observations = [];
  const states = [];

  for (const representative of PATTERN_REPRESENTATIVE_ROOTS) {
    const subject = join(PROJECT_ROOT, representative);
    // The digest is taken before the chain does anything at all. A digest taken
    // after an input was authored would measure the subject once the chain had
    // already had its chance to edit it, which is the assertion's whole content.
    const before = hashTree(subject);

    const source = createScratchFrom(subject);
    const out = scratchOutput();
    const decisions = decisionsFor(representative, out.root);
    const stages = [];

    // The analysis is the chain's first stage, and it is read first: a representative
    // it cannot run over never reaches the reverse commands, and the stage it named
    // is the finding rather than an absence of one.
    const analysed = runChain('workspacify-reverse/run.mjs', ['analyze', source.root, '--through=r8', `--out=${out.root}`]);
    stages.push(...stagesFrom(`${analysed.stdout}\n${analysed.stderr}`));

    if (existsSync(join(out.root, ORIGIN_SPEC_FILE))) {
      const chained = runReverseChain({
        subject: { root: source.root, specPath: join(out.root, ORIGIN_SPEC_FILE) },
        documents: { inputsRoot: out.root, decisionsPath: decisions },
      });
      stages.push(...chained.stages);
    }

    const summary = summariseStages(stages);
    const measured = measureTerminalState({ root: source.root });
    observations.push({
      representative,
      stages: summary,
      missing: measured.missing.length,
      packages: measured.packages.length,
    });
    states.push({ representative, ...measured, gates: {} });

    // The representative itself was never the subject: the chain ran over a
    // copy, so a frozen instrument — and the answer key among them — is
    // byte-identical afterwards.
    assert.deepEqual(hashTree(subject), before, `${representative}: the representative was not modified`);

    if (!summary.complete || !measured.complete) {
      // Reported rather than worked around: the finding names the stage that
      // stopped the chain, or the artefacts the tree is still missing, and the
      // other representatives' observations stand beside it.
      assert.equal(
        summary.refused.length > 0 || measured.missing.length > 0,
        true,
        `${representative}: stopping short names a refusing stage or a missing artefact`,
      );
    }
    source.dispose();
    out.dispose();
  }

  const comparison = compareTerminalStates(states);
  const report = renderTerminalStateReport({
    states,
    comparison,
    ladder: { position: 'L0' },
    stages: null,
  });

  writeFileSync(RECORD_PATH, `${JSON.stringify({
    observations, comparison, matrix: { states: states.map((state) => ({ representative: state.representative, packages: state.packages, missing: state.missing })) },
  }, null, 2)}\n`, 'utf8');

  assert.equal(observations.length, PATTERN_REPRESENTATIVE_ROOTS.length);
  assert.equal(comparison.representatives.length, PATTERN_REPRESENTATIVE_ROOTS.length);
  assert.match(report, /a human’s/i, 'the report states the judgement is a human’s, whatever the run did');
  assert.equal(LADDER_POSITIONS.includes('L0'), true);

  const unconfigurable = observations.find((entry) => entry.representative.endsWith(KNOWN_UNCONFIGURABLE));
  if (unconfigurable !== undefined) {
    assert.equal(unconfigurable.stages.complete === false || unconfigurable.missing > 0, true, `${KNOWN_UNCONFIGURABLE} is reported rather than presented as complete`);
  }
});

test('IT: the forward manifest hash is byte-identical after the chain, which is the indistinguishability property', { skip: !selected }, () => {
  const baselinePath = join(PROJECT_ROOT, 'tests', 'workspacify-tree', 'baselines', 'manifest-hashes.json');
  const baseline = readFileSync(baselinePath, 'utf8');

  const checked = runChain('workspacify-reverse/run.mjs', ['regression', 'check']);
  assert.equal(checked.status, 0, 'the forward-rotation regression gate still exits 0');

  assert.equal(
    readFileSync(baselinePath, 'utf8'),
    baseline,
    'the baseline is read, never re-captured — re-capturing would destroy the assertion',
  );
});

test('IT: the two refusals a decisions input meets are each named, and neither publishes', () => {
  const workspace = buildGroundedWorkspace();
  try {
    assert.equal(seedTheFourthLayer(workspace, { through: 'tree' }).tree.status, 0, 'the tree step grounded the copy');

    // The flag is absent: the command cannot read a plan from a path nobody named,
    // and it says which flag it needed rather than running with a default.
    const absentFlag = runChain('workspacify-allocate/run.mjs', ['reverse', `--root=${workspace.root}`]);
    assert.notEqual(absentFlag.status, 0, 'a run with no decisions input is refused rather than run with defaults');
    assert.match(absentFlag.stdout, /"gateId":"A1"/, 'the refusal is judged at A1');
    assert.match(absentFlag.stdout, /--decisions=<path>/, 'and names the input that was missing');

    // The flag names a path that holds nothing: the run is refused by path, so an
    // operator can see which document to repair.
    const unreadable = join(workspace.inputs, 'no-such-decisions.json');
    const absentFile = runChain('workspacify-allocate/run.mjs', [
      'reverse', `--root=${workspace.root}`, `--decisions=${unreadable}`,
    ]);
    assert.notEqual(absentFile.status, 0, 'an unreadable decisions input is refused');
    assert.ok(
      `${absentFile.stdout}${absentFile.stderr}`.includes(unreadable),
      'the refusal names the path that could not be read',
    );

    assert.equal(existsSync(join(workspace.root, ALLOCATE_MANIFEST_FILE_NAME)), false, 'neither refusal published a manifest');
    assert.deepEqual(seedsUnder(workspace.root), [], 'and neither rendered a seed');
  } finally {
    workspace.dispose();
  }
});

/**
 * The verdict the reverse run gave each T gate, as `{T1: 'PASS', ...}`.
 *
 * The report is read rather than the one-line summary, because the summary is
 * printed only when every gate passed. A failing run still names each verdict in
 * the report, which is where an operator reads what stopped it.
 */
// [::TICKET::] P24-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-10 --for-spec --no-implementation-order`.
function gatesFrom(output) {
  const verdicts = {};
  for (const [, gateId, status] of output.matchAll(/^## (T\d) — (\w+)$/gm)) {
    verdicts[gateId] = status;
  }
  return Object.keys(verdicts).length === 0 ? null : verdicts;
}

/** The pattern T4's report uses to name the cycles that stopped it proving an order. */
const T4_CYCLE_REPORT = /the measured DAG contains \d+ cycle\(s\)/;

/**
 * Drive the chain over the configured representative and hold its output open.
 *
 * The caller reads the published documents, so the scratch directories are handed
 * back with the run rather than disposed of here: `dispose` closes both.
 */
// [::TICKET::] P24-10, P24-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-10|P24-11) --for-spec --no-implementation-order`.
function configuredRepresentativeRun() {
  const subject = join(PROJECT_ROOT, CONFIGURED_REPRESENTATIVE);
  const before = hashTree(subject);
  const source = createScratchFrom(subject);
  const out = scratchOutput();
  const dispose = () => {
    source.dispose();
    out.dispose();
  };

  // The analysis publishes the documents the reverse command is pointed at; its
  // exit status is read from what it left on disk, below.
  runChain('workspacify-reverse/run.mjs', ['analyze', source.root, '--through=r8', `--out=${out.root}`]);
  const invocation = reverseArgs({
    subject: { root: source.root, specPath: join(out.root, ORIGIN_SPEC_FILE) },
    documents: { inputsRoot: out.root, decisionsPath: decisionsFor(CONFIGURED_REPRESENTATIVE, out.root) },
  });
  const reverse = runChain('workspacify-tree/run.mjs', ['reverse', ...invocation.args]);
  const reverseOutput = `${reverse.stdout}\n${reverse.stderr}`;

  // One input replaced, the rest as they were read: the refusal tests start from a
  // run that works and change exactly one thing, so what they observe is that input.
  const withInput = (name, value) => ['reverse', ...argsFrom({ ...invocation.base, [name]: value })];

  return {
    subject,
    before,
    dispose,
    withInput,
    // The analysis publishes its documents and prints its stage list to a report
    // rather than to stdout, so presence on disk is what says the exit was reached.
    specPublished: existsSync(join(out.root, ORIGIN_SPEC_FILE)),
    reverseOutput,
    gates: gatesFrom(reverseOutput),
    outRoot: out.root,
    // The fourth layer and the record T5 judges are artefacts of the tree §2.2
    // describes, so both are looked for where the chain publishes them: the tree it
    // was pointed at, not the scratch the analysis happens to write into.
    manifestPath: join(source.root, TREE_MANIFEST_FILE_NAME),
    deltaPath: join(source.root, DELTA_FILE),
  };
}

test('IT: every input a reverse run reads is the chain\'s own document, and five gates answer PASS', () => {
  const run = configuredRepresentativeRun();
  try {
    // The analysis run published the origin spec and the dependency measurement the
    // reverse run is pointed at, so both inputs are documents the chain produced.
    assert.equal(run.specPublished, true, 'the analysis reached its exit and published the origin spec');
    assert.equal(existsSync(join(run.outRoot, DEPENDENCIES_FILE)), true, 'the analysis published the measured edges');
    assert.equal(existsSync(join(run.outRoot, GROUNDING_NODES_FILE)), true, 'the graph nodes were read from the origin spec');

    // T3 judges the graph the origin spec grounds, T5 the record the operator named,
    // and T6 the sidecar bundle: each passes on a document the chain published.
    assert.deepEqual(run.gates, {
      T1: 'PASS', T2: 'PASS', T3: 'PASS', T4: 'FAIL', T5: 'PASS', T6: 'PASS',
    }, run.reverseOutput);

    assert.equal(existsSync(run.manifestPath), false, 'a run whose every gate did not answer PASS publishes nothing');
    assert.equal(existsSync(run.deltaPath), true, 'the delta record T5 judges exists where the run was told to find it');

    const delta = JSON.parse(readFileSync(run.deltaPath, 'utf8'));
    assert.deepEqual(delta.mismatches, [], 'the delta records that the layout was examined, with nothing to record');

    assert.deepEqual(hashTree(run.subject), run.before, `${CONFIGURED_REPRESENTATIVE}: the representative was not modified`);
  } finally {
    run.dispose();
  }
});

test('IT: T4 is the one gate the frozen inputs cannot prove, and it names what it found', () => {
  const run = configuredRepresentativeRun();
  try {
    // The measurement is cyclic, so it proves no implementation order and T4 says so
    // with the cycles it found. The run reports this rather than passing on an empty
    // edge set: synthesising one would make the gate pass on evidence nobody measured.
    assert.equal(run.gates.T4, 'FAIL', 'T4 fails on the measurement rather than being silenced');
    assert.match(run.reverseOutput, T4_CYCLE_REPORT, 'T4 names the cycles it found');
    assert.match(run.reverseOutput, /T3 — PASS/, 'and the gates that did read their inputs are reported beside it');

    // The chain records that refusal as a stage, so a reader of the observation
    // learns which gate stopped the run without re-running the command.
    const stages = stagesFrom(run.reverseOutput);
    assert.deepEqual(
      stages.filter((entry) => entry.status === 'refused').map((entry) => entry.stage),
      ['T4'],
      'the report records the gate that refused, and only that gate',
    );
    assert.match(stages.find((entry) => entry.stage === 'T4').input, T4_CYCLE_REPORT, 'with the reason the gate published');
  } finally {
    run.dispose();
  }
});

test('IT: an input that cannot be read is refused by name, and nothing is synthesised in its place', () => {
  const run = configuredRepresentativeRun();
  try {
    const absent = join(run.outRoot, 'no-such-input.json');
    // A graph that parses but carries no nodes array: the run has to refuse this
    // rather than read it as an empty graph, which would pass T3 on nothing.
    const claimlessGraph = join(run.outRoot, 'graph-without-nodes.json');
    writeFileSync(claimlessGraph, `${JSON.stringify({ claims: [] }, null, 2)}\n`, 'utf8');

    const cases = [
      { input: 'measured', value: absent, pattern: /could not be read as JSON/ },
      { input: 'graph', value: absent, pattern: /the graph .* could not be read as JSON/ },
      { input: 'graph', value: claimlessGraph, pattern: /does not carry a "nodes" array/ },
      // The sidecar directory is listed rather than parsed, so it is refused by
      // existence. It is read after the two readers above, which is the order the
      // command reads its inputs in.
      { input: 'sidecars', value: absent, pattern: /the sidecar directory .* does not exist/ },
    ];

    for (const { input, value, pattern } of cases) {
      const refused = runChain('workspacify-tree/run.mjs', run.withInput(input, value));
      const output = `${refused.stdout}${refused.stderr}`;
      const named = `--${input}=${value}`;

      assert.notEqual(refused.status, 0, `${named}: an unreadable input is refused`);
      assert.match(output, pattern, `${named}: the refusal names the problem`);
      // The path is what an operator needs to fix it, and an empty substitute
      // would leave a gate judging something nobody supplied.
      assert.ok(output.includes(value), `${named}: the refusal names the path`);
    }
  } finally {
    run.dispose();
  }
});

// ---------------------------------------------------------------------------
// the fifth layer, produced by two runs over one tree
// ---------------------------------------------------------------------------
//
// The four representatives above cannot carry this observation: the reverse tree
// run refuses T4 over every one of them, and a refused run publishes nothing, so
// no fourth layer ever reaches the allocate step. What follows is the same chain
// over a subject the tree run can ground — one measured directory that is exactly
// the package the decisions declare — so §2.2's fifth layer is observed being
// produced rather than assumed.

/**
 * A workspace whose fourth layer a reverse tree run can actually publish.
 *
 * The measured population is one directory, so the measured edge set is empty and
 * the partition the decisions declare is the one the tree holds: T1 compares the
 * two sets, and a subject measured this way agrees with itself rather than being
 * shaped to a gate. The origin spec is co-located with the manifest because every
 * source reference a seed cites is anchored to the specification bytes.
 */
// [::TICKET::] P24-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-11 --for-spec --no-implementation-order`.
function buildGroundedWorkspace() {
  const decisions = JSON.parse(readFileSync(join(PROJECT_ROOT, GROUNDED_DECISIONS), 'utf8'));
  const packagePath = decisions.workspace[0].path;
  const root = mkdtempSync(join(os.tmpdir(), 'wsp-p24-11-tree-'));
  const inputs = mkdtempSync(join(os.tmpdir(), 'wsp-p24-11-inputs-'));
  const sourcePath = join(packagePath, 'mod.rs');

  mkdirSync(join(root, packagePath), { recursive: true });
  writeFileSync(join(root, sourcePath), 'pub fn call() {}\n', 'utf8');
  copyFileSync(join(PROJECT_ROOT, GROUNDED_SPEC), join(root, basename(GROUNDED_SPEC)));

  // The measured edge set, at the path the chain passes to `--measured`. One package
  // has nothing to depend on, so the set is empty because the subject is one unit
  // and not because a measurement was withheld.
  writeFileSync(join(inputs, DEPENDENCIES_FILE), `${JSON.stringify({ edges: [] }, null, 2)}\n`, 'utf8');
  writeFileSync(
    join(inputs, GROUNDING_NODES_FILE),
    `${JSON.stringify({ sourceFile: 'RFC-ROOT.md', nodes: [{ id: 'N0001', title: 'Purpose', file: sourcePath }] }, null, 2)}\n`,
    'utf8',
  );

  return {
    root,
    inputs,
    // The entry at the top of the measured tree, read from the package path rather
    // than written here: a subject whose directories were renamed in this file
    // instead of derived from its own plan would drift from the fixture silently.
    topLevelPath: packagePath.split('/')[0],
    specPath: join(root, basename(GROUNDED_SPEC)),
    decisionsPath: join(PROJECT_ROOT, GROUNDED_DECISIONS),
    dispose: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(inputs, { recursive: true, force: true });
    },
  };
}

/**
 * Drive the chain over the grounded workspace.
 *
 * The default walks the whole chain, which is how the fifth layer is observed. The
 * observations that judge a refusal stop at the tree step, because they need a copy
 * that holds the fourth layer and has not yet been sealed by a successful run — a
 * refusal observed over an already-published fifth layer would be looking at the
 * artefacts of the run before it.
 */
// [::TICKET::] P24-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-11 --for-spec --no-implementation-order`.
function seedTheFourthLayer(workspace, { through = 'allocate' } = {}) {
  return runReverseChain({
    subject: { root: workspace.root, specPath: workspace.specPath },
    documents: {
      inputsRoot: workspace.inputs,
      decisionsPath: workspace.decisionsPath,
      graphPath: join(workspace.inputs, GROUNDING_NODES_FILE),
    },
    through,
  });
}

/**
 * The allocate step's decisions input, derived from the manifest the tree run published.
 *
 * The two commands read different payloads — the tree run takes the partition, the
 * allocate run takes the per-package authoring sections — so "the same decisions
 * input" is not one document. What is shared is the plan: every section here is
 * derived from the manifest that plan produced, so the seeds restate the partition
 * rather than an invention beside it.
 */
// [::TICKET::] P24-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-11 --for-spec --no-implementation-order`.
function allocateDecisionsFor({ workspaceRoot, inputsRoot }) {
  const manifest = JSON.parse(readFileSync(join(workspaceRoot, TREE_MANIFEST_FILE_NAME), 'utf8'));
  const path = join(inputsRoot, 'allocate-decisions.json');
  writeFileSync(path, `${JSON.stringify(makeDecisions(manifest), null, 2)}\n`, 'utf8');
  return path;
}

/** The manifest as a forward run would have published it, self-hash recomputed. */
// [::TICKET::] P24-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-11 --for-spec --no-implementation-order`.
function withoutReverseProvenance(manifest) {
  const copy = JSON.parse(JSON.stringify(manifest));
  delete copy[REVERSE_PROVENANCE_FIELD];
  return assembleManifest(copy);
}

/** Every seed under a root, as root-relative POSIX paths. */
// [::TICKET::] P24-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-11 --for-spec --no-implementation-order`.
function seedsUnder(root) {
  const found = [];
  const walk = (dir, relative) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), path);
      } else if (entry.name === SEED_FILE_NAME) {
        found.push(path);
      }
    }
  };
  walk(root, '');
  return found.sort();
}

/** The top-level directory names under a root, sorted. Only directories: A2 counts entries that can be renamed. */
// [::TICKET::] P24-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-11 --for-spec --no-implementation-order`.
function topLevelDirectories(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

test('IT: the tree run publishes the fourth layer and the allocate run writes the fifth, over one scratch copy', () => {
  const workspace = buildGroundedWorkspace();
  try {
    // C002's precondition, asserted rather than assumed: the run is pointed at a
    // scratch tree outside the project, so no write it makes can reach an instrument.
    assert.equal(workspace.root.startsWith(PROJECT_ROOT), false, 'the subject is a scratch tree, not a representative');

    const chained = seedTheFourthLayer(workspace);
    assert.equal(chained.tree.status, 0, `${chained.tree.stdout}\n${chained.tree.stderr}`);
    assert.equal(
      existsSync(chained.manifestPath),
      true,
      'the fourth layer is published into the tree the allocate step reads it from',
    );

    const manifest = JSON.parse(readFileSync(chained.manifestPath, 'utf8'));
    assert.equal(manifest.status, 'COMPLETE');
    assert.equal(
      manifest.reverse_provenance.sidecar_bundle_hash.length,
      SHA256_HEX_LENGTH,
      'the manifest records the provenance the seeds are rendered from',
    );

    assert.notEqual(chained.allocate, null, 'the chain reached the allocate step, because its plan was published');
    assert.equal(chained.allocate.status, 0, `${chained.allocate.stdout}\n${chained.allocate.stderr}`);
    assert.match(chained.allocate.stdout, /## A1 — PASS/, 'A1 answers PASS over the copy');

    assert.deepEqual(
      seedsUnder(workspace.root),
      manifest.workspace.packages
        .filter((pkg) => pkg.seed_required !== false)
        .map((pkg) => `${pkg.path}/${SEED_FILE_NAME}`)
        .sort(),
      'exactly one RFC-SEED.md in every package the manifest declares, and nowhere else',
    );
    assert.equal(
      existsSync(join(workspace.root, ALLOCATE_MANIFEST_FILE_NAME)),
      true,
      'the allocate manifest is written at the root, beside the fourth layer it was built from',
    );
  } finally {
    workspace.dispose();
  }
});

test('IT: a manifest with no reverse provenance is refused naming it, and no seed is rendered from an invented index', () => {
  const workspace = buildGroundedWorkspace();
  try {
    const chained = seedTheFourthLayer(workspace, { through: 'tree' });
    assert.equal(existsSync(chained.manifestPath), true, 'the fourth layer is published');

    const manifest = JSON.parse(readFileSync(chained.manifestPath, 'utf8'));
    writeFileSync(
      chained.manifestPath,
      `${JSON.stringify(withoutReverseProvenance(manifest), null, 2)}\n`,
      'utf8',
    );

    const refused = runChain('workspacify-allocate/run.mjs', [
      'reverse', `--root=${workspace.root}`, `--decisions=${allocateDecisionsFor({ workspaceRoot: workspace.root, inputsRoot: workspace.inputs })}`,
    ]);
    assert.notEqual(refused.status, 0, 'a manifest that records no provenance is refused');
    assert.match(refused.stdout, /## A4 — BLOCKED/, 'the gate that judges the index is named');
    assert.match(refused.stdout, /does not carry a reverse_index/, 'the missing provenance is named rather than rendered empty');
    assert.equal(existsSync(join(workspace.root, ALLOCATE_MANIFEST_FILE_NAME)), false, 'nothing is published');
    assert.deepEqual(seedsUnder(workspace.root), [], 'and no seed is rendered from an index nobody recorded');
  } finally {
    workspace.dispose();
  }
});

test('IT: a copy renamed at the top level is refused by A1, and the rename is not undone', () => {
  const workspace = buildGroundedWorkspace();
  try {
    assert.equal(seedTheFourthLayer(workspace, { through: 'tree' }).tree.status, 0, 'the tree step grounded the copy');

    const renamedTo = `${workspace.topLevelPath}-renamed`;
    renameSync(join(workspace.root, workspace.topLevelPath), join(workspace.root, renamedTo));

    const refused = runChain('workspacify-allocate/run.mjs', [
      'reverse', `--root=${workspace.root}`, `--decisions=${allocateDecisionsFor({ workspaceRoot: workspace.root, inputsRoot: workspace.inputs })}`,
    ]);

    assert.notEqual(refused.status, 0, 'a renamed top-level entry stops the run');
    assert.match(refused.stdout, /## A1 — BLOCKED/, 'A1 names the gate');
    assert.ok(refused.stdout.includes(renamedTo), 'the paths no package claims are named');
    assert.ok(refused.stdout.includes(workspace.topLevelPath), 'and the planned paths the tree no longer holds');
    assert.deepEqual(seedsUnder(workspace.root), [], 'a blocked run publishes no seed');
    assert.deepEqual(
      topLevelDirectories(workspace.root),
      [renamedTo],
      'the entry stands where it was moved to: a run that cannot match the plan does not repair it',
    );
  } finally {
    workspace.dispose();
  }
});

test('IT: the chain writes its decisions skeletons beside the copy, so no representative is edited', () => {
  const digestsBefore = new Map(
    PATTERN_REPRESENTATIVE_ROOTS.map((representative) => [representative, hashTree(join(PROJECT_ROOT, representative))]),
  );
  const scratch = scratchOutput();

  try {
    for (const representative of PATTERN_REPRESENTATIVE_ROOTS) {
      const authored = existsSync(decisionsPathFor(representative, PROJECT_ROOT));
      const decisions = decisionsFor(representative, scratch.root);

      if (authored) {
        assert.equal(decisions, decisionsPathFor(representative, PROJECT_ROOT), `${representative}: the authored input is the one a run reads`);
        continue;
      }
      assert.equal(
        decisions.startsWith(scratch.root),
        true,
        `${representative}: the skeleton a run reads is written beside the copy, never into the instrument`,
      );
    }

    for (const representative of PATTERN_REPRESENTATIVE_ROOTS) {
      assert.deepEqual(
        hashTree(join(PROJECT_ROOT, representative)),
        digestsBefore.get(representative),
        `${representative}: the representative was not modified`,
      );
    }
  } finally {
    scratch.dispose();
  }
});
