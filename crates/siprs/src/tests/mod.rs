
// Test-strategy and integration-test module.
//
// Sub-modules:
// - test_strategy_4layer:  §43 4-Layer Test Strategy (N0052, P1-3)
// - m20_test_dual_client:  §43 M20 Test Layer Mapping & Dual Client Utility (N0053, P1-3)
// - test_apilayer5:        §57 Test Strategy Layer 5 — API Integration (N0065, P4-5)

pub mod m20_test_dual_client;
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
pub mod test_strategy_4layer;
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
