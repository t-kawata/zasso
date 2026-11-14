/**
 * The trigger instruction is AI-authored but machine-checked.
 *
 * The machine enforces the telegraphic English contract and token coverage;
 * it never translates or generates the sentence itself.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_TRIGGER_INSTRUCTION_LENGTH,
  buildTriggerLine,
  triggerMarker,
  validateTriggerInstruction,
} from '../../../.claude/scripts/amend-rfc-up/law-integration/applicability.mjs';

const SKILL = 'rust-interface-law';
const CONDITIONS = [
  { id: 'path', terms: ['crates/**'] },
  { id: 'roles', terms: ['rest', 'websocket', 'cli', 'grpc', 'mcp', 'a2a'] },
  { id: 'shared', terms: ['operation', 'core', 'ticket declares interface scope'] },
];
const GOOD = '`rust-interface-law`: apply only when changed/target path matches `crates/**` unit role `rest|websocket|cli|grpc|mcp|a2a`; shared `operation|core` only if ticket declares interface scope. `applies` exit 3 = skip.';

function codes(instruction, options = {}) {
  return validateTriggerInstruction(instruction, {
    skill: SKILL,
    conditions: CONDITIONS,
    ...options,
  }).map((finding) => finding.code);
}

test('a telegraphic English instruction passes', () => {
  assert.deepEqual(validateTriggerInstruction(GOOD, { skill: SKILL, conditions: CONDITIONS }), []);
});

test('CJK is rejected', () => {
  assert.ok(codes(`${GOOD} のみ。`).includes('TRIGGER_NOT_ENGLISH'));
});

test('an over-length instruction is rejected', () => {
  const long = `${GOOD} ${'x'.repeat(MAX_TRIGGER_INSTRUCTION_LENGTH)}`;
  assert.ok(codes(long).includes('TRIGGER_TOO_LONG'));
});

test('filler prose is rejected', () => {
  assert.ok(codes(`${GOOD} Please note that this is important.`).includes('TRIGGER_FILLER'));
});

test('a missing condition term is rejected', () => {
  assert.ok(codes(GOOD.replace('websocket|', '')).includes('TRIGGER_MISSING_TERM'));
});

test('a missing skip action is rejected', () => {
  assert.ok(codes(GOOD.replace('`applies` exit 3 = skip.', '')).includes('TRIGGER_MISSING_ACTION'));
});

test('the injected line is exactly marker plus instruction', () => {
  assert.equal(buildTriggerLine(SKILL, GOOD), `${triggerMarker(SKILL)} ${GOOD}`);
});
