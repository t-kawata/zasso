// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
/**
 * The package entry point.
 *
 * A re-export is the construct an extractor has to resolve to know what this
 * package publishes: the name that reaches a consumer is declared in another
 * module, so a reader that stops at this file sees a module with no declarations
 * of its own.
 */
export * from './alpha.js';

export { Box, describe as describeBox } from './model.js';
