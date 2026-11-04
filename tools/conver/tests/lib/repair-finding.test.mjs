// PX-365 @verifies C004
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createFinding,
  assertConcreteAction,
  renderFinding,
  renderFindings,
  toJson,
} = require('../../.claude/scripts/lib/repair-finding.js');

const BASE = {
  severity: 'blocking',
  code: 'FORMULA_THEORY_MISMATCH',
  layer: 'tickets',
  artifact: 'pkg/Tickets.json',
  formulaId: 'fx-0123456789ab',
  field: 'theory',
  cause: 'the ticket theory differs from the sidecar',
  action: 'node .claude/scripts/tickets/merge-formulas-to-tickets.js --tickets=pkg/Tickets.json --write',
  verify: 'node .claude/scripts/sequences-slice/verify-chain.mjs --formula-only --package=pkg',
  route: 'in-drill',
};

// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
test('C004 precondition: a finding carries severity, action, verify and route', () => {
  const finding = createFinding(BASE);
  const json = toJson(finding);

  assert.equal(json.severity, 'blocking');
  assert.equal(json.code, BASE.code);
  assert.equal(json.action, BASE.action);
  assert.equal(json.verify, BASE.verify);
  assert.equal(json.route, 'in-drill');
  assert.match(renderFinding(finding), /^\[ERROR\] FORMULA_THEORY_MISMATCH/m);
  assert.match(renderFinding(finding), /Action: node \.claude\/scripts\//);
  assert.match(renderFinding(finding), /Verify: node \.claude\/scripts\//);
});

test('C004 invariant: a generic action is a script defect', () => {
  assert.throws(() => assertConcreteAction('fix staging'), /concrete/);
  assert.throws(() => assertConcreteAction('investigate'), /concrete/);
  assert.doesNotThrow(() => assertConcreteAction(BASE.action));
});

test('C004 invariant: a missing required field is refused', () => {
  assert.throws(() => createFinding({ ...BASE, verify: '' }), /verify/);
  assert.throws(() => createFinding({ ...BASE, severity: 'fatal' }), /severity/);
});

test('C004 postcondition: advisories render without an error prefix', () => {
  const advisory = createFinding({
    ...BASE,
    severity: 'advisory',
    code: 'STALE_SECONDARY_RECORD',
    action: 'node .claude/scripts/grill-me-for-rfc/verify-source-identity.js pkg',
    verify: 'node .claude/scripts/grill-me-for-rfc/verify-source-identity.js pkg',
    route: 'advisory',
  });
  const rendered = renderFinding(advisory);
  assert.match(rendered, /^\[ADVISORY\] STALE_SECONDARY_RECORD/m);
  assert.equal(toJson(advisory).severity, 'advisory');
});

test('C004 postcondition: the Markdown list is capped and names the remainder', () => {
  const findings = Array.from({ length: 12 }, (_, index) => createFinding({
    ...BASE,
    code: `CODE_${index}`,
    artifact: `pkg/file-${index}.json`,
  }));
  const rendered = renderFindings(findings, { cap: 10 });

  assert.match(rendered, /CODE_9/);
  assert.equal(rendered.includes('CODE_10'), false);
  assert.match(rendered, /\.\.\.and 2 more/);
});
