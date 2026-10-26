// PX-314 @verifies C002, C005
// The command documents are part of the mechanical chain: the preflight stage and the
// package view must be on the command line, or the script cannot scope what it checks.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..', '..', '.claude', 'commands');

// [::TICKET::] PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-314 --for-spec --no-implementation-order`.
test('C005 boundify Step 0 runs the preflight stage and Step 2 keeps the dirs check', () => {
  const content = readFileSync(join(ROOT, 'boundify-graph.md'), 'utf8');
  assert.match(content, /verify-chain\.mjs --stage=boundify --preflight/);
  assert.match(content, /verify-chain\.mjs --stage=boundify --package=/);
});

test('C002 graphify passes the package view to verify-graph-contracts', () => {
  const content = readFileSync(join(ROOT, 'graphify-rfc.md'), 'utf8');
  assert.match(content, /verify-graph-contracts\.js --graph="\$graphPath" --registry="\$registryPath" --view="\$viewPath"/);
});
