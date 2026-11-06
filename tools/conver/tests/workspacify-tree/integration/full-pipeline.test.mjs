// @verifies C003
// @verifies C004
// [::TICKET::] PX-178: workspacify-tree full pipeline integration tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-178 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildHeadingTree } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { segmentAtHeadings } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';

const CONVER_ROOT = process.cwd();
const RUN_SCRIPT = join(CONVER_ROOT, '.claude/scripts/workspacify-tree/run.mjs');
const FIXTURES = join(CONVER_ROOT, 'tests/workspacify-tree/fixtures');
import { stageTreeDecisions, stageTreeDecisionsFrom } from '../helpers/stage-tree-decisions.mjs';

function runCli(args, cwd = CONVER_ROOT) {
  return spawnSync(process.execPath, [RUN_SCRIPT, ...args], { cwd, encoding: 'utf8' });
}

function makeWorkingSpecDir() {
  const dir = mkdtempSync(join(tmpdir(), 'wst-pipe-'));
  cpSync(join(FIXTURES, 'long-spec.md'), join(dir, 'long-spec.md'));
  return dir;
}

// [::TICKET::] PX-215 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-215 --for-spec --no-implementation-order`.
test('cli C003 [@verifies C003]: no arguments prints usage and exits non-zero', () => {
  const usage = runCli([]);
  assert.notEqual(usage.status, 0);
  assert.ok(usage.stdout.includes('usage:'));
});

test('cli C003 [@verifies C003]: parse subcommand returns the node exit code', () => {
  const parseResult = runCli(['parse', join(FIXTURES, 'small-spec.md')]);
  assert.equal(parseResult.status, 0);
  const parsed = JSON.parse(parseResult.stdout);
  assert.equal(parsed.status, 'PASS');
  assert.ok(parsed.heading_count >= 4);
});

test('pipeline C003 invariant [@verifies C003]: successful finalize publishes exactly one manifest into the spec directory', () => {
  const dir = makeWorkingSpecDir();
  stageTreeDecisionsFrom(dir, join(FIXTURES, 'decisions-long-ok.json'));
  const result = runCli(['finalize', `--spec=${join(dir, 'long-spec.md')}`], dir);
  assert.equal(result.status, 0, result.stdout);
  const manifestPath = join(dir, 'WORKSPACIFY-TREE-MANIFEST.json');
  assert.equal(existsSync(manifestPath), true);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.status, 'COMPLETE');
});

test('pipeline C004 [@verifies C004]: an invalid decision input prevents COMPLETE', () => {
  const dir = makeWorkingSpecDir();
  stageTreeDecisionsFrom(dir, join(FIXTURES, 'decisions-review-open.json'));
  const result = runCli(['finalize', `--spec=${join(dir, 'long-spec.md')}`], dir);
  assert.notEqual(result.status, 0);
  const manifestPath = join(dir, 'WORKSPACIFY-TREE-MANIFEST.json');
  assert.equal(existsSync(manifestPath), false);
});

// PX-389 @verifies C001
// A prose chapter that carries a formula but no harvested declaration is material.
// The manifest must publish the grounded segment claim and the formula ids, or S8 has
// no owner to route a missing ledger row to.

// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
test('PX-389 C001: finalize publishes a grounded prose-formula segment claim', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-px389-'));
  const specText = `${readFileSync(join(FIXTURES, 'objects-table.md'), 'utf8')}\n\n## Beta\n\n\\[ 1+1=2 \\]\n`;
  const specPath = join(dir, 'spec.md');
  writeFileSync(specPath, specText);

  const extract = runCli(['extract', specPath], dir);
  assert.equal(extract.status, 0, extract.stdout + extract.stderr);
  const extractJson = JSON.parse(extract.stdout.split('\n').find((line) => line.startsWith('{')));
  const pulseCandidates = extractJson.spec_pulse.candidates;

  const decisions = JSON.parse(readFileSync(join(FIXTURES, 'decisions-complete.json'), 'utf8'));
  const settled = new Set([
    ...(decisions.spec_defects ?? []).map((record) => record.candidate_id),
    ...(decisions.residual_questions ?? []).map((record) => record.candidate_id),
  ]);
  decisions.residual_questions = [
    ...(decisions.residual_questions ?? []),
    ...pulseCandidates.filter((candidate) => !settled.has(candidate.id)).map((candidate) => ({
      candidate_id: candidate.id,
      topic: candidate.observation,
      alternatives: ['leave it as context prose', 'allocate it to the package that owns the value'],
      chosen_default: 'leave it as context prose',
      why_unresolved: 'the per-directory grill decides the package shape',
    })),
  ];

  const headings = buildHeadingTree(specText.split('\n'), undefined, { sourceText: specText });
  const { segments } = segmentAtHeadings({ sourceText: specText, headings }, { segmentLevel: 2 });
  const beta = segments.find((segment) => segment.title === 'Beta');
  const quote = '\\[ 1+1=2 \\]';
  const line = specText.split('\n').findIndex((text) => text.includes('1+1=2')) + 1;
  decisions.segment_ownership = [{
    segmentId: beta.id,
    packageId: decisions.workspace[0].id,
    source: { line, quote },
  }];
  stageTreeDecisions(dir, decisions);

  const result = runCli(['finalize', `--spec=${specPath}`], dir);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const manifest = JSON.parse(readFileSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
  const claim = manifest.workspace.ownership.entries.find((entry) => entry.category === 'segment' && entry.segment_id === beta.id);
  assert.ok(claim, JSON.stringify(manifest.workspace.ownership.entries));
  assert.equal(claim.owner_package, decisions.workspace[0].id);
  const segment = manifest.structure.segments.find((entry) => entry.id === beta.id);
  assert.equal(segment.formula_ids.length, 1);
});
