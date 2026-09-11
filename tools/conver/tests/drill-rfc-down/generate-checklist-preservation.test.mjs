// [::TICKET::] PX-208 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-208 --for-spec --no-implementation-order`.
// @verifies C002
// @verifies C004
/**
 * Both checklist generators preserve what they did not author.
 *
 * These two scripts are siblings that carried the identical defect: each emitted
 * a comment telling the reader to append their own constraints, then rewrote the
 * whole file, deleting exactly that content on the next run. PX-207 fixed a
 * different defect in one sibling and left the other, which is how the pair
 * drifted once already — so this file runs BOTH generators against the same
 * fixture and asserts they behave identically. Fixing one and not the other fails
 * here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { AI_SUPPLEMENT_COMMENT } from '../../.claude/scripts/grill-me-for-rfc/lib/checklist-fence.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GENERATORS = [
  '.claude/scripts/drill-rfc-down/generate-checklist.js',
  '.claude/scripts/grill-me-for-rfc/generate-checklist.js',
];

const HUMAN = '## AI補足: プロジェクト固有の制約・注意事項\n\n- この節は人間が書いた。生成器が消してはならない。\n- 制約B';

const STATUS = {
  state: 'CHECKLIST_APPROVED',
  researchPath: '/tmp/research.md',
  rfcPath: '/tmp/research.md',
  rfcDir: '/tmp',
  reviewLoopCount: 0,
  createdAt: '2026-09-11T00:00:00.000Z',
  updatedAt: '2026-09-11T00:00:00.000Z',
};

const DESIGN_TREE = {
  version: 1,
  updatedAt: '2026-09-11T00:00:00.000Z',
  nodes: [{ id: 'Q1', title: 'Section one', kind: 'section', status: 'resolved', questions: [], children: [] }],
};

/** A directory holding a valid session, with a CheckList.md written by the PRE-fix generator. */
// [::TICKET::] PX-208 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-208 --for-spec --no-implementation-order`.
function makeSessionWithLegacyFile({ withChecklist = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'px208-gen-'));
  writeFileSync(join(dir, 'Status.json'), JSON.stringify(STATUS, null, 2), 'utf8');
  writeFileSync(join(dir, 'DesignTree.json'), JSON.stringify(DESIGN_TREE, null, 2), 'utf8');
  if (!withChecklist) return dir;
  writeFileSync(
    join(dir, 'CheckList.md'),
    ['# RFC 要件チェックリスト', '', '## 全体チェック', '', AI_SUPPLEMENT_COMMENT, '', HUMAN, ''].join('\n'),
    'utf8',
  );
  return dir;
}

/**
 * Replace the generation timestamp with a placeholder.
 *
 * It is volatile by design — the generated region is regenerated, so its
 * timestamp legitimately changes between runs. The frozen forward surface
 * normalises the same field the same way (CHECKLIST_TIMESTAMP_PLACEHOLDER in
 * forward-surface-baseline.mjs). What contract C002 holds invariant is the
 * PRESERVED region, not the regenerated one.
 */
const normaliseGenerationTimestamp = (text) => text.replace(/^生成日時: .*$/m, '生成日時: <timestamp>');

