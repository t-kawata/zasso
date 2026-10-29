import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkOperationEnvelope } from '../../.claude/scripts/smooth-sequences/lib/checks-layer-a.mjs';
import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadVocabulary } from '../../.claude/scripts/smooth-sequences/lib/vocabulary.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import {
  defaultAllocateManifest,
  materializeSmoothWorkspace,
  minimalV3Artifact,
  operationRow,
} from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-276 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-276 --for-spec --no-implementation-order`.

const ARTIFACT_PATH = '/tmp/example-sequences.json';
const QUIET = Object.freeze({ stdout: () => {}, stderr: () => {} });
const DETECTOR_DIRECTORY = '.claude/scripts/smooth-sequences';

/** The vocabulary a bare artifact and manifest state, with no workspace on disk. */
// [::TICKET::] PX-276 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-276 --for-spec --no-implementation-order`.
function vocabularyOf(artifact, allocateManifest = {}) {
  return loadVocabulary({ artifact, artifactPath: ARTIFACT_PATH, allocateManifest });
}

/** An artifact without the producer-written vocabulary, so every check derives. */
// [::TICKET::] PX-276 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-276 --for-spec --no-implementation-order`.
function artifactWithoutVocabulary() {
  const artifact = minimalV3Artifact();
  delete artifact.vocabulary;
  return artifact;
}

/** The workspace and the index the detector would judge. */
// [::TICKET::] PX-276 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-276 --for-spec --no-implementation-order`.
function indexOfWorkspace(input) {
  const workspace = materializeSmoothWorkspace(input);
  return { workspace, index: indexArtifact(loadWorkspace(workspace.root)) };
}

// @verifies C001
test('a declared vocabulary is returned de-duplicated and frozen', () => {
  const artifact = {
    schema_version: 3,
    operations: [],
    vocabulary: { terminalStatuses: ['closed', 'aborted', 'closed'], requiredInterfaces: ['grpc', 'grpc'] },
  };
  const vocabulary = vocabularyOf(artifact);
  assert.deepEqual(vocabulary.terminalStatuses, ['closed', 'aborted']);
  assert.deepEqual(vocabulary.requiredInterfaces, ['grpc']);
  assert.deepEqual(vocabulary.withheld, []);
  assert.ok(Object.isFrozen(vocabulary));
  assert.ok(Object.isFrozen(vocabulary.withheld));
});

// @verifies C001
test('a null declaration falls through to derivation', () => {
  const artifact = artifactWithoutVocabulary();
  artifact.vocabulary = { terminalStatuses: null };
  const allocateManifest = { declared_interfaces: { 'crates/alpha': [{ column: 'grpc' }] } };
  const vocabulary = vocabularyOf(artifact, allocateManifest);
  assert.deepEqual(vocabulary.terminalStatuses, ['closed']);
  assert.deepEqual(vocabulary.requiredInterfaces, ['grpc']);
});

// @verifies C002
test('an absent declaration derives the terminal union across active operations', () => {
  const artifact = artifactWithoutVocabulary();
  artifact.operations = [
    operationRow('A', { allowed_status_transitions: { open: ['closed'], closed: [] } }),
    operationRow('B', { allowed_status_transitions: { open: ['closed'], closed: ['open'] } }),
  ];
  assert.deepEqual(vocabularyOf(artifact).terminalStatuses, ['closed']);
});

// @verifies C002
test('an inactive operation does not contribute a terminal status', () => {
  const artifact = artifactWithoutVocabulary();
  artifact.operations = [
    operationRow('A', { allowed_status_transitions: { open: [] } }),
    operationRow('B', { disposition: 'excluded', allowed_status_transitions: { open: ['closed'], closed: [] } }),
  ];
  assert.deepEqual(vocabularyOf(artifact).terminalStatuses, ['open']);
});

