/**
 * A partially typed contract is an incomplete typed surface, not a vacuous pass.
 *
 * A workspace that authors only some typed facts reaches the typed checks with a
 * positive typed-step count but an empty fact family. That state used to resolve to
 * `vacuous`, which the certificate counts as open but no repair route names. The
 * check must instead name the authored-contract surface, whose producer is the
 * annotation migration: the author either supplies the missing fact or returns the
 * step to prose, and the strictness of the check is unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFamilySubChecks,
} from '../../.claude/scripts/smooth-sequences/lib/check-status.mjs';
import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { materializeSmoothWorkspace, minimalV3Artifact } from './helpers/workspace-fixture.mjs';

/** The index the detector would judge. */
function indexOfWorkspace(input) {
  const workspace = materializeSmoothWorkspace(input);
  return { workspace, index: indexArtifact(loadWorkspace(workspace.root)) };
}

/** A v3 artifact whose steps author only the consumed facts. */
function consumesOnlyArtifact() {
  const artifact = minimalV3Artifact();
  artifact.steps = artifact.steps.map((step, position) => ({
    ...step,
    contract: {
      ...step.contract,
      pre: [],
      post: [],
      invariants: [],
      errors: [],
      // Only the consumed family is authored. An absent key is an absent family;
      // an explicit empty array would instead be an authored "none".
      authored: {
        consumes: position === 1 ? ['order_id'] : [],
        produces: [],
      },
    },
  }));
  return artifact;
}

/** One meshing sub-check by id. */
function meshingCheck(index, checkId) {
  return buildFamilySubChecks('meshing', index).find((entry) => entry.id === checkId);
}

test('a missing fact family is blocked on the authored surface, not vacuous', () => {
  const { workspace, index } = indexOfWorkspace({ artifact: consumesOnlyArtifact() });
  try {
    const check = meshingCheck(index, 'S5.precondition-not-implied');

    assert.equal(check.status, 'blocked');
    assert.equal(check.surface, 'steps[].contract.authored');
    assert.equal(check.reason, 'empty denominator');
  } finally {
    workspace.remove();
  }
});

test('a missing error set is blocked on the authored surface, not vacuous', () => {
  const { workspace, index } = indexOfWorkspace({ artifact: consumesOnlyArtifact() });
  try {
    const check = meshingCheck(index, 'S5.error-set-mismatch');

    assert.equal(check.status, 'blocked');
    assert.equal(check.surface, 'steps[].contract.authored');
  } finally {
    workspace.remove();
  }
});

test('the fact family that is authored still executes', () => {
  const { workspace, index } = indexOfWorkspace({ artifact: consumesOnlyArtifact() });
  try {
    const check = meshingCheck(index, 'S5.consumes-not-produced');

    assert.equal(check.status, 'executed');
    assert.equal(check.evaluatedClaims, 1);
  } finally {
    workspace.remove();
  }
});

test('a prose step beside a typed step does not hide the missing typed fact', () => {
  const artifact = consumesOnlyArtifact();
  artifact.steps[0] = {
    ...artifact.steps[0],
    contract: null,
    contract_prose: 'pre: the input is present',
  };
  const { workspace, index } = indexOfWorkspace({ artifact });
  try {
    const check = meshingCheck(index, 'S5.precondition-not-implied');

    assert.equal(check.status, 'blocked');
    assert.notEqual(check.status, 'notApplicable');
  } finally {
    workspace.remove();
  }
});
