// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// [::TICKET::] PX-179: workspacify-tree command realization tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-179 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadDecisionInput, assertDecisionSchema } from '../../../.claude/scripts/workspacify-tree/lib/decision-input.mjs';

const CONVER_ROOT = process.cwd();
const RUN_SCRIPT = join(CONVER_ROOT, '.claude/scripts/workspacify-tree/run.mjs');
const MD_PATH = join(CONVER_ROOT, '.claude/commands/workspacify-tree.md');
const FIXTURES = join(CONVER_ROOT, 'tests/workspacify-tree/fixtures');
const SPEC = join(FIXTURES, 'objects-table.md');

function runCli(args, cwd = CONVER_ROOT) {
  return spawnSync(process.execPath, [RUN_SCRIPT, ...args], { cwd, encoding: 'utf8' });
}

// [::TICKET::] PX-187: doc-extraction helpers used by the semantic-review tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-187 --for-spec --no-implementation-order`
function readCommandDoc() {
  return readFileSync(MD_PATH, 'utf8');
}

/** Pick the first ```json fenced block whose body declares a workspace (the Step 3 decision example). */
function extractStep3DecisionJson(markdownText) {
  let searchFrom = 0;
  while (true) {
    const fenceStart = markdownText.indexOf('```json', searchFrom);
    if (fenceStart === -1) break;
    const bodyStart = fenceStart + '```json'.length;
    const fenceEnd = markdownText.indexOf('```', bodyStart);
    assert.notEqual(fenceEnd, -1, 'json fence is closed');
    const block = markdownText.slice(bodyStart, fenceEnd);
    if (block.includes('"workspace"')) {
      return JSON.parse(block);
    }
    searchFrom = fenceEnd + 3;
  }
  assert.fail('no Step 3 decision JSON block containing workspace was found');
}

