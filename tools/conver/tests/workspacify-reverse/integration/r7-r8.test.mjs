// @verifies C001
// @verifies C002
// @verifies C003
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
/**
 * R7 and R8 measured through the pipeline that runs them.
 *
 * The unit suites prove each module alone. These prove the wiring: that the two
 * stages are reached by the command line's `--through`, that the Markdown the
 * run publishes re-parses to the sidecar published beside it, and that the
 * claims the spec carries rest on evidence that is actually on disk at the
 * stated location. The forward-rotation gate is asserted here too, because
 * every later ticket runs it after its own step.
 *
 * The real-tree case is what can fail for a reason a synthetic fixture cannot
 * reproduce: a real crate's layout, four thousand claims, and an answer key the
 * comparison is finally run against. It is the last stage at which the whole
 * analysis meets that answer key, so the disagreement list it produces is the
 * one a human reads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANALYSIS_STAGES, analyzeProject, EMPTY_RECORD, runSpike } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { CARD_LAYERING_THRESHOLD, renderServing } from '../../../.claude/scripts/workspacify-reverse/lib/packet.mjs';
import { compareText } from '../../../.claude/scripts/workspacify-reverse/lib/holdout-ledger.mjs';
import { parseOriginSpec } from '../../../.claude/scripts/workspacify-reverse/lib/origin-spec.mjs';
import { CAPABILITY_DIMENSIONS } from '../../../.claude/scripts/workspacify-reverse/lib/capability-profile.mjs';
import { checkBaselines } from '../../../.claude/scripts/workspacify-reverse/lib/regression-gate.mjs';
import { KNOWN_DELTA_RELATIVE_PATH } from '../../../.claude/scripts/workspacify-reverse/lib/oracle-bundle.mjs';
import { NO_KNOWN_DELTA, reconcile } from '../../../.claude/scripts/workspacify-reverse/lib/reconcile.mjs';
import { createSyntheticTree, LAYERED_SERVING_TREE, SPIKE_SLICE_FILES } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const REVERSE_ROOT = join(PROJECT_ROOT, 'siprs-for-reverse');
const targetAvailable = existsSync(REVERSE_ROOT);
const bundleAvailable = existsSync(join(PROJECT_ROOT, 'tests/workspacify-reverse/oracle/ORACLE-BUNDLE.json'));

/**
 * Where the integration runs stop.
 *
 * R8 is the last stage this ticket owns, and the stage list is asserted below
 * to still end there: a stage added later must be run by default, so a constant
 * that silently became a prefix would hide it.
 */
const THROUGH_R8 = 'r8';

/** R7 is the stage that publishes `R7-SERVING.md`, so it is where a packet run stops. */
const THROUGH_R7 = 'r7';

/** A throwaway directory to publish into, so no test writes into the project. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function scratchOutput() {
  const root = mkdtempSync(join(os.tmpdir(), 'wsp-r8-it-'));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/**
 * A population carrying all three claim families.
 *
 * One boundary crossing, one asserted condition and one error return, so the
 * spec has to carry claims of more than one shape rather than a single one.
 */
/** The unresolved claims a published ledger holds: the population R7 serves. */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function unresolvedIn(ledger) {
  return ledger.claims.filter((claim) => claim.claim_type === 'unresolved');
}

/** The counts the serving packet states about itself, read out of the page a human reads. */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function statedCounts(markdown) {
  const served = /^(\d+) unresolved claim\(s\) are set out below/m.exec(markdown);
  const withheld = /^(\d+) further unresolved claim\(s\) were not printed here/m.exec(markdown);
  return { served: Number(served?.[1] ?? 0), withheld: Number(withheld?.[1] ?? 0) };
}

