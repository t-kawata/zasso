/**
 * A backup is worth taking only when the file holds something to lose.
 *
 * `init.js` writes a CheckList.md template into every fresh RFC directory at
 * STEP 0, and STEP 4 regenerates that same file — so a backup keyed on "the file
 * exists" always fires, and the first artifact a new directory collects is a copy
 * of an empty page. Because the generator preserves every byte outside its own
 * fence (PX-208), the only text a regeneration can lose is text neither script
 * authored: a hand-written note, a project-specific constraint.
 *
 * These tests pin the backup to that text. The two sibling generators are both
 * exercised, because the defect is in both and PX-207 already showed what fixing
 * one and leaving the other costs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import {
  AI_SUPPLEMENT_COMMENT,
  GENERATED_BEGIN,
  GENERATED_END,
  carriesHandWrittenText,
} from '../../.claude/scripts/grill-me-for-rfc/lib/checklist-fence.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GRILL_INIT = '.claude/scripts/grill-me-for-rfc/init.js';
const GRILL_GENERATOR = '.claude/scripts/grill-me-for-rfc/generate-checklist.js';
const DRILL_GENERATOR = '.claude/scripts/drill-rfc-down/generate-checklist.js';
const GENERATORS = [GRILL_GENERATOR, DRILL_GENERATOR];

const STATUS = {
  state: 'CHECKLIST_PENDING',
  researchPath: '/tmp/research.md',
  rfcPath: '/tmp/research.md',
  rfcDir: '/tmp',
  reviewLoopCount: 0,
  createdAt: '2026-10-06T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
};

const DESIGN_TREE = {
  version: 1,
  updatedAt: '2026-10-06T00:00:00.000Z',
  nodes: [{ id: 'Q1', title: 'Section one', kind: 'section', status: 'resolved', questions: [], children: [] }],
};

/** The bytes `init.js` and `session-init.js` both write at their STEP 0. */
const CHECKLIST_TEMPLATE = `# RFC 要件チェックリスト\n\n${AI_SUPPLEMENT_COMMENT}\n`;

const HAND_WRITTEN = '## AI補足: プロジェクト固有の制約\n\n- この節は人間が書いた。生成器が消してはならない。\n';

function makeSession({ checklist }) {
  const dir = mkdtempSync(join(tmpdir(), 'checklist-backup-'));
  writeFileSync(join(dir, 'Status.json'), JSON.stringify(STATUS, null, 2), 'utf8');
  writeFileSync(join(dir, 'DesignTree.json'), JSON.stringify(DESIGN_TREE, null, 2), 'utf8');
  if (checklist !== undefined) writeFileSync(join(dir, 'CheckList.md'), checklist, 'utf8');
  return dir;
}

