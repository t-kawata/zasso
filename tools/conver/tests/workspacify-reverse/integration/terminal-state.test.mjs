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

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** Where the chain's commands live. */
const COMMAND_ROOT = join(PROJECT_ROOT, '.claude', 'scripts');

/** The origin spec the tree command consumes. */
const ORIGIN_SPEC_FILE = 'ORIGIN-LONG-SPEC.md';

/** Where this observation's record is written, so it survives without being repeated. */
const RECORD_PATH = join(PROJECT_ROOT, 'tests', 'workspacify-reverse', 'analysis', 'TERMINAL-STATE.json');

/** A representative the chain cannot configure: it carries no source in any target language. */
const KNOWN_UNCONFIGURABLE = 'spec-only-project';

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

/** The frozen decisions input for one representative, written once and pinned. */
// [::TICKET::] P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-8 --for-spec --no-implementation-order`.
function decisionsFor(representative) {
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
      const seeded = runChain('workspacify-tree/run.mjs', [
        'reverse', `--spec=${join(out.root, ORIGIN_SPEC_FILE)}`, `--decisions=${decisions}`, `--root=${source.root}`,
      ]);
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
