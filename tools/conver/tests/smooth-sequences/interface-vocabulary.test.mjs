// @verifies C009
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { collectOperationEnvelope } from '../../.claude/scripts/smooth-sequences/lib/checks-layer-a.mjs';
import { materializeSmoothWorkspace, minimalV3Artifact } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-288 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-288 --for-spec --no-implementation-order`.
function artifactWithCliVocabulary() {
  const artifact = minimalV3Artifact();
  artifact.vocabulary.requiredInterfaces = ['cli'];
  artifact.pins.columns = [{ name: 'cli', decidedBy: 'borrowedVocabulary', vocabulary: 'CliCommand' }];
  artifact.pins.enumerations.push({ name: 'CliCommand', members: ['gaia operation submit <kind>'], closedness: 'closed' });
  artifact.operations.forEach((operation) => { operation.cli = 'gaia operation submit'; });
  return artifact;
}

test('a placeholder-normalized value is accepted', () => {
  const workspace = materializeSmoothWorkspace({ artifact: artifactWithCliVocabulary() });
  try {
    const index = indexArtifact(loadWorkspace(workspace.root));
    const findings = collectOperationEnvelope(index).findings;
    assert.equal(findings.some((finding) => finding.checkId === 'S3.interface-value-unknown'), false);
  } finally {
    workspace.remove();
  }
});

test('a value outside the pinned vocabulary is S3.interface-value-unknown', () => {
  const artifact = artifactWithCliVocabulary();
  artifact.operations.forEach((operation) => { operation.cli = 'gaia submit'; });
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const index = indexArtifact(loadWorkspace(workspace.root));
    const findings = collectOperationEnvelope(index).findings;
    assert.ok(findings.some((finding) => finding.checkId === 'S3.interface-value-unknown' && finding.subject === artifact.operations[0].id));
  } finally {
    workspace.remove();
  }
});
