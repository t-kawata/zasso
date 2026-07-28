// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0028:  §20 DTMF Specification & DtmfReceived
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0028 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================
//
// [::TICKET::] P5-2: DTMF specification — DtmfMethod validation helpers for DtmfPolicy
//
// DtmfReceivedInfo is defined in event_model_payload_bus.rs (method:DtmfMethod added by P5-2).
// This module provides DtmfPolicy validation helpers used by the DTMF send/receive pipeline.

use crate::config::account_config_spec::{DtmfMethod, DtmfPolicy};

// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
impl DtmfPolicy {
    /// Check whether the given `method` is allowed for sending DTMF digits.
    ///
    /// Returns `true` if `method` appears in `self.send_methods`.
    pub fn is_send_allowed(&self, method: DtmfMethod) -> bool {
        self.send_methods.contains(&method)
    }

    /// Check whether the given `method` is allowed for receiving DTMF digits.
    ///
    /// Returns `true` if `method` appears in `self.receive_methods`.
    pub fn is_receive_allowed(&self, method: DtmfMethod) -> bool {
        self.receive_methods.contains(&method)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::account_config_spec::DtmfPolicy;

    // ── Normal: DtmfPolicy::is_send_allowed ───────────────────────────────

    /// @verifies C029
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_policy_is_send_allowed_returns_true_for_allowed_method() {
        let policy = DtmfPolicy {
            send_methods: vec![DtmfMethod::Rfc4733, DtmfMethod::Info],
            receive_methods: vec![DtmfMethod::Rfc4733],
            default_send_method: DtmfMethod::Rfc4733,
        };
        assert!(policy.is_send_allowed(DtmfMethod::Rfc4733));
        assert!(policy.is_send_allowed(DtmfMethod::Info));
    }

    /// @verifies C029
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_policy_is_send_allowed_returns_false_for_disallowed_method() {
        let policy = DtmfPolicy {
            send_methods: vec![DtmfMethod::Rfc4733],
            receive_methods: vec![DtmfMethod::Rfc4733],
            default_send_method: DtmfMethod::Rfc4733,
        };
        assert!(!policy.is_send_allowed(DtmfMethod::Inband));
        assert!(!policy.is_send_allowed(DtmfMethod::Info));
    }

    // ── Normal: DtmfPolicy::is_receive_allowed ─────────────────────────────

    /// @verifies C029
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_policy_is_receive_allowed_returns_true_for_allowed_method() {
        let policy = DtmfPolicy {
            send_methods: vec![DtmfMethod::Rfc4733],
            receive_methods: vec![DtmfMethod::Rfc4733, DtmfMethod::Inband],
            default_send_method: DtmfMethod::Rfc4733,
        };
        assert!(policy.is_receive_allowed(DtmfMethod::Rfc4733));
        assert!(policy.is_receive_allowed(DtmfMethod::Inband));
    }

    /// @verifies C029
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_policy_is_receive_allowed_returns_false_for_disallowed_method() {
        let policy = DtmfPolicy {
            send_methods: vec![DtmfMethod::Rfc4733],
            receive_methods: vec![DtmfMethod::Rfc4733],
            default_send_method: DtmfMethod::Rfc4733,
        };
        assert!(!policy.is_receive_allowed(DtmfMethod::Info));
    }

    // ── Error: empty send_methods / receive_methods ─────────────────────

    /// @verifies C029
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_policy_empty_send_methods_no_method_is_allowed() {
        let policy = DtmfPolicy {
            send_methods: vec![],
            receive_methods: vec![DtmfMethod::Rfc4733],
            default_send_method: DtmfMethod::Rfc4733,
        };
        assert!(!policy.is_send_allowed(DtmfMethod::Rfc4733));
    }

    /// @verifies C029
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_policy_empty_receive_methods_no_method_is_allowed() {
        let policy = DtmfPolicy {
            send_methods: vec![DtmfMethod::Rfc4733],
            receive_methods: vec![],
            default_send_method: DtmfMethod::Rfc4733,
        };
        assert!(!policy.is_receive_allowed(DtmfMethod::Rfc4733));
    }

    // ── Boundary: single-method policy ──────────────────────────────────

    /// @verifies C029
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_policy_single_method_send_and_receive() {
        let policy = DtmfPolicy {
            send_methods: vec![DtmfMethod::Rfc2833],
            receive_methods: vec![DtmfMethod::Rfc2833],
            default_send_method: DtmfMethod::Rfc2833,
        };
        assert!(policy.is_send_allowed(DtmfMethod::Rfc2833));
        assert!(!policy.is_send_allowed(DtmfMethod::Rfc4733));
        assert!(policy.is_receive_allowed(DtmfMethod::Rfc2833));
        assert!(!policy.is_receive_allowed(DtmfMethod::Info));
    }

    // ── Invariant: DtmfReceivedInfo Compile-time Trait Bounds ──────────

    /// @verifies C029
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_received_info_is_clone_debug() {
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_clone_debug<T: Clone + std::fmt::Debug>() {}
        assert_clone_debug::<crate::api::event_model_payload_bus::DtmfReceivedInfo>();
    }
}
