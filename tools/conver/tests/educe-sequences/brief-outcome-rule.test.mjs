// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
// The rule the reading brief states, and the check that holds it (PX-251, contract C005).
//
// `singleStep` is a member of two closed vocabularies. As an operation `position` it says
// this operation is a single step; as an entry `outcome` it says this single-step sequence
// is drawn. A reader that reports the position and leaves the owning entry ruled away has
// recorded half of one decision in two fields, and `every-step-belongs-to-a-drawn-sequence`
// refuses the result: the step hangs off an entry no diagram carries.
//
// The check is right and stays as it is. What this file holds is that the brief — the file
// the reader is handed — states the rule, so the trap is named where the reading is invited
// rather than discovered through a refusal a generation later.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { DIAGRAMMED_OUTCOMES, checkAll } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BRIEF = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/briefs/uncovered.md');
const GOLDEN_ARTIFACT = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger-sequences.json');
const GOLDEN_SPEC = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.md');
const DRAWN_CHECK = 'every-step-belongs-to-a-drawn-sequence';

// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
function goldenArtifact() {
  return JSON.parse(readFileSync(GOLDEN_ARTIFACT, 'utf8'));
}

// ---------------------------------------------------------------------------
// C005 — the brief states the rule
// ---------------------------------------------------------------------------

test('C005 the brief states that the owning entry outcome, not the operation position, makes a step drawable', () => {
  const brief = readFileSync(BRIEF, 'utf8');

  assert.match(brief, /outcome/, 'the brief names the field that decides');
  assert.match(brief, /singleStep/, 'the brief names the value that traps a reader, because it is a member of two vocabularies');
  assert.match(brief, /position/, 'the brief distinguishes the operation position from the entry outcome');
  assert.match(brief, /notASequence/, 'the brief names what a ruled-away entry is, so the refusal reads as a rule rather than an accident');
});

// ---------------------------------------------------------------------------
// C005 — the check enforces it, and nothing else decides
// ---------------------------------------------------------------------------

/** An entry the golden artifact draws, and the steps placed inside it. */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
function aDrawnEntryWithSteps(artifact) {
  const entry = artifact.sequences.find(
    (candidate) => DIAGRAMMED_OUTCOMES.includes(candidate.outcome)
      && artifact.steps.some((step) => step.sequence === candidate.id),
  );
  assert.notEqual(entry, undefined, 'the golden artifact holds a drawn entry with steps');
  return entry;
}

/** The same artifact with one entry ruled away, and every other field left alone. */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
function withEntryRuledAway(artifact, entry) {
  return {
    ...artifact,
    sequences: artifact.sequences.map((candidate) => (
      candidate.id === entry.id ? { ...candidate, outcome: 'notASequence' } : candidate
    )),
  };
}

test('C005 a step inside a claiming entry passes, and the same step inside a ruled-away entry is refused', () => {
  const spec = readSpecification(GOLDEN_SPEC);
  const artifact = goldenArtifact();
  const entry = aDrawnEntryWithSteps(artifact);

  const drawn = checkAll({ specLines: spec.lines, artifact });
  assert.equal(drawn.verdicts.some((verdict) => verdict.check === DRAWN_CHECK), false, JSON.stringify(drawn.verdicts));

  const ruledAway = withEntryRuledAway(artifact, entry);
  const refused = checkAll({ specLines: spec.lines, artifact: ruledAway }).verdicts.find((verdict) => verdict.check === DRAWN_CHECK);
  assert.notEqual(refused, undefined, 'the check refuses a step whose sequence is not one the artifact draws');
});

test('C005 the operation record is untouched by that refusal, so the entry outcome is the field that decides', () => {
  const spec = readSpecification(GOLDEN_SPEC);
  const artifact = goldenArtifact();
  const entry = aDrawnEntryWithSteps(artifact);
  const ruledAway = withEntryRuledAway(artifact, entry);

  assert.deepEqual(ruledAway.operations, artifact.operations, 'ruling an entry away is not a statement about any operation position');
  const refused = checkAll({ specLines: spec.lines, artifact: ruledAway }).verdicts.find((verdict) => verdict.check === DRAWN_CHECK);
  assert.notEqual(refused, undefined, 'a position alone cannot make a step drawable');
});
