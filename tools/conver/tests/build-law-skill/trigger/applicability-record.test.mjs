/**
 * The generated `applies` selection is data-driven by the shipped record.
 *
 * A hardcoded interface-role list would pass the CLI smoke test but fail here:
 * narrowing `applies.roles` to `cli` must make a `rest` unit non-applicable.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateApplicability } from '../../../.claude/skills/rust-interface-law/scripts/lib/applicability.mjs';

const RECORD = {
  schema: 'law-applicability/v1',
  skill: 'rust-interface-law',
  classification: 'specific-case-trigger',
  conditions: [{ id: 'path', terms: ['crates/**'] }],
  instruction: '`rust-interface-law`: apply only when changed/target path matches `crates/**`; `applies` exit 3 = skip.',
  applies: {
    discovery: 'workspace-units',
    paths: ['crates/**'],
    roles: ['rest'],
    sharedRoles: ['core'],
    sharedCondition: 'ticket declares interface scope',
    skipExit: 3,
  },
};

const UNITS = [
  { id: 'app-rest', role: 'rest', paths: ['crates/app-rest/**'] },
  { id: 'app-core', role: 'core', paths: ['crates/app-core/**'] },
  { id: 'app-cli', role: 'cli', paths: ['crates/app-cli/**'] },
];

test('a matching path and role applies', () => {
  const result = evaluateApplicability({
    record: RECORD,
    paths: ['crates/app-rest/src/lib.rs'],
    units: UNITS,
    includeShared: false,
  });
  assert.equal(result.applies, true);
  assert.deepEqual(result.applicable.map((unit) => unit.id), ['app-rest']);
});

test('a shared role is skipped without the shared flag', () => {
  const result = evaluateApplicability({
    record: RECORD,
    paths: ['crates/app-core/src/lib.rs'],
    units: UNITS,
    includeShared: false,
  });
  assert.equal(result.applies, false);
});

test('a shared role applies with the shared flag', () => {
  const result = evaluateApplicability({
    record: RECORD,
    paths: ['crates/app-core/src/lib.rs'],
    units: UNITS,
    includeShared: true,
  });
  assert.equal(result.applies, true);
});

test('narrowing the record roles changes the selection', () => {
  const narrowed = {
    ...RECORD,
    applies: { ...RECORD.applies, roles: ['cli'] },
  };
  const rest = evaluateApplicability({
    record: narrowed,
    paths: ['crates/app-rest/src/lib.rs'],
    units: UNITS,
    includeShared: false,
  });
  const cli = evaluateApplicability({
    record: narrowed,
    paths: ['crates/app-cli/src/lib.rs'],
    units: UNITS,
    includeShared: false,
  });
  assert.equal(rest.applies, false);
  assert.equal(cli.applies, true);
});

test('a path outside the record does not apply', () => {
  const result = evaluateApplicability({
    record: RECORD,
    paths: ['docs/README.md'],
    units: UNITS,
    includeShared: false,
  });
  assert.equal(result.applies, false);
});