// [::TICKET::] PX-208 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-208 --for-spec --no-implementation-order`.
function runGenerator(script, dir) {
  const run = spawnSync(process.execPath, [join(PROJECT_ROOT, script), dir, '--no-backup'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, `${script} exited ${run.status}: ${run.stderr}`);
  return readFileSync(join(dir, 'CheckList.md'), 'utf8');
}

test('both generators preserve a hand-written section on the first run against a legacy file', () => {
  for (const script of GENERATORS) {
    const dir = makeSessionWithLegacyFile();
    try {
      const after = runGenerator(script, dir);
      assert.ok(after.includes(HUMAN), `${script} must preserve the hand-written section`);
      assert.equal(
        after.slice(after.indexOf('## AI補足')),
        HUMAN + '\n',
        `${script} must preserve it byte-for-byte, not approximately`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('the two siblings produce the same preserved region for the same input', () => {
  const preserved = GENERATORS.map((script) => {
    const dir = makeSessionWithLegacyFile();
    try {
      const after = runGenerator(script, dir);
      return after.slice(after.indexOf('## AI補足'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  assert.equal(preserved[0], preserved[1], 'neither sibling may drift from the other');
  assert.equal(preserved[0], HUMAN + '\n');
});

test('a second run is idempotent: the preserved region does not move', () => {
  const dir = makeSessionWithLegacyFile();
  try {
    const first = runGenerator(GENERATORS[0], dir);
    const second = runGenerator(GENERATORS[0], dir);

    assert.equal(
      second.slice(second.indexOf('## AI補足')),
      first.slice(first.indexOf('## AI補足')),
      'the preserved region must not move between runs',
    );
    assert.equal(
      normaliseGenerationTimestamp(second),
      normaliseGenerationTimestamp(first),
      'and nothing outside the timestamp may differ either',
    );
    assert.ok(second.includes(HUMAN));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a hand-written section added between runs survives the next one', () => {
  const dir = makeSessionWithLegacyFile();
  try {
    const migrated = runGenerator(GENERATORS[0], dir);
    const appended = `${migrated}\n## AI補足: 後から追記した節\n\n- 追記1\n`;
    writeFileSync(join(dir, 'CheckList.md'), appended, 'utf8');

    const after = runGenerator(GENERATORS[0], dir);

    assert.ok(after.includes('後から追記した節'), 'the section appended after the first run must survive the second');
    assert.ok(after.includes(HUMAN), 'and so must the one that was already there');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the generated region is fenced, and the fence is explained to a human reader', () => {
  const dir = makeSessionWithLegacyFile();
  try {
    const after = runGenerator(GENERATORS[1], dir);

    assert.ok(after.includes('<!-- checklist:generated:begin -->'));
    assert.ok(after.includes('<!-- checklist:generated:end -->'));
    assert.ok(
      after.indexOf('<!-- checklist:generated:end -->') < after.indexOf('## AI補足'),
      'the fence must close before the hand-written section, so the section is outside it',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C003: the fence is purely additive — nothing the pre-fix generator wrote is lost or reordered', () => {
  // The frozen `checklist-output` surface captures the CLI's stdout+stderr, not
  // the generated file, so it cannot prove this on its own. This test runs the
  // PRE-fix generator, read straight out of git, beside the fixed one and
  // compares the files they produce. It is the assertion that "the fix is a
  // superset of the old behaviour" is a fact rather than a claim.
  const generator = '.claude/scripts/grill-me-for-rfc/generate-checklist.js';
  const preFixSource = execFileSync('git', ['show', `HEAD:${generator}`], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  const stagingPath = join(PROJECT_ROOT, '.claude/scripts/grill-me-for-rfc/.px208-prefix-generator.js');
  writeFileSync(stagingPath, preFixSource, 'utf8');

  // Compare as lines, not bytes: the pre-fix generator ended its output without a
  // terminating newline, and the fenced form terminates the file properly. That
  // one newline and the fence pair are the whole of the difference, which is what
  // this test exists to establish — everything else must match line for line, in
  // order.
  const linesOf = (text) => {
    const lines = text
      .split('\n')
      .filter((line) => line !== '<!-- checklist:generated:begin -->' && line !== '<!-- checklist:generated:end -->');
    if (lines[lines.length - 1] === '') lines.pop();
    return lines.map((line) => line.replace(/^生成日時: .*$/, '生成日時: <timestamp>'));
  };

  try {
    // Fresh directories: nothing to preserve, so `created` is the path both
    // generators take and the comparison is of the generated body alone. This is
    // also the path the frozen surface exercises.
    const preFixDir = makeSessionWithLegacyFile({ withChecklist: false });
    const postFixDir = makeSessionWithLegacyFile({ withChecklist: false });
    try {
      const preFix = runGenerator('.claude/scripts/grill-me-for-rfc/.px208-prefix-generator.js', preFixDir);
      const postFix = runGenerator(generator, postFixDir);

      assert.deepEqual(
        linesOf(postFix),
        linesOf(preFix),
        'every line the pre-fix generator produced must still be produced, in the same order',
      );
      assert.equal(
        postFix.split('\n').filter((line) => line.startsWith('<!-- checklist:generated:')).length,
        2,
        'and the fence pair is the only thing added',
      );
    } finally {
      rmSync(preFixDir, { recursive: true, force: true });
      rmSync(postFixDir, { recursive: true, force: true });
    }
  } finally {
    rmSync(stagingPath, { force: true });
  }
});

test('a file the generator cannot claim is refused rather than overwritten', () => {
  const dir = mkdtempSync(join(tmpdir(), 'px208-refuse-'));
  try {
    writeFileSync(join(dir, 'Status.json'), JSON.stringify(STATUS, null, 2), 'utf8');
    writeFileSync(join(dir, 'DesignTree.json'), JSON.stringify(DESIGN_TREE, null, 2), 'utf8');
    const unclaimable = '# 手書きのファイル\n\n生成器のものではない。\n';
    writeFileSync(join(dir, 'CheckList.md'), unclaimable, 'utf8');

    const run = spawnSync(process.execPath, [join(PROJECT_ROOT, GENERATORS[0]), dir, '--no-backup'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    assert.notEqual(run.status, 0, 'the generator must exit non-zero rather than overwrite');
    assert.match(run.stderr, /Refusing to write/, 'and it must say so, naming the path');
    assert.equal(readFileSync(join(dir, 'CheckList.md'), 'utf8'), unclaimable, 'the file must be untouched');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
