// @verifies C004
// [::TICKET::] PX-177: workspacify-tree schema validator tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-177 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateAgainstSchema, loadSchema } from '../../../.claude/scripts/workspacify-tree/lib/manifest-schema.mjs';

test('schema C004 [@verifies C004]: a value violating required fields is invalid', () => {
  const schema = {
    type: 'object',
    required: ['artifact_kind', 'status'],
    properties: {
      artifact_kind: { type: 'string' },
      status: { type: 'string', enum: ['COMPLETE', 'FAIL'] },
    },
  };
  const result = validateAgainstSchema({ artifact_kind: 'workspacify-tree-manifest' }, schema);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 1);
});

test('schema: enum and nested property constraints are enforced', () => {
  const schema = {
    type: 'object',
    required: ['run'],
    properties: {
      run: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', enum: ['PASS', 'FAIL'] } },
      },
    },
  };
  assert.equal(validateAgainstSchema({ run: { status: 'MAYBE' } }, schema).valid, false);
  assert.equal(validateAgainstSchema({ run: { status: 'PASS' } }, schema).valid, true);
  assert.equal(validateAgainstSchema({}, schema).valid, false);
});

test('schema: array items and string pattern are checked', () => {
  const schema = {
    type: 'object',
    required: ['hash'],
    properties: {
      hash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      list: { type: 'array', items: { type: 'integer' }, minItems: 1 },
    },
  };
  assert.equal(validateAgainstSchema({ hash: 'zz', list: [1] }, schema).valid, false);
  assert.equal(validateAgainstSchema({ hash: 'a'.repeat(64), list: [1, 2] }, schema).valid, true);
});

test('schema: type mismatches are reported', () => {
  const schema = { type: 'object', properties: { count: { type: 'integer' }, name: { type: 'string' } } };
  assert.equal(validateAgainstSchema({ count: '1', name: 'x' }, schema).valid, false);
  assert.equal(validateAgainstSchema({ count: 1, name: 5 }, schema).valid, false);
});

test('schema: manifest schema file loads and accepts its own skeleton', () => {
  const manifestSchema = loadSchema('workspacify-tree-manifest.schema.json');
  assert.ok(manifestSchema.$schema && manifestSchema.$schema.includes('2020-12'));
  const skeleton = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    artifact_kind: 'workspacify-tree-manifest',
    schema_version: '1.0.0',
    status: 'COMPLETE',
    run: {},
    input: {},
    structure: {},
    inventory: {},
    requirements: {},
    workspace: {},
    adapters: {},
    dependencies: {},
    conformance: {},
    stage2_handoff: {},
    gates: {},
    final_audit: {},
    integrity: {},
  };
  const result = validateAgainstSchema(skeleton, manifestSchema);
  assert.equal(result.valid, true);
});

test('schema: decisions schema file loads and accepts a valid decisions object', () => {
  const decisionsSchema = loadSchema('workspacify-tree-decisions.schema.json');
  const valid = { workspace: [], ownership: [], dependencies: [], adapters: [], approvals: [] };
  const result = validateAgainstSchema(valid, decisionsSchema);
  assert.equal(result.valid, true);
});
