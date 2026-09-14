/**
 * A prototype-based type, and the two constructs that make it hard to read.
 *
 * `render` is attached to the prototype rather than declared in a class body, so
 * the methods of a `Widget` are not enumerated by the constructor. The registry
 * below is keyed by a computed property name, so the key is a value evaluated at
 * run time rather than a literal a reader can resolve from the syntax alone.
 */

/** The property the registry is keyed by. Its value is only known once this runs. */
const widgetKey = 'widgets';

/** Every widget ever constructed, keyed by a computed name. */
const registry = {
  [widgetKey]: [],
};

/** A widget carrying an identifier and a rendered label. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function Widget(id) {
  this.id = id;
  this.label = '';
}

Widget.prototype.render = function render() {
  this.label = `widget-${this.id}`;
  registry[widgetKey].push(this);
  return this.label;
};

/** Every widget that has been rendered, in the order it was rendered. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function renderedWidgets() {
  return registry[widgetKey];
}

module.exports = { Widget, renderedWidgets };
