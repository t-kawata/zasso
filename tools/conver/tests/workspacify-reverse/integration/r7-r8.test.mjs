// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
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
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANALYSIS_STAGES, analyzeProject, EMPTY_RECORD, runSpike } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { CARD_LAYERING_THRESHOLD, renderServing, renderWithholdingNote } from '../../../.claude/scripts/workspacify-reverse/lib/packet.mjs';
// [::TICKET::] P23-8: the two lanes R7 now publishes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-8 --for-spec --no-implementation-order`.
import {
  LANE_FALSIFICATION_BUDGET,
  LANE_MEMBERSHIP,
  RISK_CATEGORIES,
  assertAuthorityRecorded,
  assertLanesAreSeparate,
  blockCanonisation,
  classifySecurityLane,
  isStrongFalsification,
} from '../../../.claude/scripts/workspacify-reverse/lib/security-lane.mjs';
import {
  ADJUDICATION_STATES,
  MISMATCH_KINDS,
  adjudicateCandidates,
  assertCardIsAdjudicable,
  assertNoCandidateLost,
  countCandidates,
  deriveMismatches,
  physicalPartition,
} from '../../../.claude/scripts/workspacify-reverse/lib/reflexion.mjs';
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

// ---------------------------------------------------------------------------
// P23-8 — the security lane and the adjudication cards, both published at R7
// ---------------------------------------------------------------------------
//
// N3 and N4 are absences of the same shape: a module complete, tested, and
// unreachable. The tests below are written against the *published* documents
// rather than against the modules, because the defect they exist to catch is a
// wiring that computes a classification and then publishes something else. Every
// assertion re-reads what the run wrote, so an assertion that ran only in memory
// cannot satisfy it.
//
// The two conservation properties are the load-bearing ones: lanes separate and
// candidates conserved. A lane document whose separation was never checked, and a
// card set that quietly dropped a candidate, are exactly the two failures F15 and
// F14 name, and both are invisible in a document that merely renders.

/**
 * A population whose anchors name an authorization risk term.
 *
 * `login` and `session` are whole segments of the path, which is how the
 * classifier reads risk — the claim families describe their subject in a fixed
 * sentence that almost never names the risk, so the path and the line are what
 * carry it. `src/model.rs` names nothing, so it lands in the ordinary lane and
 * gives the per-lane counts something to disagree about.
 */
const SECURITY_LANE_TREE = Object.freeze({
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
  'src/api/session.rs': [
    'use crate::model::User;',
    '',
    'pub fn session_for(user: &User) -> Result<String, Error> {',
    '    assert!(!user.name.is_empty());',
    '    if user.name.len() > 64 {',
    '        return Err(Error::TooLong);',
    '    }',
    '    Ok(user.name.clone())',
    '}',
    '',
  ].join('\n'),
  // A claim that names no risk term, so the split has two sides. `src/model.rs`
  // alone does not give one: it consumes nothing, so it produces no claim at all.
  'src/report/emit.rs': [
    'use crate::model::User;',
    '',
    'pub fn emit(user: &User) -> Result<String, Error> {',
    '    assert!(!user.name.is_empty());',
    '    Ok(user.name.clone())',
    '}',
    '',
  ].join('\n'),
  'src/model.rs': 'pub struct User { pub name: String }\n',
});

/** The prior partition, as the old cycle left it on disk beside the tree. */
const PRIOR_DIRS_TREE = Object.freeze({
  trees: {
    rust: {
      name: 'src',
      mappedNodeIds: [{ nodeId: 'N0100', title: 'the source root' }],
      children: [
        {
          name: 'api',
          mappedNodeIds: [{ nodeId: 'N0101', title: 'the api boundary' }],
          children: [],
        },
      ],
    },
  },
});

/**
 * A population carrying no risk term anywhere, so its run publishes a lane
 * document with nothing blocked. It exists so that "the document set does not
 * depend on what a lane found" can be asserted by running both and comparing.
 */
const ORDINARY_ONLY_TREE = Object.freeze({
  'src/plain/handler.rs': [
    'use crate::plain::Shape;',
    '',
    'pub fn handle(shape: &Shape) -> Result<(), Error> {',
    '    assert!(!shape.name.is_empty());',
    '    if shape.name.len() > 64 {',
    '        return Err(Error::TooLong);',
    '    }',
    '    Ok(())',
    '}',
    '',
  ].join('\n'),
  'src/plain/shape.rs': 'pub struct Shape { pub name: String }\n',
});