/** The claim ids the packet prints, in the order it prints them. */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function documentedCardIds(markdown) {
  return [...markdown.matchAll(/^### `([^`]+)`$/gm)].map((match) => match[1]);
}

const CLAIM_BEARING_TREE = Object.freeze({
  'src/api/login.rs': [
    'use crate::model::User;',
    '',
    'pub fn login(user: &User) -> Result<(), Error> {',
    '    assert!(!user.name.is_empty());',
    '    if user.name.len() > 64 {',
    '        return Err(Error::TooLong);',
    '    }',
    '    Ok(())',
    '}',
    '',
  ].join('\n'),
  'src/model.rs': [
    'pub struct User { pub name: String }',
    '',
  ].join('\n'),
});

test('IT-1: the stage list ends at R8, so a run without --through reaches it', () => {
  assert.equal(ANALYSIS_STAGES[ANALYSIS_STAGES.length - 1], THROUGH_R8);
  assert.equal(ANALYSIS_STAGES.includes('r7'), true, 'R7 must be a declared stage');
  assert.equal(ANALYSIS_STAGES.includes('r6.5'), true, 'the stages before it are unchanged');
});

test('IT-1: a full run publishes an origin spec whose Markdown re-parses to its sidecar', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchOutput();
  try {
    await analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R8 });

    assert.equal(existsSync(join(out.root, 'ORIGIN-LONG-SPEC.json')), true);
    assert.equal(existsSync(join(out.root, 'ORIGIN-LONG-SPEC.md')), true);
    assert.equal(existsSync(join(out.root, 'CAPABILITY-PROFILE.json')), true);
    assert.equal(existsSync(join(out.root, 'ORIGIN-SPEC-CANDIDATE.json')), true);

    const sidecar = JSON.parse(readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.json'), 'utf8'));
    const markdown = readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.md'), 'utf8');

    assert.equal(sidecar.kind, 'origin-long-spec');
    assert.match(markdown, /^# /m, 'the published Markdown carries ATX headings');
    assert.deepEqual(parseOriginSpec(markdown), sidecar, 'the Markdown re-parses to the sidecar beside it');
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT-2: every observed claim in the output has evidence that exists at the stated location', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchOutput();
  try {
    await analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R8 });
    const sidecar = JSON.parse(readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.json'), 'utf8'));

    const observed = sidecar.claims.filter((claim) => claim.claim_type === 'observed');
    assert.ok(observed.length > 0, 'this population produces at least one observed claim');
    for (const claim of observed) {
      assert.ok(claim.evidence.length > 0);
      for (const item of claim.evidence) {
        const located = join(tree.root, item.source_span.file);
        assert.equal(existsSync(located), true, `${item.source_span.file} must exist`);
        assert.ok(
          readFileSync(located, 'utf8').split('\n').length >= item.source_span.line,
          `${item.source_span.file}:${item.source_span.line} must be a line the file actually has`,
        );
      }
    }
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT-3: every unresolved claim in the output carries a question', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchOutput();
  try {
    await analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R8 });
    const sidecar = JSON.parse(readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.json'), 'utf8'));

    for (const claim of sidecar.claims.filter((entry) => entry.claim_type === 'unresolved')) {
      assert.equal(typeof claim.grill_question, 'string');
      assert.ok(claim.grill_question.length > 0, 'an unresolved claim hands the grill a question');
    }
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT-1: the run publishes the profile in five dimensions with no eligibility verdict', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchOutput();
  try {
    await analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R8 });
    const profile = JSON.parse(readFileSync(join(out.root, 'CAPABILITY-PROFILE.json'), 'utf8'));

    assert.deepEqual(Object.keys(profile.dimensions).sort(), [...CAPABILITY_DIMENSIONS].sort());
    assert.equal(JSON.stringify(profile).includes('eligible'), false);
    for (const name of CAPABILITY_DIMENSIONS) {
      assert.ok(profile.dimensions[name].can_prove.length > 0);
      assert.ok(profile.dimensions[name].cannot_prove.length > 0);
    }
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT-2: the falsifiability dimension reports the counterexample channel rather than a constant', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchOutput();
  try {
    await analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R8 });
    const profile = JSON.parse(readFileSync(join(out.root, 'CAPABILITY-PROFILE.json'), 'utf8'));
    const results = JSON.parse(readFileSync(join(out.root, 'COUNTEREXAMPLE-RESULTS.json'), 'utf8'));
    const falsifiability = profile.dimensions.falsifiability;

    assert.equal(falsifiability.determined, true);
    assert.equal(
      falsifiability.evidence.includes('the R6 red-reconstruction plan did not run'),
      false,
      'the plan ran, so that sentence would be a lie about this run',
    );
    assert.equal(
      falsifiability.evidence.includes(`0 counterexamples executed and ${results.refusedCount} refused`),
      true,
      "the evidence is the run's own counts, so a run that executed nothing says so rather than staying silent",
    );
    assert.equal(
      falsifiability.evidence.some((line) => line.startsWith('refusals by reason:')),
      true,
      'the refusals are named by the reason code each one carries',
    );
    assert.equal(falsifiability.can_prove.includes('0 counterexamples were actually executed'), true);
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT-1: over the real experiment input, the origin spec re-parses to its sidecar', { skip: !targetAvailable }, async () => {
  const out = scratchOutput();
  try {
    const outcome = await analyzeProject({ root: REVERSE_ROOT, out: out.root, through: THROUGH_R8 });

    const sidecar = JSON.parse(readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.json'), 'utf8'));
    const markdown = readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.md'), 'utf8');

    assert.equal(sidecar.claims.length, outcome.ledger.claims.length);
    assert.ok(sidecar.claims.length > 1000, `expected the real population, found ${sidecar.claims.length}`);
    assert.deepEqual(parseOriginSpec(markdown), sidecar);
    assert.equal(
      sidecar.claims.filter((claim) => claim.claim_type === 'unresolved')
        .every((claim) => claim.grill_question.length > 0),
      true,
    );
  } finally {
    out.dispose();
  }
});

test('IT-5: the r8 comparison against the answer key names the differing headings', { skip: !bundleAvailable || !targetAvailable }, async () => {
  const out = scratchOutput();
  try {
    await analyzeProject({ root: REVERSE_ROOT, out: out.root, through: THROUGH_R8 });
    const knownDeltaPath = join(PROJECT_ROOT, KNOWN_DELTA_RELATIVE_PATH);
    const knownDelta = existsSync(knownDeltaPath) ? JSON.parse(readFileSync(knownDeltaPath, 'utf8')) : NO_KNOWN_DELTA;

    const result = reconcile({
      stage: 'r8',
      projectRoot: PROJECT_ROOT,
      candidatePath: join(out.root, 'ORIGIN-SPEC-CANDIDATE.json'),
      knownDelta,
    });

    assert.equal(result.stage, 'r8');
    assert.equal(Array.isArray(result.disagreements), true);
    assert.equal('score' in result, false, 'a comparison lists differences; it never scores');
    assert.equal('verdict' in result, false);
    for (const disagreement of result.disagreements) {
      assert.ok(disagreement.kind.length > 0);
      assert.ok(disagreement.name.length > 0, 'a disagreement names the heading it is about');
    }
  } finally {
    out.dispose();
  }
});

// --- The layered serving packet, through the pipeline that publishes it ----------

test('IT-6: a run through R7 publishes a layered packet whose counts reconcile with its ledger', async () => {
  const tree = createSyntheticTree(LAYERED_SERVING_TREE);
  const out = scratchOutput();
  try {
    await analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R7 });

    const ledger = JSON.parse(readFileSync(join(out.root, 'CLAIM-LEDGER.json'), 'utf8'));
    const markdown = readFileSync(join(out.root, 'R7-SERVING.md'), 'utf8');
    const unresolved = unresolvedIn(ledger);

    assert.ok(
      unresolved.length > CARD_LAYERING_THRESHOLD,
      `the fixture must carry more unresolved claims than the threshold, found ${unresolved.length}`,
    );
    const stated = statedCounts(markdown);
    assert.equal(stated.served + stated.withheld, unresolved.length, 'no claim may be dropped by the selection and go uncounted');
    assert.match(markdown, /^- \*\*boundary\*\* — \d+ card\(s\)/m);
    assert.match(markdown, /^- \*\*contract\*\* — 0 card\(s\)/m, 'the contract level is withheld while its boundary is open');
    assert.match(markdown, /^- \*\*bundle\*\* — \d+ card\(s\)/m);
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT-6: the published packet is the layered selection, card for card, and withholds rather than serves', async () => {
  const tree = createSyntheticTree(LAYERED_SERVING_TREE);
  const out = scratchOutput();
  try {
    await analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R7 });

    const ledger = JSON.parse(readFileSync(join(out.root, 'CLAIM-LEDGER.json'), 'utf8'));
    const markdown = readFileSync(join(out.root, 'R7-SERVING.md'), 'utf8');
    const packet = renderServing(ledger, { layered: true });

    assert.deepEqual(
      documentedCardIds(markdown),
      packet.served.map((card) => card.claim_id),
      'the page states the order the exit selected, so the exit asks for the layered shape',
    );
    assert.ok(packet.servedCount < unresolvedIn(ledger).length, 'the open boundary withholds its contract level');
    assert.match(markdown, /at the \*\*bundle\*\* level/, 'a hung card says which card it hangs from');
    assert.match(markdown, /^- \d+ withheld — .+$/m, 'the page names the rule it withheld under, not only the count');
    assert.match(markdown, /^- \d+ withheld — .*`src\/api`/m, 'and the scope the rule applied to');
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT-6: the same tree publishes a byte-identical packet on a second run', async () => {
  const tree = createSyntheticTree(LAYERED_SERVING_TREE);
  const first = scratchOutput();
  const second = scratchOutput();
  try {
    await analyzeProject({ root: tree.root, out: first.root, through: THROUGH_R7 });
    await analyzeProject({ root: tree.root, out: second.root, through: THROUGH_R7 });

    assert.equal(
      readFileSync(join(second.root, 'R7-SERVING.md'), 'utf8'),
      readFileSync(join(first.root, 'R7-SERVING.md'), 'utf8'),
      'the layering must not introduce run-to-run variation into a document a human decides from',
    );
  } finally {
    tree.dispose();
    first.dispose();
    second.dispose();
  }
});

