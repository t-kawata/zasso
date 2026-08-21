/**
 * step2-command.test.cjs — Static verification of the Step 2 graphify command (PX-160, PX-163)
 *
 * PX-163 reframes Step 2 to the AI-as-engineer staging flow: scripts provide
 * candidate information and safe editing tools, the AI designs the evolution on
 * a STAGING graph via crud.js, and --approve validates + promotes without
 * re-running the analyzer.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const COMMAND_FILE = path.resolve(__dirname, '../../.claude/commands/drill-rfc-down.md');
const md = fs.readFileSync(COMMAND_FILE, 'utf8');

function step2Section() {
  const start = md.indexOf('### Step 2: graphify');
  const end = md.indexOf('### Step 3: boundify', start);
  assert.ok(start !== -1, 'Step 2 present');
  assert.ok(end !== -1, 'Step 3 present (bounds Step 2)');
  return md.slice(start, end);
}

describe('Step 2 command definition', () => {
  it('documents the stage -> AI design (crud.js on staging) -> approve (verify.js promote) loop', () => {
    const step2 = step2Section();
    assert.match(step2, /--stage/, '--stage flag documented');
    assert.match(step2, /--approve/, '--approve flag documented');
    assert.match(step2, /--reject/, '--reject flag documented');
    assert.match(step2, /\.staging\.json/, 'staging copy path documented');
    assert.match(step2, /crud\.js/, 'crud.js (only write path) referenced');
    assert.match(step2, /verify\.js/, 'verify.js referenced');
  });

  it('casts the analyzer output as candidate information, not the plan, and forbids analyzer re-run on approve', () => {
    const step2 = step2Section();
    assert.match(step2, /candidates\.json/, 'candidates file referenced');
    assert.match(step2, /情報|候補/, 'candidates framed as information for AI judgment');
    assert.match(step2, /再実行せず/, '--approve does not re-run the analyzer');
    assert.match(step2, /手書き/, 'AI hand-editing of JSON is forbidden');
  });

  it('documents the destructive-change prohibition', () => {
    const step2 = step2Section();
    assert.match(step2, /破壊|削除/, 'destructive change concern mentioned');
  });
});
