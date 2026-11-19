// [::TICKET::] PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-451 --for-spec --no-implementation-order`.
// [::TICKET::] PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-452 --for-spec --no-implementation-order`.
/**
 * docs-contract.test.cjs — the README and the design document describe the
 * implemented shipping loop and name their normative design.
 * @verifies C012
 * @verifies C013
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const README = path.resolve(__dirname, '../../README.md');
const DESIGN = path.resolve(__dirname, '../../docs/境界契約文書ドキュメントについて.md');

describe('C012 — README shipping loop', () => {
  const readme = fs.readFileSync(README, 'utf8');

  it('distinguishes command convergence from the outer shipping judgment', () => {
    assert.ok(readme.includes('コマンドの収束') || readme.includes('コマンドは収束'), 'command convergence is named');
    assert.ok(readme.includes('出荷判定'), 'the outer shipping judgment is named');
  });

  it('names the real inputs instead of claiming the graph is the only input', () => {
    assert.ok(!readme.includes('`/crystalize-readme` は**グラフだけ**を読む'));
    assert.ok(readme.includes('パッケージ README') || readme.includes('package README'));
    assert.ok(readme.includes('ワークスペース README'));
  });

  it('keeps the no-argument, English-only, and residue-check steps', () => {
    assert.ok(readme.includes('引数はありません'));
    assert.ok(readme.includes('英語のみ'));
    assert.ok(readme.includes('--check-residues'));
  });

  it('lists the legacy scripts as compatibility-only', () => {
    assert.ok(readme.includes('validate-toc-proposal.js'));
    assert.ok(readme.includes('互換'));
  });
});

describe('C013 — design document normative banner', () => {
  const design = fs.readFileSync(DESIGN, 'utf8');

  it('names A10 and section 17 as normative and Q1-A9 as history', () => {
    assert.match(design, /Normative design/);
    assert.match(design, /A10 and section 17/);
    assert.match(design, /Q1[–-]A9 are history/);
  });

  it('records the English metadata exception in 17.5', () => {
    assert.match(design, /English metadata exception/);
    assert.match(design, /> Source RFC:/);
  });

  it('marks withdrawn proposals as withdrawn', () => {
    assert.match(design, /withdrawn/i);
  });
});
