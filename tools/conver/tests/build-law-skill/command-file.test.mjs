// [::TICKET::] PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-422 --for-spec --no-implementation-order`.
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// @verifies C006

/**
 * PX-420 — static and input-contract tests for `/build-law-skill`.
 *
 * The command is an AI-executed Markdown procedure. This suite holds the
 * procedure to its declared contract: positional arguments, required sections,
 * gate order, anti-overfit boundaries, and the input contract applied to the
 * three real source documents. The executable product (a generated law skill)
 * is verified separately by the canonical verifier.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ArgumentError,
  CANONICAL_CHECKS,
  EXAMPLE_LITERALS,
  PIPELINE_COMMANDS,
  REQUIRED_ARTIFACTS,
  STYLE_CODES,
  allocateRuleCandidates,
  auditArtifacts,
  auditClaudeBlock,
  auditCommand,
  auditCoverage,
  auditLeak,
  auditPipelineCheckpoint,
  auditSpecParity,
  auditStyle,
  deriveProfile,
  measureSource,
  normalizeLf,
  parseInvocation,
  sectionOf,
  sha256Text,
  validateSource,
} from './lib/command-contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../..');
const commandPath = join(repositoryRoot, '.claude/commands/build-law-skill.md');
const acceptanceDirectory = join(here, 'acceptance');

const sourcePaths = [
  'docs/NATLAB/Implementation-Handbook.md',
  'docs/BUILDENV/Apple-Silicon-Local-Rust-FFI-Runbook.md',
  'docs/BUILDENV/PJSIP-BUILD-GUIDE.md',
];

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function readCommand() {
  return readFileSync(commandPath, 'utf8');
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function sourceInputs() {
  return sourcePaths.map((path) => validateSource({ root: repositoryRoot, path }));
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function runAcceptance(args) {
  return spawnSync(
    process.execPath,
    [join(acceptanceDirectory, 'verify-law-builds.mjs'), ...args, '--root', repositoryRoot],
    { encoding: 'utf8' },
  );
}

// @verifies C001
test('C001: positional grammar accepts both forms and rejects option flags', () => {
  const single = parseInvocation(['example-law', 'docs/a.md']);
  assert.deepEqual(single.map((unit) => unit.name), ['example-law']);

  const paired = parseInvocation([
    'a-law=docs/a.md',
    'b-law=docs/b.md',
    'a-law=docs/c.md',
  ]);
  assert.deepEqual(paired.map((unit) => unit.sources.length), [2, 1]);

  assert.throws(
    () => parseInvocation(['example-law', '--write']),
    (error) => error instanceof ArgumentError && error.code === 'INVALID_ARGUMENT',
  );
  assert.throws(
    () => parseInvocation(['a-law=docs/a.md', 'b-law', 'docs/b.md']),
    (error) => error.code === 'MIXED_ARGUMENT_FORMS',
  );
  assert.throws(
    () => parseInvocation([]),
    (error) => error.code === 'INVALID_ARGUMENT',
  );
});

// @verifies C001
test('C001: command carries the required frontmatter and sections', () => {
  const findings = auditCommand(readCommand());
  assert.deepEqual(findings, []);
  for (const heading of ['## Arguments', '## Procedure', '## Verification Gates']) {
    assert.ok(readCommand().includes(heading), heading);
  }
});

// @verifies C001
test('C001: SKILL_DIR is fixed to <repo>/.claude/skills', () => {
  const text = readCommand();
  const anchor = sectionOf(text, '## Path Anchor');
  assert.ok(anchor.includes("printf '%s/.claude\\n' \"$(git rev-parse --show-toplevel)\""));
  assert.ok(anchor.includes('SKILL_DIR="$CLAUDE_DIR/skills/<name>-law"'));
  assert.equal(/\b(?:PWD_ROOT|DEV_ROOT)\b/.test(anchor), false);
  assert.equal(auditCommand(text).some((finding) => finding.code === 'SKILL_LOCATION_DRIFT'), false);
});

// @verifies C002
test('C002: the three sources satisfy the input contract and keep their bytes', () => {
  const sources = sourceInputs();
  for (const source of sources) {
    assert.match(source.sha256, /^[0-9a-f]{64}$/);
    assert.ok(source.lines > 0);
    assert.equal(source.text.includes('\r'), false);
    assert.ok(source.headings > 0);
  }
  const record = JSON.parse(readFileSync(join(acceptanceDirectory, 'law-builds.json'), 'utf8'));
  const recorded = new Map(record.sources.map((source) => [source.path, source]));
  for (const source of sources) {
    assert.equal(source.sha256, recorded.get(source.path).sha256, source.path);
    assert.equal(source.lines, recorded.get(source.path).lines, source.path);
  }
});

// @verifies C002
test('C002: missing, outside-root, and non-English sources are rejected', () => {
  assert.throws(
    () => validateSource({ root: repositoryRoot, path: 'docs/missing.md' }),
    (error) => error.code === 'SOURCE_MISSING',
  );
  assert.throws(
    () => validateSource({ root: repositoryRoot, path: '../outside.md' }),
    (error) => error.code === 'SOURCE_OUTSIDE_ROOT',
  );
  assert.throws(
    () => validateSource({ root: here, path: 'fixtures/non-english.md' }),
    (error) => error.code === 'SOURCE_NOT_ENGLISH',
  );
});

// @verifies C003
test('C003: the acceptance verifier rejects a bad source hash and accepts the reference build', () => {
  const record = JSON.parse(readFileSync(join(acceptanceDirectory, 'law-builds.json'), 'utf8'));
  const tampered = structuredClone(record);
  tampered.sources[0].sha256 = '0'.repeat(64);
  const tamperedPath = join(here, 'fixtures/.tampered-record.json');
  writeFileSync(tamperedPath, JSON.stringify(tampered));
  try {
    const bad = runAcceptance(['--record', tamperedPath]);
    assert.equal(bad.status, 1, bad.stdout);
    const good = runAcceptance(['--record', join(acceptanceDirectory, 'law-builds.json')]);
    assert.equal(good.status, 0, good.stdout);
    const reference = runAcceptance([
      '--record',
      join(acceptanceDirectory, 'fixtures/reference-build.json'),
    ]);
    assert.equal(reference.status, 0, reference.stdout);
  } finally {
    rmSync(tamperedPath, { force: true });
  }
});

// @verifies C004
test('C004: the three sources derive distinct profiles without example branches', () => {
  const sources = sourceInputs();
  const profiles = sources.map((source) => deriveProfile({ sources: [source] }));
  for (const profile of profiles) {
    assert.ok(profile.phases.includes('scope'));
    assert.ok(profile.phases.includes('review'));
    assert.ok(profile.prefixes.length > 0);
    for (const prefix of profile.prefixes) assert.match(prefix, /^[A-Z][A-Z0-9]*$/);
  }
  const signatures = new Set(profiles.map((profile) => profile.phases.join('|')));
  assert.equal(signatures.size, 3, 'profiles must be derived per source');
});

// @verifies C004
test('C004: rule candidates are unique, grammar-valid, and source-order stable', () => {
  const sources = sourceInputs();
  const profile = deriveProfile({ sources });
  const first = allocateRuleCandidates({ sources, profile });
  const second = allocateRuleCandidates({ sources, profile });
  assert.ok(first.length > 0);
  assert.deepEqual(first, second);
  const ids = first.map((candidate) => candidate.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/);
});

// @verifies C004
test('C004: command is standalone and names no external source fixture', () => {
  const text = readCommand();
  for (const literal of EXAMPLE_LITERALS) {
    assert.equal(text.includes(literal), false, literal);
  }
  assert.equal(/\bdocs\//.test(text), false);
  assert.equal(text.includes('## Acceptance Fixtures'), false);
});

// @verifies C004
test('C004: fixture inputs exercise the declared mutations', () => {
  const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf8');
  assert.equal(measureSource(fixture('no-normative.md')).normative, 0);
  assert.equal(normalizeLf(fixture('crlf.md')).includes('\r'), false);
  assert.equal(measureSource(fixture('no-headings.md')).headings, 0);
  const duplicateInput = [{ path: 'duplicate-headings.md', text: fixture('duplicate-headings.md') }];
  const duplicateProfile = deriveProfile({ sources: duplicateInput });
  const duplicate = allocateRuleCandidates({ sources: duplicateInput, profile: duplicateProfile });
  assert.equal(new Set(duplicate.map((candidate) => candidate.id)).size, duplicate.length);
});

// @verifies C005
test('C005: integration checkpoints name five commands and stay bounded', () => {
  const text = readCommand();
  const checkpoints = sectionOf(text, '## Integration Checkpoints');
  for (const command of ['make-ticket', 'plan-ticket', 'start-ticket', 'review-ticket', 'resolve-ticket']) {
    assert.ok(checkpoints.includes(command), command);
  }
  assert.ok(checkpoints.includes('SKILL.md'));
  assert.equal(checkpoints.includes('--root'), false);
  assert.ok(checkpoints.split('\n').filter((line) => line.trim()).length <= 5);
});

// @verifies C006
test('C006: identical inputs produce identical hashes and profiles', () => {
  const sources = sourceInputs();
  const first = sha256Text(JSON.stringify(deriveProfile({ sources })));
  const second = sha256Text(JSON.stringify(deriveProfile({ sources })));
  assert.equal(first, second);
  const changed = sources.map((source, index) => (index === 0
    ? { ...source, text: source.text.replace(/^## .+$/m, '## Changed Phase') }
    : source));
  assert.notEqual(first, sha256Text(JSON.stringify(deriveProfile({ sources: changed }))));
});

// @verifies C006
test('C006: the command states the determinism and test policy gates', () => {
  const text = readCommand();
  for (const token of ['rebuild', 'byte-identical', 'stable sort', 'atomic', 'node --test']) {
    assert.ok(text.includes(token), token);
  }
  assert.match(text, /never[^\n]*`?make test`?/i);
});


// @verifies C001
test('C001: the command declares every v2 artifact', () => {
  const text = readCommand();
  assert.deepEqual(auditArtifacts(text), []);
  for (const artifact of REQUIRED_ARTIFACTS) assert.ok(text.includes(artifact), artifact);
  assert.ok(text.includes('<name>-law.path-alias.json'));
});

// @verifies C002
test('C002: the command states the leak-prevention contract', () => {
  const text = readCommand();
  assert.deepEqual(auditLeak(text), []);
  assert.ok(text.includes('outside the skill tree'));
  assert.ok(text.includes('source/redaction.review.json'));
  assert.ok(text.includes('forbidden'));
});

// @verifies C003
test('C003: the command states the coverage-semantics contract', () => {
  const text = readCommand();
  assert.deepEqual(auditCoverage(text), []);
  assert.ok(text.includes('delivered_by'));
  assert.ok(text.includes('fact-bearing'));
  assert.ok(text.includes('orphan'));
  assert.ok(text.includes('omission'));
});

// @verifies C004
test('C004: the command consumes the 18-check v2 contract', () => {
  const text = readCommand();
  assert.equal(CANONICAL_CHECKS.length, 18);
  for (const check of CANONICAL_CHECKS) assert.ok(text.includes(check.name), check.name);
  assert.ok(text.includes('check_set_version'));
  assert.ok(text.includes('machine_verified'));
  assert.ok(text.includes('closure'));
});

// @verifies C005
test('C005: five pipeline commands carry a bounded v2 checkpoint', () => {
  for (const command of PIPELINE_COMMANDS) {
    const text = readFileSync(join(repositoryRoot, `.claude/commands/${command}.md`), 'utf8');
    assert.deepEqual(auditPipelineCheckpoint(text), [], command);
  }
});

// @verifies C005
test('C005: CLAUDE.md carries the conditional v2 block', () => {
  const text = readFileSync(join(repositoryRoot, '.claude/CLAUDE.md'), 'utf8');
  assert.deepEqual(auditClaudeBlock(text), []);
});

// @verifies C006
test('C006: the command states the four style rules', () => {
  const text = readCommand();
  assert.deepEqual(auditStyle(text), []);
  for (const code of STYLE_CODES) assert.ok(text.includes(code), code);
});

// @verifies C005
test('C005: spec field parity holds', () => {
  const ticketDocument = JSON.parse(readFileSync(join(repositoryRoot, 'Tickets.json'), 'utf8'));
  const ticket = ticketDocument.phases
    .flatMap((phase) => phase.tickets)
    .find((entry) => entry.id === 422);
  assert.ok(ticket);
  const spec = readFileSync(join(repositoryRoot, 'specs/PX-422.md'), 'utf8');
  assert.deepEqual(auditSpecParity(ticket, spec), []);
});