/** The directory a real grill run leaves behind at STEP 0, template included. */
function makeFreshGrillSession() {
  const root = mkdtempSync(join(tmpdir(), 'checklist-backup-init-'));
  const rfcDir = join(root, 'rfc');
  const materialDir = join(root, 'material');
  mkdirSync(rfcDir);
  mkdirSync(materialDir);
  writeFileSync(join(materialDir, 'seed.md'), '# seed\n', 'utf8');
  execFileSync(process.execPath, [join(PROJECT_ROOT, GRILL_INIT), rfcDir, materialDir], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  return { root, rfcDir };
}

function runGenerator(script, dir, args = []) {
  return spawnSync(process.execPath, [join(PROJECT_ROOT, script), dir, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
}

/** The backups a run left behind: the file the generator copied, not its edits. */
function backupsIn(dir) {
  return readdirSync(dir).filter((name) => name.endsWith('.bak.md'));
}

test('a freshly initialized RFC directory is not backed up', () => {
  const { root, rfcDir } = makeFreshGrillSession();
  try {
    const run = runGenerator(GRILL_GENERATOR, rfcDir);

    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(
      backupsIn(rfcDir),
      [],
      'the template init.js wrote holds nothing the generator does not write itself',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a checklist nobody has edited is not backed up on a re-run', () => {
  for (const script of GENERATORS) {
    const dir = makeSession({ checklist: CHECKLIST_TEMPLATE });
    try {
      assert.equal(runGenerator(script, dir).status, 0, `${script} must generate`);
      const second = runGenerator(script, dir);

      assert.equal(second.status, 0, second.stderr);
      assert.deepEqual(backupsIn(dir), [], `${script} must not copy a checklist it authored itself`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('a hand-written section earns a backup of the file it was written in', () => {
  for (const script of GENERATORS) {
    const dir = makeSession({ checklist: CHECKLIST_TEMPLATE });
    try {
      assert.equal(runGenerator(script, dir).status, 0, `${script} must generate`);
      const beforeEdit = readFileSync(join(dir, 'CheckList.md'), 'utf8');
      const edited = `${beforeEdit}\n${HAND_WRITTEN}`;
      writeFileSync(join(dir, 'CheckList.md'), edited, 'utf8');

      const run = runGenerator(script, dir);

      assert.equal(run.status, 0, run.stderr);
      const backups = backupsIn(dir);
      assert.equal(
        backups.length,
        1,
        `${script} must take exactly one backup: the checklist the human edited, not the one the previous run wrote`,
      );
      assert.equal(
        readFileSync(join(dir, backups[0]), 'utf8'),
        edited,
        'the copy must be of the file as the human left it, byte for byte',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('a legacy checklist carrying hand-written text is still backed up', () => {
  const legacy = `# RFC 要件チェックリスト\n\n## 全体チェック\n\n${AI_SUPPLEMENT_COMMENT}\n\n${HAND_WRITTEN}`;
  for (const script of GENERATORS) {
    const dir = makeSession({ checklist: legacy });
    try {
      const run = runGenerator(script, dir);

      assert.equal(run.status, 0, run.stderr);
      const backups = backupsIn(dir);
      assert.equal(backups.length, 1, `${script} must back up the pre-fence file it is about to migrate`);
      assert.equal(readFileSync(join(dir, backups[0]), 'utf8'), legacy);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('a session with no CheckList.md yet is not backed up', () => {
  const dir = makeSession({});
  try {
    const run = runGenerator(GRILL_GENERATOR, dir);

    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(backupsIn(dir), [], 'a file that did not exist cannot be copied');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('hand-written text above the fence earns a backup too', () => {
  const prefaced = `## 人間が先頭に書いた覚書\n\n${GENERATED_BEGIN}\n## §1 Section one\n${GENERATED_END}\n`;
  const dir = makeSession({ checklist: prefaced });
  try {
    const run = runGenerator(GRILL_GENERATOR, dir);

    assert.equal(run.status, 0, run.stderr);
    const backups = backupsIn(dir);
    assert.equal(backups.length, 1, 'a preamble is preserved by the generator, not authored by it');
    assert.equal(readFileSync(join(dir, backups[0]), 'utf8'), prefaced);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--no-backup suppresses the copy the run would otherwise take', () => {
  const dir = makeSession({ checklist: `${CHECKLIST_TEMPLATE}\n${HAND_WRITTEN}` });
  try {
    const run = runGenerator(GRILL_GENERATOR, dir, ['--no-backup']);

    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(backupsIn(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the decision itself: only text outside the generator’s own region counts', () => {
  const fencedOnly = `${GENERATED_BEGIN}\n## §1 Section one\n${GENERATED_END}\n`;
  const fencedWithTrailing = `${fencedOnly}\n${HAND_WRITTEN}`;
  const fencedWithLeading = `## 覚書\n\n${fencedOnly}`;

  const cases = [
    [null, false, 'a file that does not exist'],
    ['', false, 'an empty file'],
    ['   \n', false, 'whitespace only'],
    ['# 手書きのファイル\n', false, 'a file the generator cannot claim carries no claimable text'],
    [CHECKLIST_TEMPLATE, false, "init's template: the header is re-emitted by the generated body"],
    [`${CHECKLIST_TEMPLATE}\n${HAND_WRITTEN}`, true, 'a legacy file with text after the comment'],
    [fencedOnly, false, 'a fenced file nobody has written outside'],
    [fencedWithTrailing, true, 'text after the fence'],
    [fencedWithLeading, true, 'text before the fence'],
  ];

  for (const [text, expected, description] of cases) {
    assert.equal(carriesHandWrittenText(text), expected, description);
  }
});

test('a file the generator refuses to claim is not backed up', () => {
  const unclaimable = '# 手書きのファイル\n\n生成器のものではない。\n';
  const dir = makeSession({ checklist: unclaimable });
  try {
    const run = runGenerator(GRILL_GENERATOR, dir);

    assert.notEqual(run.status, 0, 'the generator must refuse rather than overwrite');
    assert.match(run.stderr, /Refusing to write/);
    assert.deepEqual(backupsIn(dir), [], 'a refusal writes nothing, so there is nothing to back up');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