test('command C001 [@verifies C001]: the command markdown exists, is Japanese, and carries the required contract', () => {
  assert.equal(existsSync(MD_PATH), true);
  const md = readFileSync(MD_PATH, 'utf8');
  assert.ok(/[぀-ヿ一-龯]/.test(md), 'body is written in Japanese');
  assert.match(md, /\*\*Role\*\*|## Role/);
  assert.match(md, /## Arguments/);
  assert.match(md, /## Step 1: parse/);
  assert.match(md, /## Step 4: gate ループ/);
  assert.match(md, /BLOCKED|置換|overwrite/i, 'declares no-overwrite rule');
});

test('command C001 invariant [@verifies C001]: the command file declares success and failure output contracts', () => {
  const md = readFileSync(MD_PATH, 'utf8');
  assert.match(md, /成功|manifest|source_hash|manifest_hash/i, 'success output contract');
  assert.match(md, /失敗|failed gate|fix hint/i, 'failure output contract');
});

test('gate C002 [@verifies C002]: a real spec with review-required candidates does not report PASS', () => {
  const gate = runCli(['gate', `--spec=${SPEC}`, `--decisions=${join(FIXTURES, 'decisions-long-ok.json')}`]);
  assert.notEqual(gate.status, 0);
  assert.ok(!gate.stdout.includes('"status":"PASS"'));
});

test('gate C002 invariant [@verifies C002]: gate PASS only when the real gate pipeline passes', () => {
  const gate = runCli(['gate', `--spec=${SPEC}`, `--decisions=${join(FIXTURES, 'decisions-complete.json')}`]);
  assert.equal(gate.status, 0, gate.stdout);
  assert.ok(gate.stdout.includes('COMPLETE'));
});

test('ownership C003 [@verifies C003]: finalize applies decisions ownership and a real spec reaches COMPLETE', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'wst-cmd-'));
  const finalize = runCli(['finalize', `--spec=${SPEC}`, `--decisions=${join(FIXTURES, 'decisions-complete.json')}`], outDir);
  assert.equal(finalize.status, 0, finalize.stdout);
  const manifest = JSON.parse(readFileSync(join(outDir, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
  assert.equal(manifest.status, 'COMPLETE');
  assert.equal(manifest.final_audit.status, 'PASS');
});

test('ownership C003 invariant [@verifies C003]: exactly one manifest is published and reload passes', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'wst-cmd-'));
  const finalize = runCli(['finalize', `--spec=${SPEC}`, `--decisions=${join(FIXTURES, 'decisions-complete.json')}`], outDir);
  assert.equal(finalize.status, 0);
  const files = readdirSync(outDir).filter((file) => file.endsWith('.json'));
  assert.deepEqual(files, ['WORKSPACIFY-TREE-MANIFEST.json']);
  const manifest = JSON.parse(readFileSync(join(outDir, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
  assert.equal(manifest.integrity.reload_validation, 'PASS');
});

test('schema C004 [@verifies C004]: a malformed workspace package or approval is rejected', () => {
  const malformed = {
    workspace: [{ id: 'pkg-1' }],
    ownership: [],
    dependencies: [],
    adapters: {},
    approvals: [{ rationale: 'missing decisionId' }],
  };
  const report = assertDecisionSchema(malformed);
  assert.equal(report.ok, false);
  assert.ok(report.errors.length >= 1);
});

test('schema C004 invariant [@verifies C004]: a valid complete decisions object passes', () => {
  const decisions = loadDecisionInput(join(FIXTURES, 'decisions-complete.json'));
  const report = assertDecisionSchema(decisions);
  assert.equal(report.ok, true);
  assert.equal(report.errors.length, 0);
});

test('manifest C005 [@verifies C005]: published manifest carries database_policy and contract_boundaries', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'wst-cmd-'));
  const finalize = runCli(['finalize', `--spec=${SPEC}`, `--decisions=${join(FIXTURES, 'decisions-complete.json')}`], outDir);
  assert.equal(finalize.status, 0);
  const manifest = JSON.parse(readFileSync(join(outDir, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
  assert.ok(manifest.adapters.database_policy !== undefined);
  assert.ok(Array.isArray(manifest.stage2_handoff.contract_boundaries));
  assert.ok(Array.isArray(manifest.stage2_handoff.contract_definition_order));
});

test('PX-187 C001 [PX-187 @verifies C001]: Step 3 JSON example declares semantic_review and passes the decisions schema', () => {
  const example = extractStep3DecisionJson(readCommandDoc());
  assert.equal(typeof example, 'object');
  assert.ok(example.semantic_review, 'example declares semantic_review');
  assert.equal(example.semantic_review.status, 'APPROVED');
  assert.equal(typeof example.semantic_review.statement, 'string');
  assert.equal(typeof example.semantic_review.approver, 'string');
  const report = assertDecisionSchema(example);
  assert.equal(report.ok, true, JSON.stringify(report.errors));
});

test('PX-187 C002 [PX-187 @verifies C002]: doc declares the AI final approval checklist anchors', () => {
  const md = readCommandDoc();
  for (const anchor of [
    'AI 最終承認チェックリスト',
    'owner 割当の妥当性',
    // The checklist label follows the machine's field name (edge.reasonCode), not the other way round.
    'reasonCode の正当性',
    '代替経路',
    'adapter・DB 適用可否',
    '過剰分割の最終判断',
    'semantic_review',
  ]) {
    assert.ok(md.includes(anchor), `doc mentions ${anchor}`);
  }
});

test('PX-187 C003 [PX-187 @verifies C003]: success definition requires AI approval and machine gates', () => {
  const md = readCommandDoc();
  const index = md.indexOf('## 成功の定義');
  assert.notEqual(index, -1);
  const section = md.slice(index);
  assert.ok(section.includes('AI 意味論最終承認'), 'success definition names AI approval');
  assert.ok(section.includes('semantic_review'), 'success definition names semantic_review');
  assert.ok(/機械ゲート PASS/.test(section), 'success definition requires machine gates PASS');
});

test('PX-187 C004 [PX-187 @verifies C004]: gate without semantic_review is not COMPLETE and the doc explains it', () => {
  const md = readCommandDoc();
  const step4 = md.slice(md.indexOf('## Step 4'));
  assert.ok(step4.includes('semantic_review'), 'Step 4 mentions semantic_review');
  assert.ok(step4.includes('REVIEW_REQUIRED'), 'Step 4 explains the non-COMPLETE result');
  const dir = mkdtempSync(join(tmpdir(), 'wst-sr-'));
  const decisions = loadDecisionInput(join(FIXTURES, 'decisions-complete.json'));
  delete decisions.semantic_review;
  const missingPath = join(dir, 'missing-sr.json');
  writeFileSync(missingPath, JSON.stringify(decisions));
  const gate = runCli(['gate', `--spec=${SPEC}`, `--decisions=${missingPath}`]);
  assert.notEqual(gate.status, 0, 'gate exits non-zero');
  assert.ok(!gate.stdout.includes('COMPLETE'), 'no COMPLETE status');
});

test('PX-187 C005 [PX-187 @verifies C005]: forbidden phrases never resurrect in the doc', () => {
  const md = readCommandDoc();
  assert.ok(!md.includes('--output-dir'), 'no --output-dir option');
  assert.ok(!md.includes('## 言語方針'), 'language-policy note stays deleted');
  assert.ok(!md.includes('English translation'), 'English-translation note stays deleted');
});
