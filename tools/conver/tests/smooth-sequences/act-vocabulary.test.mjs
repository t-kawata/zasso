// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-297 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { checkDangers } from '../../.claude/scripts/smooth-sequences/lib/checks-danger.mjs';
import { DEFAULT_ACT_PATTERNS, resolveActPatterns } from '../../.claude/scripts/smooth-sequences/lib/act-vocabulary.mjs';
import { materializeSmoothWorkspace, minimalV3Artifact } from './helpers/workspace-fixture.mjs';

/** An artifact with one excluded operation whose cited line orders an English act. */
// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function englishEscapeArtifact() {
  const artifact = minimalV3Artifact();
  artifact.vocabulary = {
    ...artifact.vocabulary,
    actPatterns: ['creates', 'submits'],
  };
  artifact.operations.push({
    id: 'CreatesRecord',
    position: 'excluded',
    disposition: 'excluded',
    grounding: {
      classification: 'designer_supplied',
      line: 1,
      quote: 'the actor creates the record',
    },
  });
  return artifact;
}

/** The danger findings for one artifact, with the specification line supplied. */
// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function dangerFindings(artifact) {
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const index = indexArtifact(loadWorkspace(workspace.root));
    return checkDangers({
      ...index,
      linesByPath: { 'spec.md': ['the actor creates the record'] },
    });
  } finally {
    workspace.remove();
  }
}

test('C006 an artifact declares the act verbs its specification uses', () => {
  assert.deepEqual(resolveActPatterns(englishEscapeArtifact()), ['creates', 'submits']);
});

test('C006 an artifact without actPatterns uses the Japanese default', () => {
  assert.equal(resolveActPatterns({}).includes('導入する'), true);
  assert.equal(DEFAULT_ACT_PATTERNS.includes('導入する'), true);
});

test('C006 an empty or malformed actPatterns list falls back to the default', () => {
  assert.deepEqual(resolveActPatterns({ vocabulary: { actPatterns: [] } }), DEFAULT_ACT_PATTERNS);
  assert.deepEqual(resolveActPatterns({ vocabulary: { actPatterns: ['creates', 7] } }), DEFAULT_ACT_PATTERNS);
});

test('C006 the declared act verbs make an escape-act conflict visible', () => {
  const findings = dangerFindings(englishEscapeArtifact());
  assert.equal(findings.filter((finding) => finding.checkId === 'S6.escape-act-conflict'
    && finding.subject === 'CreatesRecord').length, 1);
});

test('C006 the Japanese default does not fire on an English act line', () => {
  const artifact = englishEscapeArtifact();
  delete artifact.vocabulary.actPatterns;
  const findings = dangerFindings(artifact);
  assert.equal(findings.filter((finding) => finding.checkId === 'S6.escape-act-conflict'
    && finding.subject === 'CreatesRecord').length, 0);
});
