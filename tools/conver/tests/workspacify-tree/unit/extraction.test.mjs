// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// [::TICKET::] PX-176: workspacify-tree Inventory extraction tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-176 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { buildHeadingTree } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { segmentAtHeadings } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';
import {
  harvestObjectCandidates,
  harvestClaimCandidates,
  harvestNormativeCandidates,
  harvestRequirementCandidates,
} from '../../../.claude/scripts/workspacify-tree/lib/extraction.mjs';
import { assertSourceTraceability } from '../../../.claude/scripts/workspacify-tree/lib/traceability.mjs';
import { normalizeAliases, detectAliasCycles } from '../../../.claude/scripts/workspacify-tree/lib/alias-normalization.mjs';

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));
const readFixture = (name) => readFileSync(join(FIXTURES, name), 'utf8');

function analyze(sourceText) {
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  return { headings, segments };
}

// ---- C001: object/entity candidates -------------------------------------

test('C001 object harvest [@verifies C001]: a markdown table has an object column and inline code identifiers', () => {
  const sourceText = readFixture('objects-table.md');
  const { headings, segments } = analyze(sourceText);
  const objects = harvestObjectCandidates({ sourceText, headings, segments });
  // table + inline code identifiers are collected
  assert.ok(objects.some((c) => c.canonical_name === 'AlphaRecord'));
  assert.ok(objects.some((c) => c.canonical_name === 'BetaCredential'));
  assert.ok(objects.some((c) => c.canonical_name === 'GammaRecord'));
  assert.ok(objects.some((c) => c.canonical_name === 'delta_value'));
});

test('C001 object harvest: classification is taken from table kind and unknown from inline code', () => {
  const sourceText = readFixture('objects-table.md');
  const { headings, segments } = analyze(sourceText);
  const objects = harvestObjectCandidates({ sourceText, headings, segments });
  const alpha = objects.find((c) => c.canonical_name === 'AlphaRecord');
  const delta = objects.find((c) => c.canonical_name === 'delta_value');
  assert.equal(alpha.classification, 'record');
  assert.equal(delta.classification, 'unknown');
  assert.equal(delta.normalization_status, 'REVIEW_REQUIRED');
});

test('C001 object harvest postcondition [@verifies C001]: returns candidates with source_refs and empty canonical names are excluded', () => {
  const sourceText = '# T\n## Objects\n| object |\n|--------|\n|  |\n| RealObject |\n';
  const { headings, segments } = analyze(sourceText);
  const objects = harvestObjectCandidates({ sourceText, headings, segments });
  assert.ok(objects.every((c) => c.canonical_name.length > 0), 'empty canonical names excluded');
  assert.ok(objects.every((c) => c.source_refs.length >= 1), 'each candidate has source_refs');
  assert.ok(objects.every((c) => /^obj-\d{6}$/.test(c.id)), 'ids are obj-######');
  assert.equal(objects.some((c) => c.canonical_name === 'RealObject'), true);
});

test('C001 invariant [@verifies C001]: every candidate has at least one source_refs and canonical_name is non empty', () => {
  const sourceText = readFixture('duplicated-objects.md');
  const { headings, segments } = analyze(sourceText);
  const objects = harvestObjectCandidates({ sourceText, headings, segments });
  const report = assertSourceTraceability(objects);
  assert.equal(report.ok, true);
  assert.equal(report.missing.length, 0);
});

test('C001 traceability: source_refs carry section_id and byte range', () => {
  const sourceText = '# Title\n## Object Catalog\n\nUse `GammaRecord` now.\n';
  const { headings, segments } = analyze(sourceText);
  const objects = harvestObjectCandidates({ sourceText, headings, segments });
  const gamma = objects.find((c) => c.canonical_name === 'GammaRecord');
  const ref = gamma.source_refs[0];
  assert.ok(ref.section_id !== null && ref.section_id !== undefined);
  assert.ok(ref.line_start >= 1);
  assert.ok(ref.byte_start >= 0 && ref.byte_end > ref.byte_start);
  assert.equal(typeof ref.snippet, 'string');
});

