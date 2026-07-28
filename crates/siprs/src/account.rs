// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.

// [::TICKET::] P3-1: SipAccountHandle re-export.
// SipAccountHandle is defined in api::public_api_design.
// This module provides a re-export for backward compatibility.

pub use crate::api::public_api_design::SipAccountHandle;
