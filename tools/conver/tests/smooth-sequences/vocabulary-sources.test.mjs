// [::TICKET::] PX-385 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-385 --for-spec --no-implementation-order`.
// [::TICKET::] PX-384 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-384 --for-spec --no-implementation-order`.
// PX-383 @verifies C001
// The interface set and the applicability of each check family are authored facts.
// The detector resolves them from the stated source and withholds when no source states
// them; it never infers an interface column from a project's column name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { APPLICABILITY_KEY_BY_CHECK, buildFamilySubChecks } from '../../.claude/scripts/smooth-sequences/lib/check-status.mjs';
import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import {
  APPLICABILITY_FAMILIES,
  INTERFACE_MAPPING_CHECK,
  loadVocabulary,
} from '../../.claude/scripts/smooth-sequences/lib/vocabulary.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import {
  defaultAllocateManifest,
  materializeSmoothWorkspace,
  minimalV3Artifact,
} from './helpers/workspace-fixture.mjs';

const ARTIFACT_PATH = '/tmp/example-sequences.json';
const SPEC_PATH = 'spec.md';
const SPEC_LINES = { [SPEC_PATH]: ['# Specification', 'no interface is declared'] };

/** The vocabulary a bare artifact and manifest state, with no workspace on disk. */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
function vocabularyOf(artifact, allocateManifest = defaultAllocateManifest(), specification = { specPath: SPEC_PATH, specLines: SPEC_LINES }) {
  return loadVocabulary({ artifact, artifactPath: ARTIFACT_PATH, allocateManifest, specification });
}

test('C001 a literalInLine column is not an interface without an authored declaration', () => {
  const artifact = minimalV3Artifact();
  delete artifact.vocabulary;
  artifact.pins.columns = [{ name: 'cli', decidedBy: 'literalInLine' }];

  const vocabulary = vocabularyOf(artifact);

  assert.equal(vocabulary.requiredInterfaces, null);
  assert.equal(vocabulary.withheld.some((entry) => entry.check === INTERFACE_MAPPING_CHECK), true);
});

test('C001 an authored vocabulary records its source and resolves the interface set', () => {
  const artifact = minimalV3Artifact();
  artifact.vocabulary = { requiredInterfaces: ['cli'], terminalStatuses: [] };

  const vocabulary = vocabularyOf(artifact);

  assert.deepEqual(vocabulary.requiredInterfaces, ['cli']);
  assert.equal(vocabulary.sources.requiredInterfaces, 'artifact.vocabulary');
});

test('C001 an explicit empty list is an authored none, not a withheld input', () => {
  const artifact = minimalV3Artifact();
  artifact.vocabulary = { requiredInterfaces: [], terminalStatuses: [] };

  const vocabulary = vocabularyOf(artifact);

  assert.deepEqual(vocabulary.requiredInterfaces, []);
  assert.equal(vocabulary.sources.requiredInterfaces, 'artifact.vocabulary');
  assert.equal(vocabulary.withheld.some((entry) => entry.check === INTERFACE_MAPPING_CHECK), false);
});

test('C001 an authored applicability record is returned with its ground', () => {
  const artifact = minimalV3Artifact();
  artifact.vocabulary = {
    requiredInterfaces: [],
    terminalStatuses: [],
    applicability: {
      'S3.interface': { applicable: false, ground: { line: 2, quote: 'no interface is declared' } },
    },
  };

  const vocabulary = vocabularyOf(artifact);

  assert.equal(vocabulary.applicability['S3.interface'].applicable, false);
  assert.deepEqual(vocabulary.applicability['S3.interface'].ground, { line: 2, quote: 'no interface is declared' });
});

test('C001 an applicability ground must quote the specification line it cites', () => {
  const artifact = minimalV3Artifact();
  artifact.vocabulary = {
    requiredInterfaces: [],
    terminalStatuses: [],
    applicability: {
      'S3.interface': { applicable: false, ground: { line: 2, quote: 'a sentence the specification does not carry' } },
    },
  };

  assert.throws(
    () => vocabularyOf(artifact),
    (error) => error.code === 'INVALID_VOCABULARY' && /ground/.test(error.message),
  );
});

