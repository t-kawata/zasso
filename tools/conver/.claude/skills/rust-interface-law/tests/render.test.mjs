// [::TICKET::] PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-422 --for-spec --no-implementation-order`.
// [::TICKET::] PX-421 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-421 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAttestMarkdown, renderContextMarkdown, renderGateMarkdown } from '../scripts/lib/render-ai.mjs';

const manifest = {
  root: '/repo',
  units: [{ id: 'app-websocket', role: 'websocket', interfaces: ['websocket'] }],
  phases: ['contract', 'adapter'],
  roles: { 'identity-core': 'app-core', 'operation-contract': 'app-operation', 'interface-contract': null },
  nodes: [
    {
      id: 'WS-01',
      type: 'Rule',
      phase: 'adapter',
      delivery: 'must',
      applies_to: 'websocket',
      content_sha256: 'a'.repeat(64),
      body: '| `WS-01` | C | ws | WS | Part III.7 | The ticket is random and short-lived. | V3 test. | conformance driver |',
    },
    {
      id: 'codeblock/contract/1',
      type: 'CodeBlock',
      phase: 'contract',
      delivery: 'must',
      applies_to: 'all',
      content_sha256: 'b'.repeat(64),
      body: '```rust\npub struct SubjectId(uuid::Uuid);\n```\n',
    },
  ],
};

test('context Markdown states situation, required work, and next commands', () => {
  const text = renderContextMarkdown({
    manifest,
    phase: 'adapter',
    result: { phase: 'adapter', hash: 'c'.repeat(64), nodes: [{ id: 'WS-01', content_sha256: 'a'.repeat(64), body: manifest.nodes[0].body }] },
  });

  assert.match(text, /^# Rust Interface Law — adapter phase/m);
  assert.match(text, /## Situation/);
  assert.match(text, /\| Units \| `app-websocket` \(websocket\) \|/);
  assert.match(text, /## Project role mapping/);
  assert.match(text, /\| `identity-core` \| `app-core` \|/);
  assert.match(text, /\| `interface-contract` \| \(none\) \|/);
  assert.match(text, /## Required work/);
  assert.match(text, /- \[ \] \*\*WS-01\*\*: The ticket is random and short-lived\./);
  assert.match(text, /## Rule references/);
  assert.match(text, /\| WS-01 \| C \| ws \/ WS \| Part III\.7 \| V3 test\. \| conformance driver \|/);
  assert.match(text, /node "\$LAW" gate --manifest "\$MANIFEST" --out "\$LAW_OUT\/gate-report\.json"/);
  assert.equal(text.includes('/repo'), false);
  assert.match(text, /Delivery hash \| `c{64}`/);
});

test('context Markdown renders code blocks and the next phase', () => {
  const text = renderContextMarkdown({
    manifest,
    phase: 'contract',
    result: { phase: 'contract', hash: 'd'.repeat(64), nodes: [{ id: 'codeblock/contract/1', content_sha256: 'b'.repeat(64), body: manifest.nodes[1].body }] },
  });

  assert.match(text, /```rust\npub struct SubjectId\(uuid::Uuid\);/);
  assert.match(text, /Implement or apply `pub struct SubjectId\(uuid::Uuid\);` — node `codeblock\/contract\/1`/);
  assert.match(text, /Next phase: `adapter`/);
});

test('gate Markdown explains each violation and the exact fix', () => {
  const failed = renderGateMarkdown({
    statuses: [{
      rule: 'X-01',
      status: 'failed',
      evidence: [{
        status: 'failed',
        evidence: { ok: false, findings: [{ path: 'crates/app-rest/src/lib.rs', line: 1, kind: 'unmarked-incomplete' }], truncated: false },
      }],
    }],
    machinePass: false,
    ok: false,
  });

  assert.match(failed, /^# Gate Report — FAIL/m);
  assert.match(failed, /## Scope/);
  assert.match(failed, /V1 process check/);
  assert.match(failed, /## Blocking violations/);
  assert.match(failed, /crates\/app-rest\/src\/lib\.rs:1/);
  assert.match(failed, /unmarked-incomplete/);
  assert.match(failed, /add a `\[\:\:STUB\:\:\]` marker/);

  const passed = renderGateMarkdown({ statuses: [{ rule: 'X-01', status: 'machine_verified', evidence: [], modes: ['cmd'] }], machinePass: true, ok: true });
  assert.match(passed, /^# Gate Report — PASS$/m);
  assert.match(passed, /No violations/);

  const processOnly = renderGateMarkdown({
    statuses: [{ rule: 'X-01', status: 'machine_verified', evidence: [], modes: ['process'] }],
    machinePass: true,
    ok: true,
  });
  assert.match(processOnly, /^# Gate Report — PASS \(V1 process only\)$/m);
  assert.match(processOnly, /Rule-level behavior is not proven/);
});

test('attestation Markdown lists every row and the accepted statuses', () => {
  const text = renderAttestMarkdown({
    phase: 'adapter',
    rows: [
      { rule: 'WS-01', status: 'unset', evidence: '' },
      { rule: 'WS-02', status: 'unset', evidence: '' },
    ],
  });

  assert.match(text, /^# Attestation — adapter/m);
  assert.match(text, /- \[ \] `WS-01`/);
  assert.match(text, /- \[ \] `WS-02`/);
  assert.match(text, /`applied` \+ `evidence`/);
  assert.match(text, /attest --manifest "\$MANIFEST" --phase adapter --rows "\$LAW_OUT\/attestation\.json"/);
});
