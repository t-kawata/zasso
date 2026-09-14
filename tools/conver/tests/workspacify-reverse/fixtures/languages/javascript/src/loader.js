/**
 * A module required by a name that is only known at run time.
 *
 * A reader that resolves `require` calls by their literal argument sees a
 * caller with no dependency here. Whether it is reached at all is decided by the
 * argument, which is why the syntax layer records the call and not the target.
 */

/** Load a module by name, returning whatever the module exports. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function loadModule(moduleName) {
  return require(moduleName);
}

module.exports = { loadModule };
