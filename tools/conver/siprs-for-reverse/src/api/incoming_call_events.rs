
use crate::model::id_design_newtype::{AccountId, CallId};
use crate::runtime::state::CallEntry;
use crate::state::call_state_model::CallState;
use crate::state::m20_callstate_mapping::CallDirection;

/// Build the `CallEntry` that registers an incoming INVITE in `ClientState.calls`.
///
/// §62.14 (Q4): an `on_incoming_call` callback carries the owning account and the
/// native call id. The entry is registered with `CallDirection::Incoming`, the
/// typed `CallState::Incoming`, and the resolved account so the call is
/// answerable and resolvable via `calls()` / `call_state(call_id)`.
pub(crate) fn build_incoming_call_entry(
    account_id: AccountId,
    call_id: CallId,
    native_call_id: u32,
    remote_uri: String,
) -> CallEntry {
    CallEntry {
        id: call_id.get().get(),
        native_id: native_call_id as i32,
        account_id,
        state: CallState::Incoming,
        media: "none".into(),
        direction: CallDirection::Incoming,
        remote_uri,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::id_design_newtype::{AccountId, CallId};

    /// Construct a test `CallId` from a non-zero value.
    fn test_call_id(value: u64) -> CallId {
        CallId::from_u64(value).unwrap_or_else(|error| {
            panic!("test CallId requires a non-zero value, got {value}: {error}")
        })
    }

    /// Construct a test `AccountId` from a non-zero value.
    fn test_account(value: u64) -> AccountId {
        AccountId::from_u64(value).unwrap_or_else(|error| {
            panic!("test AccountId requires a non-zero value, got {value}: {error}")
        })
    }

    #[test]
    // Incoming-direction CallEntry in CallState::Incoming with the resolved account.
    fn build_incoming_call_entry_registers_incoming_call() {
        let entry = build_incoming_call_entry(
            test_account(5),
            test_call_id(42),
            42,
            "sip:1001@127.0.0.1".into(),
        );

        assert_eq!(entry.id, 42);
        assert_eq!(entry.native_id, 42);
        assert_eq!(entry.account_id, test_account(5));
        assert_eq!(entry.state, CallState::Incoming);
        assert_eq!(entry.direction, CallDirection::Incoming);
        assert_eq!(entry.remote_uri, "sip:1001@127.0.0.1");
    }

    #[test]
    // constraint); the entry is still answerable via the resolved account.
    fn build_incoming_call_entry_accepts_empty_remote_uri() {
        let entry = build_incoming_call_entry(test_account(5), test_call_id(42), 42, String::new());
        assert!(entry.remote_uri.is_empty());
        assert_eq!(entry.direction, CallDirection::Incoming);
    }
}
