// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
/**
 * The sufficiency of the file name, not of the assertions.
 *
 * P24-1's declaration records the presence of a test file per representative and
 * nothing about what it asserts, so this file exists to make that claim true and
 * to be readable — the adequacy of what it covers is the open item the
 * declaration records rather than something this file settles.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { Widget, renderedWidgets } = require('../widget.js');
const { loadModule } = require('../loader.js');

test('a prototype method renders through the computed key', () => {
  const widget = new Widget(7);

  assert.equal(widget.render(), 'widget-7');
  assert.deepEqual(renderedWidgets(), [widget], 'the computed key reached the registry');
});

test('a module loaded by a run-time name is reached', () => {
  assert.equal(typeof loadModule('node:path').join, 'function');
});