/** Run a tree through R7 and hand back a reader for what it published. */
// [::TICKET::] P23-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-8 --for-spec --no-implementation-order`.
async function publishR7(tree) {
  const out = scratchOutput();
  await analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R7 });
  return {
    out,
    // Parsed on every call rather than cached, so a test reads the file the run
    // wrote rather than a copy taken before some later step could have moved it.
    read: (name) => JSON.parse(readFileSync(join(out.root, name), 'utf8')),
    markdown: (name) => readFileSync(join(out.root, name), 'utf8'),
    names: () => readdirSync(out.root).sort(),
  };
}

/** Every key at every depth of a JSON value, so a walk cannot stop at the first level. */
// [::TICKET::] P23-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-8 --for-spec --no-implementation-order`.
function keysAtEveryDepth(value, found = []) {
  if (Array.isArray(value)) {
    for (const entry of value) keysAtEveryDepth(entry, found);
    return found;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      found.push(key);
      keysAtEveryDepth(entry, found);
    }
  }
  return found;
}

test('P23-8 IT-1: R7 publishes both lanes and both sidecars in one run', async () => {
  const tree = createSyntheticTree(SECURITY_LANE_TREE);
  const published = await publishR7(tree);
  try {
    for (const name of ['R7-SECURITY-LANE.md', 'SECURITY-LANE.json', 'R7-ADJUDICATION.md', 'ADJUDICATION-CANDIDATES.json']) {
      assert.equal(existsSync(join(published.out.root, name)), true, `${name} must be published by a run that reaches R7`);
    }
    // The lanes are presentation, not a gate: R8's spec was not asked for here,
    // but the serving packet R7 already published is still beside them.
    assert.equal(published.names().includes('R7-SERVING.md'), true);
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});

test('P23-8 C001 postcondition: every claim is in exactly one lane or explicitly outside every lane, and the counts are stated', async () => {
  const tree = createSyntheticTree(SECURITY_LANE_TREE);
  const published = await publishR7(tree);
  try {
    const { classification } = published.read('SECURITY-LANE.json');
    const markdown = published.markdown('R7-SECURITY-LANE.md');

    // The vocabulary is the module's, not narrowed by what this ledger happened
    // to contain: every declared category has a row even when its count is zero.
    assert.deepEqual(
      Object.keys(classification.categories).sort(),
      [...RISK_CATEGORIES].sort(),
      'a category missing from the report cannot be told apart from one that was measured at zero',
    );

    const placed = classification.lane.security.length + classification.lane.ordinary.length;
    assert.equal(
      classification.counts.total,
      placed + classification.reported.length,
      'every claim is in a lane or reported — the counts partition the population',
    );
    assert.equal(classification.counts.security, classification.lane.security.length);
    assert.equal(classification.counts.ordinary, classification.lane.ordinary.length);
    assert.equal(classification.counts.unclassified, classification.reported.length);

    assert.ok(classification.lane.security.length > 0, 'this fixture names a risk term, so the lane is not empty');
    assert.ok(classification.lane.ordinary.length > 0, 'and it holds an ordinary claim, so the split is a split');

    assert.match(markdown, /- claims read: \d+/);
    assert.match(markdown, /- in the security lane: \d+/);
    assert.match(markdown, /- in the ordinary lane: \d+/);
    assert.match(markdown, /- reported rather than settled: \d+/);
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});

test('P23-8 C001 invariant: the separation assertion holds over the published classification, and can fail', async () => {
  const tree = createSyntheticTree(SECURITY_LANE_TREE);
  const published = await publishR7(tree);
  try {
    // Read back from disk: the assertion is run on what was published, so a
    // wiring that checked an in-memory object and then wrote a different one
    // fails here rather than passing in memory.
    assert.doesNotThrow(() => assertLanesAreSeparate(published.read('SECURITY-LANE.json').classification));

    // The predicate is shown to discriminate, or 'holds' would mean 'cannot fail'.
    assert.throws(
      () => assertLanesAreSeparate({ lane: { security: [{ claim_id: 'clm-1' }], ordinary: [{ claim_id: 'clm-1' }] } }),
      /clm-1/,
    );
    assert.throws(
      () => assertLanesAreSeparate({ lane: { security: [{ claim_id: 'clm-1' }] } }),
      /two lists, never one list with a flag/,
    );
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});

test('P23-8 C002 postcondition: a thin falsification plan is blocked and published with its identifier, and the budget is the module\'s', async () => {
  const tree = createSyntheticTree(SECURITY_LANE_TREE);
  const published = await publishR7(tree);
  try {
    const lane = published.read('SECURITY-LANE.json');
    const markdown = published.markdown('R7-SECURITY-LANE.md');

    // The lane is presented whole: one block record per security claim, and no
    // claim silently missing from the set.
    assert.equal(lane.blocks.length, lane.classification.lane.security.length);
    assert.equal(
      new Set(lane.blocks.map((block) => block.claim_id)).size,
      lane.blocks.length,
      'a claim named twice would double a decision a human has to make',
    );
    assert.equal(lane.blockedCount, lane.blocks.filter((block) => block.canonisation_blocked).length);
    assert.ok(lane.blockedCount > 0, 'this run records no human authority, so every lane claim is blocked');
    assert.match(markdown, /- blocked from canonisation: \d+/);

    for (const block of lane.blocks.filter((entry) => entry.canonisation_blocked)) {
      assert.ok(block.claim_id, 'a block names the claim it fell on');
      assert.ok(block.missing.length > 0, 'a block names what was missing rather than only that something was');
      // C002 requires the count found beside the count required. Both come from
      // the module that owns the budget, so this is the rule's own reading.
      assert.equal(block.falsification.channelsRequired, LANE_FALSIFICATION_BUDGET);
      assert.equal(typeof block.falsification.channelsFound, 'number');
      assert.equal(block.falsification.strong, false, 'the claim is blocked, so its plan is not strong');
      assert.match(
        markdown,
        new RegExp(`\`${block.claim_id}\`[\\s\\S]{0,400}?falsification channels found: \\d+, required: ${LANE_FALSIFICATION_BUDGET}`),
        'the page states the count found beside the count required',
      );
    }

    // The threshold is the module's own declaration, read rather than restated.
    assert.equal(LANE_FALSIFICATION_BUDGET, 2);
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});

test('P23-8 C002 invariant: no claim is canonisable without an authority record, and none is omitted', async () => {
  const tree = createSyntheticTree(SECURITY_LANE_TREE);
  const published = await publishR7(tree);
  try {
    const lane = published.read('SECURITY-LANE.json');

    // assertAuthorityRecorded refuses the missing record rather than defaulting one.
    assert.throws(() => assertAuthorityRecorded({ authority_kind: 'role' }), /human authority record/);
    assert.throws(() => assertAuthorityRecorded(null), /human authority record/);

    // Nothing in this run records a human authority, so the canonisable set is
    // empty and the assertion is run over exactly that set.
    const canonisable = lane.blocks.filter((block) => block.canonisation_blocked === false);
    assert.deepEqual(canonisable, [], 'a claim canonised with no authority is the ratification F15 names');
    for (const block of canonisable) assertAuthorityRecorded(block.authority);

    // And nothing was omitted in its place: every lane claim is accounted for.
    assert.equal(lane.blocks.length, lane.classification.lane.security.length);
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});

test('P23-8 C003 postcondition: the cards carry both partitions, an adjudication state and mismatch kinds', async () => {
  const tree = createSyntheticTree({
    ...SECURITY_LANE_TREE,
    'RFC-ROOT-Dirs-Tree.json': JSON.stringify(PRIOR_DIRS_TREE, null, 2),
  });
  const published = await publishR7(tree);
  try {
    const adjudication = published.read('ADJUDICATION-CANDIDATES.json');
    const markdown = published.markdown('R7-ADJUDICATION.md');

    assert.equal(adjudication.logicalState, 'stated', 'this fixture carries a prior partition');
    assert.ok(adjudication.logical.length > 0, 'and it maps at least one directory');

    // `physical` is already the partition, so its groups are read directly —
    // `physicalPartition` consumes a *structure*, and handing it a partition
    // yields no groups at all.
    assert.ok(adjudication.physical.groups.length >= 2, 'this fixture has a non-trivial physical partition');

    assert.ok(adjudication.cards.length > 0);
    // The state is derived once and published beside the cards, so each card can
    // be checked against it rather than only against the vocabulary.
    assert.ok(ADJUDICATION_STATES.includes(adjudication.adjudicationState));
    assert.equal(
      adjudication.candidates.every((candidate) => candidate.adjudication === adjudication.adjudicationState),
      true,
      'the cards state one adjudication state, so the candidates they draw from must carry it',
    );

    let attachedMismatches = 0;
    for (const card of adjudication.cards) {
      assert.equal(card.adjudication, adjudication.adjudicationState);
      assert.ok(Array.isArray(card.mismatches));
      for (const mismatch of card.mismatches) {
        assert.ok(MISMATCH_KINDS.includes(mismatch.kind));
        // A card aggregates the mismatches of every candidate that places it, so
        // the identity to check is that each one names a candidate the run
        // actually generated — not that it equals some card-level id, which a
        // card does not have.
        assert.ok(
          adjudication.generated.some((candidate) => candidate.candidate_id === mismatch.candidate_id),
          `a mismatch on \`${card.scope}\` names a candidate that was never generated`,
        );
      }
      attachedMismatches += card.mismatches.length;
      assert.doesNotThrow(() => assertCardIsAdjudicable(card));
    }
    // Every recorded mismatch whose path is a measured directory reaches a card,
    // so the per-card distribution loses nothing it was given.
    const onMeasuredDirectories = adjudication.mismatches
      .filter((mismatch) => adjudication.physical.groups.some((group) => group.name === mismatch.path)).length;
    assert.equal(attachedMismatches, onMeasuredDirectories);

    assert.match(markdown, /## Physical partition/);
    assert.match(markdown, /## Logical partition/);
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});

test('P23-8 C003 boundary: with no Dirs-Tree the document is published, says the logical side is undecided, and does not infer one', async () => {
  const tree = createSyntheticTree(SECURITY_LANE_TREE);
  const published = await publishR7(tree);
  try {
    // The normal case for patterns 1 and 3: there is no prior partition on disk.
    assert.equal(existsSync(join(tree.root, 'RFC-ROOT-Dirs-Tree.json')), false);

    const adjudication = published.read('ADJUDICATION-CANDIDATES.json');
    const markdown = published.markdown('R7-ADJUDICATION.md');

    assert.equal(adjudication.logical, null);
    assert.equal(adjudication.logicalState, 'undecided');
    assert.ok(adjudication.cards.length > 0, 'the physical partition is still carried, with its cards');
    assert.match(markdown, /logical partition is undecided/i);

    // For the physical side to be echoed as the logical one is the conflation
    // F14 names: the question the cards ask is which partition the reader wants,
    // and answering it with the one already measured is answering nothing. The
    // document therefore names no logical unit at all.
    assert.equal(
      adjudication.cards.some((card) => Object.prototype.hasOwnProperty.call(card, 'logicalUnit')),
      false,
      'a card may not carry a logical unit this run never measured',
    );
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});

test('P23-8 C003 boundary: a Dirs-Tree that is present and names no package is not the same as one that is absent', async () => {
  const tree = createSyntheticTree({
    ...SECURITY_LANE_TREE,
    'RFC-ROOT-Dirs-Tree.json': JSON.stringify({ trees: {} }, null, 2),
  });
  const published = await publishR7(tree);
  try {
    const adjudication = published.read('ADJUDICATION-CANDIDATES.json');
    const markdown = published.markdown('R7-ADJUDICATION.md');

    assert.equal(adjudication.logicalState, 'empty', 'a prior partition with no packages is a third statement');
    assert.deepEqual(adjudication.logical, []);
    // The two cases must not read the same, or "there is no prior partition" and
    // "the prior partition names nothing" become one sentence.
    assert.doesNotMatch(markdown, /logical partition is undecided/i);
    // Matched as two phrases rather than one span: the path in the sentence
    // contains a dot, so a `[^.]*` between them would stop at `.json`.
    assert.match(markdown, /A prior partition is on disk/i);
    assert.match(markdown, /names no package/i);
    assert.ok(adjudication.cards.length > 0);
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});

test('P23-8 C003 invariant: no candidate is lost, and the conservation check can fail', async () => {
  const tree = createSyntheticTree({
    ...SECURITY_LANE_TREE,
    'RFC-ROOT-Dirs-Tree.json': JSON.stringify(PRIOR_DIRS_TREE, null, 2),
  });
  const published = await publishR7(tree);
  try {
    const adjudication = published.read('ADJUDICATION-CANDIDATES.json');

    // Run on the published copy, so a rendering step cannot lose what the
    // computation preserved.
    assert.doesNotThrow(() => assertNoCandidateLost(adjudication.generated, adjudication.candidates));
    assert.equal(countCandidates(adjudication.candidates).total, adjudication.generated.length);
    assert.ok(adjudication.generated.length > 1, 'more than one rule generated a candidate, so the count is a count');

    // Discrimination: the predicate refuses a loss and names it, on both of the
    // two things it checks. The count branch fires first, so the identity branch
    // needs a set of the same size whose membership differs.
    assert.throws(
      () => assertNoCandidateLost(adjudication.generated, adjudication.candidates.slice(1)),
      /candidate model\(s\) disappeared/,
    );
    // The count is unchanged, so the identity branch is what fires — and it names
    // the candidate that went missing from the generated side, which is the one a
    // reader has to look for.
    const renamed = adjudication.candidates.map((candidate, index) => (
      index === 0 ? { ...candidate, candidate_id: 'cand-never-generated' } : candidate
    ));
    assert.throws(
      () => assertNoCandidateLost(adjudication.generated, renamed),
      /cand-physical-faithful were dropped during adjudication/,
    );

    // Cards are one per measured directory, and withheld is its complement. The
    // identity the ticket states over candidates is false: generateCandidates
    // returns one per rule, while a card is a directory. Asserting the wrong
    // identity would pass only on a fixture whose directory count happens to be
    // the candidate count.
    assert.equal(adjudication.cards.length + adjudication.withheld.length, adjudication.physical.groups.length);
    assert.equal(new Set(adjudication.cards.map((card) => card.scope)).size, adjudication.cards.length);
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});

test('P23-8 C004 postcondition: each kind is counted and the count of cards with no mismatch is stated', async () => {
  const tree = createSyntheticTree({
    ...SECURITY_LANE_TREE,
    'RFC-ROOT-Dirs-Tree.json': JSON.stringify(PRIOR_DIRS_TREE, null, 2),
  });
  const published = await publishR7(tree);
  try {
    const adjudication = published.read('ADJUDICATION-CANDIDATES.json');
    const markdown = published.markdown('R7-ADJUDICATION.md');

    assert.deepEqual(Object.keys(adjudication.mismatchCounts).sort(), [...MISMATCH_KINDS].sort());
    assert.equal(
      MISMATCH_KINDS.reduce((total, kind) => total + adjudication.mismatchCounts[kind], 0),
      adjudication.mismatches.length,
      'the counts by kind are a partition of the recorded mismatches',
    );
    assert.equal(
      adjudication.cardsWithNoMismatch,
      adjudication.cards.filter((card) => card.mismatches.length === 0).length,
    );
    for (const kind of MISMATCH_KINDS) assert.match(markdown, new RegExp(`- ${kind}: \\d+`));
    assert.match(markdown, /- cards with no mismatch: \d+/);
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});

test('P23-8 C004 invariant: the recorded count equals the count re-derived from the published data', async () => {
  const tree = createSyntheticTree({
    ...SECURITY_LANE_TREE,
    'RFC-ROOT-Dirs-Tree.json': JSON.stringify(PRIOR_DIRS_TREE, null, 2),
  });
  const published = await publishR7(tree);
  try {
    const adjudication = published.read('ADJUDICATION-CANDIDATES.json');

    // Re-derived here from the published candidates and the published physical
    // partition. A rendering that dropped a mismatch from the record fails,
    // which is the property C004's invariant actually asks for.
    const derivedFromDisk = adjudication.generated
      .flatMap((candidate) => deriveMismatches(candidate, adjudication.physical));
    assert.equal(adjudication.recordedMismatchCount, derivedFromDisk.length);
    assert.equal(adjudication.mismatches.length, derivedFromDisk.length);

    const countByKind = (mismatches) => MISMATCH_KINDS.reduce(
      (counts, kind) => ({ ...counts, [kind]: mismatches.filter((entry) => entry.kind === kind).length }),
      {},
    );
    assert.deepEqual(adjudication.mismatchCounts, countByKind(derivedFromDisk));
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});

test('P23-8 C004 boundary: a zero difference is published as a signal rather than as a clean result', async () => {
  const tree = createSyntheticTree({
    ...SECURITY_LANE_TREE,
    'RFC-ROOT-Dirs-Tree.json': JSON.stringify(PRIOR_DIRS_TREE, null, 2),
  });
  const published = await publishR7(tree);
  try {
    const adjudication = published.read('ADJUDICATION-CANDIDATES.json');
    const markdown = published.markdown('R7-ADJUDICATION.md');

    // `physical_faithful` asserts the layout is the architecture, so by
    // construction it disagrees with the measured layout nowhere. That zero is
    // F1's case: the design says a difference of zero can be a signal of
    // abnormality rather than of health, so it may not be published as health.
    const faithful = adjudication.candidates.find((candidate) => candidate.derivedFrom === 'physical_faithful');
    assert.ok(faithful, 'the rule that states the layout is the architecture is one of the candidates');
    assert.deepEqual(deriveMismatches(faithful, adjudication.physical), []);
    assert.equal(adjudication.mismatchCountsByCandidate[faithful.candidate_id], 0);

    assert.match(markdown, /zero[^.\n]*signal/i);
    assert.doesNotMatch(markdown, /no mismatch(es)?[^.\n]*(clean|healthy)/i);
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});

test('P23-8 IT-2: the two new renderings state their counts through the one withholding discipline', async () => {
  const tree = createSyntheticTree(SECURITY_LANE_TREE);
  const published = await publishR7(tree);
  try {
    const adjudication = published.read('ADJUDICATION-CANDIDATES.json');
    const adjudicationMarkdown = published.markdown('R7-ADJUDICATION.md');
    const laneMarkdown = published.markdown('R7-SECURITY-LANE.md');

    // One implementation, two shapes: the note the serving packet already prints
    // is produced by the helper the two new documents call.
    const servingNote = renderWithholdingNote({
      withheldCount: 2,
      subject: 'unresolved claim(s)',
      entries: [{ count: 2, reason: 'the claim lies beyond the serving limit' }],
    });
    assert.match(servingNote.join('\n'), /2 further unresolved claim\(s\) were not printed here/);
    assert.match(servingNote.join('\n'), /the claim lies beyond the serving limit/);

    // A document that withheld nothing gets no note, and that is the discipline
    // working rather than the discipline skipped: the count is still stated.
    assert.deepEqual(renderWithholdingNote({ withheldCount: 0, subject: 'measured directory/ies', entries: [] }), []);

    // Nothing was withheld here — `physical_faithful` places every measured
    // directory — so the withheld count is a measured zero, stated as such.
    assert.equal(adjudication.withheld.length, 0);
    assert.match(adjudicationMarkdown, /- withheld: 0/);
    assert.doesNotMatch(adjudicationMarkdown, /were not printed here/);
    assert.match(laneMarkdown, /- blocked from canonisation: \d+/);
    assert.match(laneMarkdown, /- withheld: 0/);
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});

test('P23-8 IT-3: neither lane is a gate — the document set is the same with a blocked claim and without', async () => {
  const blockedTree = createSyntheticTree(SECURITY_LANE_TREE);
  const ordinaryTree = createSyntheticTree(ORDINARY_ONLY_TREE);
  const blocked = await publishR7(blockedTree);
  const ordinary = await publishR7(ordinaryTree);
  // The acceptance criterion is about the run that reaches R8: a blocked claim
  // must not stop the spec from being published, so the comparison is made at the
  // deepest stage rather than at the one the lanes are published from.
  const blockedSpecOut = scratchOutput();
  const ordinarySpecOut = scratchOutput();
  try {
    await analyzeProject({ root: blockedTree.root, out: blockedSpecOut.root, through: THROUGH_R8 });
    await analyzeProject({ root: ordinaryTree.root, out: ordinarySpecOut.root, through: THROUGH_R8 });

    // The condition is real: one run has a blocked claim and the other has none.
    assert.ok(blocked.read('SECURITY-LANE.json').blockedCount > 0);
    assert.equal(ordinary.read('SECURITY-LANE.json').blockedCount, 0);

    // And the document set is the same either way. A lane that could stop the
    // analysis would be the gate design 1.2 forbids.
    assert.deepEqual(blocked.names(), ordinary.names());
    for (const name of ['R7-SECURITY-LANE.md', 'R7-ADJUDICATION.md', 'SECURITY-LANE.json', 'ADJUDICATION-CANDIDATES.json']) {
      assert.equal(blocked.names().includes(name), true, `${name} is published beside a blocked claim`);
      assert.equal(ordinary.names().includes(name), true, `${name} is published without one`);
    }

    // The R8 spec is still published over a ledger carrying a blocked claim.
    for (const out of [blockedSpecOut, ordinarySpecOut]) {
      assert.equal(existsSync(join(out.root, 'ORIGIN-LONG-SPEC.json')), true);
      assert.equal(existsSync(join(out.root, 'ORIGIN-LONG-SPEC.md')), true);
    }
    assert.deepEqual(
      readdirSync(blockedSpecOut.root).sort(),
      readdirSync(ordinarySpecOut.root).sort(),
      'the full document set is invariant to what the lane found',
    );
  } finally {
    blockedTree.dispose();
    ordinaryTree.dispose();
    blocked.out.dispose();
    ordinary.out.dispose();
    blockedSpecOut.dispose();
    ordinarySpecOut.dispose();
  }
});

test('P23-8 IT-4: neither lane introduces a verdict — no eligible, verdict, score or recommendation key', async () => {
  const tree = createSyntheticTree({
    ...SECURITY_LANE_TREE,
    'RFC-ROOT-Dirs-Tree.json': JSON.stringify(PRIOR_DIRS_TREE, null, 2),
  });
  const published = await publishR7(tree);
  try {
    const forbidden = ['eligible', 'verdict', 'score', 'recommendation'];
    for (const name of ['SECURITY-LANE.json', 'ADJUDICATION-CANDIDATES.json']) {
      const keys = keysAtEveryDepth(published.read(name));
      assert.ok(keys.length > 0, `${name} was walked, so the absence below is an absence of keys rather than of reading`);
      for (const key of keys) {
        assert.equal(forbidden.includes(key), false, `${name} carries the verdict key \`${key}\``);
      }
    }
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});

test('P23-8 C002 postcondition: the budget is what decides a block, and the module is what declares the budget', () => {
  // Exercised on the module directly, because the run cannot produce a strong
  // plan yet: every evidence record this pipeline writes is source_static, since
  // no observation channel has run. The wiring must therefore block every lane
  // claim — and the day a channel exists, this predicate is what admits one.
  const laneClaim = {
    claim_id: 'clm-sec-1',
    lane: LANE_MEMBERSHIP.SECURITY,
    falsification: 'remove the guard at src/api/login.rs:4 and observe whether the caller still resolves',
  };
  const authority = { authority_kind: 'role', authority_ref: 'security-domain-steward' };
  const thin = [{ channel: 're-read the source', evidence_mode: 'source_static' }];
  const strong = [
    { channel: 'read the built artefact', evidence_mode: 'build_semantic' },
    { channel: 'run without the guard', evidence_mode: 'runtime_dynamic' },
  ];

  assert.equal(isStrongFalsification(laneClaim, thin), false);
  assert.equal(isStrongFalsification(laneClaim, strong), true);
  assert.equal(isStrongFalsification({ ...laneClaim, falsification: '' }, strong), false);

  const blocked = blockCanonisation(laneClaim, { authorityRecord: authority, falsificationPlan: thin });
  assert.equal(blocked.canonisation_blocked, true);
  assert.equal(blocked.claim_id, 'clm-sec-1');
  assert.deepEqual(blocked.missing, ['a strong falsification']);

  const passing = blockCanonisation(laneClaim, { authorityRecord: authority, falsificationPlan: strong });
  assert.equal(passing.canonisation_blocked, false);
  assert.deepEqual(passing.missing, []);

  // An ordinary claim is outside this gate, and a claim whose lane was never
  // settled is not: answering "the gate does not apply" there would allow a
  // high-risk claim to pass by never being classified.
  assert.equal(
    blockCanonisation({ claim_id: 'clm-plain-1', lane: LANE_MEMBERSHIP.ORDINARY }, {}).canonisation_blocked,
    false,
  );
  assert.equal(blockCanonisation({ claim_id: 'clm-unsettled' }, {}).canonisation_blocked, true);
});

test('P23-8 IT-5: the lane classification refuses the inputs it refused before the wiring', () => {
  // The wiring gave the module a caller; it did not loosen what the module accepts.
  assert.throws(() => classifySecurityLane(null), /no claim ledger/);
  assert.throws(() => classifySecurityLane({ claims: [] }), /must name the root/);
  assert.throws(() => classifySecurityLane({ root: '/tmp/nowhere' }), /carries no list of claims/);
});

test('P23-8 IT-6: the published candidate set is adjudicated, and adjudication conserves it', async () => {
  const tree = createSyntheticTree(SECURITY_LANE_TREE);
  const published = await publishR7(tree);
  try {
    const adjudication = published.read('ADJUDICATION-CANDIDATES.json');
    const adjudicated = adjudicateCandidates(adjudication.generated);

    // The published set carries an adjudication state from the declared
    // vocabulary, so a card a human has not answered says so rather than
    // defaulting to a decision.
    assert.deepEqual(
      [...new Set(adjudication.candidates.map((candidate) => candidate.adjudication))].sort(),
      [ADJUDICATION_STATES[0]],
      'nothing has been decided at R7, so every candidate is unresolved',
    );
    assertNoCandidateLost(adjudication.generated, adjudicated);
    assert.equal(countCandidates(adjudicated).unresolved, adjudication.generated.length);
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});

test('P23-8 IT-7: an empty target still publishes both lanes, and says why they are empty', async () => {
  // The case that proves the lanes are material and not gates. An empty tree
  // places no directory, so there is nothing to partition — and a wiring that
  // threw there would turn presentation into the refusal condition design 1.2
  // forbids, and would lose the whole run rather than one lane.
  const tree = createSyntheticTree({});
  const published = await publishR7(tree);
  try {
    const adjudication = published.read('ADJUDICATION-CANDIDATES.json');
    const lane = published.read('SECURITY-LANE.json');
    const adjudicationMarkdown = published.markdown('R7-ADJUDICATION.md');

    assert.equal(adjudication.empty, true);
    assert.deepEqual(adjudication.generated, []);
    assert.deepEqual(adjudication.cards, []);
    assert.equal(adjudication.recordedMismatchCount, 0);
    assert.match(adjudicationMarkdown, /This card set is empty\./);
    assert.match(
      adjudicationMarkdown,
      /explicit empty result from a run that looked/,
      'the emptiness is stated rather than implied by an absent section',
    );

    assert.equal(lane.classification.counts.total, 0);
    assert.equal(lane.blockedCount, 0);
    assert.match(published.markdown('R7-SECURITY-LANE.md'), /The security lane is empty\./);
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});

test('P23-8 IT-8: a prior partition on disk and unreadable is not reported as an absent one', async () => {
  // The three cases the sidecar must keep apart. A consumer reads `logicalState`
  // rather than parsing the prose beside it, so "there is no prior partition" and
  // "the prior partition is on disk and broken" must not share a value.
  const tree = createSyntheticTree({
    ...SECURITY_LANE_TREE,
    'RFC-ROOT-Dirs-Tree.json': '{ this is not valid json',
  });
  const published = await publishR7(tree);
  try {
    const adjudication = published.read('ADJUDICATION-CANDIDATES.json');
    const markdown = published.markdown('R7-ADJUDICATION.md');

    assert.equal(adjudication.logicalState, 'unreadable');
    assert.notEqual(
      adjudication.logicalState,
      'undecided',
      'a present but unreadable prior partition is not the absence of one',
    );
    assert.equal(adjudication.logical, null);
    assert.match(adjudication.logicalReason, /could not be read/);
    assert.match(markdown, /could not be read/);
    // The run continues: a broken prior is material for a reader, not a stop.
    assert.ok(adjudication.cards.length > 0);
    assert.match(markdown, /## Physical partition/);
  } finally {
    tree.dispose();
    published.out.dispose();
  }
});
