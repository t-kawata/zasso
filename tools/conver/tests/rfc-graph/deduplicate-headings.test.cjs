// [::TICKET::] PX-335 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-335 --for-spec --no-implementation-order`.
/**
 * deduplicate-headings.test.cjs — deduplicateHeadings unit tests
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * Target: full behavior of deduplicateHeadings(), readLines()
 * Policy: Pure functions (line array I/O only) are tested by passing
 *         line arrays directly. File I/O uses a temporary directory.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('node:child_process');

const { deduplicateHeadings } = require('../../.claude/scripts/rfc-graph/deduplicate-headings.js');

/** CLI entry point used by the Step 0 integration cases. */
const DEDUPLICATE_SCRIPT = path.resolve(
  __dirname,
  '../../.claude/scripts/rfc-graph/deduplicate-headings.js',
);

// ============================================================
// deduplicateHeadings
// ============================================================

describe('deduplicateHeadings', () => {
  it('normal: no duplicates — modified=false', () => {
    const lines = ['# A', '## B', '### C'];
    const result = deduplicateHeadings(lines);
    assert.equal(result.modified, false);
    assert.deepEqual(result.changes, []);
    assert.deepEqual(result.result, lines);
  });

  it('normal: one duplicate at same level appends A', () => {
    const lines = ['# A', '# A'];
    const result = deduplicateHeadings(lines);
    assert.equal(result.modified, true);
    assert.equal(result.changes.length, 1);
    assert.equal(result.result[1], '# A A');
  });

  it('normal: multiple duplicates at same level append A, B, C', () => {
    const lines = ['# X', '# X', '# X'];
    const result = deduplicateHeadings(lines);
    assert.equal(result.modified, true);
    assert.equal(result.changes.length, 2);
    assert.equal(result.result[1], '# X A');
    assert.equal(result.result[2], '# X B');
  });

  it('boundary: same text at different levels is counted separately', () => {
    const lines = ['# A', '## A', '### A'];
    const result = deduplicateHeadings(lines);
    // All lines are at different levels — no duplicates
    assert.equal(result.modified, false);
    assert.deepEqual(result.changes, []);
  });

  it('normal: non-heading lines are unaffected', () => {
    const lines = ['Normal text', '', '# Heading', '# Heading', '---'];
    const result = deduplicateHeadings(lines);
    assert.equal(result.modified, true);
    assert.equal(result.result[0], 'Normal text');
    assert.equal(result.result[4], '---');
  });

  it('error: throws on 27 duplicates', () => {
    const lines = ['# X'];
    for (let i = 0; i < 27; i++) lines.push('# X');
    assert.throws(() => deduplicateHeadings(lines), /exceeded 27/i);
  });
});

// @verifies C002
describe('deduplicateHeadings — fenced code blocks', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dedupe-fence-test-'));
  });

  after(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('normal: fenced duplicates are untouched and only real duplicates are suffixed', () => {
    const lines = ['## Section', '```md', '## Example', '## Example', '```', '## Section'];
    const result = deduplicateHeadings(lines);

    assert.equal(result.result[1], '```md');
    assert.deepEqual(result.result.slice(2, 4), ['## Example', '## Example']);
    assert.equal(result.result[5], '## Section A');
    assert.equal(result.changes.length, 1);
    assert.equal(result.unclosedFence, false);
  });

  it('boundary: ~~~ fences are excluded and the first real occurrence gets no suffix', () => {
    const lines = ['~~~', '## Example', '## Example', '~~~', '## Example', '## Example'];
    const result = deduplicateHeadings(lines);

    assert.deepEqual(result.result.slice(1, 3), ['## Example', '## Example']);
    assert.equal(result.result[4], '## Example');
    assert.equal(result.result[5], '## Example A');
  });

  it('error: an unclosed fence is reported without a modification', () => {
    const lines = ['```md', '## Example', '## Example'];
    const result = deduplicateHeadings(lines);

    assert.equal(result.unclosedFence, true);
    assert.equal(result.modified, false);
    assert.deepEqual(result.result, lines);
  });

  it('error: the CLI refuses an unclosed fence and leaves the file byte-identical', () => {
    const sourcePath = path.join(tmpDir, 'RFC-unclosed.md');
    const before = ['```md', '## Example', '## Example', ''].join('\n');
    fs.writeFileSync(sourcePath, before, 'utf8');

    const run = spawnSync(process.execPath, [DEDUPLICATE_SCRIPT, sourcePath], {
      encoding: 'utf8',
    });

    assert.equal(run.status, 1);
    assert.match(run.stderr, /UNCLOSED_FENCE/);
    assert.equal(fs.readFileSync(sourcePath, 'utf8'), before);
    assert.deepEqual(fs.readdirSync(tmpDir).filter((name) => name.endsWith('.tmp')), []);
  });

  it('normal: a changed source is written atomically and no temp file remains', () => {
    const sourcePath = path.join(tmpDir, 'RFC-duplicate.md');
    fs.writeFileSync(sourcePath, ['## Example', '## Example', ''].join('\n'), 'utf8');

    const run = spawnSync(process.execPath, [DEDUPLICATE_SCRIPT, sourcePath], {
      encoding: 'utf8',
    });

    assert.equal(run.status, 0);
    assert.equal(
      fs.readFileSync(sourcePath, 'utf8'),
      ['## Example', '## Example A', ''].join('\n'),
    );
    assert.deepEqual(fs.readdirSync(tmpDir).filter((name) => name.endsWith('.tmp')), []);
  });

  it('invariant: a fenced line is never counted toward the 27-duplicate error', () => {
    const lines = ['# X'];
    for (let i = 0; i < 30; i++) lines.push('```md', '# X', '```');
    const result = deduplicateHeadings(lines);

    assert.equal(result.unclosedFence, false);
    assert.equal(result.modified, false);
  });
});
