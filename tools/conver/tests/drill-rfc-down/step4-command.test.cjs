/**
 * step4-command.test.cjs — Static verification of the Step 4 split command (PX-162, PX-165)
 *
 * PX-165 reframes Step 4 to the AI-as-engineer staging flow: scripts provide
 * candidate information and safe editing tools (add-ticket.js/update-ticket.js),
 * the AI designs the evolution on a STAGING Tickets.json, and --approve
 * validates + promotes without re-running the analyzer.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const COMMAND_FILE = path.resolve(__dirname, '../../.claude/commands/drill-rfc-down.md');
const md = fs.readFileSync(COMMAND_FILE, 'utf8');

function step4Section() {
  const start = md.indexOf('### Step 4: split');
  const end = md.indexOf('### Step 5: verify', start);
  assert.ok(start !== -1, 'Step 4 present');
  assert.ok(end !== -1, 'Step 5 present (bounds Step 4)');
  return md.slice(start, end);
}

describe('Step 4 command definition', () => {
  it('documents the stage -> AI design (add-ticket/update-ticket on staging) -> approve (validate promote) loop', () => {
    const step4 = step4Section();
    assert.match(step4, /--stage/, '--stage flag documented');
    assert.match(step4, /--approve/, '--approve flag documented');
    assert.match(step4, /--reject/, '--reject flag documented');
    assert.match(step4, /\.staging\.json/, 'staging copy path documented');
    assert.match(step4, /add-ticket/, 'add-ticket.js (only write path) referenced');
    assert.match(step4, /update-ticket/, 'update-ticket.js (only write path) referenced');
    assert.match(step4, /validate-tickets/, 'validate-tickets referenced');
  });

  it('casts the analyzer output as candidate information and forbids analyzer re-run on approve', () => {
    const step4 = step4Section();
    assert.match(step4, /candidates\.json/, 'candidates file referenced');
    assert.match(step4, /情報|候補/, 'candidates framed as information for AI judgment');
    assert.match(step4, /再実行せず/, '--approve does not re-run the analyzer');
    assert.match(step4, /手書き/, 'AI hand-editing of JSON is forbidden');
  });

  it('documents existing-status preservation and destructive-change prohibition', () => {
    const step4 = step4Section();
    assert.match(step4, /status.*上書き|黙って上書き|status.*保全/, 'status preservation mentioned');
    assert.match(step4, /破壊|削除/, 'destructive change concern mentioned');
  });
});
