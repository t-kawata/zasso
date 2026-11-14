// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-422 --for-spec --no-implementation-order`.
// @verifies C004

/**
 * PX-420 — mutation tests for the `/build-law-skill` static audit.
 *
 * A contract test that only reads the finished command proves presence, not
 * discrimination. Each case below mutates the real command text in exactly one
 * way and asserts that `auditCommand` reports the corresponding defect. The
 * real file is the fixture, so this suite cannot drift from a second copy.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  auditClaudeBlock,
  auditCommand,
  auditPipelineCheckpoint,
  INTEGRATION_CANONICAL_LINES,
  sectionOf,
} from './lib/command-contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../..');
const COMMAND_TEXT = readFileSync(join(repositoryRoot, '.claude/commands/build-law-skill.md'), 'utf8');

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function mutated(from, to) {
  const output = COMMAND_TEXT.replace(from, to);
  assert.notEqual(output, COMMAND_TEXT, `mutation did not apply: ${from}`);
  return output;
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function codes(text) {
  return new Set(auditCommand(text).map((finding) => finding.code));
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function mutateSection(heading, from, to) {
  const start = COMMAND_TEXT.indexOf(heading);
  assert.ok(start >= 0, `missing ${heading}`);
  const next = COMMAND_TEXT.indexOf('\n## ', start + heading.length);
  const end = next < 0 ? COMMAND_TEXT.length : next;
  const section = COMMAND_TEXT.slice(start, end);
  assert.ok(section.includes(from), `${heading} lacks ${from}`);
  const replaced = section.replace(from, to);
  assert.notEqual(replaced, section);
  return COMMAND_TEXT.slice(0, start) + replaced + COMMAND_TEXT.slice(end);
}

test('C004: audit rejects a missing required section', () => {
  assert.ok(codes(mutated('## Arguments', '## Argument Notes')).has('MISSING_SECTION'));
});

test('C004: audit rejects an option flag in the argument grammar', () => {
  const text = mutated('## Arguments', '## Arguments\n\n- `--write`');
  assert.ok(codes(text).has('FLAG_IN_ARGUMENT_GRAMMAR'));
});

test('C004: audit rejects an example literal in execution logic', () => {
  const text = mutated('## Procedure', '## Procedure\n\nUse NATLAB.');
  assert.ok(codes(text).has('EXAMPLE_LITERAL_IN_EXECUTION'));
});

test('C004: audit rejects an absolute path', () => {
  const text = mutated('## Procedure', '## Procedure\n\nWrite to /Users/example.');
  assert.ok(codes(text).has('ABSOLUTE_PATH'));
});

test('C004: audit rejects a ticket id', () => {
  const text = mutated('## Procedure', '## Procedure\n\nPX-420');
  assert.ok(codes(text).has('TICKET_ID'));
});

test('C004: audit rejects non-English text', () => {
  const text = mutated('## Procedure', '## Procedure\n\n実装');
  assert.ok(codes(text).has('CJK_TEXT'));
});

test('C004: audit rejects a path anchor not rooted at the git top-level', () => {
  const text = mutateSection(
    '## Path Anchor',
    "printf '%s/.claude\\n' \"$(git rev-parse --show-toplevel)\"",
    "printf '%s\\n' \"$PWD\"",
  );
  assert.ok(codes(text).has('SKILL_LOCATION_DRIFT'));
});

test('C004: audit rejects a skill location outside <repo>/.claude/skills', () => {
  const text = mutateSection(
    '## Path Anchor',
    'SKILL_DIR="$CLAUDE_DIR/skills/<name>-law"',
    'SKILL_DIR="$PWD_ROOT/.claude/skills/<name>-law"',
  );
  assert.ok(codes(text).has('SKILL_LOCATION_DRIFT'));
});

test('C004: audit rejects a missing canonical verifier', () => {
  const text = mutateSection('## Verification Gates', 'verify-law-skill.mjs', 'verify-something.mjs');
  assert.ok(codes(text).has('MISSING_VERIFIER'));
});

test('C004: audit rejects a missing pipeline checkpoint', () => {
  const text = mutateSection('## Integration Checkpoints', 'make-ticket', 'make-something');
  assert.ok(codes(text).has('MISSING_CHECKPOINT'));
});

test('C004: audit rejects an overlong checkpoint block', () => {
  const text = COMMAND_TEXT.replace(
    '\n## Integration Checkpoints\n',
    '\n## Integration Checkpoints\n\n- one\n- two\n- three\n- four\n- five\n- six\n',
  );
  assert.ok(codes(text).has('CHECKPOINT_TOO_LONG'));
});

test('C004: audit rejects CLI syntax inside a checkpoint', () => {
  const text = COMMAND_TEXT.replace(
    '\n## Integration Checkpoints\n',
    '\n## Integration Checkpoints\n\n- run --root .\n',
  );
  assert.ok(codes(text).has('CLI_IN_CHECKPOINT'));
});

test('C004: audit rejects a missing determinism term', () => {
  const text = mutateSection('## Verification Gates', 'rebuild', 'recheck');
  assert.ok(codes(text).has('MISSING_DETERMINISM_TERM'));
});

test('C004: audit rejects replacing node --test with make test', () => {
  const text = COMMAND_TEXT.replaceAll('node --test', 'make test');
  assert.notEqual(text, COMMAND_TEXT);
  assert.ok(codes(text).has('MISSING_NODE_TEST_POLICY'));
});

test('C004: audit rejects a missing read-only source invariant', () => {
  const text = mutateSection('## Input Contract', 'read-only', 'readable');
  assert.ok(codes(text).has('MISSING_SOURCE_READ_ONLY'));
});

test('C004: audit rejects a missing failure code', () => {
  const text = mutateSection('## Failure Modes', 'INVALID_ARGUMENT', 'BAD_ARGUMENT');
  assert.ok(codes(text).has('MISSING_FAILURE_CODE'));
});

test('C004: audit rejects an external source fixture reference', () => {
  const text = mutated('## Procedure', '## Procedure\n\nUse docs/example.md.');
  assert.ok(codes(text).has('EXTERNAL_FIXTURE_REFERENCE'));
});

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
test('C005: audit rejects a missing Integration Contract section', () => {
  const text = COMMAND_TEXT.replace('\n## Integration Contract\n', '\n## Integration Notes\n');
  assert.notEqual(text, COMMAND_TEXT);
  assert.ok(codes(text).has('MISSING_SECTION'));
  assert.ok(codes(text).has('MISSING_INTEGRATION_CONTRACT'));
});

test('C005: audit rejects a missing Integration gate row', () => {
  const text = mutated('| Integration |', '| Integrated |');
  assert.ok(codes(text).has('MISSING_INTEGRATION_GATE'));
});

test('C005: audit rejects a missing integration failure code', () => {
  const text = mutated('INTEGRATION_MISSING', 'INTEGRATION_ABSENT');
  assert.ok(codes(text).has('MISSING_INTEGRATION_CODE'));
});

test('C005: audit rejects a drifted canonical line', () => {
  const canonical = INTEGRATION_CANONICAL_LINES.claude;
  const text = mutated(canonical, canonical.replace('machine_verified', 'verified'));
  assert.ok(codes(text).has('MISSING_INTEGRATION_LINE'));
});

test('C005: audit rejects exact CLI in a canonical line', () => {
  const canonical = INTEGRATION_CANONICAL_LINES.claude;
  const text = mutated(canonical, `${canonical} --root .`);
  assert.ok(codes(text).has('INTEGRATION_CLI_LEAK'));
});

test('C004: the unmutated command passes', () => {
  assert.deepEqual(auditCommand(COMMAND_TEXT), []);
});

test('C004: section extraction is exact', () => {
  assert.ok(sectionOf(COMMAND_TEXT, '## Procedure').includes('Step'));
});


test('C006: audit rejects a removed v2 artifact', () => {
  const text = mutated('source/input-ledger.json', 'source/ledger.json');
  assert.ok(codes(text).has('MISSING_ARTIFACT'));
});

test('C006: audit rejects a removed leak ledger', () => {
  const text = COMMAND_TEXT.replaceAll('source/redaction.review.json', 'source/review.json');
  assert.notEqual(text, COMMAND_TEXT);
  assert.ok(codes(text).has('MISSING_LEAK_LEDGER'));
});

test('C006: audit rejects a removed coverage ledger', () => {
  const text = COMMAND_TEXT.replaceAll('source/normative-inventory.json', 'source/inventory.json');
  assert.notEqual(text, COMMAND_TEXT);
  assert.ok(codes(text).has('MISSING_COVERAGE_LEDGER'));
});

test('C006: audit rejects a removed style rule', () => {
  const text = mutated('STYLE_NOT_ENGLISH', 'STYLE');
  assert.ok(codes(text).has('MISSING_STYLE_RULE'));
});

test('C006: audit rejects a removed path alias', () => {
  const text = COMMAND_TEXT.replaceAll('.path-alias.json', 'alias.json').replaceAll('path-alias', 'alias-map');
  assert.notEqual(text, COMMAND_TEXT);
  assert.ok(codes(text).has('MISSING_PATH_ALIAS'));
});

test('C006: audit rejects a removed check name', () => {
  const text = mutated('ruleIdentity', 'identityRule');
  assert.ok(codes(text).has('MISSING_GATE_TERM'));
});

test('C006: audit rejects the old eighteen-check gate', () => {
  const text = mutateSection('## Verification Gates', '36 checks', '18 checks');
  assert.ok(codes(text).has('MISSING_GATE_TERM'));
});

test('C006: a pipeline checkpoint without installed v2 fails', () => {
  const path = join(repositoryRoot, '.claude/commands/make-ticket.md');
  const text = readFileSync(path, 'utf8').replace('v3 `dev` + `installed`', 'v3 `dev`');
  assert.ok(auditPipelineCheckpoint(text).some((finding) => finding.code === 'MISSING_V2_CHECKPOINT'));
});

test('C006: a CLAUDE block without closure fails', () => {
  const path = join(repositoryRoot, '.claude/CLAUDE.md');
  const text = readFileSync(path, 'utf8').replace('record `closure`', 'record status');
  assert.ok(auditClaudeBlock(text).some((finding) => finding.code === 'MISSING_V2_CHECKPOINT'));
});