test('IT-6: over the real experiment input the packet layers and reconciles', { skip: !targetAvailable }, async () => {
  const out = scratchOutput();
  try {
    await analyzeProject({ root: REVERSE_ROOT, out: out.root, through: THROUGH_R7 });

    const ledger = JSON.parse(readFileSync(join(out.root, 'CLAIM-LEDGER.json'), 'utf8'));
    const markdown = readFileSync(join(out.root, 'R7-SERVING.md'), 'utf8');
    const unresolved = unresolvedIn(ledger);

    assert.ok(unresolved.length > CARD_LAYERING_THRESHOLD);
    const stated = statedCounts(markdown);
    assert.equal(stated.served + stated.withheld, unresolved.length);
    assert.ok(stated.served > 0 && stated.served < unresolved.length, 'the packet serves a part of what is open');
    assert.match(markdown, /^- \*\*boundary\*\* — \d+ card\(s\)/m);
    assert.match(markdown, /^- \*\*bundle\*\* — \d+ card\(s\)/m);
  } finally {
    out.dispose();
  }
});

test('IT-6: the spike still produces the sequence it calibrated', () => {
  const tree = createSyntheticTree(SPIKE_SLICE_FILES);
  try {
    const outcome = runSpike({ root: tree.root, slice: 'login', recorded: EMPTY_RECORD });
    const ledgerOrder = outcome.ledger.claims.map((claim) => claim.claim_id).sort(compareText);

    assert.deepEqual(outcome.cards.map((card) => card.claim_id), ledgerOrder);
    assert.equal(outcome.cardRun.layered, false, 'the recorded slice sits below the threshold');
    assert.equal(outcome.cardRun.suppressed, 0);
  } finally {
    tree.dispose();
  }
});

test('IT-4: the forward rotation still reproduces every frozen value', () => {
  const result = checkBaselines({ projectRoot: PROJECT_ROOT });
  assert.equal(result.verdict, 'proved', 'no backward step may change forward-rotation behaviour');
});
