#!/usr/bin/env node
// [::TICKET::] PX-121: integer step renumbering — consistency test for the command docs.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-121 --for-spec --no-implementation-order`.

/**
 * renumbering-consistency.test.js — RED tests for integer step renumbering.
 *
 * @verifies C002 (command docs to step headings)
 */

const fs = require('fs');
const path = require('path');

const DOCS = [
  path.resolve(__dirname, '../../../commands/resolve-ticket.md'),
  path.resolve(__dirname, '../../../commands/find-omissions.md')
];

let passed = 0;
let failed = 0;

// [::TICKET::] PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-121 --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

console.log('\n━━━ renumbering-consistency.test.js — TESTS ━━━\n');

// ============================================================
// C002 — integer step headings, no decimals
// ============================================================
console.log('## C002 — integer step headings\n');

(function testC002IntegerHeadings() {
  console.log('  ── every step heading is a distinct integer, no decimals');
  for (const file of DOCS) {
    const md = fs.readFileSync(file, 'utf8');
    const headings = md.match(/^#{1,3} Step [^\n]+/gm) || [];
    assert(headings.length > 0, path.basename(file) + ' has step headings');
    for (const heading of headings) {
      // Integer step or integer substep (Step N / Step Na); a decimal (Step 7.5) fails.
      assert(/^#{1,3} Step \d+[a-z]?[ —:-]/.test(heading), path.basename(file) + ' has no decimal heading: ' + heading.trim());
    }
  }
})();

(function testC002NoDecimalSteps() {
  console.log('  ── no decimal step numbers appear in headings (e.g. Step 7.5)');
  for (const file of DOCS) {
    const md = fs.readFileSync(file, 'utf8');
    const headings = md.match(/^#{1,3} Step [^\n]+/gm) || [];
    const decimals = headings.filter(h => /Step \d+\.\d+/.test(h));
    assert(decimals.length === 0, path.basename(file) + ' has zero decimal step headings');
  }
})();

(function testC002ReferencesResolve() {
  console.log('  ── every internal "Step N" reference resolves to an existing integer heading');
  for (const file of DOCS) {
    const md = fs.readFileSync(file, 'utf8');
    const headings = (md.match(/^#{1,3} Step (\d+)/gm) || []).map(h => parseInt(h.match(/\d+/)[0], 10));
    const headingSet = new Set(headings);
    // Step N / Step Na references (substeps share the parent integer)
    const refs = (md.match(/\bStep (\d+)[a-z]?\b/g) || [])
      .map(r => parseInt(r.match(/\d+/)[0], 10));
    const dangling = refs.filter(n => !headingSet.has(n));
    assert(dangling.length === 0, path.basename(file) + ' has no dangling step references: ' + JSON.stringify(dangling));
  }
})();

// ============================================================
// Summary
// ============================================================
console.log('\n━━━ Summary ━━━\n');
console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
