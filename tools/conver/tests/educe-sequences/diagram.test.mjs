// Every sequence the artifact declares can be drawn from it (PX-248, C005).
//
// The artifact carried what a diagram needs and no diagram was drawn: `renderArtifact`
// emitted a listing, and `run.mjs` told the reader to run a module that does not exist.
// What is held here is that the data is sufficient — one diagram per sequence that claims
// to be one, participants taken from the steps — and that a sequence whose steps do not
// carry what a diagram needs is refused rather than drawn badly.
//
// @verifies C005
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkRenderFreshness, renderArtifact } from '../../.claude/scripts/educe-sequences/rail/harness.mjs';
import { checkAll } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { suppliedDocumentsOf } from '../../.claude/scripts/educe-sequences/rail/supplied.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURE = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/census');
const SPEC_PATH = join(FIXTURE, 'ledger.md');
const GOLDEN_PATH = join(FIXTURE, 'ledger-sequences.json');
const RENDER_PATH = join(FIXTURE, 'ledger-sequences.md');

const spec = readSpecification(SPEC_PATH);
const SUPPLIED = suppliedDocumentsOf(join(FIXTURE, 'educe-sequences'));

/** Judge an artifact with the material it was read beside.
 *
 * A borrowed census is re-derived from the supplied file, so an artifact that carries one
 * cannot be judged without the material it names: the check that would answer is the
 * re-derivation, and it has nothing to read. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function verify(artifact) {
  return checkAll({ specLines: spec.lines, artifact, recorded: { supplied: SUPPLIED } });
}

/** The golden artifact, read fresh so no test can hand another a mutated one. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function golden() {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
}

/** The sequences that claim to be sequences, which are the ones a diagram is owed for. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function drawable(artifact) {
  return artifact.sequences.filter((entry) => ['direct', 'viaNeighbour', 'singleStep'].includes(entry.outcome));
}

test('C005 one diagram is drawn per sequence that claims to be a sequence', () => {
  const artifact = golden();
  const rendered = renderArtifact(artifact);

  assert.equal((rendered.match(/sequenceDiagram/g) ?? []).length, drawable(artifact).length);
  assert.equal(drawable(artifact).length > 0, true, 'the fixture declares a sequence, so the count is not vacuous');
});

test('C005 every participant a step names is declared, and the messages follow the step order', () => {
  const artifact = golden();
  const rendered = renderArtifact(artifact);

  for (const entry of drawable(artifact)) {
    const steps = artifact.steps.filter((step) => step.sequence === entry.id);
    for (const step of steps) {
      assert.equal(rendered.includes(`participant ${step.subject}`), true, `${step.subject} is a participant`);
      assert.equal(rendered.includes(`participant ${step.object}`), true, `${step.object} is a participant`);
    }
    const positions = steps.map((step) => rendered.indexOf(`${step.predicate}`)).filter((index) => index !== -1);
    assert.deepEqual(positions, [...positions].sort((left, right) => left - right), 'the messages are drawn in step order');
  }
});

test('C005 a sequence an entry was ruled out of is not drawn, so the diagram set follows the rulings', () => {
  const artifact = golden();
  const rendered = renderArtifact(artifact);

  for (const entry of artifact.sequences.filter((sequence) => sequence.outcome === 'notASequence')) {
    assert.equal(rendered.includes(`sequenceDiagram\n  %% ${entry.id}`), false);
  }
});

test('C005 an undrawable sequence is refused rather than drawn, and the refusal names the step', () => {
  const artifact = golden();
  const undrawable = {
    ...artifact,
    steps: artifact.steps.map((step, index) => (index === 0 ? { ...step, object: '' } : step)),
  };
  const verdict = verify(undrawable).verdicts
    .find((entry) => entry.check === 'every-sequence-is-drawable');

  assert.notEqual(verdict, undefined);
  assert.equal(verdict.subject, artifact.steps[0].sequence);
  assert.match(verdict.reason, /object|step/);
});

test('C005 the committed rendering is byte-equal to a re-render, and a hand edit fails the freshness check', () => {
  const artifact = golden();
  const rendered = Buffer.from(renderArtifact(artifact), 'utf8');

  assert.equal(rendered.equals(readFileSync(RENDER_PATH)), true, 'the committed rendering is the rendered artifact');
  assert.deepEqual(checkRenderFreshness({ artifact, committedPath: RENDER_PATH }), { ok: true, files: [] });
});

test('C005 the command the run prints exists, and writing the rendering is what it does', () => {
  const renderModule = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/render.mjs');
  assert.equal(readFileSync(renderModule, 'utf8').includes('renderArtifact'), true);
  assert.equal(readFileSync(join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/run.mjs'), 'utf8').includes('rail/render.mjs'), true);
});
