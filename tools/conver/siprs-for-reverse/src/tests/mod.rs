// Test-strategy and integration-test module.
//
// Sub-modules:
// - test_strategy_4layer:  §43 4-Layer Test Strategy (N0052, P1-3)
// - m20_test_dual_client:  §43 M20 Test Layer Mapping & Dual Client Utility (N0053, P1-3)
// - test_apilayer5:        §57 Test Strategy Layer 5 — API Integration (N0065, P2-2)
// - docker_asterisk_it:    §62.19 Docker/Asterisk Integration Test Base (N0088, P16-10)
// - raw_sip_real_test:     §62.38 Real-PJSIP raw SIP Verification Path (N0107, P19-1)
// - real_pjsip_itest:      §62.42 Real-PJSIP Protocol + RTP Integration Scope (N0111, P19-5)

pub mod m20_test_dual_client;
pub mod docker_asterisk_it;
pub mod raw_sip_real_test;
pub mod real_pjsip_itest;
pub mod test_strategy_4layer;
pub mod test_apilayer5;
