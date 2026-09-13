/**
 * A module reached by a name that is only known at run time.
 *
 * `import()` with a computed specifier is the TypeScript form of the dynamic
 * load: which module arrives is decided by the argument, so the syntax layer
 * records the call and no target. The JavaScript representative carries the same
 * mechanism written as `require(moduleName)`, and the two are deliberately the
 * same class in two syntaxes — a dependency that no import statement names.
 */

/** Load a module by name, resolving to whatever the module publishes. */
export async function loadModule(moduleName: string): Promise<unknown> {
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
  return import(moduleName);
}
