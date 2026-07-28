


// Test-strategy and integration-test module.
//
// Sub-modules:
// - test_strategy_4layer:  §43 4-Layer Test Strategy (N0052, P1-3)
// - m20_test_dual_client:  §43 M20 Test Layer Mapping & Dual Client Utility (N0053, P1-3)
// - test_apilayer5:        §57 Test Strategy Layer 5 — API Integration (N0065, P2-2)

pub mod m20_test_dual_client;
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
pub mod test_strategy_4layer;
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
pub mod test_apilayer5;
// [::TICKET::] P2-2: Layer 5 API integration test module (N0065).
