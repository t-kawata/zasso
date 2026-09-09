// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// [::TICKET::] PX-182: workspacify-tree info-level loop and command doc tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-182 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkTreeEntryGate } from '../../../.claude/scripts/workspacify-tree/lib/entry-parity.mjs';

const CONVER_ROOT = process.cwd();
const RUN_SCRIPT = join(CONVER_ROOT, '.claude/scripts/workspacify-tree/run.mjs');
const MD_PATH = join(CONVER_ROOT, '.claude/commands/workspacify-tree.md');
const FIXTURES = join(CONVER_ROOT, 'tests/workspacify-tree/fixtures');

test('doc C001 [@verifies C001]: Step 3 describes an information-raising iteration', () => {
  const md = readFileSync(MD_PATH, 'utf8');
  assert.match(md, /## Step 3/);
  assert.match(md, /情報レベルを上げる反復手順/);
  assert.match(md, /responsibilities|seed_required/);
  assert.match(md, /owner|所有権/);
  assert.match(md, /invariant|不変条件/);
  assert.match(md, /boundary|contract_boundaries|契約境界/);
});

test('doc C002 [@verifies C002]: gates and exit conditions are explained', () => {
  const md = readFileSync(MD_PATH, 'utf8');
  assert.match(md, /## Step 4/);
  assert.match(md, /unallocated|未割当/);
  assert.match(md, /tree_catalog_mismatch|tree/);
  assert.match(md, /missing_responsibilities|responsibilities/);
  assert.match(md, /COMPLETE/);
});

test('doc C004 [@verifies C004]: output contract retained and removed notes stay absent', () => {
  const md = readFileSync(MD_PATH, 'utf8');
  assert.match(md, /カレントディレクトリ/);
  assert.match(md, /BLOCKED|置換/);
  assert.ok(!/言語方針/.test(md), 'language-policy note must not be resurrected');
  assert.ok(!/English translation/.test(md), 'deferred-translation note must not be resurrected');
});

test('loop C003 [@verifies C003]: incomplete decisions fail the gate, complete decisions reach entry-parity', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-loop-'));
  const specPath = join(dir, 'gaia-like-spec.md');
  cpSync(join(FIXTURES, 'gaia-like-spec.md'), specPath);

  // Incomplete decisions: no ownership/approvals/tree -> gate must not pass.
  const incompletePath = join(dir, 'incomplete.json');
  writeFileSync(incompletePath, JSON.stringify({ workspace: [], ownership: [], dependencies: [], adapters: {}, approvals: [] }));
  const incomplete = spawnSync(process.execPath, [RUN_SCRIPT, 'gate', `--spec=${specPath}`, `--decisions=${incompletePath}`], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(incomplete.status, 0);

  // Complete decisions -> finalize COMPLETE and entry gate ok.
  const completePath = join(dir, 'gaia-decisions.json');
  cpSync(join(FIXTURES, 'gaia-decisions.json'), completePath);
  const finalize = spawnSync(process.execPath, [RUN_SCRIPT, 'finalize', `--spec=${specPath}`, `--decisions=${completePath}`], { cwd: dir, encoding: 'utf8' });
  assert.equal(finalize.status, 0, finalize.stdout);
  const manifest = JSON.parse(readFileSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
  assert.equal(manifest.status, 'COMPLETE');
  const gate = checkTreeEntryGate(manifest, specPath);
  assert.equal(gate.ok, true, JSON.stringify(gate.errors));
});

test('doc C005 [@verifies C005]: Step structure is intact', () => {
  const md = readFileSync(MD_PATH, 'utf8');
  assert.match(md, /## Step 1: parse/);
  assert.match(md, /## Step 6: 報告/);
});
