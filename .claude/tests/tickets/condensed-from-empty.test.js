// @verifies C010
const assert = require('assert');

const {
  renderCondensedFrom,
} = require('../../scripts/tickets/show-ticket-context.js');

let passed = 0;
let failed = 0;

// [::TICKET::] PX-414 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-414 --for-spec --no-implementation-order`.
function run(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
    failed++;
  }
}

console.log('\n## A condensedFrom stamp is rendered even when nothing was absorbed\n');

run('an empty absorbed set still renders the heading and the generation', () => {
  const rendered = renderCondensedFrom({ condensedFrom: { generation: 2, tickets: [] } });
  assert.ok(rendered.startsWith('## Condensed From'), rendered);
  assert.ok(rendered.includes('No ticket was absorbed'), rendered);
  assert.ok(rendered.includes('generation 2'), rendered);
});

run('a missing tickets array is treated as no absorption', () => {
  const rendered = renderCondensedFrom({ condensedFrom: { generation: 0 } });
  assert.ok(rendered.startsWith('## Condensed From'), rendered);
});

run('an absent condensedFrom renders nothing', () => {
  assert.strictEqual(renderCondensedFrom({}), null);
  assert.strictEqual(renderCondensedFrom({ condensedFrom: null }), null);
});

run('a non-empty absorption keeps the existing rendering', () => {
  const rendered = renderCondensedFrom({
    condensedFrom: {
      generation: 1,
      tickets: [{ key: 'P0-1', title: 'absorbed', status: 'reviewed', record: {} }],
    },
  });
  assert.ok(rendered.startsWith('## Condensed From'), rendered);
  assert.ok(rendered.includes('P0-1@g1'), rendered);
  assert.ok(!rendered.includes('No ticket was absorbed'), rendered);
});

console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━\n`);
process.exit(failed > 0 ? 1 : 0);