// @verifies C002
test('a status terminal in one operation and left in another is flagged in the second', () => {
  const artifact = artifactWithoutVocabulary();
  artifact.operations = [
    operationRow('A', { allowed_status_transitions: { open: ['closed'], closed: [] } }),
    operationRow('B', { allowed_status_transitions: { open: ['closed'], closed: ['open'] } }),
  ];
  const { workspace, index } = indexOfWorkspace({ artifact });
  try {
    const findings = checkOperationEnvelope(index).filter((finding) => finding.checkId === 'S3.transition-out-of-terminal');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].subject, 'B');
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('an absent interface declaration derives the columns the allocate manifest names', () => {
  const allocateManifest = {
    declared_interfaces: {
      'crates/alpha': [{ interfaceId: 'rest', column: 'rest' }],
      'crates/beta': [{ column: 'grpc' }, { column: 'rest' }],
    },
  };
  assert.deepEqual(vocabularyOf(artifactWithoutVocabulary(), allocateManifest).requiredInterfaces, ['rest', 'grpc']);
});

// @verifies C003
test('without declared_interfaces the pinned operation columns are the interface set', () => {
  const artifact = artifactWithoutVocabulary();
  artifact.pins.enumerations = [{ name: 'surface', members: ['GET /v1/orders'] }];
  artifact.operations = [operationRow('A', { rest: 'GET /v1/orders' }), operationRow('B')];
  assert.deepEqual(vocabularyOf(artifact).requiredInterfaces, ['rest']);
});

// @verifies C003
test('declared_interfaces wins over the pinned columns instead of merging with them', () => {
  const artifact = artifactWithoutVocabulary();
  artifact.pins.enumerations = [{ name: 'surface', members: ['GET /v1/orders'] }];
  artifact.operations = [operationRow('A', { rest: 'GET /v1/orders' }), operationRow('B')];
  const allocateManifest = { declared_interfaces: { 'crates/alpha': [{ column: 'grpc' }] } };
  assert.deepEqual(vocabularyOf(artifact, allocateManifest).requiredInterfaces, ['grpc']);
});

// @verifies C003
// [::TICKET::] PX-277 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-277 --for-spec --no-implementation-order`.
test('a required column stays required when one active operation lacks it', () => {
  const artifact = artifactWithoutVocabulary();
  artifact.operations[1].grpc = undefined;
  const allocateManifest = {
    declared_interfaces: {
      'crates/alpha': [{ column: 'grpc' }],
      'crates/beta': [{ column: 'grpc' }],
    },
  };
  const { workspace, index } = indexOfWorkspace({ artifact, allocateManifest: { ...defaultAllocateManifest(), ...allocateManifest } });
  try {
    const findings = checkOperationEnvelope(index).filter((finding) => finding.checkId === 'S3.interface-mapping-missing');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].subject, 'ConsumeFact');
    assert.match(findings[0].why, /grpc/);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a non-object vocabulary is refused as misuse', () => {
  assert.throws(
    () => vocabularyOf({ schema_version: 3, operations: [], vocabulary: [] }),
    (error) => error.code === 'INVALID_VOCABULARY'
      && error.path === ARTIFACT_PATH
      && error.message.includes('vocabulary')
      && typeof error.repair === 'string'
      && error.repair.includes('vocabulary'),
  );
});

// @verifies C001
test('a non-array declaration list is refused as misuse', () => {
  assert.throws(
    () => vocabularyOf({ schema_version: 3, operations: [], vocabulary: { terminalStatuses: 'closed' } }),
    (error) => error.code === 'INVALID_VOCABULARY' && error.message.includes('terminalStatuses'),
  );
});

// @verifies C001
test('a non-string declaration member is refused as misuse', () => {
  assert.throws(
    () => vocabularyOf({ schema_version: 3, operations: [], vocabulary: { terminalStatuses: ['closed', 7] } }),
    (error) => error.code === 'INVALID_VOCABULARY' && error.message.includes('terminalStatuses'),
  );
});

// @verifies C001
test('a malformed declared vocabulary exits 2 and writes no report', () => {
  const artifact = artifactWithoutVocabulary();
  artifact.vocabulary = { terminalStatuses: 'closed' };
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const result = runCommand([workspace.root], QUIET);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report, null);
    assert.equal(existsSync(join(workspace.root, 'SMOOTH-SEQUENCES.json')), false);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('no active status graph withholds the terminal check instead of passing it', () => {
  const vocabulary = vocabularyOf({ schema_version: 3, operations: [] });
  assert.equal(vocabulary.terminalStatuses, null);
  const withheld = vocabulary.withheld.filter((entry) => entry.check === 'S3.terminal-status');
  assert.equal(withheld.length, 1);
  assert.equal(withheld[0].layer, 'vocabulary');
  assert.ok(withheld[0].reason.length > 0);
});

// @verifies C003
test('no interface source withholds the interface check instead of passing it', () => {
  const vocabulary = vocabularyOf({ schema_version: 3, operations: [] });
  assert.equal(vocabulary.requiredInterfaces, null);
  const withheld = vocabulary.withheld.filter((entry) => entry.check === 'S3.interface-mapping');
  assert.equal(withheld.length, 1);
  assert.equal(withheld[0].layer, 'vocabulary');
  assert.ok(withheld[0].reason.length > 0);
});

// @verifies C004
test('a rules file on disk changes no verdict and is never read', () => {
  const withoutFile = materializeSmoothWorkspace();
  const withFile = materializeSmoothWorkspace();
  try {
    writeFileSync(join(withFile.root, 'SMOOTH-SEQUENCES-RULES.json'), '{not json');
    const first = runCommand([withoutFile.root], QUIET);
    const second = runCommand([withFile.root], QUIET);
    assert.equal(second.exitCode, first.exitCode);
    assert.deepEqual(second.report.findings, first.report.findings);
    assert.deepEqual(second.report.withheld, first.report.withheld);
  } finally {
    withoutFile.remove();
    withFile.remove();
  }
});

// @verifies C004
test('no detector source names the removed rules file', () => {
  const sources = readdirSync(DETECTOR_DIRECTORY, { recursive: true })
    .filter((name) => name.endsWith('.mjs') || name.endsWith('.js'));
  assert.ok(sources.length > 0);
  for (const file of sources) {
    assert.doesNotMatch(readFileSync(join(DETECTOR_DIRECTORY, file), 'utf8'), /SMOOTH-SEQUENCES-RULES|RULES_FILE_NAME/, file);
  }
});