test('C001 an applicability ground without the specification it cites is refused', () => {
  const artifact = minimalV3Artifact();
  artifact.vocabulary = {
    requiredInterfaces: [],
    terminalStatuses: [],
    applicability: {
      'S3.interface': { applicable: false, ground: { line: 2, quote: 'no interface is declared' } },
    },
  };

  assert.throws(
    () => vocabularyOf(artifact, defaultAllocateManifest(), {}),
    (error) => error.code === 'INVALID_VOCABULARY' && /specification/.test(error.message),
  );
});

test('C001 an applicability record without a ground is refused', () => {
  const artifact = minimalV3Artifact();
  artifact.vocabulary = {
    requiredInterfaces: [],
    terminalStatuses: [],
    applicability: { 'S3.interface': { applicable: false } },
  };

  assert.throws(
    () => vocabularyOf(artifact),
    (error) => error.code === 'INVALID_VOCABULARY' && error.message.includes('applicability'),
  );
});

test('C001 a declared S3.interface notApplicable is carried into the check status', () => {
  const artifact = minimalV3Artifact();
  artifact.vocabulary = {
    requiredInterfaces: [],
    terminalStatuses: [],
    applicability: {
      'S3.interface': { applicable: false, ground: { line: 2, quote: 'no interface is declared' } },
    },
  };
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    writeFileSync(join(workspace.root, SPEC_PATH), SPEC_LINES[SPEC_PATH].join('\n'));
    const index = indexArtifact(loadWorkspace(workspace.root));
    const check = buildFamilySubChecks('envelope', index)
      .find((entry) => entry.id === 'S3.interface-mapping-missing');

    assert.equal(check.status, 'notApplicable');
    assert.deepEqual(check.ground, { line: 2, quote: 'no interface is declared' });
  } finally {
    workspace.remove();
  }
});

test('C001 an applicability family outside the declared set is refused', () => {
  const artifact = minimalV3Artifact();
  artifact.vocabulary = {
    requiredInterfaces: [],
    terminalStatuses: [],
    applicability: {
      'S3.statuz': { applicable: false, ground: { line: 2, quote: 'no interface is declared' } },
    },
  };

  assert.throws(
    () => vocabularyOf(artifact),
    (error) => error.code === 'INVALID_VOCABULARY' && /S3\.statuz/.test(error.message),
  );
});

test('C001 an explicit empty interface set is vacuous, never executed', () => {
  const artifact = minimalV3Artifact();
  artifact.vocabulary = { requiredInterfaces: [], terminalStatuses: [] };
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const index = indexArtifact(loadWorkspace(workspace.root));
    const check = buildFamilySubChecks('envelope', index)
      .find((entry) => entry.id === 'S3.interface-mapping-missing');

    assert.equal(check.status, 'vacuous');
    assert.equal(check.evaluatedClaims, 0);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('C004 a grounded S3.status notApplicable makes the three status checks notApplicable', () => {
  const artifact = minimalV3Artifact();
  artifact.vocabulary = {
    requiredInterfaces: [],
    terminalStatuses: [],
    applicability: {
      'S3.status': { applicable: false, ground: { line: 2, quote: 'no interface is declared' } },
    },
  };
  const vocabulary = vocabularyOf(artifact);
  const index = {
    artifact: { operations: [{ id: 'op', disposition: 'active' }], sequences: [], steps: [] },
    vocabulary,
    allocateManifest: {},
    packages: [],
  };
  const checks = buildFamilySubChecks('envelope', index);
  for (const id of [
    'S3.status-initial-unknown',
    'S3.transition-target-unknown',
    'S3.transition-out-of-terminal',
  ]) {
    assert.equal(checks.find((entry) => entry.id === id).status, 'notApplicable', id);
  }
});

// @verifies C004
test('C004 the declared applicability families and the check mapping agree', () => {
  const mapped = [...new Set(Object.values(APPLICABILITY_KEY_BY_CHECK))].sort();
  assert.deepEqual(mapped, [...APPLICABILITY_FAMILIES].sort());
});
