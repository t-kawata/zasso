// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
// [::TICKET::] PX-292 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-292 --for-spec --no-implementation-order`.
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
/**
 * What a span reading performed and what it merely covered.
 *
 * A step performs an operation. The `operations` list records the census the reader
 * covered, not the operations the artifact executed. Treating the two as one made the
 * registry count 257 operations as mechanically closed while the rail gate still owed
 * 108 reader records, so the two layers disagreed about the same workspace.
 */

/** The operations a span reading performed: one entry per step. */
export function performedOperations(span = []) {
  const operations = new Set();
  for (const reading of Array.isArray(span) ? span : []) {
    for (const step of Array.isArray(reading?.steps) ? reading.steps : []) {
      if (typeof step?.operation === 'string') operations.add(step.operation);
    }
  }
  return operations;
}

/** The operations a span reading covered, including ones no step performed. */
export function coveredOperations(span = []) {
  const operations = new Set();
  for (const reading of Array.isArray(span) ? span : []) {
    for (const operation of Array.isArray(reading?.operations) ? reading.operations : []) {
      const id = typeof operation === 'string' ? operation : operation?.id;
      if (typeof id === 'string') operations.add(id);
    }
  }
  return operations;
}
