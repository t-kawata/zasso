
use crate::state::call_state_model::CallState;

///
/// Mirrors RFC N0027 (§19/§20) exactly — used by the API-surface test and the
/// the RFC. Kept as a named constant so the surface is a single source of truth
/// rather than a hardcoded list scattered across tests.
pub const CALL_API_METHODS: [&str; 8] = [
    "answer",
    "hangup",
    "hold",
    "unhold",
    "transfer",
    "send_dtmf",
    "call_state",
    "calls",
];

/// The `CallState` that results from answering with `code` (§19.1 / P16-5 §62.14).
///
/// - `200` → `Active` (call accepted, media negotiated)
/// - `486` / `603` → `Disconnected` (Busy Here / Decline reject)
/// - `180` / `183` → `Connecting` (provisional; call still in progress)
///
/// `CallEntry.state` is a typed `CallState` since P16-5; this maps the answer
/// code to the resulting state directly (replaces the pre-P16-5 String bridge).
pub(crate) fn answer_call_state(code: u16) -> CallState {
    match code {
        200 => CallState::Active,
        486 | 603 => CallState::Disconnected,
        _ => CallState::Connecting,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn call_api_methods_matches_rfc_n0027_surface() {
        // The §62.5 method set must equal the RFC N0027 call-control surface.
        assert_eq!(
            CALL_API_METHODS,
            [
                "answer",
                "hangup",
                "hold",
                "unhold",
                "transfer",
                "send_dtmf",
                "call_state",
                "calls",
            ]
        );
    }

    #[test]
    fn answer_call_state_maps_codes() {
        assert_eq!(answer_call_state(200), CallState::Active);
        assert_eq!(answer_call_state(486), CallState::Disconnected);
        assert_eq!(answer_call_state(603), CallState::Disconnected);
        assert_eq!(answer_call_state(180), CallState::Connecting);
        assert_eq!(answer_call_state(183), CallState::Connecting);
    }
}