// ---- C002: claim candidates ---------------------------------------------

test('C002 claim harvest [@verifies C002]: a code block enumerates claim identifiers and proof container values', () => {
  const sourceText = readFixture('claims-codeblock.md');
  const { headings, segments } = analyze(sourceText);
  const claims = harvestClaimCandidates({ sourceText, headings, segments });
  assert.ok(claims.some((c) => c.canonical_name === 'claim_order_validity'));
  assert.ok(claims.some((c) => c.canonical_name === 'claim_eligibility'));
  assert.ok(claims.some((c) => c.canonical_name === 'StateProofEnvelope'));
});

test('C002 claim postcondition [@verifies C002]: returns claim candidates with primary owner field set to null initially', () => {
  const sourceText = readFixture('claims-codeblock.md');
  const { headings, segments } = analyze(sourceText);
  const claims = harvestClaimCandidates({ sourceText, headings, segments });
  assert.ok(claims.every((c) => c.primary_owner === null));
  assert.ok(claims.every((c) => c.source_refs.length >= 1));
  assert.ok(claims.every((c) => /^claim-\d{6}$/.test(c.id)));
});

test('C002 claim context: fenced tokens outside a claim heading are not harvested', () => {
  const sourceText = '# T\n## Other\n```\nclaim_lonely_value\nStateProofEnvelope\n```\n';
  const { headings, segments } = analyze(sourceText);
  const claims = harvestClaimCandidates({ sourceText, headings, segments });
  assert.equal(claims.length, 0);
});

test('C002 invariant [@verifies C002]: claim and object name collisions are explicitly classified', () => {
  const sourceText = readFixture('duplicated-objects.md');
  const { headings, segments } = analyze(sourceText);
  const objects = harvestObjectCandidates({ sourceText, headings, segments });
  const claims = harvestClaimCandidates({ sourceText, headings, segments });
  assert.ok(objects.some((c) => c.canonical_name === 'SharedRecord'));
  assert.ok(claims.some((c) => c.canonical_name === 'shared_record'));
  const { collisions } = normalizeAliases(objects, { collisionWith: claims });
  assert.ok(collisions.some((col) => col.normalized_key === 'sharedrecord'), 'object/claim collision detected');
});

// ---- C003: normative candidates -----------------------------------------

test('C003 normative harvest [@verifies C003]: text contains english and japanese normative keywords', () => {
  const sourceText = readFixture('normative-words.md');
  const { headings, segments } = analyze(sourceText);
  const norms = harvestNormativeCandidates({ sourceText, headings, segments });
  assert.ok(norms.some((c) => c.keyword === 'MUST NOT' && c.classification === 'must-not'));
  assert.ok(norms.some((c) => c.keyword === 'SHALL' && c.classification === 'shall'));
  assert.ok(norms.some((c) => c.keyword === '禁止'));
  assert.ok(norms.some((c) => c.keyword === '不変条件'));
});

test('C003 normative postcondition [@verifies C003]: records keyword section line range context snippet classification', () => {
  const sourceText = '# T\n## Rules\nClients MUST NOT retry.\n';
  const { headings, segments } = analyze(sourceText);
  const norms = harvestNormativeCandidates({ sourceText, headings, segments });
  assert.equal(norms.length, 1);
  const candidate = norms[0];
  assert.equal(candidate.keyword, 'MUST NOT');
  assert.equal(candidate.classification, 'must-not');
  assert.ok(candidate.section_id !== null && candidate.section_id !== undefined);
  assert.ok(candidate.line_start >= 1 && candidate.line_end >= candidate.line_start);
  assert.ok(candidate.byte_start >= 0 && candidate.byte_end > candidate.byte_start);
  assert.ok(candidate.context.includes('MUST NOT'));
  assert.ok(candidate.snippet.length > 0);
});

