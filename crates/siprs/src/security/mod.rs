// Module declarations for security sub-modules.
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.

pub mod security_platform_diffs;
// [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.

// Re-exports for crate-root convenience
pub use security_platform_diffs::{AuthorizationHeader, SecretString, TLS_VERIFY_DEFAULT};
