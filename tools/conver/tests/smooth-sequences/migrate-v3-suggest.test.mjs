import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { suggestAnnotations } from '../../.claude/scripts/smooth-sequences/lib/migrate-v3.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { materializeSmoothWorkspace, minimalV2Artifact } from './helpers/workspace-fixture.mjs';

const CLI = '.claude/scripts/smooth-sequences/migrate-v3.mjs';
const QUIET = Object.freeze({ stdout: () => {}, stderr: () => {} });

/** The suggestion input one workspace carries. */
// [::TICKET::] PX-387 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-387 --for-spec --no-implementation-order`.
function suggestionInput(workspace) {
  const loaded = loadWorkspace(workspace.root);
  return {
    artifact: loaded.artifact,
    treeManifest: loaded.treeManifest,
    allocateManifest: loaded.allocateManifest,
    packages: loaded.packages,
    specPath: 'spec.md',
    specLines: {},
  };
}

// [::TICKET::] PX-387 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-387 --for-spec --no-implementation-order`.
function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

// PX-387 @verifies C001
// The suggestion proposes only rows whose citation or derivation is determined. A
// prose contract becomes a cited fact; an operation contribution and its boundary
// effects are derived from records the workspace already carries.

test('PX-387 C001: the suggestion emits cited contracts and derived operation rows', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const { annotations, unresolved } = suggestAnnotations(suggestionInput(workspace));

    assert.equal(annotations.operations.ProduceFact.registry_contribution, 'required');
    assert.ok(Array.isArray(annotations.operations.ProduceFact.boundary_effects));
    assert.ok(Array.isArray(annotations.contracts['A-1__ProduceFact'].post));
    assert.equal(annotations.contracts['A-1__ProduceFact'].post[0].source.step, 'A-1__ProduceFact');
    assert.equal(annotations.contracts['A-1__ProduceFact'].post[0].source.line, 1);
    assert.equal(annotations.contracts['A-1__ProduceFact'].post[0].source.quote, 'the producer derives order_id');
    assert.equal(unresolved.some((entry) => entry.id === 'A-1__ProduceFact'), false);
  } finally {
    workspace.remove();
  }
});

test('PX-387 C001: a prose contract the quote cannot support is unresolved, not invented', () => {
  const artifact = minimalV2Artifact();
  artifact.steps[0].contract = 'totally unsupported prose';
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const { annotations, unresolved } = suggestAnnotations(suggestionInput(workspace));

    assert.equal(Object.hasOwn(annotations.contracts, 'A-1__ProduceFact'), false);
    const entry = unresolved.find((candidate) => candidate.id === 'A-1__ProduceFact');
    assert.ok(entry);
    assert.match(entry.reason, /support/i);
  } finally {
    workspace.remove();
  }
});

test('PX-387 C001: the CLI names each unresolved row and its reason', () => {
  const artifact = minimalV2Artifact();
  artifact.steps[0].contract = 'totally unsupported prose';
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const result = runCli([workspace.root, '--suggest-annotations']);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /unresolved contract A-1__ProduceFact facts/);
    assert.match(result.stderr, /not supported/);
  } finally {
    workspace.remove();
  }
});

test('PX-387 C001: an absent mutation fact leaves the contribution unresolved', () => {
  const artifact = minimalV2Artifact();
  for (const operation of artifact.operations) {
    if (operation.id === 'ProduceFact') delete operation.mutates_protocol_state;
  }
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const { annotations, unresolved } = suggestAnnotations(suggestionInput(workspace));

    assert.equal(Object.hasOwn(annotations.operations.ProduceFact, 'registry_contribution'), false);
    const entry = unresolved.find((candidate) => candidate.id === 'ProduceFact'
      && candidate.field === 'registry_contribution');
    assert.ok(entry);
    assert.match(entry.reason, /mutates_protocol_state/);
  } finally {
    workspace.remove();
  }
});

test('PX-387 C001: two suggestions over the same input are byte-identical', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const input = suggestionInput(workspace);
    const first = suggestAnnotations(input);
    const second = suggestAnnotations(input);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
  } finally {
    workspace.remove();
  }
});

// PX-387 @verifies C002
// The candidate is only useful when the producer accepts it. The migration must
// accept the resolved rows and the detector must stop blocking the surfaces the
// candidate restored.

test('PX-387 C002: the suggested candidate clears the restored v3 blocked surfaces', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const suggested = runCli([workspace.root, '--suggest-annotations']);
    assert.equal(suggested.status, 0, suggested.stderr);
    const candidate = join(workspace.root, 'candidate-annotations.json');
    writeFileSync(candidate, suggested.stdout);

    const migrated = runCli([workspace.root, `--annotations=${candidate}`]);
    assert.equal(migrated.status, 0, migrated.stderr);

    const result = runCommand([workspace.root], QUIET);
    const target = new Set([
      'steps[].contract',
      'steps[].contract.crosses',
      'steps[].contract.authored',
      'operations[].registry_contribution',
      'operations[].boundary_effects',
    ]);
    assert.equal(
      result.report.blocked.some((entry) => target.has(entry.surface)),
      false,
      JSON.stringify(result.report.blocked),
    );
  } finally {
    workspace.remove();
  }
});

// PX-387 @verifies C005
// Suggesting is a read operation. The live artifact stays byte-identical; only the
// explicit --write path creates a candidate file.

test('PX-387 C005: --suggest-annotations without --write leaves the artifact byte-identical', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const before = readFileSync(workspace.artifactPath, 'utf8');
    const result = runCli([workspace.root, '--suggest-annotations']);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(workspace.artifactPath, 'utf8'), before);
    assert.equal(existsSync(join(workspace.root, 'regeneration', 'candidates', 'suggested-ANNOTATIONS.json')), false);
    assert.doesNotThrow(() => JSON.parse(result.stdout));
  } finally {
    workspace.remove();
  }
});

test('PX-387 C005: --write creates only the candidate path', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const before = readFileSync(workspace.artifactPath, 'utf8');
    const result = runCli([workspace.root, '--suggest-annotations', '--write']);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(workspace.artifactPath, 'utf8'), before);
    const candidatePath = join(workspace.root, 'regeneration', 'candidates', 'suggested-ANNOTATIONS.json');
    assert.equal(existsSync(candidatePath), true);
    assert.doesNotThrow(() => JSON.parse(readFileSync(candidatePath, 'utf8')));
  } finally {
    workspace.remove();
  }
});
