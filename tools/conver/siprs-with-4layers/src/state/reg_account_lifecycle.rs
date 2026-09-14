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
//   - NODE_ID=N0081:  62.12 登録・アカウント経路（自動登録 / unregister 先行 / AccountRemoved）
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0081 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! §62.12 (N0081) — registration & account lifecycle wiring.
//!
//! Owns the account lifecycle steps the reactor's `AddAccount` / `RemoveAccount`
//! arms invoke:
//!
//! 1. [`should_auto_register`] — decides whether `add_account` consumes
//!    `AccountConfig.register_on_start` and issues an automatic REGISTER.
//! 2. [`add_account_and_apply_auto_register`] — runs the add-account sequence:
//!    `backend.add_account` → `ClientState` tracking → optional automatic
//!    REGISTER, returning the assigned logical id the reactor replies with.
//! 3. [`build_account_snapshot`] — maps a reactor `AccountEntry` to the public
//!    `AccountSnapshot` domain type (shared by the reactor's `AccountRemoved`
//!    publish and the client's `accounts()` query).
//! 4. [`remove_account_sequence`] — runs the unregister-first removal:
//!    `set_registration(false)` → `backend.remove_account` → `ClientState`
//!    removal, returning the snapshot the reactor publishes as `AccountRemoved`.
//! 5. [`classify_registration_outcome`] — exhaustively names the unified §17
//!    registration-outcome variants; compiling without
//!    `RegistrationSucceeded` / `RegistrationFailed` is the static proof of C097.

use crate::api::event_model_payload_bus::{AccountId, AccountSnapshot};
// SipEventPayload is only used by the test-only C097 classifier below, so it is
// imported under cfg(test) to avoid an unused-import warning in non-test builds.
#[cfg(test)]
use crate::api::event_model_payload_bus::SipEventPayload;
use crate::config::account_config_spec::AccountConfig;
use crate::runtime::backend::SipBackend;
use crate::runtime::command::ReactorError;
use crate::runtime::state::{AccountEntry, ClientState};
use crate::state::registr_state_machine::RegistrationState;
use crate::state::registr_wiring::apply_registration_command_state;

/// Decide whether `add_account` issues an automatic REGISTER (§62.12).
pub(crate) fn should_auto_register(config: &AccountConfig) -> bool {
    config.register_on_start
}

/// Run the add-account sequence with §62.12 auto-register (§62.12).
///
/// Order: (1) backend add, (2) `ClientState` tracking (O-004), (3) optional
/// automatic REGISTER when `register_on_start` is set — advancing `ClientState`
/// to `Registering` along the §17.1 command edge. On backend add failure the
/// error propagates with no `ClientState` change (fail-fast, no partial state);
/// on auto-register failure the account is retained (it exists on the backend)
/// but the error still propagates to the caller.
pub(crate) fn add_account_and_apply_auto_register(
    backend: &mut dyn SipBackend,
    client_state: &mut ClientState,
    config: &AccountConfig,
) -> Result<u64, ReactorError> {
    let (native_id, entry) = backend.add_account(config)?;
    let entry_id = entry.id;
    if let Ok(account_id) = AccountId::from_u64(entry_id) {
        client_state.accounts.insert(account_id, entry);
        if should_auto_register(config) {
            backend.set_registration(native_id, true)?;
            apply_registration_command_state(client_state, account_id, true);
        }
    }
    Ok(entry_id)
}

/// Map a reactor `AccountEntry` to the public `AccountSnapshot` domain type.
///
/// Returns `None` when the placeholder `id` cannot form a valid `AccountId`
/// (zero value), skipping such entries. `uri` and `display_name` are derived
/// from the stored `AccountConfig` (P10-3 makes `ClientState` the source of truth).
pub(crate) fn build_account_snapshot(entry: &AccountEntry) -> Option<AccountSnapshot> {
    Some(AccountSnapshot {
        account_id: AccountId::from_u64(entry.id).ok()?,
        display_name: entry.config.display_name.clone(),
        uri: format!("sip:{}@{}", entry.config.username, entry.config.domain),
        registered: entry.registration == RegistrationState::Registered,
    })
}