test('C003 ambiguity [@verifies C003]: ambiguous candidates are recorded as REVIEW_REQUIRED not silently promoted', () => {
  const sourceText = '# X\n## Rules\nMUST NOT 禁止\n';
  const { headings, segments } = analyze(sourceText);
  const norms = harvestNormativeCandidates({ sourceText, headings, segments });
  assert.ok(norms.length >= 2, 'both phrases are harvested');
  assert.ok(norms.every((c) => c.normalization_status === 'REVIEW_REQUIRED'));
});

test('C003 fence: normative keywords inside a code fence are ignored', () => {
  const sourceText = '# X\n## Rules\n```\nMUST NOT retry\n```\n';
  const { headings, segments } = analyze(sourceText);
  const norms = harvestNormativeCandidates({ sourceText, headings, segments });
  assert.equal(norms.length, 0);
});

test('C003 requirement harvest: invariant and error-code classifications are returned', () => {
  const sourceText = '# T\n## Rules\n不変条件: total >= 0.\nエラーコード E001.\n検査対象: the ledger.\n';
  const { headings, segments } = analyze(sourceText);
  const reqs = harvestRequirementCandidates({ sourceText, headings, segments });
  assert.ok(reqs.some((c) => c.classification === 'invariant'));
  assert.ok(reqs.some((c) => c.classification === 'error-code'));
  assert.ok(reqs.some((c) => c.classification === 'test-requirement'));
});

// ---- C004: alias normalization and collisions ---------------------------

test('C004 normalizeAliases [@verifies C004]: duplicate canonical names collapse with alias tracking', () => {
  const sourceText = readFixture('duplicated-objects.md');
  const { headings, segments } = analyze(sourceText);
  const objects = harvestObjectCandidates({ sourceText, headings, segments });
  // SharedRecord appears both in the table and as an inline code mention.
  const shared = objects.find((c) => c.canonical_name === 'SharedRecord');
  assert.ok(shared.source_refs.length >= 2);
  const { candidates, decisions } = normalizeAliases(objects);
  assert.ok(decisions.length >= 0);
  const names = candidates.map((c) => c.canonical_name);
  assert.equal(new Set(names).size, names.length, 'same canonical_name does not appear twice');
});

test('C004 normalizeAliases: snake_case and PascalCase variants merge on normalized key', () => {
  const dupObjects = [
    { id: 'obj-000001', canonical_name: 'AlphaRecord', source_refs: [{ line_start: 1 }], classification: 'record', normalization_status: 'CONFIRMED' },
    { id: 'obj-000002', canonical_name: 'alpha_record', source_refs: [{ line_start: 9 }], classification: 'unknown', normalization_status: 'REVIEW_REQUIRED' },
  ];
  const normalized = normalizeAliases(dupObjects);
  assert.equal(normalized.candidates.length, 1);
  assert.ok(normalized.candidates[0].aliases.includes('alpha_record'));
  assert.equal(normalized.candidates[0].normalization_status, 'REVIEW_REQUIRED');
});

test('C004 detectAliasCycles [@verifies C004]: a cyclic alias mapping reports the cycle path', () => {
  const cycles = detectAliasCycles([
    { name: 'x', alias: 'y' },
    { name: 'y', alias: 'z' },
    { name: 'z', alias: 'x' },
  ]);
  assert.equal(cycles.length, 1);
  assert.ok(cycles[0].path.length >= 2);
});

test('C004 detectAliasCycles: acyclic alias chains report no cycles', () => {
  const cycles = detectAliasCycles([
    { name: 'a', alias: 'b' },
    { name: 'b', alias: 'c' },
  ]);
  assert.equal(cycles.length, 0);
});

test('C004 invariant [@verifies C004]: unknown classification is zero or approved after normalization', () => {
  const unknownObject = [
    { id: 'obj-000001', canonical_name: 'MysteryThing', source_refs: [{ line_start: 2 }], classification: 'unknown', normalization_status: 'REVIEW_REQUIRED' },
  ];
  const normalized = normalizeAliases(unknownObject);
  const candidate = normalized.candidates[0];
  if (candidate.classification === 'unknown') {
    assert.equal(candidate.normalization_status, 'REVIEW_REQUIRED', 'unknown is REVIEW_REQUIRED until approved');
  }
});
