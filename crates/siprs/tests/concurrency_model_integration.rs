// Integration tests for the concurrency_model public API.
//
// These tests verify that the module skeleton correctly exposes types
// to external crate consumers via the `siprs` crate root.

use siprs::SipClient;

/// Verify that SipClient is publicly accessible from outside the crate.
#[test]
fn sip_client_is_accessible_from_external_crate() {
    // Verify the type exists without calling any method (which may panic).
    fn _take_sip_client(_client: SipClient) {}
    fn _return_sip_client() -> SipClient {
        // [::STUB::] P5-1: return a real SipClient instance when initialize works
        unimplemented!("SipClient cannot be constructed without a reactor")
    }
    let _ = (_take_sip_client, _return_sip_client);
}

/// Verify that SipClient satisfies Send + Sync.
#[test]
fn sip_client_is_send_sync_from_external_crate() {
    fn assert_send<T: Send>() {}
    fn assert_sync<T: Sync>() {}
    assert_send::<SipClient>();
    assert_sync::<SipClient>();
}

/// Verify that SipClient is Clone.
#[test]
fn sip_client_is_clone_from_external_crate() {
    fn assert_clone<T: Clone>() {}
    assert_clone::<SipClient>();
}

/// Verify that config types are re-exported and publicly accessible.
#[test]
fn config_types_are_re_exported() {
    let _ = siprs::LogLevel::Info;
    let _ = siprs::RawSipEventConfig::default();
    let _ = siprs::ResamplerQuality::High;
    let _ = siprs::TimeoutConfig::default();
}
