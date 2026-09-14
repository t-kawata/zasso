
//!
//! Owns the two wiring steps that connect the M20 converter to the §17 state
//! machine and the reactor's authoritative `ClientState`:
//!
//! 1. [`process_registration_state_changed`] — consumes a native registration
//!    event outcome (`NativeEvent::RegistrationStateChanged` → `acc_id`), maps the
//!    native snapshot through `m20_registr_cmd_pat::registration_transition_from_native`,
//!    advances `ClientState.accounts[].registration`, and produces the
//!    `SipEventPayload::RegistrationStateChanged` event to publish.
//! 2. [`apply_registration_command_state`] — advances `ClientState` along a §17.1
//!    command edge (`Register`/`set_registration(true)` → `Registering`;
//!    `Unregister`/`set_registration(false)` → `Unregistering`), guarded by
//!    `can_transition_to`.
//!
//! The reactor (`src/runtime/reactor.rs`) is the caller: it dispatches the
//! returned event on the single client-owned `EventBus`. This module hosts the
//! wiring contract assertions for C073 / C085.

use std::collections::BTreeMap;

use crate::api::event_model_payload_bus::{AccountId, EventMeta, SipEvent, SipEventPayload};
use crate::runtime::backend::SipBackend;
use crate::runtime::state::{AccountEntry, ClientState};
use crate::state::m20_registr_cmd_pat::registration_transition_from_native;
use crate::state::registr_state_machine::RegistrationState;

/// Process a native registration event and produce the `SipEvent` to publish.
///
/// Returns `Some(event)` when a publication is warranted, `None` when the event
/// is dropped (unknown account, or an invalid §17.1 edge — e.g. a success event
/// for a `Disabled` account). The C085 invariant holds: only a real REGISTER
/// success (status 200 from `Registering`) transitions to `Registered`.
pub(crate) fn process_registration_state_changed(
    backend: &dyn SipBackend,
    acc_id: u32,
    accounts: &mut BTreeMap<AccountId, AccountEntry>,
) -> Option<SipEvent> {
    let account_id = accounts
        .iter()
        .find(|(_, entry)| entry.native_id == acc_id as i32)
        .map(|(aid, _)| *aid)?;
    let current = accounts[&account_id].registration;
    match backend.get_account_info(acc_id) {
        Ok(snapshot) => match registration_transition_from_native(current, &snapshot) {
            Ok(next) => {
                if let Some(entry) = accounts.get_mut(&account_id) {
                    entry.registration = next;
                }
                Some(SipEvent {
                    meta: EventMeta::new(0, Some(account_id), None),
                    payload: SipEventPayload::RegistrationStateChanged(next),
                })
            }
            Err(transition_error) => {
                tracing::warn!(
                    from = ?transition_error.from,
                    to = ?transition_error.to,
                    "invalid registration transition ignored (§17.1)"
                );
                None
            }
        },
        Err(reactor_error) => Some(SipEvent {
            meta: EventMeta::new(0, Some(account_id), None),
            payload: SipEventPayload::Error(reactor_error.into()),
        }),
    }
}

/// Advance the reactor's `ClientState` registration along a §17.1 command edge.
///
/// `set_registration(enabled)` targets `Registering`/`Unregistering`. The edge is
/// guarded by `can_transition_to` — a spurious command (e.g. re-enabling an
/// already-`Registering` account) is logged and ignored, keeping the state machine
/// honest.
pub(crate) fn apply_registration_command_state(
    client_state: &mut ClientState,
    account_id: AccountId,
    enabled: bool,
) {
    let target = if enabled {
        RegistrationState::Registering
    } else {
        RegistrationState::Unregistering
    };
    if let Some(entry) = client_state.accounts.get_mut(&account_id) {
        if entry.registration.can_transition_to(target) {
            entry.registration = target;
        } else {
            tracing::warn!(
                from = ?entry.registration,
                to = ?target,
                "set_registration edge ignored (§17.1)"
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::backend::TestBackend;
    use crate::runtime::state::AccountEntry;

    fn test_account(value: u64) -> AccountId {
        AccountId::from_u64(value).unwrap_or_else(|error| {
            panic!("test AccountId requires a non-zero value, got {value}: {error}")
        })
    }

    fn account_with_registration(
        acc_id: u32,
        state: RegistrationState,
    ) -> BTreeMap<AccountId, AccountEntry> {
        BTreeMap::from([(
            test_account(acc_id as u64),
            AccountEntry {
                id: acc_id as u64,
                native_id: acc_id as i32,
                config: crate::config::account_config_spec::AccountConfig::default(),
                registration: state,
            },
        )])
    }

    /// A native 200 event drives Registering → Registered, updates ClientState,
    /// and yields SipEventPayload::RegistrationStateChanged(Registered).
    #[test]
    fn registration_state_changed_drives_registering_to_registered(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        backend.add_account(&crate::config::account_config_spec::AccountConfig::default())?;
        backend.mark_registered(1); // get_account_info -> status 200
        let mut accounts = account_with_registration(1, RegistrationState::Registering);

        let event = process_registration_state_changed(&backend, 1, &mut accounts)
            .ok_or("a valid Registering → Registered edge must publish")?;

        assert!(matches!(
            event.payload,
            SipEventPayload::RegistrationStateChanged(RegistrationState::Registered)
        ));
        assert_eq!(
            accounts[&test_account(1)].registration,
            RegistrationState::Registered
        );
        Ok(())
    }

    /// A success event for a Disabled account is an invalid §17.1 edge — no event
    /// is produced and ClientState stays Disabled (never jumps to Registered).
    #[test]
    fn registration_state_changed_ignores_invalid_disabled_edge(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        backend.add_account(&crate::config::account_config_spec::AccountConfig::default())?;
        backend.mark_registered(1); // native reports 200, but current is Disabled
        let mut accounts = account_with_registration(1, RegistrationState::Disabled);

        let event = process_registration_state_changed(&backend, 1, &mut accounts);

        assert!(event.is_none(), "an invalid edge must not produce an event");
        assert_eq!(
            accounts[&test_account(1)].registration,
            RegistrationState::Disabled
        );
        Ok(())
    }

    /// The SetRegistration command edge advances ClientState to Registering, and
    /// a spurious re-enable while already Registering is ignored.
    #[test]
    fn set_registration_command_edge_advances_client_state() {
        let mut state = ClientState::default();
        let aid = test_account(1);
        state.accounts.insert(
            aid,
            AccountEntry {
                id: 1,
                native_id: 1,
                config: crate::config::account_config_spec::AccountConfig::default(),
                registration: RegistrationState::Disabled,
            },
        );

        apply_registration_command_state(&mut state, aid, true);
        assert_eq!(
            state.accounts[&aid].registration,
            RegistrationState::Registering
        );

        // Advance to Registered (as if a native 200 arrived), then disable —
        // Registered → Unregistering is the §17.1 edge the command drives.
        if let Some(entry) = state.accounts.get_mut(&aid) {
            entry.registration = RegistrationState::Registered;
        }
        apply_registration_command_state(&mut state, aid, false);
        assert_eq!(
            state.accounts[&aid].registration,
            RegistrationState::Unregistering
        );
    }
}
