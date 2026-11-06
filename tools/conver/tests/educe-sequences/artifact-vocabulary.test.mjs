// PX-383 @verifies C001
// A project states its vocabulary in the educe declaration. The phase-9 composition
// carries that authored object into the artifact, so the detector reads one record
// rather than inferring interface columns from a project's names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildArtifact } from '../../.claude/scripts/educe-sequences/rail/artifact.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';

const SPEC_PATH = new URL('./fixtures/spec/ledger.md', import.meta.url).pathname;
const RUN_INPUT = JSON.parse(readFileSync(new URL('./fixtures/spec/ledger.run.json', import.meta.url), 'utf8'));

/** Compose the ledger artifact from its recorded readings. */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
function compose(overrides = {}) {
  return buildArtifact({
    specPath: SPEC_PATH,
    spec: readSpecification(SPEC_PATH),
    declaration: RUN_INPUT.declaration,
    readings: {
      sequences: RUN_INPUT.readings.sequences,
      steps: RUN_INPUT.readings.steps,
      operations: RUN_INPUT.readings.operations,
      adjudications: RUN_INPUT.readings.adjudications,
    },
    supplied: 'supplied-digest',
    suppliedDocuments: {},
    ...overrides,
  });
}

test('C001 a declaration vocabulary reaches the composed artifact', () => {
  const artifact = compose({
    declaration: {
      ...RUN_INPUT.declaration,
      vocabulary: { requiredInterfaces: ['cli'], terminalStatuses: ['closed'] },
    },
  });

  assert.deepEqual(artifact.vocabulary.requiredInterfaces, ['cli']);
  assert.deepEqual(artifact.vocabulary.terminalStatuses, ['closed']);
});

test('C001 a previous artifact vocabulary is preserved when the declaration states none', () => {
  const previous = {
    ...compose(),
    schema_version: 3,
    vocabulary: { requiredInterfaces: ['rest'] },
  };
  const artifact = compose({ previousArtifact: previous });

  assert.deepEqual(artifact.vocabulary.requiredInterfaces, ['rest']);
});

test('C001 a declaration vocabulary wins over a preserved artifact vocabulary', () => {
  const previous = {
    ...compose(),
    vocabulary: { requiredInterfaces: ['rest'] },
  };
  const artifact = compose({
    previousArtifact: previous,
    declaration: {
      ...RUN_INPUT.declaration,
      vocabulary: { requiredInterfaces: ['cli'] },
    },
  });

  assert.deepEqual(artifact.vocabulary.requiredInterfaces, ['cli']);
});

test('C001 a malformed declaration vocabulary is refused by name', () => {
  assert.throws(
    () => compose({
      declaration: {
        ...RUN_INPUT.declaration,
        vocabulary: { requiredInterfaces: 'cli' },
      },
    }),
    /vocabulary/i,
  );
});
