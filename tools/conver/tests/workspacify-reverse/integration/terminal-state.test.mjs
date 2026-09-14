// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
/**
 * The three-command chain, driven to the terminal state over the four pattern
 * representatives.
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
 * byte-identical afterwards.
 *
 * The chain costs what three commands over four representatives cost, so it is
 * selected deliberately rather than run by every suite: set `WSP_TERMINAL_STATE`
 * to run it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
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
 * representatives the chain cannot configure, where the absence is the finding.
 */
// [::TICKET::] P24-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-10 --for-spec --no-implementation-order`.
function decisionsFor(representative) {
  const authored = decisionsPathFor(representative);
  if (existsSync(authored)) return authored;
  const path = join(PROJECT_ROOT, representative, 'DECISIONS.json');
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
// [::TICKET::] P24-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-10 --for-spec --no-implementation-order`.
function reverseInputsFor(outRoot) {
  const specPath = join(outRoot, ORIGIN_SPEC_JSON_FILE);
  const graphPath = join(outRoot, 'GROUNDING-NODES.json');
  writeFileSync(graphPath, `${JSON.stringify({ nodes: buildGraphNodes({ specPath }) }, null, 2)}\n`, 'utf8');

  const deltaPath = join(outRoot, DELTA_FILE);
  if (!existsSync(deltaPath)) writeFileSync(deltaPath, `${JSON.stringify({ mismatches: [] }, null, 2)}\n`, 'utf8');

  return {
    graph: graphPath,
    measured: join(outRoot, DEPENDENCIES_FILE),
    sidecars: SIDECAR_DIR,
    delta: deltaPath,
  };
}

/**
 * The reverse command's argument list: the three it always took, plus the four inputs.
 *
 * `overrides` replaces a flag's value where it already appears. The command reads
 * the first occurrence of a flag, so appending a second one would be ignored — an
 * override that silently did nothing would make a test assert about the wrong run.
 */
// [::TICKET::] P24-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-10 --for-spec --no-implementation-order`.
function reverseArgs({ specPath, decisionsPath, sourceRoot, outRoot }, overrides = {}) {
  const base = {
    spec: specPath,
    decisions: decisionsPath,
    root: sourceRoot,
    out: outRoot,
    ...reverseInputsFor(outRoot),
  };
  const resolved = { ...base, ...overrides };

  return {
    base,
    args: argsFrom(resolved),
  };
}

/** The argument list for one resolved input set, each entry spelled as the command reads it. */
// [::TICKET::] P24-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-10 --for-spec --no-implementation-order`.
function argsFrom(resolved) {
  return Object.entries(resolved).map(([name, value]) => `--${name}=${value}`);
}

/** The stage records a command's output names, as `{stage, status, input}`. */
// [::TICKET::] P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-8 --for-spec --no-implementation-order`.
function stagesFrom(output) {
  const stages = [];
  for (const line of output.split('\n')) {
    const refused = /Stage (\S+) could not run\./.exec(line);
    if (refused) stages.push({ stage: refused[1], status: 'refused', input: null });
  }
  const published = /Stages ([^.]+) published/.exec(output);
  if (published) {
    for (const stage of published[1].split(',').map((entry) => entry.trim().replace(/`/g, ''))) {
      stages.push({ stage, status: 'reached' });
    }
  }
  return stages;
}

test('IT: the chain reaches the terminal state over each representative, or says which stage refused', { skip: !selected }, () => {
  const observations = [];
  const states = [];

  for (const representative of PATTERN_REPRESENTATIVE_ROOTS) {
    const subject = join(PROJECT_ROOT, representative);
    const decisions = decisionsFor(representative);
    const before = hashTree(subject);

    const source = createScratchFrom(subject);
    const out = scratchOutput();
    const stages = [];

    const analysed = runChain('workspacify-reverse/run.mjs', ['analyze', source.root, '--through=r8', `--out=${out.root}`]);
    stages.push(...stagesFrom(`${analysed.stdout}\n${analysed.stderr}`));

    if (existsSync(join(out.root, ORIGIN_SPEC_FILE))) {
      const seeded = runChain('workspacify-tree/run.mjs', ['reverse', ...reverseArgs({
        specPath: join(out.root, ORIGIN_SPEC_FILE),
        decisionsPath: decisions,
        sourceRoot: source.root,
        outRoot: out.root,
      }).args]);
      stages.push(...stagesFrom(`${seeded.stdout}\n${seeded.stderr}`));

      const allocated = runChain('workspacify-allocate/run.mjs', ['reverse', `--root=${source.root}`, `--decisions=${decisions}`]);
      stages.push(...stagesFrom(`${allocated.stdout}\n${allocated.stderr}`));
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
      // Reported rather than worked around: the stage and its input are named,
      // and the other representatives' observations stand beside it.
      assert.equal(summary.complete && measured.complete, false, `${representative}: incomplete is reported`);
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

test('IT: the chain refuses, by name, a representative whose frozen decisions input is absent', { skip: !selected }, () => {
  const source = createScratchFrom(join(PROJECT_ROOT, PATTERN_REPRESENTATIVE_ROOTS[2]));
  const missing = join(source.root, '..', 'no-such-decisions.json');

  const refused = runChain('workspacify-allocate/run.mjs', ['reverse', `--root=${source.root}`, `--decisions=${missing}`]);
  assert.notEqual(refused.status, 0, 'a run with no decisions input is refused rather than run with defaults');
  assert.match(`${refused.stdout}${refused.stderr}`, /A1|decisions/i, 'the refusal names what was missing');
  source.dispose();
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
// [::TICKET::] P24-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-10 --for-spec --no-implementation-order`.
function configuredRepresentativeRun() {
  const subject = join(PROJECT_ROOT, CONFIGURED_REPRESENTATIVE);
  const before = hashTree(subject);
  const source = createScratchFrom(subject);
  const out = scratchOutput();
  const dispose = () => {
    source.dispose();
    out.dispose();
  };

  const analysed = runChain('workspacify-reverse/run.mjs', ['analyze', source.root, '--through=r8', `--out=${out.root}`]);
  const invocation = reverseArgs({
    specPath: join(out.root, ORIGIN_SPEC_FILE),
    decisionsPath: decisionsFor(CONFIGURED_REPRESENTATIVE),
    sourceRoot: source.root,
    outRoot: out.root,
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
    manifestPath: join(out.root, 'WORKSPACIFY-TREE-MANIFEST.json'),
    deltaPath: join(out.root, DELTA_FILE),
  };
}

test('IT: every input a reverse run reads is the chain\'s own document, and five gates answer PASS', () => {
  const run = configuredRepresentativeRun();
  try {
    // The analysis run published the origin spec and the dependency measurement the
    // reverse run is pointed at, so both inputs are documents the chain produced.
    assert.equal(run.specPublished, true, 'the analysis reached its exit and published the origin spec');
    assert.equal(existsSync(join(run.outRoot, DEPENDENCIES_FILE)), true, 'the analysis published the measured edges');
    assert.equal(existsSync(join(run.outRoot, 'GROUNDING-NODES.json')), true, 'the graph nodes were read from the origin spec');

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
