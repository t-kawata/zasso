// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0053:  §43 M20 Test Layer Mapping & Dual Client Utility
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0053 --hops=2)
//
// Cross-referenced design context:
//   - test_policy/§43 Test Strategy — 4-Layer Architecture [NODE_ID=N0052]
//     (refines ← src/tests/m20_test_dual_client.rs)
//     → (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0052 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .clause/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
// ============================================================================

//! # §43 M20 Test Layer Mapping & Dual Client Utility
//!
//! This module documents the M20 feature-to-test-layer mapping table and the
//! `DualClientContext` test utility for bidirectional SIP testing.
//!
//! ## M20 Feature → Test Layer Mapping
//!
//! | M20 Feature | Layer | Verification | Notes |
//! |------------|-------|-------------|-------|
//! | NativeEvent → SipEventPayload | Layer 2 (MockBackend) | Each NativeEvent converts to correct SipEventPayload | Inject via MockBackend |
//! | RegistrationStateChanged | Layer 2 (MockBackend) | GetAccountInfo → RegistrationSucceeded/Failed | Layer 3 (Asterisk) for real registration |
//! | CallStateChanged pjsip_inv_state 0-4 | Layer 2 (MockBackend) | All state values (0-4) map to correct CallState | state=2: CONNECTING→Trying/Ringing |
//! | CallMediaStateChanged | Layer 2 (MockBackend) | media_status → MediaActive/Held/Error | |
//! | DtmfSent dual-path (return vs event) | Layer 2 (MockBackend) | send_dtmf return = DtmfSent fire separation | Layer 3 (Asterisk) for real DTMF |
//! | DtmfSent timeout fallback | Layer 2 (MockBackend) | Auto-fire DtmfSent after 500ms timeout | Timer behaviour |
//! | SubscribeAudio conf_connect | Layer 3 (Docker) | subscribe_audio → conf_connect → AudioTapHandle | Docker Asterisk required |
//! | conf_connect/disconnect RuntimeCommand | Layer 3 (Docker) | conf_port connect/disconnect behaviour | Media loopback |
//! | configure_codecs auto mode | Layer 2 (MockBackend) | pjsua_codec_set_priority calls | Opus=255, PCMU=254 |
//! | Dual Client (call_reject) | Layer 3 (Docker) | Shared PjsuaBackend + separate EventBus | Bidirectional init/call |
//! | low-priority NativeEvent (P1/P2) | Layer 2 (MockBackend) | Returns None (intentional ignore) | |
//!
//! ## Placeholder Test Resolution Conditions
//!
//! | Test | Status | Resolution | Prerequisite |
//! |------|--------|-----------|-------------|
//! | `call::call_reject` | eprintln! skip | Dual Client utility with shared PjsuaBackend singleton + EventBus split | Q6:A, Q9:A |
//! | `provisional::early_media_received` | eprintln! skip | SIPp uac scenario sending 183 Session Progress (Asterisk Echo does not send 183) | SIPp script |
//! | `register::reregister_after_unregister` | Partial | Fix `account()`: replace `blocking_read` → `read().await` | Q3:A (not Q1:A) |

// ---------------------------------------------------------------------------
// DualClientContext — bidirectional test utility (2 Client version)
// ---------------------------------------------------------------------------

/// Client-side handle returned by [`DualClientContext`], wrapping a SIP client
/// and its associated account for use in bidirectional test scenarios.
///
/// Reads as: "an endpoint — one of two — with its own account and client."
// [::TICKET::] P1-4: M20 test layer mapping + DualClientContext defined.
//   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
#[derive(Debug, Clone)]
pub struct DualClientEndpoint {
    /// The SIP client instance controlling this endpoint.
    pub client: crate::SipClient,
    /// The account registered on this endpoint.
    pub account: crate::SipAccountHandle,
}

/// A bidirectional test context holding two independent SIP clients that
/// share the same [`PjsuaBackend`] singleton but use separate [`EventBus`]
/// instances.
///
/// Use this for Layer 3 (SIP Integration) and Layer 2 (State-Machine) tests
/// that require client_a → call → client_b bidirectional flows.
///
/// # Invariants
///
/// - `client_a` is initialised first, creating the shared `PjsuaBackend`.
/// - `client_b` reuses the existing singleton — no second backend.
/// - Each client has a separate account (`account_a`, `account_b`).
///
/// [`PjsuaBackend`]: crate::ffi::PjsuaBackend
/// [`EventBus`]: crate::api::EventBus
// [::TICKET::] P1-4: M20 test layer mapping + DualClientContext defined.
//   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
#[derive(Debug)]
pub struct DualClientContext {
    /// Endpoint A — the caller in a typical a→b test.
    pub endpoint_a: DualClientEndpoint,
    /// Endpoint B — the callee in a typical a→b test.
    pub endpoint_b: DualClientEndpoint,
}

// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
impl DualClientContext {
    /// Creates a new dual-client test context.
    ///
    /// `client_a` is initialised first, creating the shared `PjsuaBackend`
    /// singleton. `client_b` reuses it. Each client gets its own account.
    ///
    /// # Errors
    ///
    /// Returns [`SipError`] if either client or account fails to initialise.
    ///
    /// [`SipError`]: crate::error::SipError
    // [::TICKET::] P1-4: M20 test layer mapping + DualClientContext defined.
    //   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
    pub async fn new(
        config_a: crate::ClientConfig,
        config_b: crate::ClientConfig,
        account_config_a: crate::AccountConfig,
        account_config_b: crate::AccountConfig,
    ) -> Result<Self, crate::SipError> {
        // client_a initialises first → creates Reactor + PjsuaBackend singleton
        let client_a = crate::SipClient::new(config_a).await?;
        // client_b reuses the existing PjsuaBackend singleton
        let client_b = crate::SipClient::new(config_b).await?;

        let account_a = client_a.add_account(account_config_a).await?;
        let account_b = client_b.add_account(account_config_b).await?;

        Ok(Self {
            endpoint_a: DualClientEndpoint {
                client: client_a,
                account: account_a,
            },
            endpoint_b: DualClientEndpoint {
                client: client_b,
                account: account_b,
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    // @verifies C054-invariant
    // [::TICKET::] P1-4: DualClientContext unit tests.
    //   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
    #[allow(unreachable_code)]
    // [::STUB::] P3-1: Replace todo!() when SipClient/SipAccountHandle exist (Public API ticket).
    fn dual_client_endpoint_struct_exists() {
        // Verify the DualClientEndpoint type is inhabited
        let _endpoint = DualClientEndpoint {
            client: todo!(), // runtime test; compile-time type check only
            account: todo!(),
        };
    }

    #[test]
    // @verifies C054-invariant
    // [::TICKET::] P1-4: DualClientContext struct layout check.
    //   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
    #[allow(unreachable_code)]
    // [::STUB::] P3-2: Replace todo!() when Runtime types exist (Runtime State ticket).
    fn dual_client_context_has_two_endpoints() {
        // Compile-time check: struct fields mirror the RFC design.
        let _ctx = DualClientContext {
            endpoint_a: todo!(),
            endpoint_b: todo!(),
        };
    }
}
