'use strict';

/**
 * Unit tests for candidate validation and fingerprinting.
 *
 * Covers contracts C001 (path containment), C004 (S-R-G-R-V completeness),
 * C005 (adaptation plan), and C006 (closed enums).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { initRepoWithUpstream, baseCandidate } = require('./fixtures.cjs');

const schema = require(path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'scripts',
  'pickup-conver-update-candidates',
  'schema.js'
));

/** A workspace whose .claude tree exists so realpath containment is meaningful. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function makeWorkspace() {
  const { workspace } = initRepoWithUpstream();
  return { workspace, claudeDir: path.join(workspace, '.claude') };
}

test('a candidate carrying all five completeness fields passes validation', () => {
  const { workspace, claudeDir } = makeWorkspace();
  const result = schema.validateCandidate(baseCandidate(), { workspace, claudeDir });
  assert.deepEqual(result, { ok: true });
});

test('C001 rejects a file that escapes the claudeDir prefix through traversal', () => {
  const { workspace, claudeDir } = makeWorkspace();
  const candidate = baseCandidate({
    location: { file: '.claude/../outside.js', hunkHeader: '@@ -1 +1 @@', lineStart: 1, lineEnd: 1 },
  });
  const result = schema.validateCandidate(candidate, { workspace, claudeDir });
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].field, 'location.file');
  assert.ok(result.findings[0].action.includes('CLAUDE_DIR'));
  assert.equal(fs.existsSync(path.join(workspace, 'CONVER-UPDATE-CANDIDATES.json')), false);
});

test('C001 rejects an absolute path', () => {
  const { workspace, claudeDir } = makeWorkspace();
  const candidate = baseCandidate({
    location: { file: path.join(workspace, '.claude', 'scripts', 'sample.js'), hunkHeader: '@@ -1 +1 @@', lineStart: 1, lineEnd: 1 },
  });
  const result = schema.validateCandidate(candidate, { workspace, claudeDir });
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].field, 'location.file');
});

test('C001 rejects a symlink that resolves outside claudeDir', () => {
  const { workspace, claudeDir } = makeWorkspace();
  const outside = path.join(workspace, 'outside.js');
  fs.writeFileSync(outside, 'module.exports = 1;\n');
  fs.symlinkSync(outside, path.join(claudeDir, 'scripts', 'escape.js'));
  const candidate = baseCandidate({
    location: { file: '.claude/scripts/escape.js', hunkHeader: '@@ -1 +1 @@', lineStart: 1, lineEnd: 1 },
  });
  const result = schema.validateCandidate(candidate, { workspace, claudeDir });
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].field, 'location.file');
});

test('C004 names each missing S-R-G-R-V field and writes nothing', () => {
  const { workspace, claudeDir } = makeWorkspace();
  const candidate = baseCandidate();
  delete candidate.symptom;
  const result = schema.validateCandidate(candidate, { workspace, claudeDir });
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map((finding) => finding.field), ['symptom']);
  assert.ok(result.findings[0].action.includes('symptom'));
  assert.equal(fs.existsSync(path.join(workspace, 'CONVER-UPDATE-CANDIDATES.json')), false);
});

test('C004 rejects a whitespace-only completeness field', () => {
  const { workspace, claudeDir } = makeWorkspace();
  const result = schema.validateCandidate(baseCandidate({ remedy: '   ' }), { workspace, claudeDir });
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map((finding) => finding.field), ['remedy']);
});

test('C005 rejects adapt without an adaptation plan', () => {
  const { workspace, claudeDir } = makeWorkspace();
  const result = schema.validateCandidate(
    baseCandidate({ generalization: 'adapt', adaptationPlan: '' }),
    { workspace, claudeDir }
  );
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].field, 'adaptationPlan');
  assert.ok(result.findings[0].action.includes('project-specific residue'));
});

test('C005 accepts adapt with a concrete adaptation plan', () => {
  const { workspace, claudeDir } = makeWorkspace();
  const result = schema.validateCandidate(
    baseCandidate({ generalization: 'adapt', adaptationPlan: 'Remove the zasso-specific path and read the root from git.' }),
    { workspace, claudeDir }
  );
  assert.deepEqual(result, { ok: true });
});

test('C006 rejects unknown enum values and prints the allowed values', () => {
  const { workspace, claudeDir } = makeWorkspace();
  const result = schema.validateCandidate(
    baseCandidate({ primaryCriterion: 'speed', status: 'rejected' }),
    { workspace, claudeDir }
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map((finding) => finding.field), ['primaryCriterion', 'status']);
  const causes = result.findings.map((finding) => finding.cause).join(' ');
  assert.ok(causes.includes('correctness'));
  assert.ok(causes.includes('candidate'));
});

test('C006 rejects unknown impact, confidence, riskLevel, generalization, and changeType', () => {
  const { workspace, claudeDir } = makeWorkspace();
  const result = schema.validateCandidate(
    baseCandidate({
      impact: 'urgent',
      confidence: 'certain',
      riskLevel: 'extreme',
      generalization: 'maybe',
      changeType: 'edited',
    }),
    { workspace, claudeDir }
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map((finding) => finding.field), [
    'impact',
    'confidence',
    'riskLevel',
    'generalization',
    'changeType',
  ]);
});

test('fingerprint normalizes trailing whitespace and hashes file plus patch', () => {
  const patch = '@@ -1 +1 @@\n-module.exports = 1;   \n+module.exports = 2;\t';
  const first = schema.computeContentFingerprint('.claude/scripts/sample.js', patch);
  const second = schema.computeContentFingerprint('.claude/scripts/sample.js', '@@ -1 +1 @@\n-module.exports = 1;\n+module.exports = 2;');
  assert.equal(first, second);
  assert.equal(first.length, 71);
  assert.ok(first.startsWith('sha256:'));
});

test('fingerprint changes when the file or the patch changes', () => {
  const patch = '@@ -1 +1 @@\n-old\n+new';
  assert.notEqual(
    schema.computeContentFingerprint('.claude/scripts/a.js', patch),
    schema.computeContentFingerprint('.claude/scripts/b.js', patch)
  );
  assert.notEqual(
    schema.computeContentFingerprint('.claude/scripts/a.js', patch),
    schema.computeContentFingerprint('.claude/scripts/a.js', '@@ -1 +1 @@\n-old\n+other')
  );
});

test('C001 rejects a location missing hunkHeader, lineStart, or lineEnd', () => {
  const { workspace, claudeDir } = makeWorkspace();
  const candidate = baseCandidate({ location: { file: '.claude/scripts/sample.js' } });
  const result = schema.validateCandidate(candidate, { workspace, claudeDir });
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map((finding) => finding.field), [
    'location.hunkHeader',
    'location.lineStart',
    'location.lineEnd',
  ]);
});

test('evidence must carry every reproducible field', () => {
  const { workspace, claudeDir } = makeWorkspace();
  const candidate = baseCandidate({ evidence: { patch: '@@ -1 +1 @@\n-old\n+new' } });
  const result = schema.validateCandidate(candidate, { workspace, claudeDir });
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map((finding) => finding.field), [
    'evidence.upstreamRef',
    'evidence.upstreamCommit',
    'evidence.diffStat',
    'evidence.extractCommand',
    'evidence.observedAt',
  ]);
});
