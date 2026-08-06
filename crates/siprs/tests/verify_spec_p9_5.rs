// Layer 5 integration tests for the P9-5 AccountId/CallId error migration.
//
// These tests verify at the crate boundary that the public error surface carries
// the NonZeroU64-backed newtypes (`SipError.account_id: Option<AccountId>`,
// `call_id: Option<CallId>`, `AccountInfo.account_id: AccountId`) and that the
// PJSUA 0-sentinel maps to None. The regression contracts C025 / C028 / C032
// remain covered by their owning tickets (raw_sip_message_spec.rs,
// call_api_semantics.rs, audio_subscribe_bp.rs).

use siprs::error::m20_runtime_command_error::{convert_get_account_info_error, AccountInfo};
use siprs::error::SipError;
use siprs::model::{AccountId, CallId};
use siprs::SipErrorKind;

// ── Type propagation: AccountInfo.account_id is AccountId ──────────────

#[test]
// [::TICKET::] P9-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-5 --for-spec --no-implementation-order`.
fn account_info_account_id_type_propagates_across_module_boundary(
) -> Result<(), Box<dyn std::error::Error>> {
    // P9-5: AccountInfo has no u64 id field — account_id is the AccountId newtype.
    let info = AccountInfo {
        account_id: AccountId::from_u64(1)?,
        display_name: "alice".into(),
        sip_uri: "sip:alice@example.com".into(),
        registered: true,
    };
    let _: AccountId = info.account_id; // compile-time: AccountId, not u64
    assert_eq!(info.account_id, AccountId::from_u64(1)?);
    Ok(())
}

// ── Error propagation: the not-found path carries newtype-None ids ─────

#[test]
// [::TICKET::] P9-5, P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P9-5|P10-1) --for-spec --no-implementation-order`.
fn account_not_found_error_carries_newtype_none_ids() -> Result<(), Box<dyn std::error::Error>> {
    // P9-5: convert_get_account_info_error's not-found path must not leak a u64 id.
    // P10-1: the account parameter is Option<&AccountEntry> — None is the not-found case.
    let err = convert_get_account_info_error(None, 0).expect_err("not-found must fail");
    let _: Option<AccountId> = err.account_id; // compile-time: Option<AccountId>
    let _: Option<CallId> = err.call_id; // compile-time: Option<CallId>
    assert_eq!(err.kind, SipErrorKind::AccountNotFound);
    assert_eq!(err.account_id, None);
    assert_eq!(err.call_id, None);
    assert!(!err.retryable, "account deletion is permanent");
    Ok(())
}

// ── SipError construction and Debug rendering with newtype ids ─────────

#[test]
// [::TICKET::] P9-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-5 --for-spec --no-implementation-order`.
fn sip_error_newtype_ids_render_in_debug() -> Result<(), Box<dyn std::error::Error>> {
    // P9-5: Debug output shows the newtype form (Some(AccountId(N))), not a bare number.
    let err = SipError::new(SipErrorKind::CallNotFound, "no call")
        .with_account_id(AccountId::from_u64(456)?)
        .with_call_id(CallId::from_u64(789)?);
    let debug = format!("{err:?}");
    assert!(
        debug.contains("account_id: Some(AccountId(456))"),
        "Debug must show the AccountId newtype: {debug}"
    );
    assert!(
        debug.contains("call_id: Some(CallId(789))"),
        "Debug must show the CallId newtype: {debug}"
    );
    Ok(())
}

// ── FFI boundary: PJSUA 0-sentinel maps to None, never a stored 0 ──────

#[test]
// [::TICKET::] P9-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-5 --for-spec --no-implementation-order`.
fn pjsua_zero_sentinel_maps_to_none_at_ffi_boundary() -> Result<(), Box<dyn std::error::Error>> {
    // P9-5: the native 0 invalid-sentinel must never be stored as a valid id.
    assert_eq!(AccountId::from_u64(0).ok(), None);
    assert_eq!(CallId::from_u64(0).ok(), None);
    assert!(AccountId::from_u64(1).is_ok());
    assert!(CallId::from_u64(1).is_ok());
    // Non-zero ids round-trip through the newtype without loss.
    let account_id = AccountId::from_u64(42)?;
    let call_id = CallId::from_u64(7)?;
    assert_eq!(account_id.get().get(), 42);
    assert_eq!(call_id.get().get(), 7);
    Ok(())
}
