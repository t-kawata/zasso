// Security module — SecretString, authorization, platform-specific build notes.
//
// [::TICKET::] P1-2: security/ module created with SecretString type.
// [::STUB::] P2-2: auth_jwt_middleware — JWT & Axum middleware integration.
pub mod auth_jwt_middleware;
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
pub mod security_platform_diffs;
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.

pub use security_platform_diffs::SecretString;
