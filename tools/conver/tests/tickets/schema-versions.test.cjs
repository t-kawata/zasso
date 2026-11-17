// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
'use strict';

/**
 * PX-436 C001/C004/C005 — versioned artifacts.
 *
 * A reader rejects an unknown major version rather than guessing. The five new
 * schemas declare version 1; the shared guard is the one reader rule.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { requireSupportedVersion } = require('../../.claude/scripts/tickets/lib/versioned-json.js');

const SCHEMA_DIR = path.resolve(__dirname, '../../.claude/schemas');
const SCHEMAS = [
  'contract-inventory.schema.json',
  'test-index.schema.json',
  'contract-coverage.schema.json',
  'disposition.schema.json',
  'repair-record.schema.json',
];

test('C001/C004/C005: every v3 schema exists and declares version 1', () => {
  for (const name of SCHEMAS) {
    const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8'));
    assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#', name);
    assert.equal(schema.properties.version.const, 1, name);
    assert.equal(schema.required.includes('version'), true, name);
  }
});

test('C001: a supported version passes the reader guard', () => {
  assert.equal(requireSupportedVersion({ version: 1 }, [1], 'fixture'), 1);
});

test('C001: an unknown major version is rejected, never guessed', () => {
  assert.throws(() => requireSupportedVersion({ version: 2 }, [1], 'fixture'), (error) => error.code === 'UNSUPPORTED_VERSION');
  assert.throws(() => requireSupportedVersion({}, [1], 'fixture'), (error) => error.code === 'UNSUPPORTED_VERSION');
});
