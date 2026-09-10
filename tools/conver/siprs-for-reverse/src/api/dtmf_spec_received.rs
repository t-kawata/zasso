
use crate::config::account_config_spec::{DtmfMethod, DtmfPolicy};

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

    #[test]
    fn dtmf_policy_is_send_allowed_returns_true_for_allowed_method() {
        let policy = DtmfPolicy {
            send_methods: vec![DtmfMethod::Rfc4733, DtmfMethod::Info],
            receive_methods: vec![DtmfMethod::Rfc4733],
            default_send_method: DtmfMethod::Rfc4733,
        };
        assert!(policy.is_send_allowed(DtmfMethod::Rfc4733));
        assert!(policy.is_send_allowed(DtmfMethod::Info));
    }

    #[test]
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

    #[test]
    fn dtmf_policy_is_receive_allowed_returns_true_for_allowed_method() {
        let policy = DtmfPolicy {
            send_methods: vec![DtmfMethod::Rfc4733],
            receive_methods: vec![DtmfMethod::Rfc4733, DtmfMethod::Inband],
            default_send_method: DtmfMethod::Rfc4733,
        };
        assert!(policy.is_receive_allowed(DtmfMethod::Rfc4733));
        assert!(policy.is_receive_allowed(DtmfMethod::Inband));
    }

    #[test]
    fn dtmf_policy_is_receive_allowed_returns_false_for_disallowed_method() {
        let policy = DtmfPolicy {
            send_methods: vec![DtmfMethod::Rfc4733],
            receive_methods: vec![DtmfMethod::Rfc4733],
            default_send_method: DtmfMethod::Rfc4733,
        };
        assert!(!policy.is_receive_allowed(DtmfMethod::Info));
    }

    // ── Error: empty send_methods / receive_methods ─────────────────────

    #[test]
    fn dtmf_policy_empty_send_methods_no_method_is_allowed() {
        let policy = DtmfPolicy {
            send_methods: vec![],
            receive_methods: vec![DtmfMethod::Rfc4733],
            default_send_method: DtmfMethod::Rfc4733,
        };
        assert!(!policy.is_send_allowed(DtmfMethod::Rfc4733));
    }

    #[test]
    fn dtmf_policy_empty_receive_methods_no_method_is_allowed() {
        let policy = DtmfPolicy {
            send_methods: vec![DtmfMethod::Rfc4733],
            receive_methods: vec![],
            default_send_method: DtmfMethod::Rfc4733,
        };
        assert!(!policy.is_receive_allowed(DtmfMethod::Rfc4733));
    }

    // ── Boundary: single-method policy ──────────────────────────────────

    #[test]
    fn dtmf_policy_single_method_send_and_receive() {
        let policy = DtmfPolicy {
            send_methods: vec![DtmfMethod::Rfc4733],
            receive_methods: vec![DtmfMethod::Rfc4733],
            default_send_method: DtmfMethod::Rfc4733,
        };
        assert!(policy.is_send_allowed(DtmfMethod::Rfc4733));
        assert!(!policy.is_send_allowed(DtmfMethod::Info));
        assert!(policy.is_receive_allowed(DtmfMethod::Rfc4733));
        assert!(!policy.is_receive_allowed(DtmfMethod::Info));
    }

    // ── Invariant: DtmfReceivedInfo Compile-time Trait Bounds ──────────

    #[test]
    fn dtmf_received_info_is_clone_debug() {
        fn assert_clone_debug<T: Clone + std::fmt::Debug>() {}
        assert_clone_debug::<crate::api::event_model_payload_bus::DtmfReceivedInfo>();
    }
}