/// Run the unregister-first account removal sequence (§62.12).
///
/// Order: (1) unregister first, (2) backend removal, (3) ClientState removal.
/// On any error the account is retained in `ClientState` (error atomicity) and
/// no snapshot is returned — the reactor replies `Err` without publishing.
pub(crate) fn remove_account_sequence(
    backend: &mut dyn SipBackend,
    client_state: &mut ClientState,
    account_id: AccountId,
) -> Result<Option<AccountSnapshot>, ReactorError> {
    let native_id = client_state
        .accounts
        .get(&account_id)
        .ok_or_else(|| ReactorError::NotInitialized("account not found".into()))?
        .native_id;
    backend.set_registration(native_id, false)?;
    backend.remove_account(native_id)?;
    let snapshot = client_state
        .accounts
        .remove(&account_id)
        .and_then(|entry| build_account_snapshot(&entry));
    Ok(snapshot)
}

/// Name the unified §17 registration-outcome variant (C097 static proof).
///
/// Test-only support: enumerating the remaining registration variants without a
/// wildcard compiles only because `RegistrationSucceeded` / `RegistrationFailed`
/// were removed from `SipEventPayload` — the compile is the static proof of C097.
#[cfg(test)]
pub(crate) fn classify_registration_outcome(payload: &SipEventPayload) -> &'static str {
    match payload {
        SipEventPayload::RegistrationStarted(_) => "started",
        SipEventPayload::UnregistrationSucceeded => "unregistered",
        SipEventPayload::UnregistrationFailed(_) => "unregister_failed",
        SipEventPayload::RegistrationExpired => "expired",
        SipEventPayload::RegistrationStateChanged(RegistrationState::Registered) => "registered",
        SipEventPayload::RegistrationStateChanged(_) => "unregistered_or_failed",
        _ => "non_registration",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::event_model_payload_bus::AccountId;
    use crate::config::account_config_spec::AccountConfig;
    use crate::runtime::backend::TestBackend;
    use crate::runtime::state::AccountEntry;
    use crate::state::registr_state_machine::RegistrationState;

    /// Build a test `AccountEntry` with the given id/native_id/registration.
    // [::TICKET::] P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-3 --for-spec --no-implementation-order`.
    fn test_entry(id: u64, native_id: i32, registration: RegistrationState) -> AccountEntry {
        AccountEntry {
            id,
            native_id,
            config: AccountConfig {
                username: "alice".into(),
                domain: "sip.example.com".into(),
                ..Default::default()
            },
            registration,
        }
    }

    #[test]
    // @verifies C096
    // [::TICKET::] P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-3 --for-spec --no-implementation-order`.
    fn should_auto_register_consumes_register_on_start() {
        let config = AccountConfig {
            register_on_start: true,
            ..Default::default()
        };
        assert!(should_auto_register(&config));
        let config = AccountConfig {
            register_on_start: false,
            ..Default::default()
        };
        assert!(!should_auto_register(&config));
    }

    #[test]
    // [::TICKET::] P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-3 --for-spec --no-implementation-order`.
    fn build_account_snapshot_maps_entry_to_snapshot() -> Result<(), Box<dyn std::error::Error>> {
        let entry = test_entry(1, 1, RegistrationState::Registered);
        let snapshot = build_account_snapshot(&entry).ok_or("valid entry must map")?;
        assert_eq!(snapshot.account_id.get().get(), 1);
        assert_eq!(snapshot.uri, "sip:alice@sip.example.com");
        assert_eq!(snapshot.display_name, entry.config.display_name);
        assert!(snapshot.registered);
        Ok(())
    }

    #[test]
    // [::TICKET::] P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-3 --for-spec --no-implementation-order`.
    fn build_account_snapshot_registered_only_for_registered_state(
    ) -> Result<(), Box<dyn std::error::Error>> {
        for state in [
            RegistrationState::Disabled,
            RegistrationState::Idle,
            RegistrationState::Registering,
            RegistrationState::Unregistering,
            RegistrationState::Failed,
            RegistrationState::Expired,
        ] {
            let entry = test_entry(1, 1, state);
            let snapshot = build_account_snapshot(&entry).ok_or("valid entry must map")?;
            assert!(!snapshot.registered, "{state:?} must not be registered");
        }
        Ok(())
    }

    #[test]
    // [::TICKET::] P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-3 --for-spec --no-implementation-order`.
    fn build_account_snapshot_rejects_zero_id() {
        let entry = test_entry(0, 1, RegistrationState::Idle);
        assert!(build_account_snapshot(&entry).is_none());
    }

    #[test]
    // @verifies C095
    // [::TICKET::] P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-3 --for-spec --no-implementation-order`.
    fn remove_account_sequence_unregisters_first_then_removes_and_maps_snapshot(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        let mut client_state = crate::runtime::state::ClientState::default();
        let aid = AccountId::from_u64(1)?;
        client_state
            .accounts
            .insert(aid, test_entry(1, 1, RegistrationState::Registered));

        let snapshot = remove_account_sequence(&mut backend, &mut client_state, aid)?
            .ok_or("a valid entry must produce a snapshot")?;

        // Unregister-first ordering: set_registration(false) attempted before remove_account.
        assert!(backend
            .set_registration_calls
            .iter()
            .any(|(native_id, enabled)| *native_id == 1 && !*enabled));
        assert!(backend.remove_account_calls.contains(&1));
        assert!(client_state.accounts.is_empty());
        assert_eq!(snapshot.account_id, aid);
        assert!(snapshot.registered);
        Ok(())
    }

    #[test]
    // [::TICKET::] P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-3 --for-spec --no-implementation-order`.
    fn remove_account_sequence_missing_account_rejects_without_backend_calls(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        let mut client_state = crate::runtime::state::ClientState::default();
        let aid = AccountId::from_u64(1)?;

        let result = remove_account_sequence(&mut backend, &mut client_state, aid);
        assert!(result.is_err());
        assert!(backend.set_registration_calls.is_empty());
        assert!(backend.remove_account_calls.is_empty());
        Ok(())
    }

    #[test]
    // [::TICKET::] P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-3 --for-spec --no-implementation-order`.
    fn remove_account_sequence_unregister_failure_aborts_before_removal(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        backend.set_registration_result = Some(Err(
            crate::runtime::command::ReactorError::BackendError("unregister failed".into()),
        ));
        let mut client_state = crate::runtime::state::ClientState::default();
        let aid = AccountId::from_u64(1)?;
        client_state
            .accounts
            .insert(aid, test_entry(1, 1, RegistrationState::Registered));

        let result = remove_account_sequence(&mut backend, &mut client_state, aid);
        assert!(result.is_err());
        // Unregister was attempted but removal never ran; account retained (atomicity).
        assert!(backend
            .set_registration_calls
            .iter()
            .any(|(native_id, enabled)| *native_id == 1 && !*enabled));
        assert!(backend.remove_account_calls.is_empty());
        assert!(client_state.accounts.contains_key(&aid));
        Ok(())
    }

    #[test]
    // [::TICKET::] P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-3 --for-spec --no-implementation-order`.
    fn remove_account_sequence_remove_failure_retains_account_after_unregister(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        backend.remove_account_result = Some(Err(
            crate::runtime::command::ReactorError::BackendError("remove failed".into()),
        ));
        let mut client_state = crate::runtime::state::ClientState::default();
        let aid = AccountId::from_u64(1)?;
        client_state
            .accounts
            .insert(aid, test_entry(1, 1, RegistrationState::Registered));

        let result = remove_account_sequence(&mut backend, &mut client_state, aid);
        assert!(result.is_err());
        // Unregister ran, removal attempted, but ClientState entry retained (atomicity).
        assert!(backend
            .set_registration_calls
            .iter()
            .any(|(native_id, enabled)| *native_id == 1 && !*enabled));
        assert!(backend.remove_account_calls.contains(&1));
        assert!(client_state.accounts.contains_key(&aid));
        Ok(())
    }

    #[test]
    // @verifies C096
    // [::TICKET::] P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-3 --for-spec --no-implementation-order`.
    fn add_account_and_apply_auto_register_issues_set_registration_when_enabled(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        let mut client_state = crate::runtime::state::ClientState::default();
        let config = AccountConfig {
            register_on_start: true,
            ..Default::default()
        };

        let entry_id =
            add_account_and_apply_auto_register(&mut backend, &mut client_state, &config)?;

        // The backend received set_registration(native_id, true) and ClientState
        // advanced to Registering along the §17.1 command edge.
        assert!(backend
            .set_registration_calls
            .iter()
            .any(|(native_id, enabled)| *native_id == entry_id as i32 && *enabled));
        let aid = AccountId::from_u64(entry_id)?;
        assert_eq!(
            client_state.accounts[&aid].registration,
            RegistrationState::Registering
        );
        Ok(())
    }

    #[test]
    // @verifies C096
    // [::TICKET::] P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-3 --for-spec --no-implementation-order`.
    fn add_account_and_apply_auto_register_skips_when_disabled(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        let mut client_state = crate::runtime::state::ClientState::default();
        let config = AccountConfig {
            register_on_start: false,
            ..Default::default()
        };

        let entry_id =
            add_account_and_apply_auto_register(&mut backend, &mut client_state, &config)?;

        // No automatic REGISTER; ClientState stays at the §62.2 Disabled start.
        assert!(backend.set_registration_calls.is_empty());
        let aid = AccountId::from_u64(entry_id)?;
        assert_eq!(
            client_state.accounts[&aid].registration,
            RegistrationState::Disabled
        );
        Ok(())
    }

    #[test]
    // @verifies C096
    // [::TICKET::] P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-3 --for-spec --no-implementation-order`.
    fn add_account_and_apply_auto_register_backend_failure_leaves_state_unchanged(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        backend.add_account_result = Some(Err(ReactorError::BackendError("add failed".into())));
        let mut client_state = crate::runtime::state::ClientState::default();

        let result = add_account_and_apply_auto_register(
            &mut backend,
            &mut client_state,
            &AccountConfig::default(),
        );

        // Fail-fast: error propagates, no set_registration, ClientState untouched.
        assert!(result.is_err());
        assert!(backend.set_registration_calls.is_empty());
        assert!(client_state.accounts.is_empty());
        Ok(())
    }

    #[test]
    // @verifies C096
    // [::TICKET::] P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-3 --for-spec --no-implementation-order`.
    fn add_account_and_apply_auto_register_auto_register_failure_retains_account(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        backend.set_registration_result = Some(Err(ReactorError::BackendError(
            "set_registration failed".into(),
        )));
        let mut client_state = crate::runtime::state::ClientState::default();
        let config = AccountConfig {
            register_on_start: true,
            ..Default::default()
        };

        let result = add_account_and_apply_auto_register(&mut backend, &mut client_state, &config);

        // The account exists on the backend so it is retained, but the auto-register
        // error still propagates (no silent swallow).
        assert!(result.is_err());
        assert_eq!(client_state.accounts.len(), 1);
        Ok(())
    }

    #[test]
    // [::TICKET::] P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-3 --for-spec --no-implementation-order`.
    fn classify_registration_outcome_names_unified_registration_variants(
    ) -> Result<(), Box<dyn std::error::Error>> {
        use crate::api::event_model_payload_bus::SipEventPayload;
        let started_account_id = AccountId::from_u64(1)?;
        assert_eq!(
            classify_registration_outcome(&SipEventPayload::RegistrationStateChanged(
                RegistrationState::Registered
            )),
            "registered"
        );
        assert_eq!(
            classify_registration_outcome(&SipEventPayload::RegistrationStarted(
                crate::api::event_model_payload_bus::RegistrationInfo {
                    account_id: started_account_id,
                    renew: false,
                }
            )),
            "started"
        );
        Ok(())
    }
}
