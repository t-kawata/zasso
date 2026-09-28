// [::TICKET::] PX-191 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-191 --for-spec --no-implementation-order`.
// PX-191 @verifies C002 C003 C005
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { materializeSeedFixture, makeDecisions } from '../helpers/build-valid-manifest.mjs';
import { parseSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parse.mjs';
import { SEED_REQUIRED_SECTIONS } from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';
import { stageAllocateDecisions } from '../helpers/stage-allocate-decisions.mjs';

const RUN = fileURLToPath(new URL('../../../.claude/scripts/workspacify-allocate/run.mjs', import.meta.url));

// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
test('C005 acceptance: a COMPLETE tree manifest becomes a real workspace with grill-ready seeds', () => {
  const { dir, manifestPath, manifest } = materializeSeedFixture();
  try {
    stageAllocateDecisions(dir, makeDecisions(manifest));

    const finalize = spawnSync(process.execPath, [RUN, 'finalize', manifestPath], { encoding: 'utf8' });
    assert.equal(finalize.status, 0, finalize.stderr);
    const summary = JSON.parse(finalize.stdout);
    assert.equal(summary.published, true);
    assert.equal(summary.seedCount, 2);
    assert.equal(summary.directoryCount >= 4, true); // crates, crates/protocol, two leaves

    // Every seed parses with all 15 required headings in order.
    for (const leaf of ['alpha', 'beta']) {
      const seedText = readFileSync(join(dir, 'crates', 'protocol', leaf, 'RFC-SEED.md'), 'utf8');
      const parsed = parseSeed(seedText);
      assert.equal(parsed.headings.length, SEED_REQUIRED_SECTIONS.length);
      assert.ok(seedText.startsWith('# RFC Seed: '));
    }

    // The allocate manifest is published next to the tree and re-verifies itself.
    const allocateManifestPath = join(dir, 'WORKSPACIFY-ALLOCATE-MANIFEST.json');
    assert.equal(existsSync(allocateManifestPath), true);
    const allocateManifest = JSON.parse(readFileSync(allocateManifestPath, 'utf8'));
    assert.equal(allocateManifest.artifact_kind, 'workspacify-allocate-manifest');
    assert.equal(allocateManifest.status, 'COMPLETE');
    assert.equal(allocateManifest.seed_index.length, 2);
    assert.equal(allocateManifest.source_coverage.uncovered.length, 0);
    assert.equal(allocateManifest.integrity.reload_validation, 'READY');
    // Every seed references the published manifest by its canonical path.
    for (const leaf of ['alpha', 'beta']) {
      const seedText = readFileSync(join(dir, 'crates', 'protocol', leaf, 'RFC-SEED.md'), 'utf8');
      assert.ok(seedText.includes('WORKSPACIFY-ALLOCATE-MANIFEST.json'));
    }

    // A second finalize is BLOCKED (fresh-workspace-only policy). The decisions
    // document is not re-staged: the first finalize left it in place, which is the
    // point of the retention rule, so this run is refused for the fresh-workspace
    // policy and for nothing else.
    const second = spawnSync(process.execPath, [RUN, 'finalize', manifestPath], { encoding: 'utf8' });
    assert.notEqual(second.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// [::TICKET::] PX-219 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-219 --for-spec --no-implementation-order`.
test('C005 acceptance: a host project root holding unrelated directories still publishes', () => {
  const { dir, manifestPath, manifest } = materializeSeedFixture();
  try {
    // The shape the defect lived in: the workspace root is the host project's own
    // root - the specification and the manifest beside directories the plan says
    // nothing about. G2 already passes here because the planned paths are fresh; the
    // reload scan is what refused, after the publication had happened.
    mkdirSync(join(dir, 'docs/archive'), { recursive: true });
    mkdirSync(join(dir, 'node_modules/left-pad'), { recursive: true });
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
    stageAllocateDecisions(dir, makeDecisions(manifest));

    const finalize = spawnSync(process.execPath, [RUN, 'finalize', manifestPath], { encoding: 'utf8' });
    assert.equal(finalize.status, 0, finalize.stderr);
    const summary = JSON.parse(finalize.stdout);
    assert.equal(summary.published, true, "the reload scan must not report the operator's own directories");

    // The publication happened, and nothing the root already held was touched.
    assert.equal(existsSync(join(dir, 'crates', 'protocol', 'alpha', 'RFC-SEED.md')), true);
    assert.equal(existsSync(join(dir, 'WORKSPACIFY-ALLOCATE-MANIFEST.json')), true);
    assert.equal(existsSync(join(dir, 'docs', 'archive')), true);
    assert.equal(existsSync(join(dir, 'node_modules', 'left-pad')), true);
    assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), 'node_modules\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// [::TICKET::] PX-219 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-219 --for-spec --no-implementation-order`.
test('C005 the two post-publication refusals undo the publication before they throw', () => {
  // A refusal after the publication cannot be produced from the command line: the
  // published set is the plan, and the plan is what the scan compares the root
  // against, so no invocation makes a run-created directory unexpected. The wiring is
  // therefore asserted in the source of runFinalize, where it is observable - the
  // same form the reverse suite uses for its own unreachable A1 path.
  const source = readFileSync(RUN, 'utf8');
  const finalize = source.slice(source.indexOf('export function runFinalize'));
  const at = (needle) => {
    const index = finalize.indexOf(needle);
    assert.notEqual(index, -1, `runFinalize must contain ${needle}`);
    return index;
  };
  const undoCalls = [...finalize.matchAll(/rollbackPublicationOfThisRun\(\);/g)].map((match) => match.index);

  assert.equal(undoCalls.length, 2, 'each post-publication refusal undoes the publication');
  assert.ok(at('snapshotDirectories(manifestDir)') < at('publishWorkspace({'), 'the snapshot is read before the publication');
  assert.ok(undoCalls[0] > at('publishWorkspace({') && undoCalls[0] < at("gateId: 'G6.4'"), 'G6.4 undoes the publication');
  assert.ok(undoCalls[1] > at("gateId: 'G6.4'") && undoCalls[1] < at("gateId: 'G6.5'"), 'G6.5 undoes the publication');
});
