
//
// Re-exports the single `DtmfMethod` definition and maps each method to the
// PJSIP send API it must use. Keeping this mapping pure keeps the
// FFI layer (`backend_calls::send_dtmf`) a thin dispatch wrapper and the
// whole mapping unit-testable without `pjsua-native`.

pub use crate::model::dtmf_spec::DtmfMethod;

/// The PJSIP call the FFI layer must invoke for a given `DtmfMethod`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DtmfSendApi {
    /// `pjsua_call_send_dtmf` — SIP INFO / RTP event (RFC 2976 / RFC 4733).
    SendDtmf,
    /// `pjsua_call_dial_dtmf` — RFC 2833 payload (in-band method).
    DialDtmf,
}

/// Map a `DtmfMethod` to the PJSIP send API (§62.15 Q5).
///
/// `Info` and `Rfc4733` are carried by `pjsua_call_send_dtmf` (SIP INFO / RTP
/// event), while `Inband` uses `pjsua_call_dial_dtmf`.
pub fn send_api_for(method: DtmfMethod) -> DtmfSendApi {
    match method {
        DtmfMethod::Info | DtmfMethod::Rfc4733 => DtmfSendApi::SendDtmf,
        DtmfMethod::Inband => DtmfSendApi::DialDtmf,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal: every method resolves to its PJSIP API ─────────────────

    #[test]
    fn send_api_for_maps_rfc4733_and_info_to_send_dtmf() {
        assert_eq!(send_api_for(DtmfMethod::Rfc4733), DtmfSendApi::SendDtmf);
        assert_eq!(send_api_for(DtmfMethod::Info), DtmfSendApi::SendDtmf);
    }

    #[test]
    fn send_api_for_maps_inband_to_dial_dtmf() {
        assert_eq!(send_api_for(DtmfMethod::Inband), DtmfSendApi::DialDtmf);
    }

    // ── Invariant: the re-export is the single model definition ───────

    #[test]
    fn dtmf_method_is_the_model_single_definition() {
        let model: crate::model::dtmf_spec::DtmfMethod = DtmfMethod::Inband;
        assert_eq!(model, DtmfMethod::Inband);
    }
}
